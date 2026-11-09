import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TableName } from '../types';
import type { DB, Row } from './types';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const hasSupabase = !!(SUPABASE_URL && SUPABASE_KEY);

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

const PAGE = 1000;
const CHUNK = 400;
const PK: Partial<Record<TableName, string>> = { app_settings: 'key', invites: 'email' };

/** Tables that grow into the tens of thousands of rows: read as 16 uuid-prefix partitions, 6 at a time, keyset-paged (offset paging degrades linearly). */
const BIG = new Set<TableName>(['claims', 'work_log', 'claim_activity', 'claim_notes', 'claim_snapshots', 'import_log', 'recoveries', 'audit_log', 'qa_reviews']);
const CONCURRENCY = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T extends { error: any }>(run: () => PromiseLike<T>, ctx: string, tries = 4): Promise<T> {
  let res = await run();
  for (let i = 1; res.error && i < tries && !/permission|policy|does not exist|JWT/i.test(res.error.message || ''); i++) { await sleep(250 * 2 ** i); res = await run(); }
  void ctx; return res;
}
export async function listParallel(sb: SupabaseClient, t: TableName): Promise<Row[]> {
  const bounds = Array.from({ length: 16 }, (_, i) => ({ lo: i.toString(16) + '0000000-0000-0000-0000-000000000000', hi: i === 15 ? null : (i + 1).toString(16) + '0000000-0000-0000-0000-000000000000' }));
  const parts: Row[][] = bounds.map(() => []); let next = 0;
  const worker = async () => {
    while (next < bounds.length) {
      const i = next++; const { lo, hi } = bounds[i]; let last: string | null = null;
      for (;;) {
        let q = sb.from(t).select('*').order('id').limit(PAGE); q = last ? q.gt('id', last) : q.gte('id', lo); if (hi) q = q.lt('id', hi);
        const { data, error } = await withRetry(() => q, `load ${t}`); check(error, `load ${t}`);
        parts[i].push(...(data || [])); if (!data || data.length < PAGE) break; last = data[data.length - 1].id;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return parts.flat();
}

function check(error: { message: string } | null, ctx: string) { if (error) throw new Error(`${ctx}: ${error.message}`); }

export function createSupabaseDB(sb: SupabaseClient): DB {
  return {
    mode: 'supabase',
    async rpc(name, args) { const { data, error } = await sb.rpc(name, args); check(error, `rpc ${name}`); return data; },
    async list(t) {
      if (BIG.has(t)) return listParallel(sb, t);
      const out: Row[] = []; const pk = PK[t] || 'id';
      for (let last: any = null; ; ) {
        let q = sb.from(t).select('*').order(pk).limit(PAGE); if (last != null) q = q.gt(pk, last);
        const { data, error } = await withRetry(() => q, `load ${t}`); check(error, `load ${t}`);
        out.push(...(data || [])); if (!data || data.length < PAGE) break; last = data[data.length - 1][pk];
      }
      return out;
    },
    async find(t, where = {}, opts = {}) {
      const out: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = sb.from(t).select('*'); for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
        q = q.order(opts.order || PK[t] || 'id', { ascending: !opts.desc });
        const lim = opts.limit ? Math.min(PAGE, opts.limit - out.length) : PAGE;
        const { data, error } = await q.range(from, from + lim - 1); check(error, `load ${t}`);
        out.push(...(data || [])); if (!data || data.length < lim || (opts.limit && out.length >= opts.limit)) break;
      }
      return out;
    },
    async upsert(t, rows, oc) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await sb.from(t).upsert(rows.slice(i, i + CHUNK), oc ? { onConflict: oc } : undefined);
        check(error, `save ${t}`);
      }
    },
    async update(t, ids, patch) {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { error } = await sb.from(t).update(patch).in(PK[t] || 'id', ids.slice(i, i + CHUNK));
        check(error, `update ${t}`);
      }
    },
    async remove(t, ids) {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { error } = await sb.from(t).delete().in(PK[t] || 'id', ids.slice(i, i + CHUNK));
        check(error, `delete ${t}`);
      }
    },
    subscribe(cb) {
      const ch = sb.channel('arms-live-' + Math.random().toString(36).slice(2));
      for (const t of ['claims', 'work_log', 'claim_notes', 'config_options'] as TableName[]) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p: any) => {
          cb(t, p.eventType, p.eventType === 'DELETE' ? p.old : p.new);
        });
      }
      ch.subscribe();
      return () => { sb.removeChannel(ch); };
    },
  };
}
