// Claim *stage* = where the claim sits in the payer lifecycle (eCW/athena-style A/R queues): unbilled → billed → rejected/denied → appeal → secondary → patient.
// Distinct from workflow *status* (what our team did). Derived, never stored; fully configurable (Admin → Claim stages).
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Claim, ConfigOption } from '../types';
import { splitCodes } from './carc';

export type StageRule = 'credit' | 'patient' | 'appeal' | 'hold' | 'denied' | 'rejected' | 'secondary' | 'unbilled' | 'noresponse' | 'billed' | 'custom';
export interface StageDef { value: string; color: string; sort: number; rule: StageRule; keywords: string[]; patientAR?: boolean }
export interface StageCtx { today: string; followupDays: (payer: string | null) => number }

export const STAGE_DEFAULTS: { value: string; color: string; rule: StageRule; keywords: string; patientAR?: boolean; hint: string }[] = [
  { value: 'Credit / refund', color: '#06b6d4', rule: 'credit', keywords: 'credit,refund,overpay', hint: 'Negative balance' },
  { value: 'Patient responsibility', color: '#84cc16', rule: 'patient', keywords: 'patient resp,pt resp,patient balance,statement,billed to patient,deductible,copay,coinsurance', patientAR: true, hint: 'Payer AR has moved to the patient' },
  { value: 'In appeal', color: '#8b5cf6', rule: 'appeal', keywords: 'appeal,reconsideration,grievance', hint: 'Appeal filed / being prepared' },
  { value: 'Waiting on documents', color: '#fb923c', rule: 'hold', keywords: 'awaiting doc,records requested,need op notes,medical records,mr request,hold', hint: 'Blocked on records / info' },
  { value: 'Denied', color: '#ef4444', rule: 'denied', keywords: 'denied,denial,not covered,no auth', hint: 'Payer denied (ERA/remit)' },
  { value: 'Rejected (front-end)', color: '#f97316', rule: 'rejected', keywords: 'reject,clearinghouse,277ca,invalid,front end', hint: 'Bounced before adjudication' },
  { value: 'Secondary / COB', color: '#0ea5e9', rule: 'secondary', keywords: 'secondary,cob,coordination,crossover,bill secondary,partial,partially paid', hint: 'Primary paid — next payer due' },
  { value: 'Unbilled / not sent', color: '#64748b', rule: 'unbilled', keywords: 'unbilled,not billed,ready to bill,draft,charge entered,not submitted', hint: 'Charge never reached the payer' },
  { value: 'No response', color: '#eab308', rule: 'noresponse', keywords: '', hint: 'Billed, silent past the payer follow-up window' },
  { value: 'Billed — awaiting payer', color: '#6366f1', rule: 'billed', keywords: 'billed,submitted,sent,pending,in process,accepted,processing', hint: 'Normal payer processing' },
];

export function stageDefs(config: ConfigOption[]): StageDef[] {
  const rows = config.filter((o) => o.category === 'stage' && o.active).sort((a, b) => a.sort - b.sort);
  if (!rows.length) return STAGE_DEFAULTS.map((d, i) => ({ value: d.value, color: d.color, sort: i, rule: d.rule, patientAR: d.patientAR, keywords: d.keywords.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) }));
  return rows.map((o) => ({ value: o.value, color: o.color || '#64748b', sort: o.sort, rule: (o.meta.rule as StageRule) || 'custom', patientAR: !!o.meta.patientAR, keywords: String(o.meta.keywords || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) }));
}

const prOnly = (c: Claim) => { const k = splitCodes(c.denial_codes); return k.length > 0 && k.every((x) => x.startsWith('PR-')); };
const hasCo = (c: Claim) => splitCodes(c.denial_codes).some((x) => !x.startsWith('PR-') && x !== 'CO-45' && x !== 'OA-23');

/** First matching stage in configured order wins; the `billed` rule is the catch-all. */
export function deriveStage(c: Claim, defs: StageDef[], ctx: StageCtx): StageDef {
  const text = [c.pms_status, c.status, c.end_action, c.end_sub].filter(Boolean).join(' ').toLowerCase();
  const kw = (d: StageDef) => d.keywords.some((k) => text.includes(k));
  for (const d of defs) {
    let hit = false;
    switch (d.rule) {
      case 'credit': hit = c.balance < -0.005; break;
      case 'patient': hit = kw(d) || prOnly(c) || /patient/i.test(c.end_action || '') || c.status === 'Billed to Patient'; break;
      case 'appeal': hit = /appeal/i.test(c.end_action || '') || c.status === 'Appealed' || kw(d); break;
      case 'hold': hit = c.status === 'Awaiting Documents' || /need op notes|records requested|documentation/i.test(`${c.end_action} ${c.rca_detail}`) && !/submitted/i.test(c.end_action || '') || kw(d); break;
      case 'denied': hit = /denied|denial/i.test(c.pms_status || '') || hasCo(c) || kw(d); break;
      case 'rejected': hit = /reject/i.test(c.pms_status || '') || kw(d); break;
      case 'secondary': hit = kw(d); break;
      case 'unbilled': hit = !c.last_billed && !c.touch_count && kw(d) || /unbilled|not billed|not submitted/i.test(c.pms_status || ''); break;
      case 'noresponse': { const base = [c.last_billed, c.last_touched_at?.slice(0, 10)].filter(Boolean).sort().pop(); hit = !!base && differenceInCalendarDays(parseISO(ctx.today), parseISO(base!)) > ctx.followupDays(c.payer); break; }
      case 'billed': hit = true; break;
      default: hit = kw(d);
    }
    if (hit) return d;
  }
  return defs[defs.length - 1] || { value: 'Billed — awaiting payer', color: '#6366f1', sort: 99, rule: 'billed', keywords: [] };
}
