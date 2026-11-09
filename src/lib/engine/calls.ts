// Payer call log: every call is a claim activity (kind 'call'); the promised-payment date also lives on the claim (custom.promise_date) so rules and the next-best-action engine see it.
import type { Activity, Claim } from '../types';
export const CALL_OUTCOMES = ['Reached a rep', 'Left voicemail / no answer', 'Long hold — hung up', 'Portal / IVR check', 'Payer called back'] as const;
export interface CallRow { id: string; claim_id: string; at: string; by: string | null; outcome: string; rep: string; ref: string; promise: string; summary: string }
export const callsOf = (activity: Activity[]): CallRow[] => activity.filter((a) => a.kind === 'call').map((a) => ({ id: a.id, claim_id: a.claim_id, at: a.created_at, by: a.actor_name, outcome: String(a.meta?.outcome || ''), rep: String(a.meta?.rep || ''), ref: String(a.meta?.ref || ''), promise: String(a.meta?.promise || ''), summary: a.summary })).sort((a, b) => b.at.localeCompare(a.at));
export interface Promise_ { claim: Claim; date: string; days: number; status: 'upcoming' | 'due-today' | 'broken' }
/** Open claims with a payer-promised payment date: upcoming, due today, or broken (date passed and still open). */
export function promises(claims: Claim[], today: string): Promise_[] {
  const d = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  return claims.filter((c) => !c.closed_at && c.custom?.promise_date).map((c) => { const date = String(c.custom.promise_date).slice(0, 10); const days = d(today, date); return { claim: c, date, days, status: (days < 0 ? 'broken' : days === 0 ? 'due-today' : 'upcoming') as Promise_['status'] }; }).sort((a, b) => a.days - b.days);
}
export function payerContactRate(calls: CallRow[], claims: Claim[]) {
  const by = new Map(claims.map((c) => [c.id, c.payer || 'Unknown'])); const m = new Map<string, { calls: number; reached: number; promised: number }>();
  for (const c of calls) { const p = by.get(c.claim_id); if (!p) continue; const e = m.get(p) || { calls: 0, reached: 0, promised: 0 }; e.calls++; if (/reached|called back/i.test(c.outcome)) e.reached++; if (c.promise) e.promised++; m.set(p, e); }
  return [...m.entries()].map(([payer, v]) => ({ payer, ...v, rate: v.calls ? Math.round((v.reached / v.calls) * 100) : 0 })).sort((a, b) => b.calls - a.calls);
}
