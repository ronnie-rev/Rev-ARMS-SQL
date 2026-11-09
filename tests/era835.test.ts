import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { parseEra, planEra, adjCodes, adjSplit } from '../src/lib/engine/era835';
import type { Claim } from '../src/lib/types';
const raw = fs.readFileSync(new URL('./fixtures/sample.835', import.meta.url), 'utf8');
const mk = (o: Partial<Claim>): Claim => ({ id: crypto.randomUUID(), client_id: 'c1', claim_no: 'X', account_id: null, patient_name: null, dos: null, last_billed: null, payer: 'Aetna', provider: null, provider_type: null, cpt: null, billed_amt: 500, balance: 500, pms_status: null, denial_codes: null, status: 'New', rca: null, rca_detail: null, end_action: null, end_sub: null, mode: null, assigned_to: null, priority: 'Normal', next_fu: null, touch_count: 0, last_touched_at: null, custom: {}, first_batch: null, last_batch: null, closed_at: null, closed_reason: null, created_at: '', updated_at: '', aliases: [], flags: [], ...o } as Claim);
describe('835 parser', () => {
  const era = parseEra(raw);
  it('reads the header', () => { expect(era.payer).toBe('AETNA'); expect(era.payee).toContain('PLASTIC'); expect(era.trace).toBe('EFT7788991'); expect(era.amount).toBe(1250); expect(era.date).toBe('2026-10-16'); expect(era.method).toBe('ACH'); });
  it('reads claims, lines and adjustments', () => {
    expect(era.claims.map((c) => c.pcn)).toEqual(['CPS-100114', 'CPS-100126', 'GHOST-9']);
    const a = era.claims[0]; expect(a.paid).toBe(400); expect(a.patientResp).toBe(50); expect(a.icn).toBe('ICN100114'); expect(a.patient).toBe('TAYLOR, LISA'); expect(a.dos).toBe('2025-11-06');
    expect(adjCodes(a)).toEqual(['CO-45', 'PR-1']); expect(adjSplit(a)).toEqual({ contractual: 50, patient: 50, other: 0 }); expect(a.lines[0].cpt).toBe('99214'); expect(a.lines[0].allowed).toBe(450); expect(a.remarks).toContain('N620');
    const d = era.claims[1]; expect(d.denied).toBe(true); expect(d.lines[0].mods).toEqual(['RT']); expect(adjCodes(d)).toEqual(['CO-50']);
  });
  it('balance check passes for this file and flags a broken one', () => { expect(era.warnings.filter((w) => /balance/i.test(w))).toEqual([]); expect(parseEra(raw.replace('BPR*I*1250.00', 'BPR*I*999.00')).warnings.join()).toMatch(/Out of balance/); });
  it('rejects non-835 input and detects truncated files', () => { expect(() => parseEra('hello')).toThrow(/835/); expect(parseEra(raw.replace('SE*29*', 'SE*5*')).warnings.join()).toMatch(/segment count/); });
  it('plans matches, denials and recoveries', () => {
    const claims = [mk({ id: 'a', claim_no: 'CPS-100114', balance: 500 }), mk({ id: 'b', claim_no: 'CPS-100126', balance: 300, billed_amt: 300 })];
    const wl: any[] = [{ id: 'w1', claim_id: 'a', user_id: 'u1', user_name: 'Una', created_at: '2026-10-10T10:00:00Z' }];
    const plan = planEra(era, claims, { clientId: 'c1', today: '2026-10-16', workLog: wl, windowDays: 30, posted: new Set() });
    expect(plan.totals).toMatchObject({ claims: 3, matched: 2, unmatched: 1, denied: 1, paid: 1250, matchedPaid: 400 });
    const r0 = plan.rows[0]; expect(r0.match).toBe('matched'); expect(r0.lifecycle).toBe('PTB'); expect(r0.recovery).toMatchObject({ amount: 400, basis: 'era835', user_id: 'u1' }); expect(r0.expectedBalance).toBe(50);
    expect(plan.rows[1].lifecycle).toBe('DEN'); expect(plan.rows[1].recovery).toBeNull(); expect(plan.rows[2].match).toBe('unmatched');
  });
  it('is idempotent: the same trace + claim is a duplicate', () => {
    const claims = [mk({ id: 'a', claim_no: 'CPS-100114' })]; const posted = new Set(['EFT7788991:CPS-100114:ICN100114']);
    const p = planEra(era, claims, { clientId: 'c1', today: '2026-10-16', workLog: [], windowDays: 30, posted }); expect(p.rows[0].match).toBe('duplicate'); expect(p.rows[0].recovery).toBeNull();
  });
  it('falls back to account # and refuses ambiguous matches', () => {
    const c1 = mk({ id: 'p', claim_no: 'Z1', account_id: 'CPS-100114', dos: '2025-11-06' }), c2 = mk({ id: 'q', claim_no: 'Z2', account_id: 'CPS-100114', dos: '2025-11-06' });
    expect(planEra(era, [c1], { clientId: 'c1', today: 'x', workLog: [], windowDays: 30, posted: new Set() }).rows[0].match).toBe('matched');
    expect(planEra(era, [c1, c2], { clientId: 'c1', today: 'x', workLog: [], windowDays: 30, posted: new Set() }).rows[0].match).toBe('ambiguous');
  });
  it('only matches within the selected client', () => { const c = mk({ id: 'z', client_id: 'other', claim_no: 'CPS-100114' }); expect(planEra(era, [c], { clientId: 'c1', today: 'x', workLog: [], windowDays: 30, posted: new Set() }).rows[0].match).toBe('unmatched'); });
});
import { buildRecoveries } from '../src/lib/engine/attribution';
import { DEFAULT_IMPORT } from '../src/lib/engine/settings';
describe('no double counting with aging-based recoveries', () => {
  it('subtracts ERA-credited cash from the balance drop', () => {
    const c = mk({ id: 'a', balance: 500 }); const plan: any = { changes: [{ claim: c, delta: -450 }], closes: [] };
    const base = { batchId: 'b', now: '2026-10-20T00:00:00Z', asOf: '2026-10-20', clientId: 'c1', uid: () => 'id' };
    expect(buildRecoveries(plan, [], DEFAULT_IMPORT, base)[0].amount).toBe(450);
    const r = buildRecoveries(plan, [], DEFAULT_IMPORT, { ...base, eraCredit: new Map([['a', 400]]) }); expect(r.length).toBe(1); expect(r[0].amount).toBe(50);
    expect(buildRecoveries(plan, [], DEFAULT_IMPORT, { ...base, eraCredit: new Map([['a', 450]]) }).length).toBe(0);
  });
});
import { makeEra835 } from '../src/lib/engine/era835';
describe('generator', () => {
  it('round-trips through the parser, balanced', () => {
    const txt = makeEra835({ payer: 'CIGNA', payee: 'CLINIC', trace: 'EFT1', date: '2026-10-20', claims: [{ pcn: 'A1', charge: 200, paid: 150, patient: 20, contractual: 30 }, { pcn: 'A2', charge: 100, paid: 0, deny: { group: 'CO', code: '97', rarc: 'N20' } }] });
    const e = parseEra(txt); expect(e.warnings).toEqual([]); expect(e.amount).toBe(150); expect(e.claims.length).toBe(2); expect(e.claims[1].denied).toBe(true); expect(adjCodes(e.claims[1])).toEqual(['CO-97']); expect(e.claims[1].remarks).toContain('N20');
  });
});
