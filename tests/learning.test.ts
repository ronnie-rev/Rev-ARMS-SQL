import { describe, expect, it } from 'vitest';
import { actionSuccess, appealOdds, denialRisk } from '../src/lib/engine/learning';
const C = (o: any) => ({ id: o.id, payer: 'Aetna', cpt: '99213', provider: 'Dr A', denial_codes: null, closed_at: null, ...o }) as any;
const A = (id: string, claim: string, status: string, rec = 0) => ({ id, claim_id: claim, kind: 'appeal', status, payer: 'Aetna', amount_recovered: rec }) as any;
describe('learning', () => {
  it('appeal odds use payer+code then fall back', () => {
    const claims = Array.from({ length: 6 }, (_, i) => C({ id: 'c' + i, denial_codes: 'CO-50' })); const ap = claims.map((c, i) => A('a' + i, c.id, i < 4 ? 'won' : 'lost', 100));
    const o = appealOdds(ap, claims)('Aetna', 'CO-50')!; expect(o.n).toBe(6); expect(o.winRate).toBeCloseTo(4 / 6); expect(o.level).toBe('payer+code'); expect(appealOdds(ap, claims)('Aetna', 'CO-97')!.level).toBe('payer'); expect(appealOdds(ap, claims)('Cigna', 'CO-99')).toBeNull();
  });
  it('denial risk ranks a bad payer×CPT above a clean one and smooths thin data', () => {
    const cl = [...Array.from({ length: 10 }, (_, i) => C({ id: 'a' + i, cpt: '11042', denial_codes: i < 8 ? 'CO-16' : null })), ...Array.from({ length: 30 }, (_, i) => C({ id: 'b' + i, cpt: '99213' })), C({ id: 'z', cpt: '77777', denial_codes: 'CO-4' })];
    const m = denialRisk(cl); expect(m.score({ payer: 'Aetna', cpt: '11042', provider: 'Dr A' }).score).toBeGreaterThan(m.score({ payer: 'Aetna', cpt: '99213', provider: 'Dr A' }).score); expect(m.top()[0].cpt).toBe('11042');
  });
  it('action success measures closures inside the window', () => {
    const claims = [C({ id: 'x', closed_at: '2026-03-10' }), C({ id: 'y' })]; const wl = Array.from({ length: 6 }, (_, i) => ({ claim_id: i < 3 ? 'x' : 'y', end_action: 'Called payer', work_date: '2026-03-01' })) as any;
    const r = actionSuccess(wl, claims)[0]; expect(r.n).toBe(6); expect(r.resolved).toBe(3); expect(r.medianDays).toBe(9);
  });
});
import { describeRuleChange, ruleLab, type CustomRec } from '../src/lib/engine/customrec';
describe('rule lab', () => {
  const R = (id: string, bal: number, act: any, urg = 60): CustomRec => ({ id, name: id, enabled: true, client_id: null, match: 'all', conditions: [{ field: 'balance', op: 'gte', value: bal }], label: id, color: '#000', urgency: urg, why: '', action: act });
  const open = Array.from({ length: 10 }, (_, i) => ({ id: 'c' + i, client_id: 'x', balance: (i + 1) * 100 }) as any); const env: any = { today: '2026-01-01', buckets: [], clients: new Map(), payerTf: new Map(), carc: new Map() };
  it('finds dead, broad and conflicting rules', () => {
    const lab = ruleLab([R('a', 500, { type: 'appeal' }), R('b', 600, { type: 'corrected' }), R('dead', 99999, { type: 'none' }), R('all', 0, { type: 'none' })], open, env);
    expect(lab.health.find((h) => h.id === 'dead')!.flag).toBe('dead'); expect(lab.health.find((h) => h.id === 'all')!.flag).toBe('broad'); expect(lab.conflicts.some((c) => c.a === 'a' && c.b === 'b')).toBe(true); expect(lab.health.find((h) => h.id === 'a')!.dollars).toBe(100 * (5 + 6 + 7 + 8 + 9 + 10));
  });
  it('describes changes', () => { expect(describeRuleChange([R('a', 1, { type: 'none' })], [{ ...R('a', 1, { type: 'none' }), enabled: false }, R('b', 1, { type: 'none' })])).toContain('disabled'); });
});
