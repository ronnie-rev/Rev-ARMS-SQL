// ARMS-native claim lifecycle (Functional Design v2 §2). Independent of the PMS status, the work queue (stage),
// the aging bucket, RCA and end action. Stored in claim.custom.lifecycle; derived when never set explicitly.
import type { Claim, ConfigOption } from '../types';
import { needsVisitTriage } from './visit';

export interface LifecycleDef { code: string; label: string; color: string; hint: string; terminal?: boolean; requires?: Req[]; }
export type Req = 'reason' | 'amount' | 'approval' | 'due' | 'method' | 'evidence' | 'owner';
export const REQ_LABEL: Record<Req, string> = { reason: 'Reason', amount: 'Amount', approval: 'Approval evidence', due: 'Follow-up / due date', method: 'Method', evidence: 'Evidence', owner: 'Escalation owner' };

export const LIFECYCLE_DEFAULTS: LifecycleDef[] = [
  { code: 'NEW', label: 'New Intake', color: '#64748b', hint: 'Imported and not triaged' },
  { code: 'VAL', label: 'Validation Hold', color: '#f59e0b', hint: 'Missing/ambiguous matching or required fields' },
  { code: 'RDY', label: 'Ready for Work', color: '#0ea5e9', hint: 'Validated; can be allocated' },
  { code: 'WRK', label: 'Under Review', color: '#6366f1', hint: 'Analyst actively researching' },
  { code: 'PEN', label: 'Payer Processing', color: '#06b6d4', hint: 'Payer processing without confirmed outcome' },
  { code: 'REQ', label: 'Information Requested', color: '#fb923c', hint: 'Records, COB or response required' },
  { code: 'FIX', label: 'Correction Required', color: '#d946ef', hint: 'Correction prepared before resubmission' },
  { code: 'SUB', label: 'Submitted / Resubmitted', color: '#3b82f6', hint: 'Transmission submitted; acceptance not yet proven' },
  { code: 'ACK', label: 'Accepted / Acknowledged', color: '#14b8a6', hint: 'Clearinghouse/payer acceptance confirmed' },
  { code: 'DEN', label: 'Denied', color: '#ef4444', hint: 'Payer denial confirmed', requires: ['reason'] },
  { code: 'APL', label: 'Appeal / Reconsideration', color: '#8b5cf6', hint: 'Appeal workflow active', requires: ['method', 'due'] },
  { code: 'ESC', label: 'Escalated / On Hold', color: '#be123c', hint: 'Requires elevated decision or external dependency', requires: ['owner', 'reason'] },
  { code: 'PAY', label: 'Payment Pending Posting', color: '#22c55e', hint: 'Payment verified but not posted or reconciled' },
  { code: 'PRT', label: 'Partial Resolution', color: '#84cc16', hint: 'Partial payment or lines outstanding' },
  { code: 'PTB', label: 'Patient Responsibility', color: '#a3a3a3', hint: 'Validated patient balance' },
  { code: 'CLS', label: 'Closed / Resolved', color: '#15803d', hint: 'Resolved with documented basis', terminal: true, requires: ['evidence'] },
  { code: 'WOF', label: 'Write-Off Approved', color: '#9f1239', hint: 'Approved adjustment; closure pending reconciliation', terminal: true, requires: ['approval', 'amount', 'reason'] },
  { code: 'REO', label: 'Reopened', color: '#ea580c', hint: 'Previously resolved claim became workable again', requires: ['reason', 'evidence'] },
];

