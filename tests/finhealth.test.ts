import { describe, expect, it } from 'vitest';
import { clientHealth, findDupes, heatmap, pareto, pursueRank, staffing } from '../src/lib/engine/finhealth';
const E = (id: string, o: any = {}, c: any = {}) => ({ c: { created_at: '2026-02-20T00:00:00Z', id, claim_no: 'N' + id, client_id: 'c1', payer: 'Aetna', balance: 1000, billed_amt: 1000, denial_codes: null, touch_count: 1, last_touched_at: '2026-03-01T00:00:00Z', account_id: 'A1', dos: '2026-01-05', cpt: '99213', status: 'Open', ...c }, age: 30, bucket: { label: '0-30' }, tfLeft: null, open: true, client: { name: 'C' }, ...o }) as any;
describe('financial health', () => {
  it('scores a clean book higher than an old, denied, unworked one', () => {
    const good = clientHealth([E('1'), E('2', { age: 20 })], [{ client_id: 'c1', occurred_on: '2026-03-05', amount: 800 } as any], [], 'c1', '2026-03-10');
    const bad = clientHealth([E('1', { age: 200, tfLeft: 5 }, { denial_codes: 'CO-29', touch_count: 0, last_touched_at: null }), E('2', { age: 150 }, { denial_codes: 'CO-50', touch_count: 0, last_touched_at: null })], [], [], 'c1', '2026-03-10');
    expect(good.score).toBeGreaterThan(bad.score); expect(bad.drivers.length).toBeGreaterThan(0); expect(['D', 'F']).toContain(bad.grade);
  });
  it('computes days in A/R from monthly charges', () => { expect(clientHealth([E('1')], [], [], 'c1', '2026-03-10', { monthlyCharges: 3000 }).dar).toBe(10); });
  it('pareto is cumulative, heatmap sums by payer', () => {
    const p = pareto([E('1', {}, { denial_codes: 'CO-50', balance: 900 }), E('2', {}, { denial_codes: 'CO-16', balance: 100 })], 'code'); expect(p[0].key).toBe('CO-50'); expect(p[1].cum).toBe(100);
    expect(heatmap([E('1'), E('2')], ['0-30']).rows[0].total).toBe(2000);
  });
  it('flags write-off candidates and duplicates, sizes staffing', () => {
    const r = pursueRank([E('1', { tfLeft: -5 }, { balance: 15, denial_codes: 'CO-29' }), E('2')], () => 0.5, { costPerTouch: 10, touchesDenied: 4, touchesOther: 2 }); expect(r.find((x) => x.id === '1')!.verdict).toBe('review-write-off'); expect(r[0].id).toBe('2');
    expect(findDupes([E('1'), E('2', {}, { claim_no: 'X' })]).length).toBe(1); expect(staffing(2000, { touchesPerClaimPerMonth: 1.5, touchesPerDay: 40, workdays: 21, fteAvailable: 3 }).fteNeeded).toBe(3.6);
  });
});
describe('first-pass denial', () => {
  it('counts new claims in the last 90 days incl. resolved ones; needs 20+', () => {
    const xs = Array.from({ length: 20 }, (_, i) => E('f' + i, i < 5 ? { open: false } : {}, i < 5 ? { denial_codes: 'CO-50' } : {}));
    const h = clientHealth(xs, [], [], 'c1', '2026-03-10'); expect(h.firstPass.rate).toBe(25); expect(clientHealth(xs.slice(0, 5), [], [], 'c1', '2026-03-10').firstPass.rate).toBeNull();
  });
});
