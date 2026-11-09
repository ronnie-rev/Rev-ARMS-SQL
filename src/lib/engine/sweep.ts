// "Never forget a claim": every way an unresolved claim can slip through the cracks, in one pure sweep. Unit-tested.
import type { Appeal, Claim } from '../types';
import { isOpen } from './appeal';

export type SweepKind = 'no_owner' | 'no_followup' | 'stale' | 'missing_pending' | 'deadline_expired' | 'unconfirmed_close' | 'appeal_overdue' | 'snooze_ended' | 'credit_balance' | 'promise_overdue';
export const SWEEP_LABEL: Record<SweepKind, { title: string; help: string; severity: 'high' | 'med' | 'low' }> = {
  deadline_expired: { title: 'Filing deadline passed, still open', help: 'TFL/AFL/CCFL expired — decide appeal with proof or write off.', severity: 'high' },
  appeal_overdue: { title: 'Appeal past its due date', help: 'An appeal is still draft/sent/pending beyond its deadline.', severity: 'high' },
  missing_pending: { title: 'Missing from file, undecided', help: 'Dropped off the aging file and nobody has marked it paid, written off or restored.', severity: 'high' },
  unconfirmed_close: { title: 'Closed without a confirmed outcome', help: 'Closed claims whose resolution is still "unconfirmed".', severity: 'med' },
  no_owner: { title: 'Nobody owns it', help: 'Open claims with no assignee.', severity: 'med' },
  no_followup: { title: 'No next follow-up date', help: 'Open claims with no scheduled next touch.', severity: 'med' },
  stale: { title: 'Untouched for too long', help: 'No touch within the staleness window.', severity: 'low' },
  credit_balance: { title: 'Credit balance — refund or transfer', help: 'Open claims with a negative balance (overpayment) that must be refunded or moved.', severity: 'high' },
  promise_overdue: { title: 'Payer-promised payment is overdue', help: 'A payer rep promised payment by a date that has passed.', severity: 'med' },
  snooze_ended: { title: 'Snooze ended, not picked up', help: 'The hold date has passed and the claim is still waiting.', severity: 'low' },
};
export interface SweepCfg { staleDays: number; ownerGraceDays: number; missingDays: number; resolvedLookbackDays: number }
export const DEFAULT_SWEEP_CFG: SweepCfg = { staleDays: 14, ownerGraceDays: 3, missingDays: 7, resolvedLookbackDays: 90 };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);

export function unresolvedSweep(claims: Claim[], appeals: Appeal[], today: string, cfg: SweepCfg = DEFAULT_SWEEP_CFG): Record<SweepKind, Claim[]> {
  const out = Object.fromEntries(Object.keys(SWEEP_LABEL).map((k) => [k, [] as Claim[]])) as Record<SweepKind, Claim[]>;
  const overdue = new Set(appeals.filter((a) => isOpen(a) && a.due_on && a.due_on < today).map((a) => a.claim_id));
  for (const c of claims) {
    if (c.closed_at) { if (!c.resolution || c.resolution === 'unknown') { if (daysBetween(c.closed_at, today) <= cfg.resolvedLookbackDays) out.unconfirmed_close.push(c); } continue; }
    const f = c.flags || []; const snooze = c.custom?.snooze_until as string | undefined; const snoozed = !!snooze && snooze > today;
    if (f.includes('missing_review')) { if (c.missing_since && daysBetween(c.missing_since, today) >= cfg.missingDays) out.missing_pending.push(c); continue; }
    if (f.includes('deadline_expired')) out.deadline_expired.push(c);
    if (overdue.has(c.id)) out.appeal_overdue.push(c);
    if (c.balance < 0) out.credit_balance.push(c);
    const pr = c.custom?.promise_date as string | undefined; if (pr && pr < today) out.promise_overdue.push(c);
    if (snoozed) continue;
    if (snooze && snooze <= today) out.snooze_ended.push(c);
    if (!c.assigned_to && daysBetween(c.created_at, today) >= cfg.ownerGraceDays) out.no_owner.push(c);
    if (!c.next_fu) out.no_followup.push(c);
    if (c.last_touched_at ? daysBetween(c.last_touched_at, today) > cfg.staleDays : daysBetween(c.created_at, today) > cfg.staleDays) out.stale.push(c);
  }
  return out;
}
