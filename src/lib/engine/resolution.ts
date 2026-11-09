// Resolving claims that dropped off an aging file: a supervisor / manager decides what really happened. Pure, unit-tested.
import type { Claim, Recovery, WorkLog } from '../types';
import { buildRecoveries } from './attribution';
import { DEFAULT_IMPORT } from './settings';
import { lifecycleOf } from './lifecycle';

export type Outcome = 'paid' | 'written_off' | 'patient' | 'duplicate' | 'void' | 'transferred' | 'restore';
export const OUTCOME_LABEL: Record<Outcome, string> = { paid: 'Paid', written_off: 'Written off / adjusted', patient: 'Moved to patient balance', duplicate: 'Duplicate of another claim', void: 'Voided / billed in error', transferred: 'Transferred / sent elsewhere', restore: 'Restore — still open (file was incomplete)' };
export const OUTCOME_HELP: Record<Outcome, string> = { paid: 'Payment was received. Records the amount as a recovery credited to whoever last worked it.', written_off: 'Balance will not be collected. Needs a reason; large amounts need a manager.', patient: 'Insurance is done; the patient now owes the balance.', duplicate: 'Same service exists under another claim — nothing was lost, no recovery recorded.', void: 'The charge was cancelled by the practice.', transferred: 'Moved to another entity/practice or sent to collections.', restore: 'The claim is NOT resolved — it was simply missing from the export. Goes back to the worklist.' };
export const RESOLUTION_OF: Record<Exclude<Outcome, 'restore'>, string> = { paid: 'paid', written_off: 'adjusted', patient: 'patient', duplicate: 'duplicate', void: 'void', transferred: 'transferred' };
const STATUS_OF: Record<Exclude<Outcome, 'restore'>, string> = { paid: 'Resolved – Paid', written_off: 'Adjusted', patient: 'Billed to Patient', duplicate: 'Adjusted', void: 'Adjusted', transferred: 'Adjusted' };
const LIFECYCLE_OF: Record<Exclude<Outcome, 'restore'>, string> = { paid: 'CLS', written_off: 'WOF', patient: 'PTB', duplicate: 'CLS', void: 'CLS', transferred: 'CLS' };

export interface Decision { claimId: string; outcome: Outcome; paid?: number; adjusted?: number; patient?: number; endAction?: string | null; endSub?: string | null; resolvedOn: string; note?: string; duplicateOf?: string | null }
export interface ResolveCtx { now: string; actor: { id: string; name: string; role: string }; writeOffLimit: number; canOverrideLimit: boolean; workLog: WorkLog[]; uid: () => string; attributionWindowDays?: number }
export interface Applied { claim: Claim; next: Claim; activity: { claim_id: string; kind: string; summary: string; meta: Record<string, any> }; recoveries: Recovery[]; touch: Omit<WorkLog, 'id' | 'created_at'> | null }
export interface Skipped { claimId: string; reason: string }
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Check one decision against the claim and the actor's authority. Returns an error message or null. */
export function validateDecision(c: Claim | undefined, d: Decision, ctx: Pick<ResolveCtx, 'writeOffLimit' | 'canOverrideLimit'>): string | null {
  if (!c) return 'Claim not found'; if (c.closed_at) return 'Already closed'; if (!/^\d{4}-\d{2}-\d{2}$/.test(d.resolvedOn)) return 'Pick the date it was resolved';
  if (d.outcome === 'restore') return null;
  const bal = r2(c.balance); const paid = r2(d.paid ?? 0), adj = r2(d.adjusted ?? 0), pat = r2(d.patient ?? 0);
  if (paid < 0 || adj < 0 || pat < 0) return 'Amounts cannot be negative';
  if (d.outcome === 'paid' && paid <= 0) return 'Enter the amount paid';
  if (d.outcome === 'duplicate' && !d.duplicateOf && !(d.note || '').trim()) return 'Say which claim it duplicates';
  if (r2(paid + adj + pat) - bal > 0.01) return `Amounts add up to more than the balance (${bal.toFixed(2)})`;
  if (d.outcome === 'paid' && bal - r2(paid + adj + pat) > 0.01) return `Account for the remaining $${(bal - paid - adj - pat).toFixed(2)} — enter it as adjusted or patient balance`;
  const writeOff = d.outcome === 'written_off' ? (adj > 0 ? adj : bal) : adj;
  if (writeOff > 0 && !(d.note || '').trim()) return 'A reason is required for any write-off / adjustment';
  if (writeOff > ctx.writeOffLimit && !ctx.canOverrideLimit) return `Write-offs over $${ctx.writeOffLimit.toLocaleString('en-US')} need a manager`;
  return null;
}