/** Guardrail table from the spec (§6). Anything not listed is allowed except leaving a terminal state (only REO reopens). */
const GUARDS: { from: string; to: string; requires: Req[]; why: string }[] = [
  { from: 'DEN', to: 'APL', requires: ['reason', 'method', 'due'], why: 'Denial reason, appeal method and due date' },
  { from: 'PAY', to: 'CLS', requires: ['evidence'], why: 'Evidence of posting / reconciliation' },
  { from: 'PEN', to: 'PAY', requires: ['evidence'], why: 'Verified payer information' },
  { from: 'CLS', to: 'REO', requires: ['reason', 'evidence'], why: 'Reason and newly observed evidence' },
  { from: 'VAL', to: 'RDY', requires: ['reason'], why: 'Reviewer reconciles conflicts' },
];

export function lifecycleDefs(config: ConfigOption[]): LifecycleDef[] {
  const rows = config.filter((o) => o.category === 'lifecycle' && o.active).sort((a, b) => a.sort - b.sort);
  if (!rows.length) return LIFECYCLE_DEFAULTS;
  return rows.map((o) => ({ code: o.value, label: o.label || o.value, color: o.color || '#64748b', hint: String(o.meta.hint || ''), terminal: !!o.meta.terminal, requires: (o.meta.requires as Req[]) || [] }));
}

export interface TransitionInput { reason?: string; amount?: number | null; approval?: string; due?: string; method?: string; evidence?: string; owner?: string; canWriteOff?: boolean }
export function checkTransition(from: string, to: string, input: TransitionInput, defs: LifecycleDef[] = LIFECYCLE_DEFAULTS): { ok: boolean; missing: Req[]; message?: string } {
  if (from === to) return { ok: true, missing: [] };
  const d = defs.find((x) => x.code === to); const f = defs.find((x) => x.code === from);
  if (!d) return { ok: false, missing: [], message: `Unknown status ${to}` };
  if (f?.terminal && to !== 'REO') return { ok: false, missing: [], message: `${f.label} claims can only be reopened (REO)` };
  if (to === 'WOF' && input.canWriteOff === false) return { ok: false, missing: [], message: 'You do not have permission to approve write-offs' };
  const g = GUARDS.find((x) => x.from === from && x.to === to);
  const need = new Set<Req>([...(d.requires || []), ...(g?.requires || [])]);
  const has = (r: Req) => (r === 'amount' ? input.amount != null && Number(input.amount) > 0 : !!String((input as any)[r] ?? '').trim());
  const missing = [...need].filter((r) => !has(r));
  return { ok: missing.length === 0, missing, message: missing.length ? `Needs ${missing.map((m) => REQ_LABEL[m]).join(', ')}${g ? ' — ' + g.why : ''}` : undefined };
}

export const storedLifecycle = (c: Claim): string | null => (c.custom?.lifecycle as string) || null;

/** Best-effort native status when none was set explicitly. Explicit values always win. */
export function deriveLifecycle(c: Claim): string {
  if (c.closed_at) return /adjust|write/i.test(c.closed_reason || '') || c.status === 'Adjusted' ? 'WOF' : /patient/i.test(c.status) ? 'PTB' : 'CLS';
  if (c.custom?.reopened) return 'REO';
  const ea = (c.end_action || '').toLowerCase(); const st = (c.pms_status || '').toLowerCase();
  if (!c.touch_count) {
    if (!c.dos || !c.payer || needsVisitTriage(c)) return 'VAL';
    return c.assigned_to ? 'RDY' : 'NEW';
  }
  if (ea.includes('appeal')) return 'APL';
  if (ea.includes('escalat')) return 'ESC';
  if (ea.includes('cash posting')) return 'PAY';
  if (ea.includes('billed to patient')) return 'PTB';
  if (ea.includes('claim submitted')) return 'SUB';
  if (ea.includes('documentation') || ea.includes('op notes') || ea.includes('coding') || ea.includes('credential')) return ea.includes('coding') ? 'FIX' : 'REQ';
  if (ea.includes('follow up')) return 'PEN';
  if (st.includes('denied') || c.denial_codes) return 'DEN';
  return 'WRK';
}
export const lifecycleOf = (c: Claim): string => storedLifecycle(c) ?? deriveLifecycle(c);
