import { describe, it, expect } from 'vitest';
import { checkTransition, deriveLifecycle, lifecycleOf, LIFECYCLE_DEFAULTS } from '../src/lib/engine/lifecycle';
import { autoTags, encounterKey, inferVisitType, linkedClaims, normalizeVisitType, isValidTag } from '../src/lib/engine/visit';
import type { Claim } from '../src/lib/types';
const mk = (o: Partial<Claim> = {}): Claim => ({ id: crypto.randomUUID(), client_id: 'c1', claim_no: 'K1', account_id: 'A1', patient_name: null, dos: '2026-05-01', last_billed: null, payer: 'Aetna', provider: null, provider_type: null, cpt: '99214', billed_amt: 100, balance: 100, pms_status: null, denial_codes: null, status: 'New', rca: null, rca_detail: null, end_action: null, end_sub: null, mode: null, assigned_to: null, priority: 'Normal', next_fu: null, touch_count: 0, last_touched_at: null, custom: { visit_type: 'Office Visit' }, first_batch: null, last_batch: null, closed_at: null, closed_reason: null, created_at: '', updated_at: '', ...o } as Claim);
describe('lifecycle', () => {
  it('18 native statuses', () => expect(LIFECYCLE_DEFAULTS.map((d) => d.code)).toEqual(['NEW', 'VAL', 'RDY', 'WRK', 'PEN', 'REQ', 'FIX', 'SUB', 'ACK', 'DEN', 'APL', 'ESC', 'PAY', 'PRT', 'PTB', 'CLS', 'WOF', 'REO']));
  it('DEN → APL needs reason, method, due', () => { const r = checkTransition('DEN', 'APL', {}); expect(r.ok).toBe(false); expect(r.missing).toEqual(expect.arrayContaining(['reason', 'method', 'due'])); expect(checkTransition('DEN', 'APL', { reason: 'x', method: 'portal', due: '2026-12-01' }).ok).toBe(true); });
  it('WOF needs approval, amount, reason and permission', () => { expect(checkTransition('WRK', 'WOF', { reason: 'r', amount: 5 }).ok).toBe(false); expect(checkTransition('WRK', 'WOF', { reason: 'r', amount: 5, approval: 'ok', canWriteOff: false }).ok).toBe(false); expect(checkTransition('WRK', 'WOF', { reason: 'r', amount: 5, approval: 'ok' }).ok).toBe(true); });
  it('terminal states only reopen', () => { expect(checkTransition('CLS', 'WRK', {}).ok).toBe(false); expect(checkTransition('CLS', 'REO', { reason: 'a', evidence: 'b' }).ok).toBe(true); expect(checkTransition('CLS', 'REO', {}).ok).toBe(false); });
  it('derives sensibly and explicit wins', () => {
    expect(deriveLifecycle(mk())).toBe('NEW'); expect(deriveLifecycle(mk({ assigned_to: 'u' }))).toBe('RDY'); expect(deriveLifecycle(mk({ custom: { visit_type: 'Unknown' } }))).toBe('VAL');
    expect(deriveLifecycle(mk({ touch_count: 1, end_action: 'Claim Appealed' }))).toBe('APL'); expect(deriveLifecycle(mk({ closed_at: 'x', closed_reason: 'Adjusted' }))).toBe('WOF');
    expect(lifecycleOf(mk({ custom: { visit_type: 'Surgery', lifecycle: 'ESC' } }))).toBe('ESC');
  });
});
describe('visit / tags / encounters', () => {
  it('infers conservatively', () => { expect(inferVisitType('99214')).toBe('Office Visit'); expect(inferVisitType('27447')).toBe('Surgery'); expect(inferVisitType('99395')).toBe('Preventive / Wellness'); expect(inferVisitType('90837')).toBe('Behavioral Health'); expect(inferVisitType('XYZ')).toBe('Unknown'); expect(inferVisitType(null)).toBe('Unknown'); });
  it('normalizes aliases', () => { expect(normalizeVisitType('OV')).toBe('Office Visit'); expect(normalizeVisitType('Operating Room')).toBe('Surgery'); expect(normalizeVisitType('')).toBeNull(); });
  it('same encounter links separate claims, never merges', () => { const a = mk({ id: 'a', claim_no: 'S1' }), b = mk({ id: 'b', claim_no: 'S2' }), o = mk({ id: 'o', account_id: 'Z' }); expect(encounterKey(a)).toBe(encounterKey(b)); expect(linkedClaims(a, [a, b, o]).map((x) => x.id)).toEqual(['b']); });
  it('tags are namespaced and PHI-free', () => { const t = autoTags(mk({ balance: 9000, custom: { visit_type: 'Surgery', roles: [{ role: 'Assistant Surgeon', provider: 'X' }], tags: ['bad tag', 'DOC:OP_NOTE_PENDING'] } }), { tfLeft: 10, clientCode: 'NCPS', pms: 'eCW' }); expect(t).toEqual(expect.arrayContaining(['VISIT:SURGERY', 'ROLE:ASSISTANT_SURGEON', 'RISK:TFL_NEAR', 'FIN:HIGH_BALANCE', 'CLIENT:NCPS', 'SOURCE:ECW', 'DOC:OP_NOTE_PENDING'])); expect(t.every(isValidTag)).toBe(true); });
});
