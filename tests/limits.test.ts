import { describe, expect, it } from 'vitest';
import { buildLimitIndex, deadlinesFor, escalationPlan, limitInsights, nearest, radarItems, resolveLimitsCfg, STARTER_LIMITS, tierOf, validateLimitsCfg } from '../src/lib/engine/limits';
import type { Claim, PayerLimit } from '../src/lib/types';

const cfg = resolveLimitsCfg(null); const TODAY = '2026-10-30';
const mk = (o: Partial<Claim> = {}): Claim => ({ id: 'c' + Math.random().toString(36).slice(2, 8), client_id: 'k1', claim_no: 'C1', account_id: null, patient_name: 'A, B', dos: '2026-06-01', last_billed: '2026-06-05', payer: 'Aetna', provider: null, provider_type: null, cpt: '99213', billed_amt: 500, balance: 500, pms_status: 'Billed Primary', denial_codes: null, status: 'New', rca: null, rca_detail: null, end_action: null, end_sub: null, mode: null, assigned_to: null, priority: 'Normal', next_fu: null, touch_count: 0, last_touched_at: null, custom: {}, first_batch: null, last_batch: null, closed_at: null, closed_reason: null, created_at: '', updated_at: '', flags: [], ...o } as Claim);
const row = (o: Partial<PayerLimit>): PayerLimit => ({ id: Math.random().toString(36), payer: 'Aetna', client_id: null, plan_type: null, tfl_days: null, afl_days: null, ccfl_days: null, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: null, notes: null, verified_on: null, active: true, ...o });
const idx = (rows: PayerLimit[], meta: Record<string, any> = {}, tf: number | null = null) => buildLimitIndex({ rows, payerMeta: new Map(Object.entries(meta)), clients: [{ id: 'k1', tf_days: tf }, { id: 'k2', tf_days: null }], cfg });

describe('limit cascade', () => {
  it('client+payer beats payer beats directory beats client default; each field cascades on its own', () => {
    const i = idx([row({ tfl_days: 180, afl_days: 120 }), row({ client_id: 'k1', tfl_days: 90 })], { aetna: { tf_days: 365, appeal_days: 60, ccfl_days: 200 } }, 400);
    const r = i.resolve('Aetna', 'k1'); expect([r.tfl, r.afl, r.ccfl]).toEqual([90, 120, 200]); expect(r.from).toEqual({ tfl: 'client+payer', afl: 'payer', ccfl: 'directory' });
    expect(i.resolve('Aetna', 'k2').tfl).toBe(180); expect(i.resolve('Nobody', 'k1').tfl).toBe(400); expect(i.resolve('Nobody', 'k1').from.tfl).toBe('client'); expect(i.resolve('Nobody', 'k2').tfl).toBeNull();
  });
  it('payer names match loosely, inactive rows are ignored, plan type narrows', () => {
    const i = idx([row({ tfl_days: 100, active: false }), row({ payer: 'Medicare', plan_type: 'Medicare', tfl_days: 365 }), row({ payer: 'Medicare', plan_type: 'Advantage', tfl_days: 180 })]);
    expect(i.resolve('Aetna', 'k1').tfl).toBeNull(); expect(i.resolve('  MEDICARE ', 'k1', 'Advantage').tfl).toBe(180); expect(i.resolve('medicare', 'k1', 'Medicare').tfl).toBe(365); expect(i.known('medicare')).toBe(true);
  });
  it('starter pack is complete and plausible', () => { expect(STARTER_LIMITS.length).toBeGreaterThanOrEqual(10); for (const r of STARTER_LIMITS) { expect(r.tfl_days).toBeGreaterThan(0); expect(r.afl_days).toBeGreaterThan(0); expect(r.source).toBeTruthy(); } });
});

describe('deadline clocks', () => {
  const i = idx([row({ tfl_days: 180, afl_days: 60, ccfl_days: 90 })]);
  it('TFL only matters while the claim still needs (re)filing', () => {
    const ok = deadlinesFor(mk(), i.resolve('Aetna', 'k1'), TODAY, cfg); expect(ok.find((d) => d.kind === 'tfl')!.relevant).toBe(false); expect(nearest(ok)).toBeNull();
    const unbilled = deadlinesFor(mk({ last_billed: null, pms_status: 'Unbilled' }), i.resolve('Aetna', 'k1'), TODAY, cfg).find((d) => d.kind === 'tfl')!; expect(unbilled.relevant).toBe(true); expect(unbilled.due).toBe('2026-11-28'); expect(unbilled.left).toBe(29); expect(unbilled.tier).toBe('warn');
  });
  it('AFL / CCFL start from the denial date (exact) or are estimated, and CCFL needs a correctable denial', () => {
    const exact = deadlinesFor(mk({ denial_codes: 'CO-16', rca: 'Billing Error', denial_date: '2026-10-10' }), i.resolve('Aetna', 'k1'), TODAY, cfg); const a = exact.find((d) => d.kind === 'afl')!, cc = exact.find((d) => d.kind === 'ccfl')!;
    expect(a).toMatchObject({ due: '2026-12-09', left: 40, startSrc: 'exact', relevant: true }); expect(cc).toMatchObject({ due: '2027-01-08', relevant: true });
    const medical = deadlinesFor(mk({ denial_codes: 'CO-50', rca: 'Medical Necessity' }), i.resolve('Aetna', 'k1'), TODAY, cfg); expect(medical.find((d) => d.kind === 'afl')!.relevant).toBe(true); expect(medical.find((d) => d.kind === 'ccfl')!.relevant).toBe(false); expect(medical.find((d) => d.kind === 'afl')!.startSrc).toBe('estimated');
  });
  it('closed claims have no relevant deadlines; tiers follow the configured thresholds', () => { expect(deadlinesFor(mk({ denial_codes: 'CO-16', closed_at: 'x' }), i.resolve('Aetna', 'k1'), TODAY, cfg).every((d) => !d.relevant)).toBe(true); expect([-1, 0, 7, 8, 14, 30, 31, 60, 61].map((n) => tierOf(n, cfg))).toEqual(['expired', 'critical', 'critical', 'high', 'high', 'warn', 'watch', 'watch', 'ok']); });
  it('config validation', () => { expect(validateLimitsCfg(cfg)).toEqual([]); expect(validateLimitsCfg(resolveLimitsCfg({ tiers: { critical: 30, high: 14, warn: 7, watch: 60 } }))[0]).toMatch(/Tiers/); expect(validateLimitsCfg(resolveLimitsCfg({ escalate: { owner: 5, supervisor: 14, manager: 7 } }))[0]).toMatch(/Escalation/); });
});

