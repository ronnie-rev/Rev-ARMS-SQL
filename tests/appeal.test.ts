import { describe, expect, it } from 'vitest';
import { appealVars, fillText, mapFields, nextLevel, pickLetters } from '../src/lib/engine/appeal';
const L = (id: string, value: string, meta: any = {}, sort = 0) => ({ id, category: 'letter', value, active: true, sort, meta } as any);
const letters = [L('1', 'Appeal — medical necessity'), L('2', 'Appeal — timely filing with proof'), L('3', 'Reconsideration request'), L('4', 'Corrected claim cover note'), L('5', 'Custom CO-97 letter', { codes: 'CO-97' })];
describe('appeal letters', () => {
  it('picks by denial family', () => { expect(pickLetters(letters, { codes: ['CO-29'], kind: 'appeal', level: 1 })[0].letter.id).toBe('2'); expect(pickLetters(letters, { codes: ['CO-50'], kind: 'appeal', level: 1 })[0].letter.id).toBe('1'); expect(pickLetters(letters, { codes: ['CO-16'], kind: 'corrected_claim', level: 1 })[0].letter.id).toBe('4'); });
  it('explicit code mapping wins', () => { const p = pickLetters(letters, { codes: ['CO-97'], kind: 'appeal', level: 1 }); expect(p[0].letter.id).toBe('5'); expect(p[0].why).toContain('CO-97'); });
  it('levels', () => { expect(nextLevel([])).toBe(1); expect(nextLevel([{ level: 1, status: 'sent', kind: 'appeal' }])).toBe(1); expect(nextLevel([{ level: 1, status: 'lost', kind: 'appeal' }])).toBe(2); expect(nextLevel([{ level: 1, status: 'sent', kind: 'corrected_claim' }])).toBe(1); });
  it('fills variables and optional blocks', () => { const v = appealVars({ claim: { claim_no: 'C1', payer: 'Aetna', paid_amt: 40, expected_amt: 100, billed_amt: 200, balance: 60 } as any, today: '2026-01-02', level: 2, fmt: (d) => d || '', money: (n) => `$${n}` }); expect(v.variance).toBe('$60'); expect(fillText('{payer} {level}[[ ref {tracking}]][[ x {claim}]]', v)).toBe('Aetna Second-level appeal x C1'); });
  it('maps form fields', () => { const m = Object.fromEntries(mapFields(['PatientName', 'Date of Service', 'Claim Number', 'Amount Disputed', 'Zzz']).map((x) => [x.field, x.key])); expect(m).toEqual({ PatientName: 'patient', 'Date of Service': 'dos', 'Claim Number': 'claim', 'Amount Disputed': 'balance', Zzz: null }); });
});
