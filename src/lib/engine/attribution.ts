import type { Claim, Recovery, WorkLog } from '../types';
import type { Plan } from './reconcile';
import type { ImportSettings } from './settings';

const DAY = 864e5;
const ADJ = /^(adjustment|sent for adjustment)/i;

export interface RecoveryCtx { batchId: string; now: string; asOf: string | null; clientId: string; uid: () => string; /** payments already credited from an 835 since the previous import — the balance drop they explain must not be counted twice */ eraCredit?: Map<string, number> }

/** Classify what kind of balance reduction this was, from the claim's last worked state. Aging files alone cannot distinguish cash from write-off, so "unknown" is a legitimate (and honest) outcome. */
export function classify(c: Claim, touches: WorkLog[]): Recovery['type'] {
  const last = touches[0];
  if (c.resolution === 'paid') return 'payment'; if (c.resolution === 'adjusted') return 'adjustment'; if (c.resolution === 'patient') return 'patient';
  if (c.status === 'Adjusted' || (last?.end_action && ADJ.test(last.end_action))) return 'adjustment';
  if (c.status === 'Billed to Patient' || last?.end_action === 'Billed To Patient' || last?.rca === 'Patient Responsibility') return 'patient';
  return 'unknown';
}

/** Last-touch (default) or equal-split attribution of every balance reduction in an import plan. */
export function buildRecoveries(plan: Plan, workLog: WorkLog[], s: ImportSettings, ctx: RecoveryCtx): Recovery[] {
  const byClaim = new Map<string, WorkLog[]>();
  for (const w of workLog) byClaim.set(w.claim_id, [...(byClaim.get(w.claim_id) || []), w]);
  const events: { claim: Claim; amount: number }[] = [
    ...plan.changes.filter((c) => c.delta < -0.005).map((c) => ({ claim: c.claim, amount: -c.delta })),
    ...plan.closes.filter((c) => c.amount > 0.005).map((c) => ({ claim: c.claim, amount: c.amount })),
  ];
  const when = ctx.asOf ? new Date(ctx.asOf + 'T12:00:00Z').getTime() : new Date(ctx.now).getTime();
  const out: Recovery[] = []; const credit = new Map(ctx.eraCredit || []);
  for (const ev of events) {
    const c0 = credit.get(ev.claim.id) || 0; if (c0 > 0) { const used = Math.min(c0, ev.amount); ev.amount = round(ev.amount - used); credit.set(ev.claim.id, c0 - used); if (ev.amount < 0.005) continue; }
    const touches = (byClaim.get(ev.claim.id) || []).filter((w) => new Date(w.created_at).getTime() <= when).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const inWin = touches.filter((w) => when - new Date(w.created_at).getTime() <= s.attributionWindowDays * DAY && w.user_id);
    const type = classify(ev.claim, touches); const day = ctx.asOf || ctx.now.slice(0, 10);
    const base = { claim_id: ev.claim.id, client_id: ctx.clientId, batch_id: ctx.batchId, type, window_days: s.attributionWindowDays, occurred_on: day, created_at: ctx.now };
    if (!inWin.length) { out.push({ id: ctx.uid(), ...base, user_id: null, user_name: null, amount: round(ev.amount), basis: 'unattributed', share: 1, touch_id: null }); continue; }
    if (s.attributionMode === 'split_equal') {
      const users = [...new Map(inWin.map((w) => [w.user_id!, w])).values()];
      users.forEach((w, i) => { const share = 1 / users.length; const amt = i === users.length - 1 ? round(ev.amount - round(ev.amount * share) * (users.length - 1)) : round(ev.amount * share); out.push({ id: ctx.uid(), ...base, user_id: w.user_id, user_name: w.user_name, amount: amt, basis: 'split', share: round4(share), touch_id: w.id }); });
    } else { const w = inWin[0]; out.push({ id: ctx.uid(), ...base, user_id: w.user_id, user_name: w.user_name, amount: round(ev.amount), basis: 'last_touch', share: 1, touch_id: w.id }); }
  }
  return out;
}
const round = (n: number) => Math.round(n * 100) / 100; const round4 = (n: number) => Math.round(n * 10000) / 10000;
