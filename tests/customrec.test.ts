import { describe, expect, it } from 'vitest';
import { recMatches, REC_TEMPLATES, renderWhy, validateCustomRec, type CustomRec } from '../src/lib/engine/customrec';
import { valueOf, type Env } from '../src/lib/engine/rules';
const env: Env = { today: '2026-06-01', buckets: [], clients: new Map(), payerTf: new Map() } as any;
const claim = (o: any = {}) => ({ id: 'c', client_id: 'k', claim_no: 'C1', balance: 3000, touch_count: 0, created_at: '2026-04-01T00:00:00Z', dos: '2026-04-01', last_billed: '2026-03-01', flags: [], custom: {}, payer: 'Aetna', status: 'New', denial_codes: null, pms_status: 'Billed', paid_amt: null, ...o });
const rec = (o: Partial<CustomRec> = {}): CustomRec => ({ id: 'r', name: 'n', enabled: true, client_id: null, match: 'all', conditions: [{ field: 'balance', op: 'gte', value: 2500 }], label: 'Do it', color: '#f00', urgency: 70, why: 'x', action: { type: 'none' }, ...o });
describe('custom recommendation rules', () => {
  it('matches all / any, honours enabled + client scope + empty-condition safety', () => {
    expect(recMatches(rec(), claim() as any, env)).toBe(true); expect(recMatches(rec({ enabled: false }), claim() as any, env)).toBe(false); expect(recMatches(rec({ client_id: 'other' }), claim() as any, env)).toBe(false); expect(recMatches(rec({ conditions: [] }), claim() as any, env)).toBe(false);
    expect(recMatches(rec({ match: 'any', conditions: [{ field: 'balance', op: 'lt', value: 1 }, { field: 'touch_count', op: 'eq', value: 0 }] }), claim() as any, env)).toBe(true);
  });
  it('new fields: credit, promise date, custom claim fields', () => {
    expect(recMatches(rec({ conditions: [{ field: 'in_credit', op: 'is_true' }] }), claim({ balance: -40 }) as any, env)).toBe(true);
    expect(recMatches(rec({ conditions: [{ field: 'promise_days', op: 'lt', value: 0 }] }), claim({ custom: { promise_date: '2026-05-20' } }) as any, env)).toBe(true); expect(valueOf('promise_days', claim() as any, env)).toBe(9999);
    expect(recMatches(rec({ conditions: [{ field: 'custom:Visit reason', op: 'contains', value: 'surg' }] }), claim({ custom: { 'Visit reason': 'Surgery follow-up' } }) as any, env)).toBe(true);
    expect(recMatches(rec({ conditions: [{ field: 'custom:Score', op: 'gt', value: 5 }] }), claim({ custom: { Score: '9' } }) as any, env)).toBe(true);
  });
  it('validation', () => { expect(validateCustomRec(rec())).toEqual([]); expect(validateCustomRec(rec({ conditions: [], label: '' })).length).toBe(2); expect(validateCustomRec(rec({ action: { type: 'link', to: 'x' } }))[0]).toContain('/'); });
  it('why text fills claim values', () => { expect(renderWhy('{balance} for {payer} ({age}d)', claim() as any, env, valueOf)).toContain('$3,000 for Aetna'); });
  it('every starter template is valid and fires on a matching claim', () => {
    for (const t of REC_TEMPLATES) expect(validateCustomRec({ ...t.rule, id: 'x' })).toEqual([]);
    const m = (name: string, c: any) => recMatches({ ...REC_TEMPLATES.find((t) => t.rule.name === name)!.rule, id: 'x' }, claim(c) as any, env);
    expect(m('High-dollar claim nobody has touched', { balance: 4000, touch_count: 0, dos: '2026-04-01' })).toBe(true); expect(m('Duplicate-claim denial', { denial_codes: 'CO-18' })).toBe(true); expect(m('Credit balance', { balance: -5 })).toBe(true); expect(m('Eligibility / coverage denial', { denial_codes: 'PR-27' })).toBe(true); expect(m('Small old balance', { balance: 10, dos: '2025-12-01' })).toBe(true); expect(m('Duplicate-claim denial', { denial_codes: 'CO-50' })).toBe(false);
  });
});
