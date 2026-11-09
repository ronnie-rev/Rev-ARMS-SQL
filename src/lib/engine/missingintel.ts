// Missing-from-file intelligence: spot bulk drop-offs (usually a posting run, not 50 separate mysteries), learn from how past drop-offs were decided, and sort the queue into evidence-backed quick wins vs. real questions.
import type { Claim } from '../types';

export interface Cluster { key: string; client_id: string; payer: string; since: string; n: number; balance: number; ids: string[]; evidenceShare: number; verdict: string }
const day = (d?: string | null) => (d || '').slice(0, 10);
/** Claims that vanished from the same file, for the same payer and client, in numbers too big to be coincidence. */
export function dropoffClusters(rows: Claim[], evidence: Set<string>, minSize = 5): Cluster[] {
  const g = new Map<string, Claim[]>(); for (const c of rows) { const k = `${c.client_id}|${c.payer || '—'}|${day(c.missing_since)}`; g.set(k, [...(g.get(k) || []), c]); }
  return [...g.entries()].filter(([, cs]) => cs.length >= minSize).map(([key, cs]) => { const ev = cs.filter((c) => evidence.has(c.id)).length / cs.length; const verdict = ev >= 0.6 ? 'Most already have a posted payment — this looks like a payment run; confirm and close.' : ev > 0 ? 'Some have posted payments, the rest need checking — start with the evidence-backed ones.' : 'No payment evidence yet — check the PMS and the payer remit for this date before closing anything.'; return { key, client_id: cs[0].client_id, payer: cs[0].payer || '—', since: day(cs[0].missing_since), n: cs.length, balance: Math.round(cs.reduce((s, c) => s + Math.max(0, c.balance), 0)), ids: cs.map((c) => c.id), evidenceShare: Math.round(ev * 100), verdict }; }).sort((a, b) => b.balance - a.balance);
}

export interface Rate { n: number; paid: number; writtenOff: number; other: number }
/** How past missing-from-file claims for each payer were actually resolved. */
export function payerOutcomeRates(closed: Claim[]): Map<string, Rate> {
  const m = new Map<string, Rate>(); for (const c of closed) { if (c.custom?.resolution_basis !== 'missing_review' && !/dropped|missing/i.test(c.closed_reason || '')) continue; const r = m.get(c.payer || '—') || { n: 0, paid: 0, writtenOff: 0, other: 0 }; r.n++; const res = c.resolution || ''; if (res === 'paid') r.paid++; else if (res === 'adjusted') r.writtenOff++; else r.other++; m.set(c.payer || '—', r); } return m;
}
/** Nudges a weak suggestion using the payer's own history (never overrides evidence). */
export function learnedHint(c: Claim, base: { outcome: string; confidence: 'high' | 'medium' | 'low' }, rates: Map<string, Rate>): { outcome: string; confidence: 'high' | 'medium' | 'low'; note: string | null } {
  const r = rates.get(c.payer || '—'); if (!r || r.n < 8 || base.confidence === 'high') return { ...base, note: null };
  const p = r.paid / r.n, w = r.writtenOff / r.n;
  if (p >= 0.8) return { outcome: 'paid', confidence: base.confidence === 'low' ? 'medium' : base.confidence, note: `${Math.round(p * 100)}% of ${r.n} past ${c.payer} drop-offs turned out to be paid` };
  if (w >= 0.5) return { outcome: 'written_off', confidence: base.confidence === 'low' ? 'medium' : base.confidence, note: `${Math.round(w * 100)}% of ${r.n} past ${c.payer} drop-offs were written off` };
  return { ...base, note: `${r.n} past ${c.payer} drop-offs: ${Math.round(p * 100)}% paid, ${Math.round(w * 100)}% written off — mixed, check each one` };
}
export interface Plan { quickWins: string[]; quickWinBalance: number; needHuman: string[]; needHumanBalance: number }
export function triagePlan(rows: Claim[], sug: Map<string, { confidence: 'high' | 'medium' | 'low' }>): Plan {
  const q = rows.filter((c) => sug.get(c.id)?.confidence === 'high'); const h = rows.filter((c) => sug.get(c.id)?.confidence !== 'high');
  return { quickWins: q.map((c) => c.id), quickWinBalance: Math.round(q.reduce((s, c) => s + Math.max(0, c.balance), 0)), needHuman: h.map((c) => c.id), needHumanBalance: Math.round(h.reduce((s, c) => s + Math.max(0, c.balance), 0)) };
}
