// Document intelligence for scanned / pasted payer paperwork: what kind of document is it, what does it want from us, by when, and which claim is it about.
import { readLetter, type LetterFacts } from './letterreader';
import { parsePhone } from '../phone';
import type { Claim } from '../types';

export type DocType = 'denial' | 'eob' | 'auth' | 'records' | 'appeal_decision' | 'overpayment' | 'other';
export const DOC_LABEL: Record<DocType, string> = { denial: 'Denial letter', eob: 'EOB / remittance', auth: 'Authorization letter', records: 'Records request', appeal_decision: 'Appeal decision', overpayment: 'Overpayment / refund request', other: 'Other payer document' };
const RULES: { t: DocType; re: RegExp; w: number }[] = [
  { t: 'appeal_decision', re: /(appeal|reconsideration|redetermination|grievance)[^.\n]{0,60}(upheld|overturned|approved|denied|decision|determination)|we have (reviewed|completed)[^.\n]{0,40}appeal|decision on your appeal/gi, w: 4 },
  { t: 'overpayment', re: /overpayment|refund request|recoup|recoupment|take[- ]?back|offset against|amount due to (?:the )?plan/gi, w: 4 },
  { t: 'records', re: /medical records? (?:request|requested|needed)|additional information (?:is )?(?:needed|required|requested)|please (?:submit|send|provide)[^.\n]{0,60}(records|documentation|notes|report)|pend(?:ed|ing) for (?:records|information)/gi, w: 3 },
  { t: 'auth', re: /authori[sz]ation (?:number|approved|denied|request)|prior auth|precertification|pre-?cert|referral (?:approved|number)/gi, w: 3 },
  { t: 'denial', re: /denied|denial|not (?:a )?covered|non-?covered|adverse (?:benefit )?determination|we (?:are )?unable to (?:pay|approve)|claim (?:has been )?rejected|no payment|timely filing/gi, w: 3 },
  { t: 'eob', re: /explanation of (?:benefits|payment)|remittance advice|\bEOB\b|\bERA\b|amount paid|patient responsibility|allowed amount/gi, w: 2 },
];
export interface DocRead { type: DocType; confidence: number; facts: LetterFacts; npis: string[]; phones: string[]; faxes: string[]; appealDeadline: { days: number; context: string } | null; nextSteps: string[]; suggestedAppealKind: 'appeal' | 'reconsideration' | 'underpayment_dispute' | null; courtesyOk: boolean }

