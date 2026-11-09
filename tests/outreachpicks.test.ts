import { describe, expect, it } from 'vitest';
import { outreachPicks } from '../src/lib/engine/outreachpicks';
const C = (id: string, o: any = {}) => ({ id, claim_no: id, balance: 500, denial_codes: null, touch_count: 0, closed_at: null, dos: '2026-01-01', custom: {}, ...o }) as any;
describe('outreach picks', () => {
  it('groups client-dependent denials by what to ask for and ranks by dollars', () => {
    const g = outreachPicks([C('a', { denial_codes: 'CO-197', balance: 900 }), C('b', { denial_codes: 'CO50' }), C('c', { denial_codes: 'CO-50', balance: 2000 }), C('d', { denial_codes: 'CO-185' }), C('e', { balance: 20, touch_count: 4 }), C('f', { denial_codes: 'CO-45' }), C('g', { denial_codes: 'CO-27', closed_at: '2026-02-01' })], '2026-03-10');
    expect(g.map((x) => x.id)).toEqual(['docs', 'auth', 'cred', 'approve']); expect(g[0].claims.map((c) => c.id)).toEqual(['c', 'b']); expect(g[0].balance).toBe(2500);
  });
});
