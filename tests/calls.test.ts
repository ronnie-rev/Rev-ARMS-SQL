import { describe, expect, it } from 'vitest';
import { callsOf, payerContactRate, promises } from '../src/lib/engine/calls';
describe('call log', () => {
  it('lists calls, flags broken promises and per-payer reach rate', () => {
    const act = [{ id: 'a', claim_id: 'c1', kind: 'call', created_at: '2026-03-02T10:00:00Z', actor_name: 'Ann', summary: 's', meta: { outcome: 'Reached a rep', promise: '2026-03-05' } }, { id: 'b', claim_id: 'c1', kind: 'note', created_at: '', meta: {} }] as any;
    const claims = [{ id: 'c1', payer: 'Aetna', closed_at: null, custom: { promise_date: '2026-03-05' } }, { id: 'c2', payer: 'Cigna', closed_at: null, custom: { promise_date: '2026-03-20' } }] as any;
    expect(callsOf(act).length).toBe(1); const p = promises(claims, '2026-03-10'); expect(p[0].status).toBe('broken'); expect(p[1].status).toBe('upcoming'); expect(payerContactRate(callsOf(act), claims)[0].rate).toBe(100);
  });
});
