import { describe, expect, it } from 'vitest';
import { clientReview, huddle } from '../src/lib/engine/reviewpack';
const E = (id: string, o: any = {}, c: any = {}) => ({ c: { id, claim_no: 'N' + id, client_id: 'c1', payer: 'Aetna', balance: 100, assigned_to: null, next_fu: null, created_at: '2026-03-02T00:00:00Z', closed_at: null, denial_codes: 'CO-50', ...c }, age: 40, bucket: { label: '31-60' }, tfLeft: null, open: true, fuDue: false, stale: false, owner: undefined, ...o }) as any;
describe('huddle + client review', () => {
  it('summarises the last working day and what is due', () => {
    const h = huddle([E('1', { fuDue: true }, { next_fu: '2026-03-01' }), E('2', { tfLeft: 5 }, { balance: 900 })], [{ work_date: '2026-03-02', user_name: 'Ann' } as any, { work_date: '2026-03-02', user_name: 'Ann' } as any], [{ occurred_on: '2026-03-02', amount: 250 } as any], '2026-03-03');
    expect(h.yesterday.touches).toBe(2); expect(h.yesterday.recovered).toBe(250); expect(h.today.overdue).toBe(1); expect(h.today.unassigned).toBe(2); expect(h.urgent[0].claim_no).toBe('N2');
  });
  it('builds a per-client period review', () => {
    const r = clientReview([E('1'), E('2', {}, { client_id: 'other' }), E('3', { open: false }, { closed_at: '2026-03-05T00:00:00Z' })], [{ client_id: 'c1', occurred_on: '2026-03-04', amount: 500 } as any], [{ client_id: 'c1', status: 'won', decided_on: '2026-03-06', filed_on: '2026-02-20', amount_recovered: 300 } as any], [], 'c1', '2026-03-01', '2026-03-31');
    expect(r.openClaims).toBe(1); expect(r.recovered).toBe(500); expect(r.appeals.won).toBe(1); expect(r.closedInPeriod.n).toBe(1); expect(r.topDenials[0].code).toBe('CO-50');
  });
});
