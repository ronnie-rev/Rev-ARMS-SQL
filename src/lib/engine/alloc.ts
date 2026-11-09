import type { EClaim } from './eclaim';
import type { AllocationRule } from '../types';

export type Strategy = AllocationRule['strategy'];
export type Criteria = AllocationRule['criteria'];

export function allocate(pool: EClaim[], assignees: string[], strategy: Strategy, existing: EClaim[], skills?: Map<string, string[]>) {
  const load = new Map(assignees.map((a) => [a, { n: 0, v: 0 }]));
  for (const x of existing) { const l = load.get(x.c.assigned_to || ''); if (l) { l.n++; l.v += x.c.balance; } }
  const out = new Map<string, string>(); let rr = 0;
  if (!assignees.length) return out;
  const sorted = [...pool].sort((a, b) => b.c.balance - a.c.balance);
  for (const x of sorted) {
    let pick: string;
    if (strategy === 'skills') {
      const payer = (x.c.payer || '').toLowerCase(); const able = assignees.filter((a) => (skills?.get(a) || []).some((k) => k.toLowerCase() === payer));
      const cands = able.length ? able : assignees; pick = cands.reduce((best, a) => (load.get(a)!.n < load.get(best)!.n ? a : best), cands[0]);
    } else if (strategy === 'round_robin') pick = assignees[rr++ % assignees.length];
    else pick = assignees.reduce((best, a) => { const A = load.get(a)!, B = load.get(best)!; return (strategy === 'by_balance' ? A.v < B.v : A.n < B.n) ? a : best; }, assignees[0]);
    out.set(x.c.id, pick); const l = load.get(pick)!; l.n++; l.v += x.c.balance;
  }
  return out;
}

export function matches(x: EClaim, cr: Criteria, clientId: string | null) {
  if (!x.open) return false;
  if (clientId && x.c.client_id !== clientId) return false;
  if (cr.buckets?.length && !cr.buckets.includes(x.bucket?.label || '')) return false;
  if (cr.payers?.length && !cr.payers.includes(x.c.payer || '')) return false;
  if (cr.statuses?.length && !cr.statuses.includes(x.c.status)) return false;
  if (cr.minBalance && x.c.balance < cr.minBalance) return false;
  return true;
}
