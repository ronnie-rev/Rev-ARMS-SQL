import type { Appeal, AppealKind, Claim, ConfigOption } from '../types';
import { codeMatches, splitList } from './checklist';

export const LEVEL_LABEL = (n: number) => (n <= 1 ? 'First-level appeal' : n === 2 ? 'Second-level appeal' : n === 3 ? 'Third-level / external review' : `Level ${n}`);
export const KIND_LABEL: Record<AppealKind, string> = { appeal: 'Appeal', reconsideration: 'Reconsideration', corrected_claim: 'Corrected claim', underpayment_dispute: 'Underpayment dispute', external_review: 'External review' };
export const STATUS_LABEL: Record<Appeal['status'], string> = { draft: 'Draft', ready: 'Ready to send', sent: 'Sent', pending: 'Awaiting decision', won: 'Won', partial: 'Partially won', lost: 'Lost', withdrawn: 'Withdrawn' };
export const OPEN_STATUS: Appeal['status'][] = ['draft', 'ready', 'sent', 'pending'];
export const isOpen = (a: Pick<Appeal, 'status'>) => OPEN_STATUS.includes(a.status);

/** Built-in code-family → letter-title keywords, used when a letter template has no explicit "Denial codes" mapping. */
const FAMILY: [RegExp, RegExp, AppealKind][] = [
  [/^(CO|PR|OA)-?29$/i, /timely/i, 'appeal'],
  [/^(CO|PR|OA)-?(50|55|56|57|58|59|151|167|197|198|199|288|A1)$/i, /necessity|authoriz/i, 'appeal'],
  [/^(CO|PR|OA)-?(4|5|6|9|10|11|16|31|109|140|181|182|183|185)$/i, /corrected/i, 'corrected_claim'],
  [/^(CO|PR|OA)-?(45|59|97|24|23)$/i, /reconsider/i, 'reconsideration'],
];
export interface LetterPick { letter: ConfigOption; why: string; score: number }
/** Rank letter templates for a claim: explicit code mapping (Admin → Letters) > built-in family match > kind match. */
export function pickLetters(letters: ConfigOption[], o: { codes: string[]; kind: AppealKind; level: number }): LetterPick[] {
  const out: LetterPick[] = [];
  for (const l of letters) {
    if (!l.active) continue; let score = 0, why = ''; const pats = splitList(l.meta.codes); const lk = String(l.meta.kind || '');
    if (pats.length && o.codes.some((c) => pats.some((p) => codeMatches(p, c)))) { score += 100; why = `mapped to ${o.codes.find((c) => pats.some((p) => codeMatches(p, c)))}`; }
    else if (!pats.length) for (const [re, title, kind] of FAMILY) if (o.codes.some((c) => re.test(c.trim())) && title.test(l.value)) { score += 60; why = 'matches the denial reason'; if (kind === o.kind) score += 5; break; }
    if (lk && lk === o.kind) { score += 25; why ||= `${KIND_LABEL[o.kind]} letter`; }
    if (!lk && o.kind === 'underpayment_dispute' && /underpay|reconsider/i.test(l.value)) { score += 40; why ||= 'underpayment letter'; }
    if (o.level >= 2 && /second|level 2|2nd/i.test(l.value)) { score += 20; why += ' · second level'; }
    if (!score && /appeal|reconsider/i.test(l.value) && o.kind === 'appeal') { score = 5; why = 'general appeal'; }
    if (score) out.push({ letter: l, why: why.trim(), score });
  }
  return out.sort((a, b) => b.score - a.score || a.letter.sort - b.letter.sort);
}
export const nextLevel = (existing: Pick<Appeal, 'level' | 'status' | 'kind'>[]) => { const real = existing.filter((a) => a.kind === 'appeal' || a.kind === 'external_review'); return real.length ? Math.max(...real.map((a) => a.level)) + (real.every((a) => !isOpen(a)) ? 1 : 0) : 1; };

export interface AppealCtx { claim: Claim; practice?: string | null; user?: string | null; today: string; level: number; due?: string | null; reason?: string | null; tracking?: string | null; fmt: (iso: string | null | undefined) => string; money: (n: number) => string }
/** Every variable available to letters and payer-form fields. */
export function appealVars(x: AppealCtx): Record<string, string> {
  const c = x.claim; const paid = c.paid_amt ?? 0; const exp = c.expected_amt ?? 0;
  return {
    payer: c.payer || '', claim: c.claim_no, patient: c.patient_name || '', dos: x.fmt(c.dos), cpt: c.cpt || '', billed: x.money(c.billed_amt), balance: x.money(c.balance), codes: c.denial_codes || 'see remittance', reason: x.reason || '',
    practice: x.practice || '', provider: c.provider || '', date: x.fmt(x.today), user: x.user || '', level: LEVEL_LABEL(x.level), deadline: x.fmt(x.due), denial_date: x.fmt(c.denial_date), tracking: x.tracking || '',
    account: c.account_id || '', encounter: c.encounter_no || '', uid: c.claim_uid || '', paid: x.money(paid), allowed: c.allowed_amt != null ? x.money(c.allowed_amt) : '', expected: c.expected_amt != null ? x.money(exp) : '', variance: c.expected_amt != null ? x.money(Math.max(0, exp - paid)) : '', last_billed: x.fmt(c.last_billed),
  };
}
export const VAR_KEYS = Object.keys(appealVars({ claim: { claim_no: '' } as Claim, today: '2000-01-01', level: 1, fmt: () => '', money: () => '' }));
export const fillText = (tpl: string, vars: Record<string, string>) => tpl.replace(/\[\[([\s\S]*?)\]\]/g, (_, inner: string) => { const used = [...inner.matchAll(/\{(\w+)\}/g)]; return used.length && used.every((m) => !vars[m[1]]) ? '' : inner; }).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

