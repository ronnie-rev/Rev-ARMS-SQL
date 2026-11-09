// Outreach intelligence: which open claims are stuck waiting on the CLIENT (records, authorization, eligibility, credentialing, coding clarification, write-off approval), grouped by the message template that asks for it.
import type { Claim } from '../types';
import { splitDenials } from '../kb';

export type AskId = 'docs' | 'auth' | 'elig' | 'cred' | 'coding' | 'approve';
export const ASK_LABEL: Record<AskId, string> = { docs: 'Records / documentation', auth: 'Authorization / referral', elig: 'Eligibility / coverage', cred: 'Credentialing / enrollment', coding: 'Coding clarification', approve: 'Approval to write off' };
const CODES: Record<Exclude<AskId, 'approve'>, RegExp> = { docs: /^CO-?(50|55|56|57|58|59|151|167)$|^N(29|241)$/, auth: /^CO-?(15|197|198|199)$|^N54$/, elig: /^CO-?(26|27|31|109|200|204|242)$|^N(30|522)$/, cred: /^CO-?(170|171|185|208)$|^N(95|290|568)$/, coding: /^CO-?(4|11|16|181|182|183|184|251|252)$|^N(657)$/ };
export interface AskGroup { id: AskId; label: string; claims: Claim[]; balance: number; oldestDays: number }
/** Group a client's open claims by what we need from the client. A claim appears in one group (most specific wins). */
export function outreachPicks(claims: Claim[], today: string, o: { smallBalance?: number } = {}): AskGroup[] {
  const small = o.smallBalance ?? 50; const groups = new Map<AskId, Claim[]>(); const dd = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);
  for (const c of claims) {
    if (c.closed_at || c.balance <= 0) continue; const codes = splitDenials(c.denial_codes); let id: AskId | null = null;
    for (const k of ['auth', 'cred', 'elig', 'docs', 'coding'] as const) if (codes.some((x) => CODES[k].test(x))) { id = k; break; }
    if (!id && (c.touch_count >= 3 && c.balance < small)) id = 'approve';
    if (!id && c.custom?.timely_filing_missed) id = 'approve';
    if (id) groups.set(id, [...(groups.get(id) || []), c]);
  }
  return [...groups.entries()].map(([id, cs]) => ({ id, label: ASK_LABEL[id], claims: cs.sort((a, b) => b.balance - a.balance), balance: Math.round(cs.reduce((a, c) => a + c.balance, 0)), oldestDays: Math.max(0, ...cs.map((c) => (c.dos ? dd(c.dos, today) : 0))) })).sort((a, b) => b.balance - a.balance);
}
