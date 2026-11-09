// Scheduled report sender (Netlify Scheduled Function). Runs hourly, sends every due schedule once.
// Required env (Netlify → Site settings → Environment variables — NEVER expose these to the browser):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   – server-side read access to claims/batches/schedules
//   RESEND_API_KEY, REPORT_FROM               – email delivery via Resend (https://resend.com)
// Optional: REPORTS_DRY_RUN=1 (render + log, send nothing), REPORTS_SECRET (enables manual trigger: ?secret=…&id=<schedule>&dry=1)
import type { Config } from '@netlify/functions';
import { buildReport, isDue } from '../../src/lib/engine/report';
import { carcMap } from '../../src/lib/engine/carc';
import { buildLimitIndex, radarDigest, resolveLimitsCfg } from '../../src/lib/engine/limits';
import { buildPayerIndex } from '../../src/lib/engine/payers';

const env = (k: string) => (globalThis as any).Netlify?.env?.get?.(k) ?? process.env[k];
const SB = () => env('SUPABASE_URL')!.replace(/\/$/, '');
const H = () => ({ apikey: env('SUPABASE_SERVICE_ROLE_KEY')!, Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' });

async function rest<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${SB()}/rest/v1/${path}`, { ...init, headers: { ...H(), ...(init?.headers || {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  const text = await r.text();
  return (text ? JSON.parse(text) : null) as T;
}
async function all<T = any>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) { const r = await fetch(`${SB()}/rest/v1/${path}`, { headers: { ...H(), Range: `${from}-${from + 999}` } }); if (!r.ok) throw new Error(`${path}: ${r.status}`); const rows = (await r.json()) as T[]; out.push(...rows); if (rows.length < 1000) break; }
  return out;
}

export default async (req: Request) => {
  const url = new URL(req.url); const manual = url.searchParams.get('secret');
  if (manual !== null && manual !== env('REPORTS_SECRET')) return new Response('forbidden', { status: 403 });
  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY')) return new Response('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set', { status: 500 });
  const dry = env('REPORTS_DRY_RUN') === '1' || url.searchParams.get('dry') === '1'; const only = url.searchParams.get('id'); const now = new Date(); const log: string[] = [];
  const schedules = await all<any>('report_schedules?active=eq.true&select=*');
  const due = schedules.filter((s) => (only ? s.id === only : isDue(s, now)));
  if (!due.length) return new Response('nothing due', { status: 200 });
  const [clients, config, limitRows, limitCfgRows] = await Promise.all([all<any>('clients?select=*'), all<any>('config_options?category=in.(bucket,payer)&select=*'), all<any>('payer_limits?active=eq.true&select=*').catch(() => []), all<any>('app_settings?key=eq.limits_cfg&select=*').catch(() => [])]);
  const limitCfg = resolveLimitsCfg(limitCfgRows[0]?.value); const payerDir = config.filter((o) => o.category === 'payer' && o.active); const pidx = buildPayerIndex(payerDir.map((o) => ({ value: o.value, aliases: o.meta?.aliases })));
  const limitIdx = buildLimitIndex({ rows: limitRows, payerMeta: new Map(payerDir.map((o) => [o.value, o.meta || {}])), clients, cfg: limitCfg, canon: (n) => pidx.canon(n).name });
  const buckets = config.filter((o) => o.category === 'bucket' && o.active).sort((a, b) => a.sort - b.sort).map((o) => ({ label: o.value, min: Number(o.meta?.min ?? 0), max: o.meta?.max == null || o.meta?.max === '' ? null : Number(o.meta.max), color: o.color || '' }));
  const payerTf = new Map<string, number>(config.filter((o) => o.category === 'payer' && o.meta?.tf_days).map((o) => [String(o.value).toLowerCase(), Number(o.meta.tf_days)]));
  for (const s of due) {
    try {
      const scope = s.client_id ? `&client_id=eq.${s.client_id}` : '';
      const [claims, batches, recoveries] = await Promise.all([all<any>(`claims?closed_at=is.null${scope}&select=*`), all<any>(`import_batches?select=id,client_id,status,created_at,summary${s.client_id ? `&client_id=eq.${s.client_id}` : ''}`), all<any>(`recoveries?select=client_id,amount,occurred_on${s.client_id ? `&client_id=eq.${s.client_id}` : ''}`)]);
      const rep = buildReport({ clients, claims, batches, recoveries, buckets, carc: carcMap(), today: now.toISOString().slice(0, 10), payerTf, radar: s.client_id ? radarDigest(claims, limitIdx, limitCfg, now.toISOString().slice(0, 10), s.client_id) : undefined }, s.audience, s.client_id);
      if (!s.recipients?.length) { log.push(`${s.name}: no recipients`); continue; }
      if (dry) { log.push(`${s.name}: DRY RUN → ${s.recipients.join(', ')} · ${rep.subject}`); continue; }
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env('REPORT_FROM'), to: s.recipients, subject: rep.subject, html: rep.html, text: rep.text }) });
      if (!r.ok) throw new Error(`email provider ${r.status}: ${await r.text()}`);
      await rest(`report_schedules?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify({ last_sent_at: now.toISOString() }) });
      await rest('audit_log', { method: 'POST', body: JSON.stringify({ kind: 'report_sent', actor_name: 'scheduler', entity: 'report_schedules', entity_id: s.id, summary: `Sent “${s.name}” to ${s.recipients.length} recipient(s)`, meta: { subject: rep.subject } }) });
      log.push(`${s.name}: sent to ${s.recipients.length}`);
    } catch (e: any) {
      log.push(`${s.name}: FAILED ${e.message}`);
      try { await rest('audit_log', { method: 'POST', body: JSON.stringify({ kind: 'report_failed', actor_name: 'scheduler', entity: 'report_schedules', entity_id: s.id, summary: `Report “${s.name}” failed: ${e.message}` }) }); } catch { /* ignore */ }
    }
  }
  return new Response(log.join('\n'), { status: 200 });
};

export const config: Config = { schedule: '@hourly' };
