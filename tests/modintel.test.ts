import { describe, expect, it } from 'vitest';
import { calibrationGroups, coachingPlan, coachTip, reviewerBias } from '../src/lib/engine/qacoach';
import { payerRisk } from '../src/lib/engine/payerrisk';
import { collectabilityCurve } from '../src/lib/engine/collectability';
import { buildNarrative } from '../src/lib/engine/reportnarrative';

const R = (id: string, analyst: string, o: any = {}) => ({ id, analyst_id: analyst, reviewer_id: 'rv1', score: 90, result: 'pass', errors: [], reviewed_at: '2026-10-20T10:00:00Z', created_at: '2026-10-20T10:00:00Z', is_calibration: false, ...o }) as any;
describe('QA coaching', () => {
  it('finds recurring errors above the team rate and ranks the analyst needing help', () => {
    const doc = (n: number) => ({ criterion: 'c1', category: 'Documentation', severity: 'major', note: 'No reference # ' + n });
    const rs = [...Array.from({ length: 6 }, (_, i) => R('a' + i, 'ann', { score: 70, result: 'fail', errors: [doc(i)] })), ...Array.from({ length: 6 }, (_, i) => R('b' + i, 'bob', { score: 95 })), ...Array.from({ length: 4 }, (_, i) => R('c' + i, 'ann', { score: 88, reviewed_at: '2026-08-01T10:00:00Z' }))];
    const plan = coachingPlan(rs, { today: '2026-11-06' }); expect(plan[0].analystId).toBe('ann'); expect(plan[0].items[0].category).toBe('Documentation'); expect(plan[0].items[0].tip).toMatch(/touch note/); expect(plan[0].trend).toBe('down'); expect(plan.find((p) => p.analystId === 'bob')!.items.length).toBe(0);
    expect(coachTip('Compliance miss')).toMatch(/compliance/i); expect(coachTip('zzz')).toMatch(/three recent examples/);
  });
  it('measures calibration spread and reviewer leniency', () => {
    const rs = [R('1', 'x', { is_calibration: true, calibration_group: 'g1', reviewer_id: 'r1', score: 95 }), R('2', 'x', { is_calibration: true, calibration_group: 'g1', reviewer_id: 'r2', score: 70 }), R('3', 'y', { is_calibration: true, calibration_group: 'g2', reviewer_id: 'r1', score: 92 }), R('4', 'y', { is_calibration: true, calibration_group: 'g2', reviewer_id: 'r2', score: 86 })];
    const g = calibrationGroups(rs); expect(g[0].group).toBe('g1'); expect(g[0].spread).toBe(25); const b = reviewerBias(rs, g); expect(b.find((x) => x.reviewerId === 'r1')!.label).toBe('lenient'); expect(b.find((x) => x.reviewerId === 'r2')!.label).toBe('strict');
  });
});

const X = (id: string, c: any = {}, x: any = {}) => ({ c: { id, payer: 'Aetna', balance: 100, denial_codes: null, closed_at: null, dos: '2026-01-01', created_at: '2026-01-01', last_billed: '2026-01-01', ...c }, open: !c.closed_at, age: 60, tfLeft: null, ...x }) as any;
describe('payer watchlist', () => {
  it('scores a payer that denies a lot, pays slowly, loses appeals and sits near deadlines', () => {
    const bad = Array.from({ length: 20 }, (_, i) => X('b' + i, { payer: 'BadCo', denial_codes: i < 10 ? 'CO-50' : null, closed_at: i % 2 ? '2026-06-01' : null, paid_amt: 40, expected_amt: 100 }, { tfLeft: i < 4 ? 10 : 100 }));
    const good = Array.from({ length: 30 }, (_, i) => X('g' + i, { payer: 'GoodCo', closed_at: '2026-02-01', paid_amt: 100, expected_amt: 100 }));
    const ap = Array.from({ length: 5 }, (_, i) => ({ id: 'p' + i, claim_id: 'b' + i, status: 'lost' })) as any;
    const r = payerRisk([...bad, ...good], ap); expect(r[0].payer).toBe('BadCo'); expect(r[0].tier).not.toBe('ok'); expect(r[0].reasons.join('|')).toMatch(/Denies 50%/); expect(r[0].reasons.join('|')).toMatch(/Appeals win only 0%/); expect(r[0].reasons.join('|')).toMatch(/filing limit/); expect(r.find((p) => p.payer === 'GoodCo')!.tier).toBe('ok'); expect(payerRisk([X('1')], [])).toEqual([]);
  });
});
describe('collectability curve', () => {
  it('learns resolution odds by age from closed claims and applies them to open balances', () => {
    const closed = Array.from({ length: 60 }, (_, i) => X('c' + i, { closed_at: i < 40 ? '2026-02-10' : '2026-05-15', paid_amt: 80, billed_amt: 100 }, { open: false, age: null }));
    const open = [X('o1', { balance: 1000 }, { age: 10 }), X('o2', { balance: 2000 }, { age: 400 })]; const r = collectabilityCurve([...closed, ...open]);
    expect(r.closedSample).toBe(60); const young = r.buckets.find((b) => b.from === 0)!; expect(young.balance).toBe(1000); expect(young.p30).not.toBeNull(); expect(r.buckets.find((b) => b.from === 365)!.balance).toBe(2000); expect(r.expected30).toBeGreaterThanOrEqual(0);
  });
});
describe('executive narrative', () => {
  it('writes the summary, flags concentration, deadlines and unowned claims', () => {
    const ecs = [X('1', { balance: 9000, assigned_to: null }, { age: 130, tfLeft: 10 }), X('2', { balance: 1000, payer: 'Cigna', assigned_to: 'u', denial_codes: 'CO-50' }, { age: 20 })];
    const rec = [{ amount: 500, occurred_on: '2026-11-03' }, { amount: 1000, occurred_on: '2026-10-02' }] as any; const n = buildNarrative({ ecs, recoveries: rec, appeals: [], today: '2026-11-06', scope: 'Acme Clinic' });
    expect(n.paragraphs[0]).toContain('$10,000'); expect(n.paragraphs[0]).toContain('90%'); expect(n.text).toContain('behind'); expect(n.paragraphs.join(' ')).toContain('CO-50'); expect(n.actions.join(' ')).toMatch(/Aetna holds 90%/); expect(n.actions.join(' ')).toMatch(/deadline-critical/); expect(n.actions.join(' ')).toMatch(/unowned/);
    expect(buildNarrative({ ecs: [], recoveries: [], appeals: [], today: '2026-11-06' }).paragraphs[0]).toMatch(/no open A\/R/);
  });
});
