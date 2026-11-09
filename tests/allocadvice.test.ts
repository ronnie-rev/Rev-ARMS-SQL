import { describe, expect, it } from 'vitest';
import { adviseAllocation } from '../src/lib/engine/allocadvice';
const E = (id: string, c: any = {}) => ({ c: { id, claim_no: id, client_id: 'c1', payer: 'Aetna', balance: 1000, assigned_to: null, ...c }, client: { name: 'Clinic' } }) as any;
const P = (id: string, o: any = {}) => ({ id, full_name: id, daily_target: 40, skills: [], client_ids: [], ...o });
describe('allocation advisor', () => {
  it('prefers skill + coverage, respects load, and spreads work', () => {
    const owned = Array.from({ length: 200 }, (_, i) => E('o' + i, { assigned_to: 'busy' }));
    const plan = adviseAllocation({ unassigned: [E('u1'), E('u2', { balance: 5000 }), E('u3', { payer: 'Cigna' })], owned, people: [P('busy', { skills: ['Aetna'], client_ids: ['c1'] }), P('ann', { skills: ['Aetna'], client_ids: ['c1'] }), P('bob', { skills: ['Cigna'] })], insights: new Map([['u2', [{ id: 'tf_critical', label: 'x', detail: 'deadline', tone: 'bad', weight: 92 }]]]) as any });
    expect(plan.suggestions[0].claimId).toBe('u2'); expect(plan.suggestions.find((s) => s.claimId === 'u1')!.to).toBe('ann'); expect(plan.suggestions.find((s) => s.claimId === 'u3')!.to).toBe('bob'); expect(plan.suggestions.every((s) => s.to !== 'busy')).toBe(true);
  });
  it('never offers a restricted user a client outside their assignment', () => {
    const plan = adviseAllocation({ unassigned: [E('u1', { client_id: 'cx' })], owned: [], people: [P('r', { client_scope: 'assigned', client_ids: ['c1'] })], insights: new Map() }); expect(plan.suggestions.length).toBe(0); expect(plan.unplaceable).toBe(1);
  });
});