/** Apply a validated decision: closes (or restores) the claim and builds everything that must be recorded with it. */
export function applyDecision(c: Claim, d: Decision, ctx: ResolveCtx): Applied {
  const flags = (c.flags || []).filter((f) => f !== 'missing_review' && f !== 'missing_once');
  if (d.outcome === 'restore') {
    const next: Claim = { ...c, flags, missing_count: 0, missing_since: null, updated_at: ctx.now };
    return { claim: c, next, recoveries: [], touch: null, activity: { claim_id: c.id, kind: 'review', summary: `Missing-file review: restored to the worklist${d.note ? ' — ' + d.note : ''}`, meta: { outcome: 'restore', by: ctx.actor.name } } };
  }
  const bal = r2(c.balance); let paid = r2(d.paid ?? 0), adj = r2(d.adjusted ?? 0), pat = r2(d.patient ?? 0);
  if (d.outcome === 'written_off' && adj === 0) adj = r2(bal - paid - pat);
  if (d.outcome === 'patient' && pat === 0) pat = r2(bal - paid - adj);
  const rest = r2(bal - paid - adj - pat); if (rest > 0.005 && d.outcome !== 'paid') adj = r2(adj + rest);   // anything unexplained is an adjustment, never silently lost
  const endAt = new Date(d.resolvedOn + 'T12:00:00Z').toISOString();
  const res = RESOLUTION_OF[d.outcome];
  const next: Claim = { ...c, balance: 0, closed_at: endAt, closed_reason: `${OUTCOME_LABEL[d.outcome]} — resolved after dropping off the aging file`, resolution: res, status: STATUS_OF[d.outcome], resolved_by: ctx.actor.id, resolved_at: ctx.now, resolution_note: d.note?.trim() || null,
    end_action: d.endAction ?? c.end_action, end_sub: d.endSub ?? c.end_sub, flags, missing_count: c.missing_count || 0, updated_at: ctx.now, custom: { ...c.custom, lifecycle: LIFECYCLE_OF[d.outcome], lifecycle_at: ctx.now, resolved_balance: bal, resolution_basis: 'missing_review', duplicate_of: d.duplicateOf ?? undefined } };
  const touches = ctx.workLog.filter((w) => w.claim_id === c.id);
  const mini = (amount: number, resolution: string) => buildRecoveries({ changes: [], closes: [{ claim: { ...c, resolution } as Claim, next, reason: 'review', amount }] } as any, touches, { ...DEFAULT_IMPORT, attributionWindowDays: ctx.attributionWindowDays ?? DEFAULT_IMPORT.attributionWindowDays }, { batchId: '', now: ctx.now, asOf: d.resolvedOn, clientId: c.client_id, uid: ctx.uid });
  const recoveries = [...(paid > 0 ? mini(paid, 'paid') : []), ...(adj > 0 ? mini(adj, 'adjusted') : []), ...(pat > 0 ? mini(pat, 'patient') : [])].map((r) => ({ ...r, batch_id: null, basis: r.basis === 'unattributed' ? 'review_unattributed' : 'review_' + r.basis }));
  const parts = [paid > 0 && `paid $${paid.toFixed(2)}`, adj > 0 && `adjusted $${adj.toFixed(2)}`, pat > 0 && `to patient $${pat.toFixed(2)}`].filter(Boolean).join(', ');
  const touch: Applied['touch'] = { claim_id: c.id, client_id: c.client_id, user_id: ctx.actor.id, user_name: ctx.actor.name, emp_code: null, supervisor_name: null, work_date: d.resolvedOn, comment: `Missing-file review: ${OUTCOME_LABEL[d.outcome]}${parts ? ' (' + parts + ')' : ''}${d.note ? ' — ' + d.note : ''}`, rca: c.rca, rca_detail: c.rca_detail, end_action: d.endAction ?? c.end_action, end_sub: d.endSub ?? c.end_sub, mode: 'Review', balance: bal, age_days: null, bucket: null, next_fu: null, multi_touch: false, audit_status: 'pending', audit_remarks: null, audit_by: null, audited_at: null, legacy: false, time_spent_sec: 0, call_ref: null, contact_name: null, ack_at: null } as any;
  return { claim: c, next, recoveries, touch, activity: { claim_id: c.id, kind: 'close', summary: `Resolved on ${d.resolvedOn.slice(5, 7)}/${d.resolvedOn.slice(8, 10)}/${d.resolvedOn.slice(0, 4)}: ${OUTCOME_LABEL[d.outcome]}${parts ? ' — ' + parts : ''}${d.endAction ? ` · end action ${d.endAction}${d.endSub ? ' › ' + d.endSub : ''}` : ''}${d.note ? ' — ' + d.note : ''}`, meta: { outcome: d.outcome, paid, adjusted: adj, patient: pat, by: ctx.actor.name, role: ctx.actor.role, basis: 'missing_review', lifecycleFrom: lifecycleOf(c) } } };
}

/** Evidence-based hint for the reviewer — never applied automatically. */
export function suggest(c: Claim, ctx: { workLog: WorkLog[]; eraPaid?: number; recentRecovery?: number }): { outcome: Outcome; reason: string; confidence: 'high' | 'medium' | 'low' } {
  const last = ctx.workLog.filter((w) => w.claim_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if ((ctx.eraPaid || 0) > 0 || (ctx.recentRecovery || 0) > 0) return { outcome: 'paid', reason: `An 835 / recovery of $${(ctx.eraPaid || ctx.recentRecovery || 0).toFixed(2)} was already posted`, confidence: 'high' };
  if (/^(paid|payment)/i.test(last?.end_action || '') || c.status === 'Resolved – Paid' || /paid/i.test(last?.rca_detail || '')) return { outcome: 'paid', reason: 'Last touch says the payer paid', confidence: 'medium' };
  if (/^(adjust|sent for adjustment)/i.test(last?.end_action || '') || c.status === 'Adjusted') return { outcome: 'written_off', reason: 'Last touch was an adjustment / write-off', confidence: 'medium' };
  if (c.status === 'Billed to Patient' || last?.end_action === 'Billed To Patient' || last?.rca === 'Patient Responsibility') return { outcome: 'patient', reason: 'Billed to the patient', confidence: 'medium' };
  if ((c.flags || []).includes('possible_duplicate')) return { outcome: 'duplicate', reason: 'Flagged as a possible duplicate', confidence: 'low' };
  if (/appeal/i.test(last?.end_action || '') || /appeal/i.test(c.status)) return { outcome: 'restore', reason: 'Appeal in progress — it is unlikely to have been resolved yet', confidence: 'low' };
  return { outcome: 'paid', reason: 'No evidence either way — check the PMS before choosing', confidence: 'low' };
}
