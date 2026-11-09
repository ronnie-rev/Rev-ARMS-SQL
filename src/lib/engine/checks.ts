// Claim-accounting & workflow consistency checks. Each check is a pure function with a plain-English message, an editable
// severity/threshold, and writes a managed `chk:<id>` flag so rules, worklists and the Exceptions workbench can all use it.
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Claim, Client, WorkLog } from '../types';
import { splitCodes, suggestFromCodes, type Carc } from './carc';

export type Severity = 'high' | 'med' | 'low';
export type Group = 'accounting' | 'workflow' | 'coding' | 'identity' | 'data';
export interface CheckCtx {
  today: string; c: Claim; client?: Client; age: number | null; tfLeft: number | null; terminal: Set<string>;
  endActions: Map<string, { status?: string; terminal?: boolean }>; users: Map<string, { active: boolean; name: string }>;
  dupCount: number; touches: WorkLog[]; carc: Map<string, Carc>; p: Record<string, number>;
}
export interface Check { id: string; title: string; group: Group; severity: Severity; help: string; params?: { key: string; label: string; def: number }[]; test: (x: CheckCtx) => string | null }

const dsince = (iso: string | null | undefined, today: string) => (iso ? differenceInCalendarDays(parseISO(today), parseISO(iso.slice(0, 10))) : null);
const money = (n: number) => '$' + n.toFixed(2);