/** Luhn check for US NPIs (prefix 80840 per CMS). */
export const npiValid = (n: string) => { if (!/^\d{10}$/.test(n)) return false; const s = '80840' + n; let sum = 0; for (let i = s.length - 1, alt = false; i >= 0; i--, alt = !alt) { let d = +s[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; } return sum % 10 === 0; };

export function readDocument(text: string): DocRead {
  const facts = readLetter(text); const scores = new Map<DocType, number>();
  for (const r of RULES) { const n = (text.match(r.re) || []).length; if (n) scores.set(r.t, (scores.get(r.t) || 0) + Math.min(n, 3) * r.w); }
  if (facts.carc.length && !scores.has('eob')) scores.set('denial', (scores.get('denial') || 0) + 2);
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]); const type: DocType = ranked[0]?.[0] || 'other'; const top = ranked[0]?.[1] || 0; const second = ranked[1]?.[1] || 0;
  const confidence = type === 'other' ? 0 : Math.min(97, Math.max(40, Math.round(50 + top * 4 - second * 2)));
  const npis = [...new Set([...text.matchAll(/\b(\d{10})\b/g)].map((m) => m[1]).filter(npiValid))].slice(0, 4);
  const fmt = (xs: string[]) => [...new Set(xs.map((x) => { const p = parsePhone(x); return p.valid ? p.national : x; }))];
  const phones0 = [...new Set([...text.matchAll(/(?:phone|tel|call)[^\d]{0,12}(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/gi)].map((m) => m[1]))].slice(0, 3);
  const faxes0 = [...new Set([...text.matchAll(/fax[^\d]{0,12}(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/gi)].map((m) => m[1]))].slice(0, 3);
  const phones = fmt(phones0); const faxes = fmt(faxes0);
  const appealDeadline = facts.deadlineDays.find((d) => /appeal|reconsider|dispute|file/i.test(d.context)) || null;
  const nextSteps: string[] = []; let kind: DocRead['suggestedAppealKind'] = null; let courtesyOk = false;
  if (type === 'denial') { nextSteps.push('Attach to the claim and record the denial code(s) and reference number.'); if (appealDeadline) nextSteps.push(`Calendar the appeal deadline — ${appealDeadline.days} days from the letter date.`); nextSteps.push('Start an appeal (or a courtesy / good-faith review if the appeal window has closed).'); kind = 'appeal'; courtesyOk = true; }
  else if (type === 'records') { nextSteps.push('Send the requested records before the pend date and keep proof of submission.'); nextSteps.push('Set a follow-up 10 business days after sending.'); }
  else if (type === 'auth') nextSteps.push('Save the authorization number on the claim and confirm it covers the billed CPT and dates.');
  else if (type === 'appeal_decision') { const lost = /upheld|denied/i.test(text); nextSteps.push(lost ? 'Appeal not overturned — review the next-level rights and deadline.' : 'Overturned — confirm reprocessing and post the payment.'); kind = lost ? 'appeal' : null; courtesyOk = lost; }
  else if (type === 'overpayment') { nextSteps.push('Verify the overpayment against the remittance before refunding; dispute within the payer’s window if incorrect.'); kind = 'reconsideration'; }
  else if (type === 'eob') { nextSteps.push('Compare allowed amount with the contracted rate — dispute underpayments.'); kind = 'underpayment_dispute'; }
  return { type, confidence, facts, npis, phones, faxes, appealDeadline, nextSteps, suggestedAppealKind: kind, courtesyOk };
}

export interface ClaimMatch { claim: Claim; by: string; score: number }
/** Claims this document is about: exact claim number / alias / UID first, then date of service + amount + payer. */
export function matchClaims(facts: LetterFacts, claims: Claim[]): ClaimMatch[] {
  const norm = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const keys = new Set([...facts.claimNos, ...facts.refs].map(norm)); const out = new Map<string, ClaimMatch>();
  for (const c of claims) { const ids = [c.claim_no, c.claim_uid, c.account_id, c.encounter_no, ...(c.aliases || [])].map(norm).filter(Boolean); if (ids.some((i) => keys.has(i))) out.set(c.id, { claim: c, by: 'claim number', score: 100 }); }
  if (!out.size) {
    const dates = new Set(facts.dates.map((d) => d.iso)); const amts = new Set(facts.amounts.map((a) => Math.round(a.value * 100)));
    for (const c of claims) { if (c.closed_at) continue; let s = 0; if (c.dos && dates.has(c.dos.slice(0, 10))) s += 45; if (amts.has(Math.round((c.billed_amt || 0) * 100))) s += 30; if (amts.has(Math.round((c.balance || 0) * 100))) s += 25; if (facts.payerHint && (c.payer || '').toLowerCase().includes(facts.payerHint.toLowerCase().split(' ')[0])) s += 15; if (s >= 70) out.set(c.id, { claim: c, by: 'date of service + amount', score: s }); }
  }
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, 5);
}

/** Plain-text summary suitable for a claim note (no patient identifiers). */
export function docSummary(r: DocRead, fromOcr: boolean): string {
  const f = r.facts; return [`${DOC_LABEL[r.type]}${fromOcr ? ' (scanned — verify against the original)' : ''}:`, f.carc.length || f.rarc.length ? `Codes: ${[...f.carc, ...f.rarc].join(', ')}` : '', r.appealDeadline ? `Appeal deadline: ${r.appealDeadline.days} days — ${r.appealDeadline.context}` : '', f.refs.length ? `Reference #: ${f.refs.slice(0, 3).join(', ')}` : '', f.dates.length ? `Dates: ${f.dates.map((d) => `${d.label} ${d.iso}`).join('; ')}` : '', f.amounts.length ? `Amounts: ${f.amounts.map((a) => `${a.label} $${a.value.toFixed(2)}`).join('; ')}` : '', r.faxes.length ? `Payer fax: ${r.faxes[0]}` : '', r.phones.length ? `Payer phone: ${r.phones[0]}` : '', ...f.asks.slice(0, 3).map((a) => `Payer asks: ${a}`)].filter(Boolean).join('\n');
}
