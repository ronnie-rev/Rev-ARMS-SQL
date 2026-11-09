import { describe, expect, it } from 'vitest';
import { appealRoi, contractual, daysInAR, filingDeadline, netCollectionRate, patientSplit, underpaymentCheck } from '../src/lib/engine/tools';
describe('A/R calculators', () => {
  it('filing deadline', () => { expect(filingDeadline('2026-01-01', 90, '2026-03-20')).toMatchObject({ due: '2026-04-01', left: 12 }); expect(filingDeadline('2026-01-01', 30, '2026-03-20').status).toContain('Expired'); });
  it('days in A/R and collection rates', () => { expect(daysInAR(300000, 100000, 30)).toBe(90); expect(daysInAR(1, 0, 30)).toBeNull(); expect(netCollectionRate(80, 200, 100)).toBe(80); });
  it('contractual write-off', () => { expect(contractual(200, 120)).toEqual({ writeOff: 80, pctOfBilled: 60 }); });
  it('patient split flags EOB mismatch and overpayment', () => { expect(patientSplit({ allowed: 100, paid: 80 }).patient).toBe(20); expect(patientSplit({ allowed: 100, paid: 80, eobPatient: 25 }).mismatch).toBe(-5); expect(patientSplit({ allowed: 100, paid: 120 }).note).toContain('overpayment'); });
  it('underpayment bar', () => { expect(underpaymentCheck(200, 150, 20)).toMatchObject({ short: 30, dispute: true }); expect(underpaymentCheck(200, 195, 0).dispute).toBe(false); });
  it('appeal ROI', () => { const r = appealRoi(500, 40, 1, 40); expect(r).toMatchObject({ expected: 200, cost: 40, worthIt: true, breakEvenWinPct: 8 }); expect(appealRoi(50, 30, 1, 40).worthIt).toBe(false); });
});