export const CHECKS: Check[] = [
  // ── accounting
  { id: 'missing_stale', title: 'Missing from file — decision overdue', group: 'workflow', severity: 'high', help: 'The claim dropped off an aging file and nobody has recorded what happened. Mark it paid / written off, or restore it.', params: [{ key: 'days', label: 'Days waiting', def: 7 }], test: ({ c, today, p }) => { if (c.closed_at || !(c.flags || []).includes('missing_review') || !c.missing_since) return null; const d = Math.round((Date.parse(today) - Date.parse(c.missing_since)) / 864e5); return d >= p.days ? `Waiting ${d} days for a paid / written-off decision` : null; } },
  { id: 'bal_gt_billed', title: 'Balance exceeds billed amount', group: 'accounting', severity: 'med', help: 'A balance higher than the charge usually means a posting or import error.', test: ({ c }) => (c.billed_amt > 0 && c.balance > c.billed_amt * 1.01 ? `Balance ${money(c.balance)} > billed ${money(c.billed_amt)}` : null) },
  { id: 'credit_balance', title: 'Credit (negative) balance', group: 'accounting', severity: 'med', help: 'Overpayment or misposted payment — needs a refund/transfer decision.', test: ({ c }) => (c.balance < -0.005 ? `Credit of ${money(-c.balance)}` : null) },
  { id: 'zero_open', title: 'Open claim with zero balance', group: 'accounting', severity: 'low', help: 'Nothing left to collect; should close on the next snapshot.', test: ({ c }) => (!c.closed_at && Math.abs(c.balance) < 0.005 ? 'Zero balance but still open' : null) },
  { id: 'billed_zero', title: 'Zero billed amount with a balance', group: 'accounting', severity: 'med', help: 'Charge missing from the export; balance cannot be validated.', test: ({ c }) => (c.billed_amt <= 0 && c.balance > 0 ? 'Billed amount is 0 but a balance exists' : null) },
  { id: 'tiny_balance', title: 'Tiny balance — adjustment candidate', group: 'accounting', severity: 'low', help: 'Chasing this costs more than it recovers.', params: [{ key: 'max', label: 'Balance below ($)', def: 25 }], test: ({ c, p }) => (c.balance > 0.005 && c.balance < p.max ? `Only ${money(c.balance)} outstanding` : null) },
  { id: 'dos_after_billed', title: 'Billed before date of service', group: 'accounting', severity: 'med', help: 'Impossible sequence — one of the dates is wrong.', test: ({ c }) => (c.dos && c.last_billed && c.last_billed < c.dos ? `Last billed ${c.last_billed} precedes DOS ${c.dos}` : null) },
  { id: 'balance_up_worked', title: 'Balance rose after we worked it', group: 'accounting', severity: 'med', help: 'Often a reversed payment, takeback or rebill — verify before more effort.', test: ({ c }) => ((c.flags || []).includes('balance_up') && c.touch_count > 0 ? 'Balance increased since the last file on a worked claim' : null) },
  { id: 'old_unworked', title: 'Old claim never worked', group: 'accounting', severity: 'high', help: 'Aged inventory with zero touches is the fastest way to lose money.', params: [{ key: 'days', label: 'Older than (days)', def: 90 }], test: ({ age, c, p }) => ((age ?? 0) > p.days && c.touch_count === 0 ? `${age} days old with no touches` : null) },
  { id: 'tf_passed_open', title: 'Timely-filing window passed — no appeal in progress', group: 'accounting', severity: 'high', help: 'Without proof of timely filing this is likely unrecoverable; decide appeal vs adjust.', test: ({ tfLeft, c }) => (tfLeft != null && tfLeft <= 0 && !/appeal/i.test(c.end_action || '') ? `Filing limit passed ${-tfLeft} days ago` : null) },
  { id: 'tf_imminent_unowned', title: 'Timely filing within 30 days and unassigned', group: 'accounting', severity: 'high', help: 'Nobody owns a claim about to expire.', test: ({ tfLeft, c }) => (tfLeft != null && tfLeft > 0 && tfLeft <= 30 && !c.assigned_to ? `${tfLeft} days left, no owner` : null) },
  // ── workflow
  { id: 'terminal_lingering', title: 'Closing action taken but balance still on the aging', group: 'workflow', severity: 'med', help: 'Adjusted / billed-to-patient claims should leave the PMS aging soon.', params: [{ key: 'days', label: 'Still open after (days)', def: 14 }], test: ({ c, terminal, today, p }) => (terminal.has(c.status) && c.balance > 0.005 && !c.closed_at && (dsince(c.last_touched_at, today) ?? 0) > p.days ? `Status “${c.status}” but balance ${money(c.balance)} remains after ${dsince(c.last_touched_at, today)} days` : null) },
  { id: 'fu_missing', title: 'Worked claim without a follow-up date', group: 'workflow', severity: 'med', help: 'No follow-up = claim falls off everyone’s radar.', test: ({ c, terminal }) => (c.touch_count > 0 && !c.next_fu && !terminal.has(c.status) && !c.closed_at ? 'Worked but no next follow-up date' : null) },
  { id: 'fu_on_closed', title: 'Follow-up date on a closed-out claim', group: 'workflow', severity: 'low', help: 'Stale follow-up creates false work.', test: ({ c, terminal }) => (terminal.has(c.status) && c.next_fu ? `Follow-up ${c.next_fu} set on “${c.status}”` : null) },
  { id: 'status_action_mismatch', title: 'Status does not match last end action', group: 'workflow', severity: 'low', help: 'Status was edited manually or an end action was reconfigured.', test: ({ c, endActions, terminal }) => { const m = c.end_action ? endActions.get(c.end_action) : undefined; return m?.status && c.status !== m.status && !terminal.has(c.status) ? `Status “${c.status}” but “${c.end_action}” implies “${m.status}”` : null; } },
  { id: 'new_but_touched', title: 'Status still “New” after being worked', group: 'workflow', severity: 'low', help: 'Status was not advanced.', test: ({ c }) => (c.status === 'New' && c.touch_count > 0 ? `${c.touch_count} touches but status is “New”` : null) },
  { id: 'stuck_new', title: 'Stuck in “New”', group: 'workflow', severity: 'med', help: 'Claim has sat unstarted for too long.', params: [{ key: 'days', label: 'Days in New', def: 21 }], test: ({ c, today, p }) => (c.status === 'New' && (dsince(c.created_at, today) ?? 0) > p.days && c.touch_count === 0 ? `Unstarted for ${dsince(c.created_at, today)} days` : null) },
  { id: 'loop_same_action', title: 'Same action repeated without progress', group: 'workflow', severity: 'high', help: 'Doing the same thing three times and expecting a different result — change approach or escalate.', params: [{ key: 'n', label: 'Repeats', def: 3 }], test: ({ touches, p, c }) => { if (c.closed_at) return null; const last = touches.slice(0, p.n); return last.length >= p.n && last.every((t) => t.end_action && t.end_action === last[0].end_action && t.rca_detail === last[0].rca_detail) ? `“${last[0].end_action}” logged ${p.n}× for “${last[0].rca_detail}”` : null; } },
  { id: 'many_touches', title: 'Excessive touches', group: 'workflow', severity: 'med', help: 'High effort, no result: candidate for escalation or adjustment.', params: [{ key: 'n', label: 'Touches ≥', def: 6 }], test: ({ c, p }) => (!c.closed_at && c.touch_count >= p.n ? `${c.touch_count} touches and still open` : null) },
  { id: 'owner_inactive', title: 'Owner is inactive or missing', group: 'workflow', severity: 'high', help: 'Claim is assigned to someone who can no longer work it.', test: ({ c, users }) => { if (!c.assigned_to || c.closed_at) return null; const u = users.get(c.assigned_to); return !u ? 'Assigned to an unknown user' : !u.active ? `Assigned to inactive user ${u.name}` : null; } },
  { id: 'unowned_old', title: 'Unassigned for too long', group: 'workflow', severity: 'med', help: 'Unowned claims age silently.', params: [{ key: 'days', label: 'Days unassigned', def: 14 }], test: ({ c, today, p }) => (!c.assigned_to && !c.closed_at && (dsince(c.created_at, today) ?? 0) > p.days ? `No owner for ${dsince(c.created_at, today)} days` : null) },
  { id: 'appeal_stale', title: 'Appeal with no activity', group: 'workflow', severity: 'med', help: 'Appeals have deadlines and need status checks.', params: [{ key: 'days', label: 'Quiet for (days)', def: 45 }], test: ({ c, today, p }) => (/appeal/i.test(c.end_action || '') && !c.closed_at && (dsince(c.last_touched_at, today) ?? 0) > p.days ? `Appeal quiet for ${dsince(c.last_touched_at, today)} days` : null) },
  { id: 'submitted_stale', title: 'Resubmitted claim not followed up', group: 'workflow', severity: 'med', help: 'Corrected claims should be checked after the payer’s processing window.', params: [{ key: 'days', label: 'Quiet for (days)', def: 35 }], test: ({ c, today, p }) => (/claim submitted/i.test(c.end_action || '') && !c.closed_at && (dsince(c.last_touched_at, today) ?? 0) > p.days ? `Submitted ${dsince(c.last_touched_at, today)} days ago, no follow-up` : null) },
  // ── coding / denial logic
  { id: 'carc_rca_mismatch', title: 'Root cause contradicts the denial code', group: 'coding', severity: 'med', help: 'The remit says one thing, the coded root cause another — one is wrong (hurts analytics and QA).', test: ({ c, carc }) => { if (!c.rca || !c.denial_codes) return null; const s = suggestFromCodes(c.denial_codes, carc); if (!s || s.confidence < 0.6) return null; const ok = [s.rca, 'Claim is in Process', 'No Response'].includes(c.rca) || (s.rca === 'Paid According to Contract'); return ok ? null : `Denial ${splitCodes(c.denial_codes).join(', ')} points to “${s.rca}” but coded “${c.rca}”`; } },
  { id: 'carc_unknown', title: 'Denial code not in the dictionary', group: 'coding', severity: 'low', help: 'Add it in Admin → Denial codes so it can drive suggestions and analytics.', test: ({ c, carc }) => { const u = splitCodes(c.denial_codes).filter((k) => !carc.has(k)); return u.length ? `Unrecognised code(s): ${u.join(', ')}` : null; } },
  { id: 'denied_no_codes', title: 'PMS says denied but no denial code', group: 'coding', severity: 'low', help: 'Without codes the root cause is guesswork.', test: ({ c }) => (/denied/i.test(c.pms_status || '') && !c.denial_codes ? 'Denied status without denial codes' : null) },
  { id: 'cpt_format', title: 'CPT/HCPCS format looks wrong', group: 'coding', severity: 'low', help: 'Five digits, or a letter plus four digits, optional modifier.', test: ({ c }) => { if (!c.cpt) return null; const bad = c.cpt.split(/[,;\s/|]+/).filter(Boolean).filter((t) => !/^([0-9]{5}|[A-Z][0-9]{4})(-[A-Z0-9]{2})?$/i.test(t)); return bad.length ? `Odd procedure code(s): ${bad.slice(0, 3).join(', ')}` : null; } },
  // ── identity / data
  { id: 'dup_charge', title: 'Same charge exists on another open claim', group: 'identity', severity: 'high', help: 'Same patient, DOS, CPT and amount under a different number — likely duplicate.', test: ({ dupCount }) => (dupCount > 1 ? `${dupCount} open claims share this exact charge` : null) },
  { id: 'payer_unknown', title: 'Payer missing', group: 'data', severity: 'med', help: 'Cannot apply payer rules, timely filing or contacts.', test: ({ c }) => (!c.payer || /^unknown$/i.test(c.payer) ? 'Payer is blank/Unknown' : null) },
  { id: 'no_dos', title: 'No date of service', group: 'data', severity: 'med', help: 'Claim cannot be aged.', test: ({ c }) => (!c.dos ? 'Missing DOS' : null) },
  { id: 'patient_blank', title: 'Patient name missing', group: 'data', severity: 'low', help: 'Hard to identify and to fingerprint for duplicates.', test: ({ c }) => (!c.patient_name ? 'Missing patient name' : null) },
];

