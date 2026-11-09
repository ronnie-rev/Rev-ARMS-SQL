import { differenceInCalendarDays, addDays, format, parseISO } from 'date-fns';
import type { AutoRule, Claim, Client, RuleAction, RuleCondition } from '../types';
import { ageDays, bucketFor, tfDaysLeft, type Bucket } from '../utils';
import { familyOf, splitCodes, suggestFromCodes, type Carc } from './carc';

export type FieldType = 'number' | 'text' | 'bool';
export const RULE_FIELDS: { key: string; label: string; type: FieldType; hint?: string }[] = [
  { key: 'balance', label: 'Balance ($)', type: 'number' }, { key: 'billed_amt', label: 'Billed ($)', type: 'number' }, { key: 'age', label: 'Age (days)', type: 'number' },
  { key: 'bucket', label: 'Aging bucket', type: 'text' }, { key: 'tf_left', label: 'Timely-filing days left', type: 'number', hint: 'negative = passed' },
  { key: 'days_since_touch', label: 'Days since last touch', type: 'number', hint: '999 if never touched' }, { key: 'touch_count', label: 'Touch count', type: 'number' },
  { key: 'payer', label: 'Payer', type: 'text' }, { key: 'client', label: 'Client', type: 'text' }, { key: 'status', label: 'Status', type: 'text' }, { key: 'priority', label: 'Priority', type: 'text' },
  { key: 'rca', label: 'Root cause category', type: 'text' }, { key: 'rca_detail', label: 'Root cause detail', type: 'text' }, { key: 'end_action', label: 'End action', type: 'text' },
  { key: 'pms_status', label: 'PMS status', type: 'text' }, { key: 'denial_codes', label: 'Denial codes', type: 'text' }, { key: 'cpt', label: 'CPT', type: 'text' }, { key: 'provider', label: 'Provider', type: 'text' },
  { key: 'owner', label: 'Owner (user id)', type: 'text', hint: 'empty = unassigned' }, { key: 'flag', label: 'Has flag', type: 'text', hint: 'includes quality-check flags like chk:loop_same_action' },
  { key: 'denial_family', label: 'Denial family', type: 'text', hint: 'e.g. Timely filing, Authorization, Bundling' }, { key: 'collectability', label: 'Collectability (%)', type: 'number' }, { key: 'days_open', label: 'Days since first seen', type: 'number' }, { key: 'check_count', label: 'Quality-check flags', type: 'number' },
  { key: 'paid_amt', label: 'Paid so far ($)', type: 'number' }, { key: 'allowed_amt', label: 'Allowed ($)', type: 'number' }, { key: 'expected_amt', label: 'Expected reimbursement ($)', type: 'number', hint: '0 if not set' }, { key: 'patient_resp', label: 'Patient responsibility ($)', type: 'number' },
  { key: 'days_since_billed', label: 'Days since last billed', type: 'number', hint: '999 if unknown' }, { key: 'days_since_denial', label: 'Days since denial date', type: 'number', hint: '999 if unknown' }, { key: 'promise_days', label: 'Days until payer-promised payment', type: 'number', hint: 'negative = promise date passed · 9999 if none' },
  { key: 'in_credit', label: 'Credit / negative balance', type: 'bool' }, { key: 'has_denial', label: 'Has a denial code', type: 'bool' }, { key: 'missing_from_file', label: 'Missing from latest file', type: 'bool' }, { key: 'uid', label: 'Claim UID', type: 'text' }, { key: 'encounter', label: 'Encounter #', type: 'text' },
  { key: 'is_new', label: 'New in this import', type: 'bool' }, { key: 'is_reopened', label: 'Reopened', type: 'bool' }, { key: 'fu_overdue', label: 'Follow-up overdue', type: 'bool' },
];
export const OPS: Record<FieldType, { op: string; label: string }[]> = {
  number: [{ op: 'gt', label: '>' }, { op: 'gte', label: '≥' }, { op: 'lt', label: '<' }, { op: 'lte', label: '≤' }, { op: 'eq', label: '=' }, { op: 'neq', label: '≠' }],
  text: [{ op: 'eq', label: 'is' }, { op: 'neq', label: 'is not' }, { op: 'in', label: 'is one of' }, { op: 'contains', label: 'contains' }, { op: 'not_contains', label: 'does not contain' }, { op: 'is_empty', label: 'is empty' }, { op: 'not_empty', label: 'is not empty' }],
  bool: [{ op: 'is_true', label: 'is true' }, { op: 'is_false', label: 'is false' }],
};

export interface Env { carc?: Map<string, Carc>; collect?: (c: Claim) => number; supervisorOf?: (c: Claim) => string | undefined; today: string; buckets: Bucket[]; clients: Map<string, Client>; payerTf: Map<string, number>; batchId?: string | null; loads: Map<string, number>; userName: (id: string) => string }

