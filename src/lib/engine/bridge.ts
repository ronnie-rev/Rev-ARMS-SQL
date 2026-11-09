// Inventory movement bridge (Pivot spec §4): opening + new + increases − reductions = ending; reductions are explained by
// recoveries, and anything left over is surfaced as a reconciliation exception instead of being hidden.
import type { ClaimSnapshot, Recovery } from '../types';

export interface BridgeLine { key: string; label: string; amount: number; kind: 'open' | 'add' | 'sub' | 'exception' | 'end'; hint?: string }
export interface Bridge { from: string; to: string; opening: number; ending: number; claimsOpening: number; claimsEnding: number; lines: BridgeLine[]; residual: number; balanced: boolean }
const r2 = (n: number) => Math.round(n * 100) / 100;
const neg = (n: number) => (Math.abs(n) < 0.005 ? 0 : -r2(n));

/** Distinct snapshot dates (newest first) across the given practices. */
export const snapshotDates = (snaps: ClaimSnapshot[], clientIds?: string[]) => [...new Set(snaps.filter((s) => !clientIds?.length || clientIds.includes(s.client_id)).map((s) => s.as_of))].sort().reverse();

export function arBridge(snaps: ClaimSnapshot[], recoveries: Recovery[], o: { clientIds?: string[]; from: string; to: string }): Bridge {
  const ids = o.clientIds?.length ? o.clientIds : [...new Set(snaps.map((s) => s.client_id))];
  let opening = 0, ending = 0, add = 0, inc = 0, red = 0, nO = 0, nE = 0;
  const rec = { era: 0, payment: 0, adjustment: 0, patient: 0, unknown: 0 };
  for (const cid of ids) {
    const mine = snaps.filter((s) => s.client_id === cid); const dates = [...new Set(mine.map((s) => s.as_of))].sort();
    const a = [...dates].filter((d) => d <= o.from).pop(); const b = [...dates].filter((d) => d <= o.to).pop(); if (!b || (a && b < a)) continue;
    const A = new Map(mine.filter((s) => s.as_of === a).map((s) => [s.claim_id, s.balance])); const B = new Map(mine.filter((s) => s.as_of === b).map((s) => [s.claim_id, s.balance]));
    for (const v of A.values()) opening += v; for (const v of B.values()) ending += v; nO += A.size; nE += B.size;
    for (const [id, v] of B) { const p = A.get(id); if (p == null) add += v; else if (v > p) inc += v - p; else if (v < p) red += p - v; }
    for (const [id, v] of A) if (!B.has(id)) red += v;
    for (const r of recoveries) { if (r.client_id !== cid || (a && r.occurred_on <= a) || r.occurred_on > b) continue; const amt = r.amount * (r.share ?? 1); if (r.basis === 'era835') rec.era += amt; else if (r.type === 'payment') rec.payment += amt; else if (r.type === 'adjustment') rec.adjustment += amt; else if (r.type === 'patient') rec.patient += amt; else rec.unknown += amt; }
  }
  const explained = rec.era + rec.payment + rec.adjustment + rec.patient + rec.unknown; const residual = r2(red - explained);
  const lines: BridgeLine[] = [
    { key: 'open', label: 'Opening A/R', amount: r2(opening), kind: 'open' },
    { key: 'new', label: 'New inventory (first seen)', amount: r2(add), kind: 'add' },
    { key: 'inc', label: 'Balance increases (rebills, corrections)', amount: r2(inc), kind: 'add' },
    { key: 'era', label: 'Payments — verified on 835', amount: neg(rec.era), kind: 'sub' },
    { key: 'pay', label: 'Payments — inferred from file', amount: neg(rec.payment), kind: 'sub', hint: 'Balance dropped and last action pointed to cash; not yet matched to a remit' },
    { key: 'adj', label: 'Adjustments / write-offs', amount: neg(rec.adjustment), kind: 'sub' },
    { key: 'pat', label: 'Moved to patient', amount: neg(rec.patient), kind: 'sub' },
    { key: 'unk', label: 'Reductions of unknown type', amount: neg(rec.unknown), kind: 'sub' },
    { key: 'res', label: 'Unexplained residual', amount: neg(residual), kind: 'exception', hint: 'Reductions with no recovery record (undo, merge, manual edit) — or recoveries with no balance change' },
    { key: 'end', label: 'Ending A/R', amount: r2(ending), kind: 'end' },
  ];
  return { from: o.from, to: o.to, opening: r2(opening), ending: r2(ending), claimsOpening: nO, claimsEnding: nE, lines, residual, balanced: Math.abs(r2(opening + add + inc - red) - r2(ending)) < 0.02 };
}
