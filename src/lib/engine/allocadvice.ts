// Allocation advisor: who should take each unassigned claim, considering client coverage, payer skills, current load and how urgent/valuable the claim is.
import type { Profile } from '../types';
import type { EClaim } from './eclaim';
import type { Insight } from './insights';

export interface Person { id: string; full_name: string; daily_target: number; skills: string[]; client_ids: string[]; client_scope?: 'all' | 'assigned' }
export interface Suggestion { claimId: string; claim_no: string; payer: string | null; client: string; balance: number; urgency: number; why: string; to: string; toName: string; reasons: string[] }
export interface AdvicePlan { suggestions: Suggestion[]; byPerson: { id: string; name: string; n: number; amount: number; loadBefore: number; loadAfter: number; softCap: number }[]; unplaceable: number }
export const peopleFrom = (profiles: Pick<Profile, 'id' | 'full_name' | 'daily_target' | 'skills' | 'client_ids' | 'client_scope'>[]): Person[] => profiles.map((p) => ({ id: p.id, full_name: p.full_name, daily_target: p.daily_target || 40, skills: p.skills || [], client_ids: p.client_ids || [], client_scope: p.client_scope }));

export function adviseAllocation(i: { unassigned: EClaim[]; owned: EClaim[]; people: Person[]; insights: Map<string, Insight[]>; keepWarm?: number }): AdvicePlan {
  const mult = i.keepWarm ?? 6; const load = new Map(i.people.map((p) => [p.id, i.owned.filter((x) => x.c.assigned_to === p.id).length])); const cap = (p: Person) => Math.max(10, Math.round(p.daily_target * mult)); const before = new Map(load);
  const ranked = [...i.unassigned].map((x) => { const top = (i.insights.get(x.c.id) || [])[0]; return { x, urgency: top?.weight ?? 20, why: top?.detail || 'Unowned claim', s: (top?.weight ?? 20) * Math.log10(Math.max(10, x.c.balance + 10)) }; }).sort((a, b) => b.s - a.s);
  const suggestions: Suggestion[] = []; let unplaceable = 0;
  for (const r of ranked) {
    const c = r.x.c; const cands = i.people.filter((p) => p.client_scope !== 'assigned' || p.client_ids.includes(c.client_id)); if (!cands.length) { unplaceable++; continue; }
    const scored = cands.map((p) => { const covers = p.client_ids.includes(c.client_id); const skill = !!c.payer && p.skills.some((s) => s.toLowerCase() === (c.payer || '').toLowerCase()); const l = load.get(p.id) || 0; const ratio = l / cap(p); const reasons: string[] = []; if (covers) reasons.push('covers this client'); if (skill) reasons.push(`knows ${c.payer}`); reasons.push(ratio < 0.6 ? 'has room' : ratio < 1 ? 'near capacity' : 'over capacity'); return { p, reasons, score: (covers ? 2 : 0) + (skill ? 3 : 0) - ratio * 4 + (ratio >= 1.25 ? -5 : 0) }; }).sort((a, b) => b.score - a.score);
    const pick = scored[0]; load.set(pick.p.id, (load.get(pick.p.id) || 0) + 1);
    suggestions.push({ claimId: c.id, claim_no: c.claim_no, payer: c.payer, client: r.x.client?.name || '', balance: c.balance, urgency: r.urgency, why: r.why, to: pick.p.id, toName: pick.p.full_name, reasons: pick.reasons });
  }
  const byPerson = i.people.map((p) => { const mine = suggestions.filter((s) => s.to === p.id); return { id: p.id, name: p.full_name, n: mine.length, amount: Math.round(mine.reduce((a, s) => a + Math.max(0, s.balance), 0)), loadBefore: before.get(p.id) || 0, loadAfter: load.get(p.id) || 0, softCap: cap(p) }; }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  return { suggestions, byPerson, unplaceable };
}
