import { describe, expect, it } from 'vitest';
import { appealStrategy, evidenceFor, letterScore } from '../src/lib/engine/appealintel';
const claim = { id: 'c0', claim_no: 'CL-1', payer: 'Aetna', denial_codes: 'CO-50', balance: 1000 } as any;
const mk = (n: number, won: number) => Array.from({ length: n }, (_, k) => ({ id: 'a' + k, claim_id: 'p' + k, kind: 'appeal', level: 1, status: k < won ? 'won' : 'lost', payer: 'Aetna', template: 'T1', filed_on: '2026-01-01', decided_on: '2026-02-01', amount_recovered: 800, outcome_note: '' })) as any[];
const prior = (n: number) => Array.from({ length: n }, (_, k) => ({ id: 'p' + k, denial_codes: 'CO-50', payer: 'Aetna', claim_no: 'P' + k })) as any[];
describe('appeal intelligence', () => {
  it('recommends from your own win rate and sizes expected value', () => {
    const s = appealStrategy({ claim, claims: [claim, ...prior(5)], appeals: mk(5, 4), activity: [], payerMeta: { appeal_fax: '555' }, level: 1, amount: 1000, today: '2026-03-01', templateId: 'T1', deadlineLeft: 20 });
    expect(s.verdict).toBe('strong'); expect(s.odds!.rate).toBeCloseTo(0.8); expect(s.ev).toBe(Math.round(1000 * 0.8 - 60)); expect(s.turnaround.avgDays).toBe(31); expect(s.chase.days).toBe(23); expect(s.template).toEqual({ won: 4, n: 5 }); expect(s.channel.recommend).toMatch(/Fax/); expect(s.family).toBe('Medical necessity'); expect(s.similar.length).toBeGreaterThan(0);
  });
  it('flags low-return and closed-window cases', () => {
    const low = appealStrategy({ claim: { ...claim, balance: 40 }, claims: [claim], appeals: [], activity: [], payerMeta: {}, level: 1, amount: 40, today: '2026-03-01', deadlineLeft: -5 }); expect(low.verdict).toBe('skip'); expect(low.reasons.join(' ')).toMatch(/closed 5 days ago/);
  });
  it('escalates with new evidence after a loss', () => {
    const s = appealStrategy({ claim, claims: [claim], appeals: [{ id: 'x', claim_id: 'c0', kind: 'appeal', level: 1, status: 'lost', payer: 'Aetna' } as any], activity: [], payerMeta: {}, level: 2, amount: 1000, today: '2026-03-01', deadlineLeft: 10 }); expect(s.levelAdvice).toMatch(/level 2 with NEW evidence/);
  });
  it('maps denial families to proof and scores letters', () => {
    expect(evidenceFor(['CO-29']).family).toBe('Timely filing'); expect(evidenceFor(['XX-1']).family).toBe('General');
    const good = letterScore('<p>Claim CL-1 was denied with CO-50. Per the payer policy criteria, we request that you overturn this denial for $1,000. Filed within the appeal window. Enclosures attached.</p>' + '<p>' + 'The chart documents the clinical need. '.repeat(25) + '</p>', { claimNo: 'CL-1', codes: ['CO-50'], amount: 1000, enclosures: 2, deadlineLeft: 10 });
    expect(good.score).toBeGreaterThanOrEqual(90); const bad = letterScore('<p>Please look at this [FILL IN: why]</p>', { claimNo: 'CL-1', codes: ['CO-50'], amount: 1000, enclosures: 0, deadlineLeft: 10 }); expect(bad.score).toBeLessThan(40);
  });
});
