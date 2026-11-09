import { describe, expect, it } from 'vitest';
import { huddleNarrative } from '../src/lib/engine/narrative';
describe('narrative', () => {
  it('writes pace, risks and rebalance lines', () => {
    const h: any = { kpis: { touches: 30, target: 40, attain: 75, recoveredMTD: 12000, recoveredLastMonthToDate: 10000, filing7: 2, filing7Amt: 900, overdue: 0, unassigned: 3, unassignedBalance: 1500 }, blockers: [], capacity: [{ name: 'Ann', flag: 'overloaded' }, { name: 'Bo', flag: 'idle' }], focus: [{ claim_no: 'C1', balance: 5000, why: 'deadline' }] };
    const n = huddleNarrative(h, 'the team'); expect(n[0]).toContain('20% ahead'); expect(n[1]).toContain('2 claims'); expect(n[2]).toContain('Ann'); expect(n[3]).toContain('C1');
  });
});
