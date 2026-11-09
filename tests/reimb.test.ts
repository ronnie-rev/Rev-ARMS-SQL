import { describe, expect, it } from 'vitest';
import { buildRatesIndex, clientReimb, cptCodes, expectedFor, recalcExpected, resolveReimbCfg, validateClientReimb } from '../src/lib/engine/reimb';
import { detectUnderpayments, systemicUnderpay } from '../src/lib/engine/underpay';
import type { Claim, FeeSchedule } from '../src/lib/types';

const cfg = resolveReimbCfg(null);
const mk = (o: Partial<Claim> = {}): Claim => ({ id: 'c' + Math.random().toString(36).slice(2, 7), client_id: 'k1', claim_no: 'X', account_id: null, patient_name: null, dos: '2026-06-01', last_billed: null, payer: 'Aetna', provider: null, provider_type: null, cpt: '99213', billed_amt: 200, balance: 100, pms_status: null, denial_codes: null, status: 'New', rca: null, rca_detail: null, end_action: null, end_sub: null, mode: null, assigned_to: null, priority: 'Normal', next_fu: null, touch_count: 0, last_touched_at: null, custom: {}, first_batch: null, last_batch: null, closed_at: null, closed_reason: null, created_at: '', updated_at: '', flags: [], ...o } as Claim);
const sch = (o: Partial<FeeSchedule>): FeeSchedule => ({ id: 's' + Math.random().toString(36).slice(2, 6), name: 'Sched', client_id: null, payer: null, kind: 'contract', pct: null, effective_from: null, effective_to: null, active: true, notes: null, ...o });
const client = (reimb: any) => ({ id: 'k1', settings: { reimb } });

describe('expected reimbursement', () => {
  it('fee schedule → payer % → client GCR, each as a fallback', () => {
    const s = sch({ id: 's1', name: 'Aetna 2026', payer: 'Aetna' }); const rates = buildRatesIndex([{ schedule_id: 's1', cpt: '99213', amount: 88 }, { schedule_id: 's1', cpt: '99214', amount: 120 }]);
    const base = { cfg, schedules: [s], rates, client: client({ method: 'auto', gcr_pct: 40, payer_pct: { cigna: 55 } }) };
    expect(expectedFor(mk(), base)).toMatchObject({ amount: 88, src: 'fee_schedule' }); expect(expectedFor(mk({ cpt: '99213, 99214' }), base)!.amount).toBe(208);
    expect(expectedFor(mk({ payer: 'Cigna' }), base)).toMatchObject({ amount: 110, src: 'payer_pct' }); expect(expectedFor(mk({ payer: 'Humana' }), base)).toMatchObject({ amount: 80, src: 'gcr' });
    expect(expectedFor(mk({ cpt: '12345' }), base)).toMatchObject({ amount: 80, src: 'gcr' });   // no rate for this CPT → falls through to GCR
  });
  it('client method forces the source; nothing configured → null', () => {
    const s = sch({ id: 's1' }); const rates = buildRatesIndex([{ schedule_id: 's1', cpt: '99213', amount: 88 }]);
    expect(expectedFor(mk(), { cfg, schedules: [s], rates, client: client({ method: 'gcr', gcr_pct: 50 }) })).toMatchObject({ amount: 100, src: 'gcr' });
    expect(expectedFor(mk(), { cfg, schedules: [s], rates, client: client({ method: 'payer_pct', gcr_pct: null, payer_pct: {} }) })).toBeNull();
    expect(expectedFor(mk(), { cfg, schedules: [], rates: new Map(), client: client({ method: 'auto' }) })).toBeNull();
  });
  it('schedule scoping: client+payer beats global; effective dates and inactive rows respected; medicare % applied', () => {
    const g = sch({ id: 'g', name: 'Global' }), cp = sch({ id: 'cp', name: 'Client Aetna', client_id: 'k1', payer: 'Aetna' }), old = sch({ id: 'o', name: 'Old', client_id: 'k1', payer: 'Aetna', effective_to: '2025-12-31' }), off = sch({ id: 'x', name: 'Off', client_id: 'k1', active: false }), mp = sch({ id: 'm', name: 'Medicare 120%', payer: 'Medicare', kind: 'medicare_pct', pct: 120 });
    const rates = buildRatesIndex([{ schedule_id: 'g', cpt: '99213', amount: 70 }, { schedule_id: 'cp', cpt: '99213', amount: 95 }, { schedule_id: 'o', cpt: '99213', amount: 50 }, { schedule_id: 'x', cpt: '99213', amount: 1 }, { schedule_id: 'm', cpt: '99213', amount: 60 }]);
    const ctx = { cfg, schedules: [g, cp, old, off, mp], rates, client: client({ method: 'auto' }) };
    expect(expectedFor(mk(), ctx)).toMatchObject({ amount: 95, schedule: 'cp' }); expect(expectedFor(mk({ payer: 'Cigna' }), ctx)!.amount).toBe(70); expect(expectedFor(mk({ payer: 'Medicare' }), ctx)!.amount).toBe(72);
  });
  it('recalc reports only what changed and leaves manual values alone', () => {
    const c1 = mk({ id: 'a' }), c2 = mk({ id: 'b', expected_amt: 99, expected_src: 'manual' }), c3 = mk({ id: 'c', expected_amt: 80, expected_src: 'gcr', billed_amt: 200 });
    const r = recalcExpected([c1, c2, c3], new Map([['k1', client({ method: 'gcr', gcr_pct: 40 }) as any]]), { cfg, schedules: [], rates: new Map() }, 'now'); expect(r.changed.map((x) => x.id)).toEqual(['a']); expect(r.changed[0].expected_amt).toBe(80);
  });
  it('parses CPT lists and validates the client form', () => { expect(cptCodes('99213-25, 11042; j3490 12345')).toEqual(['99213', '11042', 'J3490', '12345']); expect(validateClientReimb(clientReimb({ settings: { reimb: { method: 'gcr' } } } as any))[0]).toMatch(/GCR/); expect(validateClientReimb({ method: 'auto', gcr_pct: 250, payer_pct: {} })[0]).toMatch(/between/); expect(validateClientReimb({ method: 'auto', gcr_pct: 45, payer_pct: { aetna: 60 } })).toEqual([]); });
});

