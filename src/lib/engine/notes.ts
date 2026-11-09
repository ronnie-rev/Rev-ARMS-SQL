// Note builder: structured facts → a clear, audit-ready claim comment; plus a quality meter and abbreviation tidy-up.
export type Contact = 'Call' | 'Portal' | 'Fax' | 'Email' | 'Chat' | 'Review';
export interface NoteFacts {
  contact: Contact; rep?: string; ref?: string; outcomeId?: string; reason?: string; docs?: string; received?: string; check?: string;
  allowed?: string; paid?: string; next?: string; nextDate?: string; extra?: string;
}
export interface NoteCtx { payer?: string | null; claim: string; balance?: number; endAction?: string; endSub?: string; rca?: string; rcaDetail?: string; codes?: string | null; today?: string }
export interface OutcomeTpl { id: string; name: string; body: string }

export const DEFAULT_OUTCOMES: OutcomeTpl[] = [
  { id: 'in_process', name: 'Claim is in process', body: '{contact} {payer}[[ — spoke with {rep}]][[ (ref# {ref})]]. Claim {claim} is in process[[, received {received}]]; no additional information needed. [[Next: {next}.]][[ Follow up {nextdate}.]]' },
  { id: 'denied', name: 'Denial explained', body: '{contact} {payer}[[ — spoke with {rep}]][[ (ref# {ref})]]. Claim {claim} denied[[ for {reason}]][[ (codes {codes})]]. [[Next: {next}.]][[ Follow up {nextdate}.]]' },
  { id: 'records', name: 'Records / documents requested', body: '{contact} {payer}[[ — spoke with {rep}]][[ (ref# {ref})]]. Payer requires {docs} to process claim {claim}. [[Sent via {via} on {today}.]] [[Next: {next}.]][[ Follow up {nextdate}.]]' },
  { id: 'resubmit', name: 'Corrected claim / resubmission', body: 'Reviewed claim {claim} with {payer}[[ (ref# {ref})]]. [[Issue: {reason}. ]]Corrected claim submitted on {today}. [[Expect response by {nextdate}.]]' },
  { id: 'appeal', name: 'Appeal filed', body: 'Appeal filed with {payer} for claim {claim} (balance {balance}) on {today}[[ — basis: {reason}]][[ (ref# {ref})]]. [[Attached: {docs}.]] [[Decision expected by {nextdate}.]]' },
  { id: 'paid', name: 'Payment issued / pending posting', body: '{contact} {payer}[[ — spoke with {rep}]][[ (ref# {ref})]]. Claim {claim} paid[[ — allowed {allowed}]][[, paid {paid}]][[, check/EFT {check}]]. Pending posting. [[Follow up {nextdate}.]]' },
  { id: 'no_claim', name: 'No claim on file', body: '{contact} {payer}[[ — spoke with {rep}]][[ (ref# {ref})]]. No claim on file for {claim}. Resubmitting electronically; verify receipt [[by {nextdate}]].' },
  { id: 'no_response', name: 'No response / unable to reach', body: 'Unable to reach a live representative at {payer} via {via} on {today} for claim {claim}. [[Left message / submitted inquiry{ref}.]] [[Retry {nextdate}.]]' },
  { id: 'patient', name: 'Transfer to patient responsibility', body: 'Claim {claim} processed by {payer}: balance {balance} is patient responsibility[[ ({reason})]]. Transferred to patient billing.' },
];

const VAR = /\{(\w+)\}/g;
/** Render a template. `[[ … ]]` segments are dropped when any variable inside is empty, so optional facts vanish cleanly. */
export function render(tpl: string, vars: Record<string, string | undefined>): string {
  let out = tpl.replace(/\[\[(.*?)\]\]/gs, (_, seg: string) => { const names = [...seg.matchAll(VAR)].map((m) => m[1]); return names.every((n) => (vars[n] ?? '').toString().trim() !== '') ? seg : ''; });
  out = out.replace(VAR, (_, n: string) => (vars[n] ?? '').toString());
  return out.replace(/\s+([.,;])/g, '$1').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/\.{2,}/g, '.').replace(/\s+\./g, '.').trim();
}

