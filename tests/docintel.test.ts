import { describe, expect, it } from 'vitest';
import { matchClaims, npiValid, readDocument } from '../src/lib/engine/docintel';
describe('document intelligence', () => {
  it('classifies a denial letter, finds the deadline and matches the claim', () => {
    const t = 'Aetna\nClaim #: CLM-2026-77123\nWe have denied this claim. Reason: CO-50 not medically necessary.\nYou may appeal within 180 days of receipt of this notice.\nFax: (800) 555-0101\nDate of service: 08/14/2026';
    const r = readDocument(t); expect(r.type).toBe('denial'); expect(r.facts.carc).toContain('CO-50'); expect(r.appealDeadline?.days).toBe(180); expect(r.faxes[0]).toContain('555'); expect(r.courtesyOk).toBe(true);
    const m = matchClaims(r.facts, [{ id: 'a', claim_no: 'CLM-2026-77123', aliases: [] } as any, { id: 'b', claim_no: 'X1' } as any]); expect(m[0].claim.id).toBe('a');
  });
  it('recognises records requests, appeal decisions and valid NPIs', () => {
    expect(readDocument('Additional information is required. Please submit the operative report and medical records.').type).toBe('records');
    expect(readDocument('We have completed our review of your appeal. The denial is upheld.').type).toBe('appeal_decision');
    expect(npiValid('1234567893')).toBe(true); expect(npiValid('1234567890')).toBe(false);
  });
});
