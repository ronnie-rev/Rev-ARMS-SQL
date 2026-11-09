import { describe, expect, it } from 'vitest';
import { cptMatches, sopsFor, suggestSops, type ClientSop } from '../src/lib/engine/sops';
const S = (o: Partial<ClientSop>): ClientSop => ({ id: 'x', client_id: null, title: 't', instruction: 'i', level: 'info', active: true, payers: [], cpts: [], providers: [], codes: [], ...o });
const C = { client_id: 'c1', payer: 'Aetna', cpt: '11042, 99213', provider: 'Dr Lee', denial_codes: 'CO50', balance: 900 };
describe('client SOPs', () => {
  it('matches CPT exact, prefix and range', () => { expect(cptMatches('110*', '11042')).toBe(true); expect(cptMatches('97110-97140', '97124')).toBe(true); expect(cptMatches('97110-97140', '99213')).toBe(false); expect(cptMatches('11042', '11042')).toBe(true); });
  it('applies client, payer, provider, code and balance filters together and ranks by level', () => {
    const list = [S({ id: 'a', payers: ['aetna'], cpts: ['110*'], level: 'must' }), S({ id: 'b', client_id: 'other' }), S({ id: 'c', codes: ['CO-50'] }), S({ id: 'd', minBalance: 5000 }), S({ id: 'e', providers: ['Dr Smith'] }), S({ id: 'f', active: false })];
    expect(sopsFor(list, C).map((s) => s.id)).toEqual(['a', 'c']);
  });
  it('drafts rules from pasted SOP text', () => {
    const r = suggestSops('1. Never write off Aetna balances over $500 without approval.\n2. For CPT 11042 and 97110-97140 please attach the wound photos.\nThanks for your help!', ['Aetna', 'Cigna']);
    expect(r.length).toBe(2); expect(r[0].payers).toEqual(['Aetna']); expect(r[0].level).toBe('must'); expect(r[0].minBalance).toBe(500); expect(r[1].cpts).toEqual(['11042', '97110-97140']); expect(r[1].level).toBe('important');
  });
});