// ───────── smart mapping of payer-form fields → variables ─────────
const SYN: Record<string, string[]> = {
  patient: ['patient', 'member name', 'patient name', 'insured', 'subscriber', 'member'], claim: ['claim', 'claim number', 'claim no', 'icn', 'dcn', 'reference'], dos: ['date of service', 'dos', 'service date', 'from date'],
  payer: ['payer', 'plan', 'insurance', 'carrier'], billed: ['billed', 'charge', 'charges', 'amount billed', 'total charge'], balance: ['balance', 'amount in dispute', 'amount disputed', 'amount due', 'outstanding'], paid: ['paid', 'amount paid', 'payment'],
  allowed: ['allowed', 'allowed amount'], practice: ['practice', 'facility', 'billing provider', 'provider name', 'group', 'office'], provider: ['rendering', 'physician', 'doctor', 'provider'], reason: ['reason', 'explanation', 'basis', 'description of dispute', 'comments', 'statement'],
  date: ['date', 'today', 'signed', 'signature date', 'date signed'], user: ['contact', 'prepared by', 'submitted by', 'name of person', 'authorized'], cpt: ['cpt', 'procedure', 'hcpcs', 'service code'], codes: ['denial', 'reason code', 'carc', 'adjustment code', 'remark'],
  account: ['account', 'patient account', 'acct'], tracking: ['tracking', 'confirmation', 'reference number'], denial_date: ['denial date', 'date of denial', 'determination date'], expected: ['expected', 'contract', 'correct payment', 'should have paid'], variance: ['underpaid', 'difference', 'shortfall'],
};
const tok = (s: string) => s.toLowerCase().replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^a-z0-9]+/g, ' ').trim();
export interface FieldMap { field: string; key: string | null; score: number }
/** Suggest a variable for each form-field name (exact name → synonym phrase → token overlap). */
export function mapFields(fields: string[]): FieldMap[] {
  return fields.map((f) => {
    const t = tok(f); let best: { key: string; score: number } | null = null;
    for (const [key, syns] of Object.entries(SYN)) for (const s of syns) {
      let sc = 0; if (t === s || t === key) sc = 100; else if (t.includes(s)) sc = 60 + s.length; else if (s.split(' ').every((w) => t.split(' ').includes(w))) sc = 50;
      if (sc > (best?.score || 0)) best = { key, score: sc };
    }
    return { field: f, key: best && best.score >= 55 ? best.key : null, score: best?.score || 0 };
  });
}

export type Track = 'reconsideration' | 'appeal1' | 'appeal2' | 'appeal3' | 'corrected' | 'underpay';
export const TRACK_LABEL: Record<Track, string> = { reconsideration: 'Reconsideration', appeal1: '1st-level appeal', appeal2: '2nd-level appeal', appeal3: '3rd-level / external', corrected: 'Corrected claim', underpay: 'Underpayment dispute' };
/** Which lane an appeal belongs to: reconsiderations are separate from the numbered appeal levels. */
export const trackOf = (a: Pick<Appeal, 'kind' | 'level'>): Track => (a.kind === 'reconsideration' ? 'reconsideration' : a.kind === 'corrected_claim' ? 'corrected' : a.kind === 'underpayment_dispute' ? 'underpay' : a.level <= 1 ? 'appeal1' : a.level === 2 ? 'appeal2' : 'appeal3');

/** What an appeal packet normally needs, by type — editable per appeal. */
export const PACKET_DEFAULTS: Record<AppealKind, string[]> = {
  appeal: ['Appeal letter (signed)', 'Copy of the denial / EOB', 'Copy of the original claim (CMS-1500 / UB-04)', 'Relevant medical records / notes', 'Proof of timely filing (clearinghouse acceptance)', 'Authorization / referral, if applicable'],
  reconsideration: ['Reconsideration request', 'Copy of the EOB / remittance', 'Supporting documentation for the correction'],
  corrected_claim: ['Corrected claim with frequency code 7 and original claim #', 'Copy of the original EOB', 'Reason for correction noted'],
  underpayment_dispute: ['Dispute letter', 'Remittance showing the payment', 'Contract / fee-schedule excerpt for the CPT', 'Calculation of the shortfall'],
  external_review: ['External-review request form', 'Final internal denial letter', 'All prior appeal correspondence', 'Medical records'],
};
