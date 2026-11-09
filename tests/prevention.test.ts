import { describe, expect, it } from 'vitest';
import { preventionReport } from '../src/lib/engine/prevention';
const rows = [['Front end', 'Two-pass eligibility', 'CO-27, CO-31'], ['Front end', 'Auth hard stop', 'CO-197'], ['Coding', 'NCCI scrubber', 'CO-97, CO-50']];
const c = (o: any) => ({ billed_amt: 100, balance: 80, provider: 'Dr A', cpt: '99213', payer: 'Aetna', dos: '2026-01-10', ...o });
describe('denial prevention', () => {
  it('groups denied dollars by the control that would have stopped them, counting a claim once per area', () => {
    const r = preventionReport([c({ denial_codes: 'CO-27' }), c({ denial_codes: 'CO-27, CO-197', provider: 'Dr B' }), c({ denial_codes: 'CO-97', billed_amt: 500 }), c({ denial_codes: null }), c({ denial_codes: 'CO-999' })] as any, rows);
    expect(r[0].area).toBe('Coding'); expect(r[0].amount).toBe(500); const fe = r.find((x) => x.area === 'Front end')!; expect(fe.denials).toBe(2); expect(fe.amount).toBe(200); expect(fe.controls).toEqual(['Two-pass eligibility', 'Auth hard stop']); expect(fe.topProviders.length).toBe(2);
  });
  it('respects the date-of-service window', () => { expect(preventionReport([c({ denial_codes: 'CO-27', dos: '2025-01-01' })] as any, rows, { from: '2026-01-01' })).toEqual([]); });
});