describe('radar, escalation, insights', () => {
  const i = idx([row({ tfl_days: 180, afl_days: 60, ccfl_days: 90 })]);
  const claims = [mk({ id: 'a', denial_codes: 'CO-50', denial_date: '2026-08-20', balance: 900 }), mk({ id: 'b', denial_codes: 'CO-50', denial_date: '2026-10-25', balance: 100 }), mk({ id: 'c', denial_codes: 'CO-50', denial_date: '2026-09-25', balance: 300 }), mk({ id: 'd', payer: 'Mystery Plan', balance: 50 }), mk({ id: 'e', denial_codes: 'CO-50', denial_date: '2026-10-25', closed_at: 'x' })];
  it('lists only open, relevant deadlines sorted by urgency', () => { const r = radarItems(claims, i, cfg, TODAY); expect(r.map((x) => x.claim.id)).toEqual(['a', 'c', 'b']); expect(r[0].deadline.left).toBe(-11); expect(r[1].deadline.left).toBe(25); });
  it('escalates once per stage, never downgrades, flags and raises priority', () => {
    const r = radarItems(claims, i, cfg, TODAY); const plan = escalationPlan(r, cfg); const a = plan.find((p) => p.claimId === 'a')!; expect(a.stage).toBe('s0'); expect(a.priority).toBe('Critical'); expect(a.flags.add).toContain('deadline_expired'); expect(a.notify.map((n) => n.audience)).toEqual(['supervisor', 'manager']);
    const c = plan.find((p) => p.claimId === 'c')!; expect(c.stage).toBe('s30'); expect(c.notify.map((n) => n.audience)).toEqual(['owner']); expect(c.priority).toBeNull();
    const b = plan.find((p) => p.claimId === 'b'); expect(b).toBeUndefined();   // 55 days left: watch only, nothing to do yet
    const again = escalationPlan(radarItems(claims.map((x) => (x.id === 'a' ? { ...x, flags: ['deadline_expired'], custom: { radar: { stage: 's0', kind: 'afl', due: a.due } } } : x)), i, cfg, TODAY), cfg); expect(again.find((p) => p.claimId === 'a')).toBeUndefined();
    const worse = escalationPlan(radarItems([{ ...claims[2], custom: { radar: { stage: 's30', kind: 'afl', due: c.due } }, flags: ['deadline_risk'] } as Claim], i, cfg, '2026-11-18'), cfg); expect(worse[0].stage).toBe('s7');
  });
  it('insights name payers without limits, expired and estimated clocks', () => { const ins = limitInsights([...claims, mk({ id: 'z', denial_codes: 'CO-50' })], i, cfg, TODAY); expect(ins.find((x) => x.id === 'no_limits')!.payers).toContain('Mystery Plan'); expect(ins.find((x) => x.id === 'expired')!.count).toBe(2); /* a (real date) and z (estimated from last billed) */ expect(ins.find((x) => x.id === 'estimated')!.count).toBeGreaterThan(0); });
});

import { radarDigest } from '../src/lib/engine/limits';
describe('weekly client digest', () => {
  it('aggregates expiring deadlines per payer without identifiers', () => {
    const cfg = resolveLimitsCfg(null); const idx = buildLimitIndex({ rows: [{ id: '1', payer: 'Aetna', client_id: null, plan_type: null, tfl_days: 180, afl_days: 180, ccfl_days: 180, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: null, notes: null, verified_on: null, active: true }], clients: [{ id: 'c1', tf_days: null }], cfg });
    const today = '2026-06-01'; const dos = (back: number) => new Date(Date.parse(today + 'T12:00:00Z') - back * 864e5).toISOString().slice(0, 10);
    const mk = (id: string, back: number) => ({ id, client_id: 'c1', payer: 'Aetna', balance: 100, dos: dos(back), last_billed: null, closed_at: null, claim_no: id, pms_status: 'Unbilled', flags: [], custom: {} }) as any;
    const d = radarDigest([mk('a', 190), mk('b', 177), mk('c', 150), mk('d', 10)], idx, cfg, today, 'c1');
    expect(d.expired.n).toBe(1); expect(d.critical.n).toBe(1); expect(d.rows[0]).toMatchObject({ payer: 'Aetna', kind: 'tfl' }); expect(JSON.stringify(d)).not.toContain('claim_no');
  });
});
