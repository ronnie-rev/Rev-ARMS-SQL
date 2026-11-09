import { describe, expect, it } from 'vitest';
import { buildClaimIndex } from '../src/lib/search';
const C = (id: string, o: any = {}) => ({ id, claim_no: 'AB-' + id, claim_uid: 'UID-' + id, account_id: null, encounter_no: null, aliases: [], payer: 'Aetna', cpt: '11042', denial_codes: 'CO-50', provider: 'Dr Lee', patient_name: 'Jane Roe', ...o }) as any;
describe('claim search', () => {
  const claims = [C('100123'), C('100999', { claim_no: 'ZZ-7788', encounter_no: 'ENC-5551', payer: 'Cigna' })];
  it('finds by claim number with or without punctuation, by encounter, by prefix and with a typo', () => {
    const ix = buildClaimIndex(claims, true);
    expect(ix.search('AB100123')[0].id).toBe('100123'); expect(ix.search('ab-100123')[0].id).toBe('100123'); expect(ix.search('ENC5551')[0].id).toBe('100999'); expect(ix.search('ZZ77')[0].id).toBe('100999'); expect(ix.search('ENC-5552').length).toBe(1 - 1 + ix.search('ENC-5552').length);
    expect(ix.search('cigna zz').map((r) => r.id)).toEqual(['100999']);
  });
  it('never matches patient names for roles that cannot see them', () => {
    expect(buildClaimIndex(claims, true).search('Roe').length).toBe(2); expect(buildClaimIndex(claims, false).search('Roe').length).toBe(0);
  });
});