export function valueOf(field: string, c: Claim, env: Env): any {
  const client = env.clients.get(c.client_id);
  switch (field) {
    case 'balance': return c.balance; case 'billed_amt': return c.billed_amt;
    case 'age': return ageDays(c, client) ?? 0;
    case 'bucket': return bucketFor(ageDays(c, client), env.buckets)?.label ?? '';
    case 'tf_left': return tfDaysLeft(c, client, env.payerTf.get((c.payer || '').toLowerCase())) ?? 9999;
    case 'days_since_touch': return c.last_touched_at ? differenceInCalendarDays(parseISO(env.today), parseISO(c.last_touched_at.slice(0, 10))) : 999;
    case 'touch_count': return c.touch_count;
    case 'payer': return c.payer ?? ''; case 'client': return client?.name ?? ''; case 'status': return c.status; case 'priority': return c.priority;
    case 'rca': return c.rca ?? ''; case 'rca_detail': return c.rca_detail ?? ''; case 'end_action': return c.end_action ?? ''; case 'pms_status': return c.pms_status ?? '';
    case 'denial_codes': return c.denial_codes ?? ''; case 'cpt': return c.cpt ?? ''; case 'provider': return c.provider ?? ''; case 'owner': return c.assigned_to ?? '';
    case 'flag': return (c.flags || []).join(',');
    case 'denial_family': return env.carc ? [...new Set(splitCodes(c.denial_codes).map((k) => familyOf(k, env.carc!)))].join(',') : '';
    case 'collectability': return env.collect ? Math.round(env.collect(c) * 100) : 50;
    case 'days_open': return differenceInCalendarDays(parseISO(env.today), parseISO(c.created_at.slice(0, 10)));
    case 'check_count': return (c.flags || []).filter((f) => f.startsWith('chk:')).length; case 'is_new': return !!env.batchId && c.first_batch === env.batchId;
    case 'is_reopened': return (c.flags || []).includes('reopened'); case 'fu_overdue': return !!c.next_fu && c.next_fu < env.today && !c.closed_at;
    case 'paid_amt': return c.paid_amt ?? 0; case 'allowed_amt': return c.allowed_amt ?? 0; case 'expected_amt': return c.expected_amt ?? 0; case 'patient_resp': return c.patient_resp ?? 0;
    case 'days_since_billed': return c.last_billed ? differenceInCalendarDays(parseISO(env.today), parseISO(c.last_billed)) : 999;
    case 'days_since_denial': return c.denial_date ? differenceInCalendarDays(parseISO(env.today), parseISO(c.denial_date)) : 999;
    case 'promise_days': { const p = c.custom?.promise_date as string | undefined; return p ? differenceInCalendarDays(parseISO(p), parseISO(env.today)) : 9999; }
    case 'in_credit': return c.balance < 0; case 'has_denial': return !!(c.denial_codes && c.denial_codes.trim()); case 'missing_from_file': return (c.flags || []).includes('missing_review');
    case 'uid': return c.claim_uid ?? ''; case 'encounter': return c.encounter_no ?? '';
    default: return field.startsWith('custom:') ? c.custom?.[field.slice(7)] ?? '' : undefined;
  }
}
const isNum = (v: unknown) => v !== '' && v != null && Number.isFinite(Number(v));
export function testCondition(cond: RuleCondition, c: Claim, env: Env): boolean {
  const v = valueOf(cond.field, c, env); const t = RULE_FIELDS.find((f) => f.key === cond.field)?.type || (cond.field.startsWith('custom:') && isNum(v) && isNum(cond.value) ? 'number' : 'text'); const x = cond.value;
  switch (cond.op) {
    case 'is_true': return v === true; case 'is_false': return v === false;
    case 'is_empty': return v == null || v === ''; case 'not_empty': return !(v == null || v === '');
    case 'in': return String(x ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(String(v).toLowerCase());
    case 'contains': return String(v).toLowerCase().includes(String(x ?? '').toLowerCase()); case 'not_contains': return !String(v).toLowerCase().includes(String(x ?? '').toLowerCase());
    case 'eq': return t === 'number' ? Number(v) === Number(x) : String(v).toLowerCase() === String(x ?? '').toLowerCase();
    case 'neq': return t === 'number' ? Number(v) !== Number(x) : String(v).toLowerCase() !== String(x ?? '').toLowerCase();
    case 'gt': return Number(v) > Number(x); case 'gte': return Number(v) >= Number(x); case 'lt': return Number(v) < Number(x); case 'lte': return Number(v) <= Number(x);
    default: return false;
  }
}
export function ruleMatches(r: AutoRule, c: Claim, env: Env): boolean {
  if (r.client_id && r.client_id !== c.client_id) return false;
  if (!r.conditions.length) return false;                         // a rule with no conditions never fires (safety)
  return r.match === 'any' ? r.conditions.some((k) => testCondition(k, c, env)) : r.conditions.every((k) => testCondition(k, c, env));
}

export interface ClaimEffect { notifications: { title: string; body: string; to: NonNullable<RuleAction['to']>; claim_id: string }[]; patch: Partial<Claim>; flagsAdd: Set<string>; flagsRemove: Set<string>; notes: { body: string; client_visible: boolean }[]; applied: string[]; close?: { reason: string; resolution: string } }
export interface RulePlan { effects: Map<string, ClaimEffect>; runs: { rule: AutoRule; matched: number; changed: number; sample: string[] }[] }

/** Evaluate rules (ordered by sort) against claims. Pure: returns what *would* change; the caller applies it. First matching `stop` rule ends processing for that claim. */
export function planRules(rules: AutoRule[], claims: Claim[], env: Env, trigger?: AutoRule['trigger']): RulePlan {
  const effects = new Map<string, ClaimEffect>(); const runs: RulePlan['runs'] = []; const stopped = new Set<string>();
  const loads = new Map(env.loads);
  const live = rules.filter((r) => r.enabled && (!trigger || r.trigger === trigger)).sort((a, b) => a.sort - b.sort);
  for (const r of live) {
    const matched = claims.filter((c) => !c.closed_at && !stopped.has(c.id) && ruleMatches(r, c, env));
    let changed = 0; const sample: string[] = [];
    // pooled assignment across the whole matched set so load balancing is fair within a run
    const assignAct = r.actions.find((a) => a.type === 'assign');
    const assignTo = new Map<string, string>();
    if (assignAct) {
      const pool = (assignAct.pool || []).filter(Boolean); let rr = 0;
      const targets = matched.filter((c) => assignAct.value === 'reassign' || !(effects.get(c.id)?.patch.assigned_to ?? c.assigned_to));
      for (const c of [...targets].sort((a, b) => b.balance - a.balance)) {
        if (!pool.length) break;
        const pick = assignAct.strategy === 'round_robin' ? pool[rr++ % pool.length] : pool.reduce((best, u) => ((loads.get(u) || 0) < (loads.get(best) || 0) ? u : best), pool[0]);
        assignTo.set(c.id, pick); loads.set(pick, (loads.get(pick) || 0) + 1);
      }
    }
    for (const c of matched) {
      const e = effects.get(c.id) ?? { notifications: [], patch: {}, flagsAdd: new Set<string>(), flagsRemove: new Set<string>(), notes: [], applied: [] } as ClaimEffect; let did = false;
      for (const a of r.actions) {
        switch (a.type) {
          case 'assign': { const u = assignTo.get(c.id); if (u && e.patch.assigned_to !== u) { e.patch.assigned_to = u; did = true; } break; }
          case 'priority': if (a.value && (e.patch.priority ?? c.priority) !== a.value) { e.patch.priority = a.value; did = true; } break;
          case 'status': if (a.value && (e.patch.status ?? c.status) !== a.value) { e.patch.status = a.value; did = true; } break;
          case 'next_fu_in': { const d = format(addDays(parseISO(env.today), Number(a.value) || 0), 'yyyy-MM-dd'); if ((e.patch.next_fu ?? c.next_fu) !== d) { e.patch.next_fu = d; did = true; } break; }
          case 'flag': if (a.value && !(c.flags || []).includes(a.value) && !e.flagsAdd.has(a.value)) { e.flagsAdd.add(a.value); e.flagsRemove.delete(a.value); did = true; } break;
          case 'unflag': if (a.value && (c.flags || []).includes(a.value)) { e.flagsRemove.add(a.value); e.flagsAdd.delete(a.value); did = true; } break;
          case 'note': if (a.value) { e.notes.push({ body: String(a.value), client_visible: false }); did = true; } break;
          case 'notify': if (a.value) { e.notifications.push({ title: String(a.value), body: `${c.claim_no} · ${c.payer || ''} · $${c.balance.toFixed(2)} — rule “${r.name}”`, to: a.to || 'supervisor', claim_id: c.id }); did = true; } break;
          case 'suggest_rca': { if (!c.rca && c.denial_codes && env.carc) { const sg = suggestFromCodes(c.denial_codes, env.carc); if (sg && sg.confidence >= 0.7) { e.patch.rca = sg.rca; if (sg.rca_detail) e.patch.rca_detail = sg.rca_detail; did = true; } } break; }
          case 'close': if (!e.close) { e.close = { reason: String(a.value || 'Closed by rule'), resolution: 'adjusted' }; did = true; } break;
        }
      }
      if (did) { effects.set(c.id, e); changed++; e.applied.push(r.name); if (sample.length < 8) sample.push(c.claim_no); }
      if (r.stop) stopped.add(c.id);
    }
    runs.push({ rule: r, matched: matched.length, changed, sample });
  }
  return { effects, runs };
}

/** Ready-made rules the supervisor can add with one click. */
export const RULE_TEMPLATES: Omit<AutoRule, 'id' | 'sort'>[] = [
  { name: 'Timely filing ≤ 30 days → Critical', description: 'Surface claims about to become unrecoverable.', enabled: true, trigger: 'import', client_id: null, match: 'all', stop: false,
    conditions: [{ field: 'tf_left', op: 'lte', value: 30 }, { field: 'tf_left', op: 'gt', value: 0 }], actions: [{ type: 'priority', value: 'Critical' }, { type: 'flag', value: 'tf_risk' }] },
  { name: 'Small balance (< $25) → flag for adjustment review', description: 'Cheaper to adjust than to chase.', enabled: true, trigger: 'import', client_id: null, match: 'all', stop: false,
    conditions: [{ field: 'balance', op: 'lt', value: 25 }, { field: 'balance', op: 'gt', value: 0 }], actions: [{ type: 'flag', value: 'small_balance' }, { type: 'priority', value: 'Low' }] },
  { name: 'Credit balance → refund review', description: 'Negative balances need a refund decision.', enabled: true, trigger: 'import', client_id: null, match: 'all', stop: false,
    conditions: [{ field: 'balance', op: 'lt', value: 0 }], actions: [{ type: 'flag', value: 'refund_review' }, { type: 'priority', value: 'High' }] },
  { name: 'Reopened claim → High priority', description: 'A claim that came back deserves a second look.', enabled: true, trigger: 'import', client_id: null, match: 'all', stop: false,
    conditions: [{ field: 'is_reopened', op: 'is_true' }], actions: [{ type: 'priority', value: 'High' }, { type: 'next_fu_in', value: 1 }] },
  { name: 'High value (> $5k) & unassigned → assign to seniors', description: 'Pick the user pool in the editor.', enabled: false, trigger: 'import', client_id: null, match: 'all', stop: true,
    conditions: [{ field: 'balance', op: 'gt', value: 5000 }, { field: 'owner', op: 'is_empty' }], actions: [{ type: 'assign', pool: [], strategy: 'balanced' }, { type: 'priority', value: 'High' }] },
  { name: 'Cold high-value claims → escalate', description: 'No touch in 14+ days on balances over $1,500.', enabled: true, trigger: 'daily', client_id: null, match: 'all', stop: false,
    conditions: [{ field: 'days_since_touch', op: 'gte', value: 14 }, { field: 'balance', op: 'gte', value: 1500 }], actions: [{ type: 'flag', value: 'gone_cold' }, { type: 'priority', value: 'High' }] },
  { name: 'Auto-code root cause from denial codes', description: 'Pre-fills root cause when denial codes make it unambiguous (≥70% confidence).', enabled: true, trigger: 'import', client_id: null, match: 'all', stop: false,
    conditions: [{ field: 'rca', op: 'is_empty' }, { field: 'denial_codes', op: 'not_empty' }], actions: [{ type: 'suggest_rca' }] },
  { name: 'Systemic loop (same action 3×) → notify supervisor', description: 'Quality check flagged a repeating action with no progress.', enabled: true, trigger: 'daily', client_id: null, match: 'all', stop: false,
    conditions: [{ field: 'flag', op: 'contains', value: 'chk:loop_same_action' }], actions: [{ type: 'notify', value: 'Claim stuck in an action loop', to: 'supervisor' }, { type: 'priority', value: 'High' }] },
  { name: 'Denial family: Timely filing → escalate', description: 'CO-29 style denials need proof-of-timely-filing work immediately.', enabled: false, trigger: 'import', client_id: null, match: 'all', stop: false,
    conditions: [{ field: 'denial_family', op: 'contains', value: 'Timely filing' }], actions: [{ type: 'priority', value: 'Critical' }, { type: 'flag', value: 'tf_denial' }, { type: 'notify', value: 'Timely-filing denial received', to: 'supervisor' }] },
  { name: 'Low collectability & old → flag for write-off review', description: 'Under 15% likely to collect and over 270 days old.', enabled: false, trigger: 'daily', client_id: null, match: 'all', stop: false,
    conditions: [{ field: 'collectability', op: 'lt', value: 15 }, { field: 'age', op: 'gt', value: 270 }], actions: [{ type: 'flag', value: 'writeoff_review' }, { type: 'priority', value: 'Low' }] },
  { name: 'Follow-up overdue 7+ days → Escalated status', description: '', enabled: false, trigger: 'daily', client_id: null, match: 'all', stop: false,
    conditions: [{ field: 'fu_overdue', op: 'is_true' }, { field: 'days_since_touch', op: 'gte', value: 7 }], actions: [{ type: 'status', value: 'Escalated' }] },
];
export type { RuleAction };
