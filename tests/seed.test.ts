import { describe, expect, it } from 'vitest';
import { buildSeed } from '../src/lib/seed';
import { ageDays, bucketFor, bucketsFrom } from '../src/lib/utils';
import { defaultConfig } from '../src/lib/defaults';

describe('large stress seed', () => {
  const t0 = Date.now(); const s = buildSeed('large'); const ms = Date.now() - t0;
  const claims = s.claims!; const open = claims.filter((c) => !c.closed_at);
  it('has 5 clients and 5000+ open claims', () => { expect(s.clients!.length).toBe(5); expect(open.length).toBeGreaterThan(5000); });
  it('fills every aging bucket for every client', () => {
    const b = bucketsFrom(defaultConfig() as any);
    for (const c of s.clients!) { const seen = new Set(open.filter((x) => x.client_id === c.id).map((x) => bucketFor(ageDays(x as any, { aging_basis: 'dos' } as any), b)?.label)); expect(seen.size).toBe(b.length); }
  });
  it('spreads statuses, payers and touch dates', () => {
    expect(new Set(open.map((c) => c.status)).size).toBeGreaterThan(5); expect(new Set(open.map((c) => c.payer)).size).toBeGreaterThan(8);
    const days = new Set(s.work_log!.map((w) => w.work_date)); expect(days.size).toBeGreaterThan(60);
  });
  it('seeds QA reviews with every status', () => { expect(new Set(s.qa_reviews!.map((q) => q.status)).size).toBeGreaterThanOrEqual(5); });
  it('builds in reasonable time', () => { console.log('seed ms', ms, 'claims', claims.length, 'touches', s.work_log!.length, 'snapshots', s.claim_snapshots!.length); expect(ms).toBeLessThan(20000); });
});

describe('demo seed', () => {
  it('builds the small demo with coverage only for existing clients', () => { const s = buildSeed('demo'); expect(s.clients!.length).toBe(3); expect(s.claims!.filter((c) => !c.closed_at).length).toBeGreaterThan(600); for (const p of s.profiles!) for (const id of (p as any).client_ids || []) expect(s.clients!.some((c) => c.id === id)).toBe(true); });
});

describe('QA seed covers every tab', () => {
  const s = buildSeed('demo'); const q = s.qa_reviews!;
  it('has queue, completed, disputed, resolved, calibration pairs and mapped errors', () => {
    expect(q.filter((r) => r.status === 'queued').length).toBeGreaterThanOrEqual(10); expect(q.some((r) => r.status === 'disputed')).toBe(true); expect(q.some((r) => r.status === 'resolved')).toBe(true);
    const g = new Map<string, number>(); q.filter((r) => r.is_calibration).forEach((r) => g.set(r.calibration_group, (g.get(r.calibration_group) || 0) + 1)); expect([...g.values()].filter((n) => n === 2).length).toBeGreaterThanOrEqual(5);
    const cats = new Set(['wrong_rca', 'wrong_action', 'wrong_path', 'incomplete_note', 'bad_followup', 'missing_ref', 'missed_deadline', 'unauthorized_adj']); const errs = q.flatMap((r) => r.errors); expect(errs.length).toBeGreaterThan(10); expect(errs.every((e: any) => cats.has(e.category))).toBe(true);
  });
});
