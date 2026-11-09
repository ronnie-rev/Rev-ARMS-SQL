// Manager-defined recommendation rules ("if a claim looks like THIS, recommend THAT"). They run alongside the built-in rules inside next-best-action and
// reuse the same condition fields as the automation rules (including any custom claim field). Pure and unit-tested.
import type { Claim, RuleCondition } from '../types';
import { testCondition, type Env } from './rules';

export type RecAction = { type: 'none' } | { type: 'followup'; days: number } | { type: 'assign_me' } | { type: 'appeal' } | { type: 'corrected' } | { type: 'underpay' } | { type: 'flag'; flag: string } | { type: 'status'; status: string } | { type: 'link'; to: string };
export interface CustomRec { id: string; name: string; enabled: boolean; client_id: string | null; match: 'all' | 'any'; conditions: RuleCondition[]; label: string; color: string; urgency: number; /** shown as the reason; {balance} {age} {payer} {codes} {claim} {days_since_touch} */ why: string; action: RecAction }
export const REC_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#94a3b8'];
export const ACTION_LABEL: Record<RecAction['type'], string> = { none: 'No button (advice only)', followup: 'Set a follow-up date', assign_me: 'Assign to me', appeal: 'Start an appeal', corrected: 'Start a corrected claim', underpay: 'Start an underpayment dispute', flag: 'Add a flag', status: 'Set workflow status', link: 'Open a page' };