export interface CheckSettings { [id: string]: { enabled?: boolean; severity?: Severity; params?: Record<string, number> } }
export interface Violation { claim_id: string; check_id: string; severity: Severity; message: string }
export const checkParams = (ck: Check, s: CheckSettings) => ({ ...Object.fromEntries((ck.params || []).map((p) => [p.key, p.def])), ...(s[ck.id]?.params || {}) });
export const isEnabled = (ck: Check, s: CheckSettings) => s[ck.id]?.enabled !== false;
export const sevOf = (ck: Check, s: CheckSettings) => s[ck.id]?.severity || ck.severity;

export function runChecks(items: Omit<CheckCtx, 'p' | 'dupCount' | 'touches'> & { touchesOf: (id: string) => WorkLog[]; dupCountOf: (c: Claim) => number }[] | any, settings: CheckSettings = {}, only?: string[]): Violation[] {
  const out: Violation[] = []; const active = CHECKS.filter((c) => isEnabled(c, settings) && (!only || only.includes(c.id)));
  for (const it of items as any[]) {
    for (const ck of active) {
      let msg: string | null = null;
      try { msg = ck.test({ ...it, p: checkParams(ck, settings), touches: it.touchesOf(it.c.id), dupCount: it.dupCountOf(it.c) }); } catch { msg = null; }
      if (msg) out.push({ claim_id: it.c.id, check_id: ck.id, severity: sevOf(ck, settings), message: msg });
    }
  }
  return out;
}
export const CHK = 'chk:';
/** Replace a claim's managed chk:* flags with the current violations. Returns the new flag list. */
export function syncFlags(flags: string[] | undefined, vs: Violation[]): string[] { return [...(flags || []).filter((f) => !f.startsWith(CHK)), ...new Set(vs.map((v) => CHK + v.check_id))]; }
export const groupLabel: Record<Group, string> = { accounting: 'Accounting', workflow: 'Workflow', coding: 'Coding & denials', identity: 'Identity', data: 'Data quality' };
