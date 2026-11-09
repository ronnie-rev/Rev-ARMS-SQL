// Client requests: who is waiting longest, how fast we answer, and a factual first-draft reply built from the claim itself (never invented — only fields that exist).
import { addBusinessDays } from '../utils';
import type { Appeal, Claim, ClientRequest } from '../types';

const WEIGHT: Record<ClientRequest['kind'], number> = { escalation: 40, approval: 30, documents: 20, question: 12, info: 5 };
export interface Prioritised { req: ClientRequest; score: number; ageDays: number; overdue: boolean; reasons: string[] }
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);
/** Open requests ranked by urgency: kind, how long they have waited against the response target (business days), and the dollars involved. */
export function prioritise(reqs: ClientRequest[], claims: Claim[], today: string, targetDays = 2): Prioritised[] {
  const byId = new Map(claims.map((c) => [c.id, c]));
  return reqs.filter((r) => r.status === 'open').map((r) => { const age = Math.max(0, dayDiff(r.created_at, today)); const due = addBusinessDays(r.created_at.slice(0, 10), targetDays); const overdue = due < today; const c = r.claim_id ? byId.get(r.claim_id) : undefined; const $ = Math.max(r.amount || 0, c?.balance || 0); const reasons: string[] = [];
    let s = WEIGHT[r.kind] + Math.min(30, age * 4); if (overdue) { s += 15; reasons.push(`${age}d waiting (target ${targetDays} business days)`); } if ($ >= 1000) { s += Math.min(15, Math.round(Math.log10($) * 4)); reasons.push(`$${Math.round($).toLocaleString('en-US')} involved`); } if (r.kind === 'escalation') reasons.push('escalation');
    return { req: r, score: s, ageDays: age, overdue, reasons }; }).sort((a, b) => b.score - a.score);
}
export interface Sla { answered: number; medianHours: number | null; withinTargetPct: number | null; openOverdue: number }
export function slaStats(reqs: ClientRequest[], today: string, targetDays = 2): Sla {
  const done = reqs.filter((r) => r.responded_at && r.created_at); const hrs = done.map((r) => (Date.parse(r.responded_at!) - Date.parse(r.created_at)) / 36e5).filter((h) => h >= 0).sort((a, b) => a - b);
  const within = done.filter((r) => addBusinessDays(r.created_at.slice(0, 10), targetDays) >= r.responded_at!.slice(0, 10)).length;
  return { answered: done.length, medianHours: hrs.length ? Math.round(hrs[Math.floor(hrs.length / 2)] * 10) / 10 : null, withinTargetPct: done.length >= 5 ? Math.round((within / done.length) * 100) : null, openOverdue: prioritise(reqs, [], today, targetDays).filter((p) => p.overdue).length };
}
/** A starting reply made only from what the system knows about the claim; the biller completes and sends it. */
export function suggestReply(r: ClientRequest, claim: Claim | undefined, appeals: Appeal[], today: string): string {
  if (!claim) return r.kind === 'documents' ? 'Thank you — we have received your documents and will attach them to the right claims. We will confirm once they are filed.' : 'Thank you for your message. We are looking into this and will reply with an update by [date].';
  const fact: string[] = [`Claim ${claim.claim_no}${claim.payer ? ` with ${claim.payer}` : ''} currently shows a balance of $${(claim.balance || 0).toFixed(2)} and is marked “${claim.status}”.`];
  if (claim.denial_codes) fact.push(`The payer’s denial codes are ${claim.denial_codes}.`);
  const live = appeals.filter((a) => a.claim_id === claim.id && ['draft', 'ready', 'sent', 'pending'].includes(a.status)).sort((a, b) => b.level - a.level)[0]; if (live) fact.push(live.status === 'sent' || live.status === 'pending' ? `A level ${live.level} appeal was sent${live.filed_on ? ` on ${live.filed_on}` : ''} and we are waiting for the payer’s decision.` : `A level ${live.level} appeal is being prepared${live.due_on ? ` (due ${live.due_on})` : ''}.`);
  if (claim.next_fu && claim.next_fu >= today) fact.push(`Our next follow-up is scheduled for ${claim.next_fu}.`);
  const tail = r.kind === 'documents' ? 'Please send the documents below if you have not already, and we will attach them to this claim.' : r.kind === 'approval' ? 'We will record your decision once you confirm.' : r.kind === 'escalation' ? 'We have flagged this for a supervisor and will update you within one business day.' : 'Let us know if you need anything else on this claim.';
  return `${fact.join(' ')} ${tail}`;
}
