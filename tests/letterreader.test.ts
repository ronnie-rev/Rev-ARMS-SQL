import { describe, expect, it } from 'vitest';
import { readLetter } from '../src/lib/engine/letterreader';
describe('denial letter reader', () => {
  it('pulls codes, dates, amounts and the appeal window', () => {
    const f = readLetter('Aetna Claim #: 123456789A  Date of service: 03/14/2026\nProcessed on January 5, 2026. Billed: $1,250.00 Paid: $0.00\nDenial reason CO-50 and N115. You must file an appeal within 180 days of the date of this letter. Please submit medical records.');
    expect(f.carc).toContain('CO-50'); expect(f.rarc).toContain('N115'); expect(f.claimNos).toContain('123456789A'); expect(f.dates.some((d) => d.iso === '2026-03-14')).toBe(true); expect(f.dates.some((d) => d.iso === '2026-01-05')).toBe(true);
    expect(f.amounts.find((a) => /billed/i.test(a.label))!.value).toBe(1250); expect(f.deadlineDays[0].days).toBe(180); expect(f.payerHint?.toLowerCase()).toBe('aetna'); expect(f.asks.length).toBeGreaterThan(0);
  });
});
