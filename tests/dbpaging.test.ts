import { describe, expect, it } from 'vitest';
import { createSupabaseDB, listParallel } from '../src/lib/db/supabase';

// Minimal PostgREST-style query builder over an in-memory table: select/order/limit/gt/gte/lt, thenable.
function fake(rows: Record<string, any>[], failFirst = 0) {
  let fails = failFirst; const calls: number[] = [];
  const from = () => { const f: any[] = []; let lim = 1000, col = 'id';
    const q: any = { select: () => q, order: (c: string) => { col = c; return q; }, limit: (n: number) => { lim = n; return q; }, gt: (c: string, v: any) => { f.push((r: any) => r[c] > v); return q; }, gte: (c: string, v: any) => { f.push((r: any) => r[c] >= v); return q; }, lt: (c: string, v: any) => { f.push((r: any) => r[c] < v); return q; },
      then: (res: any) => { if (fails > 0) { fails--; return Promise.resolve({ data: null, error: { message: 'network blip' } }).then(res); } const data = rows.filter((r) => f.every((g) => g(r))).sort((a, b) => (a[col] < b[col] ? -1 : 1)).slice(0, lim); calls.push(data.length); return Promise.resolve({ data, error: null }).then(res); } };
    return q; };
  return { sb: { from } as any, calls };
}
const uuid = (i: number) => { const h = (Math.imul(i + 1, 2654435761) >>> 0).toString(16).padStart(8, '0'); return `${h}-0000-4000-8000-${String(i).padStart(12, '0')}`; };

describe('paged loading', () => {
  const rows = Array.from({ length: 7300 }, (_, i) => ({ id: uuid(i), n: i }));
  it('listParallel returns every row exactly once', async () => { const { sb } = fake(rows); const out = await listParallel(sb, 'claims'); expect(out.length).toBe(rows.length); expect(new Set(out.map((r) => r.id)).size).toBe(rows.length); });
  it('retries transient errors', async () => { const { sb } = fake(rows.slice(0, 50), 2); const out = await listParallel(sb, 'claims'); expect(out.length).toBe(50); }, 15000);
  it('small tables use plain keyset paging', async () => { const { sb } = fake(Array.from({ length: 2500 }, (_, i) => ({ id: uuid(i) }))); const out = await createSupabaseDB(sb).list('providers'); expect(out.length).toBe(2500); });
});
