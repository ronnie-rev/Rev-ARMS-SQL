import { describe, expect, it } from 'vitest';
import { payerBrief } from '../src/lib/engine/payerbrief';
describe('payer brief', () => {
  it('summarises denials, appeals and reach', () => {
    const claims = Array.from({ length: 12 }, (_, i) => ({ id: 'c' + i, payer: 'Aetna', balance: 100, closed_at: null, denial_codes: i < 6 ? 'CO-50' : null })) as any;
    const appeals = [0, 1, 2, 3].map((i) => ({ claim_id: 'c' + i, status: i < 3 ? 'won' : 'lost', filed_on: '2026-01-01', decided_on: '2026-01-21' })) as any;
    const act = [0, 1, 2].map((i) => ({ id: 'a' + i, claim_id: 'c0', kind: 'call', created_at: '', meta: { outcome: i === 0 ? 'Left voicemail / no answer' : 'Reached a rep' } })) as any;
    const b = payerBrief('aetna', claims, appeals, act, { phone: '800' });
    expect(b.denialRate).toBe(50); expect(b.topCodes[0]).toMatchObject({ code: 'CO-50', n: 6 }); expect(b.appeals.rate).toBe(75); expect(b.appeals.avgDays).toBe(20); expect(b.reach.rate).toBe(67); expect(b.contact[0].value).toBe('800'); expect(b.lines.length).toBe(4);
  });
});