export function compose(f: NoteFacts, ctx: NoteCtx, outcomes: OutcomeTpl[] = DEFAULT_OUTCOMES): string {
  const o = outcomes.find((x) => x.id === f.outcomeId) || outcomes[0];
  const vars: Record<string, string | undefined> = {
    contact: { Call: 'Called', Portal: 'Checked the portal for', Fax: 'Faxed', Email: 'Emailed', Chat: 'Chatted with', Review: 'Reviewed with' }[f.contact], via: { Call: 'phone', Portal: 'portal', Fax: 'fax', Email: 'email', Chat: 'chat', Review: 'review' }[f.contact], payer: ctx.payer || 'payer', claim: ctx.claim,
    balance: ctx.balance != null ? '$' + ctx.balance.toFixed(2) : undefined, rep: f.rep, ref: f.ref, received: f.received, reason: f.reason || ctx.rcaDetail, docs: f.docs, check: f.check, allowed: f.allowed && '$' + f.allowed.replace(/^\$/, ''), paid: f.paid && '$' + f.paid.replace(/^\$/, ''),
    next: f.next || ctx.endAction, nextdate: f.nextDate, today: ctx.today, codes: ctx.codes || undefined,
  };
  const base = render(o.body, vars);
  return f.extra?.trim() ? `${base} ${f.extra.trim()}` : base;
}

export interface Quality { score: number; missing: string[]; good: string[] }
/** Heuristic completeness meter: what a reviewer or the next specialist needs to see in a note. */
export function quality(text: string, ctx: { mode?: string; nextFu?: string | null; terminal?: boolean }): Quality {
  const t = text.trim(); const good: string[] = []; const missing: string[] = []; let score = 0;
  const check = (ok: boolean, w: number, g: string, m: string) => { if (ok) { score += w; good.push(g); } else missing.push(m); };
  const isCall = ctx.mode === 'Call';
  check(t.length >= 40, 15, 'Enough detail', 'Add more detail (at least a full sentence)');
  check(/ref(erence)?\s*(#|no\.?|number)?\s*[:\-]?\s*[A-Z0-9]{4,}/i.test(t) || /\b(?:call|ticket|case)\s*(#|id)\s*[A-Z0-9]{4,}/i.test(t), isCall ? 20 : 10, 'Reference #', isCall ? 'Add the call reference #' : 'Add a reference/confirmation #');
  check(/(spoke|talked|speaking)\s+(with|to)\s+[A-Z]|rep(resentative)?\s+[A-Z][a-z]+|agent\s+[A-Z]/.test(t), isCall ? 15 : 5, 'Rep named', isCall ? 'Name the representative' : 'Name the contact (optional)');
  check(/(denied|denial|in process|processing|paid|payment|no claim|records|appeal|resubmit|corrected|eligib|auth|bundled|timely|duplicate|cob|pending|unable to reach|patient responsib)/i.test(t), 20, 'Outcome stated', 'State the outcome or reason');
  check(/(next|follow[- ]?up|will|expect|resubmit|appeal|submit|send|sent|escalat|verify|retry)/i.test(t), 15, 'Next step', 'State the next step');
  check(!!ctx.terminal || !!ctx.nextFu || /\b(\d{1,2}\/\d{1,2}(\/\d{2,4})?|20\d\d-\d\d-\d\d)\b/.test(t), 10, 'Follow-up date', 'Set a follow-up date');
  check(/\$\s?\d|\b(check|eft)\b|claim\s*#?\s*[A-Z0-9-]{4,}/i.test(t), 5, 'Specifics', 'Include a specific (amount, check #, claim #)');
  return { score: Math.min(100, score), missing, good };
}

export const DEFAULT_GLOSSARY: Record<string, string> = {
  pt: 'patient', ins: 'insurance', 'f/u': 'follow-up', fu: 'follow-up', tf: 'timely filing', tfl: 'timely filing limit', rep: 'representative', auth: 'authorization', cob: 'coordination of benefits', mr: 'medical records', 'rec\'d': 'received', recd: 'received', 'w/': 'with', 'w/o': 'without',
  resub: 'resubmit', corr: 'corrected', appt: 'appointment', dx: 'diagnosis', hx: 'history', eob: 'EOB', clm: 'claim', vm: 'voicemail', lm: 'left message', nca: 'no claim on file', ivr: 'IVR', ty: 'thank you',
};
/** Expand abbreviations, normalise spacing and capitalisation. Returns the tidied text. */
export function tidy(text: string, glossary: Record<string, string> = DEFAULT_GLOSSARY): string {
  let t = text.replace(/\s+/g, ' ').trim(); if (!t) return t;
  for (const [k, v] of Object.entries(glossary)) { const esc = k.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); t = t.replace(new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, 'gi'), v); }
  t = t.replace(/\s+([.,;:!?])/g, '$1').replace(/([.,;:!?])(?=[A-Za-z])/g, '$1 ');
  t = t.replace(/(^|[.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase());
  return /[.!?)]$/.test(t) ? t : t + '.';
}
