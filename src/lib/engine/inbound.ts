// Email-to-claim: decide which claim an inbound email belongs to and what note to file. Pure (used by the Netlify function and unit-tested).
export interface InboundMail { from: string; to: string[]; subject: string; text: string; attachments: string[] }
export interface ClaimRef { id: string; claim_no: string; claim_uid?: string | null; aliases?: string[]; client_id: string }
export interface Routed { claim: ClaimRef | null; how: 'plus-address' | 'claim-number' | 'none' | 'ambiguous'; candidates: ClaimRef[] }
const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Reply chains quote the whole thread — keep only what the sender just wrote. */
export function stripQuoted(text: string, max = 3000): string {
  const lines = text.replace(/\r/g, '').split('\n'); const out: string[] = [];
  for (const l of lines) { if (/^\s*>/.test(l) || /^On .+ wrote:\s*$/i.test(l) || /^-{2,}\s*(Original Message|Forwarded)/i.test(l) || /^From:\s.+/i.test(l) && out.length > 3 || /^_{5,}/.test(l)) break; out.push(l); }
  return out.join('\n').trim().slice(0, max);
}
/** Address like claims+AB12CD34@inbox.example.com → token AB12CD34 (the claim's permanent UID). */
export const plusToken = (addrs: string[]): string | null => { for (const a of addrs) { const m = /\+([A-Za-z0-9_-]{4,40})@/.exec(a); if (m) return m[1]; } return null; };
export function routeMail(mail: InboundMail, claims: ClaimRef[]): Routed {
  const tok = plusToken(mail.to);
  if (tok) { const t = clean(tok); const hit = claims.find((c) => c.claim_uid && clean(c.claim_uid) === t) || claims.find((c) => clean(c.claim_no) === t); if (hit) return { claim: hit, how: 'plus-address', candidates: [hit] }; }
  const hay = ` ${mail.subject} \n ${mail.text.slice(0, 4000)} `.toUpperCase(); const toks = new Set(hay.split(/[^A-Z0-9-]+/).map(clean).filter((x) => x.length >= 6));
  const hits = claims.filter((c) => (c.claim_no && toks.has(clean(c.claim_no)) && clean(c.claim_no).length >= 6) || (c.aliases || []).some((a) => clean(a).length >= 6 && toks.has(clean(a))));
  if (hits.length === 1) return { claim: hits[0], how: 'claim-number', candidates: hits };
  return { claim: null, how: hits.length > 1 ? 'ambiguous' : 'none', candidates: hits.slice(0, 5) };
}
export const noteFromMail = (m: InboundMail) => `📧 Email from ${m.from}${m.subject ? ` — “${m.subject}”` : ''}\n\n${stripQuoted(m.text) || '(no text)'}${m.attachments.length ? `\n\nAttachments (not stored): ${m.attachments.join(', ')}` : ''}`;
