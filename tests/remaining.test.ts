import { describe, expect, it } from 'vitest';
import { closedInsights } from '../src/lib/engine/closedinsights';
import { prioritise, slaStats, suggestReply } from '../src/lib/engine/requestsintel';
import { dqSummary } from '../src/lib/engine/dqsummary';

const C = (id: string, o: any = {}) => ({ id, claim_no: 'C' + id, client_id: 'k1', payer: 'Aetna', billed_amt: 100, balance: 0, status: 'Open', last_billed: '2026-01-01', closed_at: '2026-02-01T00:00:00Z', resolution: 'paid', closed_reason: null, ...o }) as any;
describe('closed insights', () => {
  it('finds slow payers, write-off heavy payers and closures that need review', () => {
    const slow = Array.from({ length: 6 }, (_, i) => C('s' + i, { payer: 'SlowCo', closed_at: '2026-06-01T00:00:00Z', resolution: i < 3 ? 'adjusted' : 'paid' })); const fast = Array.from({ length: 6 }, (_, i) => C('f' + i, { payer: 'FastCo', closed_at: '2026-01-20T00:00:00Z' }));
    const odd = [C('u1', { resolution: null, payer: 'Odd' }), C('p1', { resolution: 'paid', payer: 'Odd' })]; const rec = [...slow, ...fast].filter((c) => c.resolution === 'paid').map((c) => ({ claim_id: c.id, amount: 80 })) as any;
    const r = closedInsights([...slow, ...fast, ...odd], rec); expect(r.slowest[0].payer).toBe('SlowCo'); expect(r.writeOffs[0].payer).toBe('SlowCo'); expect(r.writeOffs[0].writeOffPct).toBe(50); expect(r.needsReview.map((x) => x.why).join('|')).toMatch(/without a confirmed outcome/); expect(r.needsReview.map((x) => x.why).join('|')).toMatch(/no payment is recorded/); expect(r.total).toBe(14); expect(closedInsights([], []).total).toBe(0);
  });
});
describe('client requests intelligence', () => {
  const R = (id: string, o: any = {}) => ({ id, kind: 'question', status: 'open', claim_id: null, amount: null, created_at: '2026-11-02T10:00:00Z', responded_at: null, ...o }) as any;
  it('ranks long waits and escalations first and flags overdue ones', () => {
    const p = prioritise([R('a'), R('b', { kind: 'escalation', created_at: '2026-11-06T10:00:00Z' }), R('c', { status: 'answered' }), R('d', { kind: 'approval', amount: 5000, created_at: '2026-11-09T09:00:00Z' })], [], '2026-11-09'); expect(p.length).toBe(3); expect(p[0].req.id).toBe('a'); expect(p[1].req.id).toBe('b'); /* a week-old unanswered question outranks a fresh escalation */ expect(p.find((x) => x.req.id === 'a')!.overdue).toBe(true); expect(p.find((x) => x.req.id === 'd')!.overdue).toBe(false); expect(p.find((x) => x.req.id === 'd')!.reasons.join()).toMatch(/\$5,000/);
  });
  it('measures response times and drafts a factual reply from the claim only', () => {
    const done = Array.from({ length: 6 }, (_, i) => R('x' + i, { status: 'answered', created_at: '2026-10-01T10:00:00Z', responded_at: i < 4 ? '2026-10-02T10:00:00Z' : '2026-10-10T10:00:00Z' })); const s = slaStats(done, '2026-11-09'); expect(s.answered).toBe(6); expect(s.medianHours).toBe(24); expect(s.withinTargetPct).toBe(67);
    const claim: any = { id: 'c1', claim_no: 'CLM-1', payer: 'Aetna', balance: 250, status: 'Appealed', denial_codes: 'CO-50', next_fu: '2026-11-20' }; const appeals: any[] = [{ claim_id: 'c1', status: 'sent', level: 1, filed_on: '2026-11-01' }];
    const t = suggestReply(R('q'), claim, appeals, '2026-11-09'); expect(t).toContain('CLM-1'); expect(t).toContain('$250.00'); expect(t).toContain('CO-50'); expect(t).toContain('level 1 appeal was sent'); expect(t).toContain('2026-11-20'); expect(suggestReply(R('q'), undefined, [], '2026-11-09')).toMatch(/will reply with an update/);
  });
});
describe('data-quality summary', () => {
  it('ranks checks by dollars at risk and clients by cleanliness', () => {
    const open = [C('1', { balance: 500, closed_at: null }), C('2', { balance: 300, closed_at: null, client_id: 'k2' }), C('3', { balance: 100, closed_at: null }), C('4', { balance: 50, closed_at: null, client_id: 'k2' })];
    const v: any[] = [{ claim_id: '1', check_id: 'no_payer', severity: 'high' }, { claim_id: '1', check_id: 'no_dos', severity: 'med' }, { claim_id: '2', check_id: 'no_payer', severity: 'med' }];
    const s = dqSummary(open, v); expect(s.claimsFlagged).toBe(2); expect(s.cleanPct).toBe(50); expect(s.balanceAtRisk).toBe(800); expect(s.topChecks[0]).toMatchObject({ check_id: 'no_payer', claims: 2, balance: 800, high: 1 }); expect(s.clients[0].client_id).toBe('k1'); expect(s.clients.find((c) => c.client_id === 'k2')!.cleanPct).toBe(50);
  });
});