export function validateCustomRec(r: CustomRec): string[] {
  const e: string[] = []; if (!r.name.trim()) e.push('Give the rule a name'); if (!r.label.trim()) e.push('Say what to recommend'); if (r.label.length > 48) e.push('Recommendation text must be 48 characters or fewer');
  if (!r.conditions.length) e.push('Add at least one condition — a rule with none never fires'); if (r.conditions.some((c) => !c.field || !c.op)) e.push('Every condition needs a field and an operator');
  if (!(r.urgency >= 0 && r.urgency <= 100)) e.push('Urgency must be 0–100'); if (r.action.type === 'followup' && !(r.action.days >= 1 && r.action.days <= 365)) e.push('Follow-up days must be 1–365'); if (r.action.type === 'flag' && !r.action.flag.trim()) e.push('Name the flag'); if (r.action.type === 'status' && !r.action.status.trim()) e.push('Pick the status'); if (r.action.type === 'link' && !/^\//.test(r.action.to)) e.push('Page link must start with /');
  return e;
}
export function recMatches(r: CustomRec, c: Claim, env: Env): boolean {
  if (!r.enabled || (r.client_id && r.client_id !== c.client_id) || !r.conditions.length) return false;
  return r.match === 'any' ? r.conditions.some((k) => testCondition(k, c, env)) : r.conditions.every((k) => testCondition(k, c, env));
}
export function renderWhy(t: string, c: Claim, env: Env, valueOf: (f: string, c: Claim, e: Env) => any): string {
  return t.replace(/\{(balance|age|payer|codes|claim|days_since_touch)\}/g, (_, k: string) => { switch (k) { case 'balance': return '$' + Math.round(c.balance).toLocaleString('en-US'); case 'payer': return c.payer || 'payer'; case 'codes': return c.denial_codes || 'no code'; case 'claim': return c.claim_no; default: return String(valueOf(k, c, env) ?? ''); } });
}

const C = (field: string, op: string, value?: any): RuleCondition => ({ field, op, value });
const T = (name: string, label: string, color: string, urgency: number, why: string, match: 'all' | 'any', conditions: RuleCondition[], action: RecAction = { type: 'none' }): Omit<CustomRec, 'id'> => ({ name, enabled: true, client_id: null, match, conditions, label, color, urgency, why, action });
/** One-click starting points written from billing-office practice. Edit freely after adding. */
export const REC_TEMPLATES: { group: string; rule: Omit<CustomRec, 'id'> }[] = [
  { group: 'Money at risk', rule: T('High-dollar claim nobody has touched', 'Escalate: high-dollar, untouched', '#ef4444', 82, '{balance} with no work after {age} days', 'all', [C('balance', 'gte', 2500), C('touch_count', 'eq', 0), C('age', 'gte', 30)], { type: 'assign_me' }) },
  { group: 'Money at risk', rule: T('Unbilled and filing window closing', 'Bill now — filing window closing', '#ef4444', 92, 'Not billed and only {days_since_touch} days since last touch; timely filing is close', 'all', [C('pms_status', 'contains', 'unbilled'), C('tf_left', 'lte', 30)], { type: 'followup', days: 1 }) },
  { group: 'Money at risk', rule: T('Small old balance', 'Small-balance write-off review', '#a855f7', 35, '{balance} after {age} days costs more to chase than it returns', 'all', [C('balance', 'lt', 25), C('age', 'gt', 120), C('balance', 'gt', 0)]) },
  { group: 'Money at risk', rule: T('Stuck after many touches', 'Supervisor review — stuck', '#f59e0b', 62, 'Worked repeatedly and still {age} days old', 'all', [C('touch_count', 'gte', 5), C('age', 'gt', 90)]) },
  { group: 'Denials', rule: T('Eligibility / coverage denial', 'Verify eligibility & COB, then rebill', '#f97316', 78, 'Coverage-type denial ({codes}) — confirm active coverage and order of benefits', 'any', [C('denial_codes', 'contains', 'CO-27'), C('denial_codes', 'contains', 'CO-31'), C('denial_codes', 'contains', 'CO-22'), C('denial_codes', 'contains', 'CO-24'), C('denial_codes', 'contains', 'PR-26'), C('denial_codes', 'contains', 'PR-27')]) },
  { group: 'Denials', rule: T('Duplicate-claim denial', 'Check the original claim first', '#06b6d4', 70, 'Duplicate denial ({codes}) — the first claim may already be paid or in process', 'all', [C('denial_codes', 'contains', 'CO-18')]) },
  { group: 'Denials', rule: T('Bundling / modifier denial', 'Modifier & bundling review', '#f97316', 74, 'Bundling-type denial ({codes}) — check modifiers (25, 59, XE/XS) and NCCI edits', 'any', [C('denial_codes', 'contains', 'CO-97'), C('denial_codes', 'contains', 'CO-59'), C('denial_codes', 'contains', 'CO-234'), C('denial_codes', 'contains', 'CO-236')]) },
  { group: 'Denials', rule: T('Authorization denial', 'Request retro-authorization', '#f97316', 76, 'Authorization denial ({codes}) — ask the payer for retro-auth or peer-to-peer', 'any', [C('denial_codes', 'contains', 'CO-197'), C('denial_codes', 'contains', 'CO-198'), C('denial_codes', 'contains', 'CO-15'), C('denial_codes', 'contains', 'CO-288')]) },
  { group: 'Denials', rule: T('Credentialing / enrollment denial', 'Route to credentialing', '#a855f7', 72, 'Provider enrollment issue — {payer} needs the practice’s credentialing contact', 'any', [C('pms_status', 'contains', 'credential'), C('rca_detail', 'contains', 'credential'), C('rca_detail', 'contains', 'enrollment')]) },
  { group: 'Follow-up', rule: T('No payer response 60+ days', 'Escalate to payer provider rep', '#06b6d4', 66, 'Billed {days_since_touch} days since last touch with no denial or payment — escalate beyond the phone queue', 'all', [C('days_since_billed', 'gt', 60), C('has_denial', 'is_false'), C('touch_count', 'gte', 1), C('paid_amt', 'eq', 0)]) },
  { group: 'Follow-up', rule: T('Payer promised payment but date passed', 'Promised payment is overdue — call back', '#ef4444', 80, 'The payer promised payment and the date has passed', 'all', [C('promise_days', 'lt', 0)], { type: 'followup', days: 1 }) },
  { group: 'Follow-up', rule: T('Primary done, secondary pending', 'Bill the secondary payer', '#84cc16', 56, 'Primary has processed — secondary is waiting ({payer})', 'all', [C('pms_status', 'contains', 'secondary')]) },
  { group: 'Compliance', rule: T('Credit balance', 'Credit balance — verify & refund', '#a855f7', 70, 'Negative balance of {balance}. Confirm the overpayment, then refund or transfer; many payers and states set a refund deadline', 'all', [C('in_credit', 'is_true')]) },
];

export interface RuleHealth { id: string; name: string; enabled: boolean; matches: number; pctOpen: number; dollars: number; flag: 'dead' | 'broad' | 'ok' | 'off' }
export interface RuleConflict { a: string; b: string; aName: string; bName: string; overlap: number; shared: number; why: string }
/** Simulate every rule against the open claims: how many each catches, the dollars in play, and where two rules fight over the same claims. */
export function ruleLab(rules: CustomRec[], open: Claim[], env: Env, opts: { broadPct?: number; minOverlap?: number } = {}) {
  const broad = opts.broadPct ?? 60; const minOv = opts.minOverlap ?? 0.5; const hits = new Map<string, Set<string>>(); const health: RuleHealth[] = [];
  for (const r of rules) { const set = new Set<string>(); let dollars = 0; if (r.enabled) for (const c of open) if (recMatches(r, c, env)) { set.add(c.id); dollars += c.balance || 0; } hits.set(r.id, set); const pct = open.length ? (set.size / open.length) * 100 : 0; health.push({ id: r.id, name: r.name, enabled: r.enabled, matches: set.size, pctOpen: pct, dollars, flag: !r.enabled ? 'off' : set.size === 0 ? 'dead' : pct >= broad ? 'broad' : 'ok' }); }
  const conflicts: RuleConflict[] = [];
  for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) {
    const a = rules[i], b = rules[j]; if (!a.enabled || !b.enabled) continue; const A = hits.get(a.id)!, B = hits.get(b.id)!; if (!A.size || !B.size) continue; let shared = 0; for (const x of A) if (B.has(x)) shared++; const ov = shared / Math.min(A.size, B.size); if (ov < minOv) continue;
    const sameAct = JSON.stringify(a.action) === JSON.stringify(b.action); const close = Math.abs(a.urgency - b.urgency) < 10;
    if (!sameAct) conflicts.push({ a: a.id, b: b.id, aName: a.name, bName: b.name, overlap: ov, shared, why: close ? 'Different buttons at nearly the same urgency — the winner is unpredictable. Separate the urgency by 10+ or narrow one rule.' : `“${a.urgency > b.urgency ? a.name : b.name}” always wins on these claims — the other never shows.` });
    else conflicts.push({ a: a.id, b: b.id, aName: a.name, bName: b.name, overlap: ov, shared, why: 'Same recommendation on mostly the same claims — likely a duplicate. Merge or disable one.' });
  }
  return { health, conflicts: conflicts.sort((x, y) => y.shared - x.shared) };
}
export interface RuleHistory { at: string; by: string; summary: string; rules: CustomRec[] }
export const describeRuleChange = (prev: CustomRec[], next: CustomRec[]): string => {
  const p = new Map(prev.map((r) => [r.id, r])); const n = new Map(next.map((r) => [r.id, r])); const out: string[] = [];
  for (const r of next) { const o = p.get(r.id); if (!o) out.push(`added “${r.name}”`); else if (JSON.stringify(o) !== JSON.stringify(r)) out.push(o.enabled !== r.enabled ? `${r.enabled ? 'enabled' : 'disabled'} “${r.name}”` : `edited “${r.name}”`); }
  for (const r of prev) if (!n.has(r.id)) out.push(`deleted “${r.name}”`); return out.slice(0, 4).join(', ') || 'no change';
};
