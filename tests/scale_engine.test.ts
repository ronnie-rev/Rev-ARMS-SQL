import { describe, expect, it } from 'vitest';
import { buildIndex, matchRows } from '../src/lib/engine/match';
import { buildPlan } from '../src/lib/engine/reconcile';
import { buildRows, collapse } from '../src/lib/engine/rows';
import { resolveSettings } from '../src/lib/engine/settings';
import { backfillUids } from '../src/lib/engine/uid';
import type { Claim, Client } from '../src/lib/types';

// Commercial-scale guard: a 60,000-claim practice receiving a 60,000-row weekly file must reconcile in seconds, not minutes.
const HEAD = ['Claim Number', 'Patient Name', 'Date of Service', 'Payer', 'CPT', 'Billed Amt', 'Balance', 'Encounter #'];
const MAP: Record<string, string | null> = { claim_no: 'Claim Number', patient_name: 'Patient Name', dos: 'Date of Service', payer: 'Payer', cpt: 'CPT', billed_amt: 'Billed Amt', balance: 'Balance', encounter_no: 'Encounter #' };
const mk = (n: number, bal = 200 + (n % 97)) => ({ 'Claim Number': 'S' + (1000000 + n), 'Patient Name': `PATIENT${n}, TEST`, 'Date of Service': `0${1 + (n % 9)}/${10 + (n % 17)}/2026`, Payer: ['Aetna', 'Cigna', 'UHC', 'Medicare'][n % 4], CPT: String(99200 + (n % 40)), 'Billed Amt': bal + 50, Balance: bal, 'Encounter #': 'E' + n });
describe('engine at commercial scale', () => {
  const N = 60000; const client = { id: 'c1', name: 'Big Practice', code: 'BIG' } as Client; const s = resolveSettings({ maxDropPct: 100, maxTotalDeltaPct: 100 }, null);
  it('reconciles 60k existing × 60k rows (5k new, 5k missing) quickly and exactly', () => {
    const t0 = Date.now(); const first = buildRows(Array.from({ length: N }, (_, i) => mk(i)), HEAD, MAP, s, []); const col = collapse(first.rows, s); const p1 = buildPlan({ rows: col.rows, matches: matchRows(col.rows, buildIndex([], s), s), existing: [], client, settings: s, mode: 'snapshot', batchId: 'b1', now: '2026-09-01T00:00:00Z', asOf: '2026-09-01', priorBatches: [], knownPayers: new Set(), pre: { skipped: first.skipped, dups: col.dropped, aggregated: col.aggregated, conflicts: col.conflicts, badDateRows: 0, totalRows: N } });
    const t1 = Date.now(); expect(p1.creates).toHaveLength(N);
    const claims = backfillUids(p1.creates.map((c) => ({ ...c, created_at: '2026-09-01T00:00:00Z' })) as any, [client]) as unknown as Claim[]; expect(new Set(claims.map((c) => c.claim_uid)).size).toBe(N);
    const t2 = Date.now(); const file = [...Array.from({ length: N - 5000 }, (_, i) => mk(i + 5000, 300)), ...Array.from({ length: 5000 }, (_, i) => mk(N + i))];
    const b = buildRows(file, HEAD, MAP, s, []); const c2 = collapse(b.rows, s); const idx = buildIndex(claims, s); const m = matchRows(c2.rows, idx, s);
    const plan = buildPlan({ rows: c2.rows, matches: m, existing: claims, client, settings: s, mode: 'snapshot', batchId: 'b2', now: '2026-09-08T00:00:00Z', asOf: '2026-09-08', priorBatches: [], knownPayers: new Set(), pre: { skipped: b.skipped, dups: c2.dropped, aggregated: c2.aggregated, conflicts: c2.conflicts, badDateRows: 0, totalRows: file.length } });
    const t3 = Date.now(); console.log(`engine ms — first import ${t1 - t0}, uid backfill ${t2 - t1}, weekly reconcile ${t3 - t2}`);
    expect(plan.creates).toHaveLength(5000); expect(plan.reviews).toHaveLength(5000); expect(plan.closes).toHaveLength(0); expect(plan.changes.length).toBe(N - 5000);
    expect(t1 - t0).toBeLessThan(20000); expect(t3 - t2).toBeLessThan(20000);
  }, 120000);
});