describe('underpayment detector', () => {
  const exp = (o: Partial<Claim>) => mk({ expected_amt: 100, expected_src: 'fee_schedule', paid_amt: 70, patient_resp: 10, ...o });
  it('flags allowed-below-contract and short-pays above the thresholds only', () => {
    const items = detectUnderpayments([exp({ id: 'a', allowed_amt: 80 }), exp({ id: 'b' }), exp({ id: 'c', paid_amt: 95, patient_resp: 4 }), exp({ id: 'd', paid_amt: 92, patient_resp: 5 }), exp({ id: 'e', paid_amt: null })], cfg, '2026-10-30');
    expect(items.map((i) => `${i.claim.id}:${i.kind}:${i.variance}`).sort()).toEqual(['a:allowed_below_contract:20', 'b:short_pay:20']);
  });
  it('estimates (payer % / GCR) are low confidence; denials and old closed claims are ignored; written-off shortfalls are marked', () => {
    const items = detectUnderpayments([exp({ id: 'a', expected_src: 'gcr' }), exp({ id: 'b', denial_codes: 'CO-50', paid_amt: 0 }), exp({ id: 'c', closed_at: '2025-01-01T00:00:00Z' }), exp({ id: 'd', closed_at: '2026-10-01T00:00:00Z', resolution: 'adjusted' })], cfg, '2026-10-30');
    expect(items.map((i) => i.claim.id).sort()).toEqual(['a', 'd']); expect(items.find((i) => i.claim.id === 'a')!.confidence).toBe('low'); expect(items.find((i) => i.claim.id === 'd')!.writtenOff).toBe(true);
  });
  it('systemic: same payer + CPT repeatedly', () => { const many = Array.from({ length: 6 }, (_, i) => exp({ id: 'm' + i })); const sys = systemicUnderpay(detectUnderpayments(many, cfg, '2026-10-30'), cfg); expect(sys).toHaveLength(1); expect(sys[0]).toMatchObject({ payer: 'Aetna', cpt: '99213', n: 6, total: 120 }); expect(systemicUnderpay(detectUnderpayments(many.slice(0, 3), cfg, '2026-10-30'), cfg)).toEqual([]); });
});
