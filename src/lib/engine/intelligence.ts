// Intelligence layer: explainable next-best-action per claim, cash forecast, team capacity planning and operational anomaly detection.
// Pure functions (no React / store) so every rule is unit-tested. Every recommendation carries its reasons — nothing is a black box.
import type { Appeal, Claim, ImportBatch, Profile, WorkLog } from '../types';
import type { EClaim } from './eclaim';
import type { Collectability } from '../analytics';
import { nearest, needsCorrected, isDenied, type Deadline } from './limits';
import type { Underpayment } from './underpay';
import { isOpen } from './appeal';
import { recMatches, renderWhy, type CustomRec, type RecAction } from './customrec';
import { valueOf, type Env } from './rules';

export type NbaKind = 'custom' | 'credit_balance' | 'promise_overdue' | 'resolve_missing' | 'appeal' | 'corrected_claim' | 'appeal_overdue' | 'writeoff_review' | 'dispute_underpay' | 'status_call' | 'patient_bill' | 'assign' | 'set_followup' | 'work_now' | 'monitor';
export const NBA_LABEL: Record<NbaKind, string> = { custom: 'Custom rule', credit_balance: 'Credit balance — verify & refund', promise_overdue: 'Promised payment overdue — call back', resolve_missing: 'Decide: missing from file', appeal: 'File appeal', corrected_claim: 'Send corrected claim', appeal_overdue: 'File overdue appeal', writeoff_review: 'Write-off review', dispute_underpay: 'Dispute underpayment', status_call: 'Call payer for status', patient_bill: 'Bill patient', assign: 'Assign an owner', set_followup: 'Set a follow-up date', work_now: 'Work this claim', monitor: 'Monitor — no action needed' };
export const NBA_COLOR: Record<NbaKind, string> = { custom: '#6366f1', credit_balance: '#a855f7', promise_overdue: '#ef4444', resolve_missing: '#ef4444', appeal: '#f97316', corrected_claim: '#f97316', appeal_overdue: '#ef4444', writeoff_review: '#a855f7', dispute_underpay: '#3b82f6', status_call: '#06b6d4', patient_bill: '#84cc16', assign: '#f59e0b', set_followup: '#f59e0b', work_now: '#6366f1', monitor: '#94a3b8' };
// ───────── manager-editable settings (Admin → Intelligence rules) ─────────
export interface IntelCfg {
  nba: { disabled: NbaKind[]; /** ± points added to a rule's urgency */ boost: Partial<Record<NbaKind, number>>; staleDays: number; defaultPayDays: number; statusCallMult: number; statusCallPadDays: number; patientBillTolPct: number };
  forecast: { horizonWeeks: number; deniedWaitDays: number; minWaitDays: number };
  capacity: { workdays: number; overPct: number; slackPct: number; fillPct: number };
  signals: { balanceJumpPct: number; balanceHighPct: number; unownedPct: number; followupPct: number; duplicatePct: number; oldAgePct: number; idleDays: number; idleMinOwned: number };
  sweep: { staleDays: number; ownerGraceDays: number; missingDays: number; resolvedLookbackDays: number };
  tools: { hourlyCost: number; appealWinPct: number; minUnderDollars: number; minUnderPct: number };
  /** thresholds for the claim signals on the Worklist, claim drawer and My Day */ claimSignals: { repeatMin: number; repeatSharePct: number; repeatRecentDays: number; repeatRecentPct: number; paySlowMult: number; crossingFromDay: number; lowValueBalance: number; lowValueTouches: number; untouchedBalance: number; untouchedDays: number; silentAppealDays: number };
}
export const DEFAULT_INTEL_CFG: IntelCfg = {
  nba: { disabled: [], boost: {}, staleDays: 14, defaultPayDays: 45, statusCallMult: 1.5, statusCallPadDays: 10, patientBillTolPct: 5 },
  forecast: { horizonWeeks: 12, deniedWaitDays: 59, minWaitDays: 5 }, capacity: { workdays: 5, overPct: 115, slackPct: 70, fillPct: 90 },
  signals: { balanceJumpPct: 15, balanceHighPct: 30, unownedPct: 25, followupPct: 20, duplicatePct: 2, oldAgePct: 50, idleDays: 3, idleMinOwned: 20 },
  sweep: { staleDays: 14, ownerGraceDays: 3, missingDays: 7, resolvedLookbackDays: 90 }, tools: { hourlyCost: 40, appealWinPct: 40, minUnderDollars: 10, minUnderPct: 5 },
  claimSignals: { repeatMin: 12, repeatSharePct: 20, repeatRecentDays: 45, repeatRecentPct: 35, paySlowMult: 1.5, crossingFromDay: 82, lowValueBalance: 50, lowValueTouches: 3, untouchedBalance: 1000, untouchedDays: 14, silentAppealDays: 30 },
};
export function resolveIntelCfg(raw?: any): IntelCfg { const d = DEFAULT_INTEL_CFG; const r = raw || {}; const m = <K extends keyof IntelCfg>(k: K): IntelCfg[K] => ({ ...d[k], ...(r[k] || {}) }) as IntelCfg[K]; return { nba: { ...m('nba'), disabled: r.nba?.disabled ?? [], boost: { ...(r.nba?.boost || {}) } }, forecast: m('forecast'), capacity: m('capacity'), signals: m('signals'), sweep: m('sweep'), tools: m('tools'), claimSignals: m('claimSignals') }; }
export function validateIntelCfg(c: IntelCfg): string[] {
  const e: string[] = []; const rng = (v: number, lo: number, hi: number, n: string) => { if (!(Number.isFinite(v) && v >= lo && v <= hi)) e.push(`${n} must be between ${lo} and ${hi}`); };
  rng(c.nba.staleDays, 1, 365, 'Stale after (days)'); rng(c.nba.defaultPayDays, 1, 365, 'Default pay time'); rng(c.nba.statusCallMult, 1, 5, 'Status-call multiplier'); rng(c.nba.statusCallPadDays, 0, 120, 'Status-call padding'); rng(c.nba.patientBillTolPct, 0, 50, 'Patient-balance tolerance');
  for (const [k, v] of Object.entries(c.nba.boost)) rng(Number(v), -40, 40, `Urgency boost for ${k}`);
  rng(c.forecast.horizonWeeks, 4, 52, 'Forecast horizon'); rng(c.forecast.deniedWaitDays, 7, 365, 'Denied-claim wait'); rng(c.forecast.minWaitDays, 0, 60, 'Minimum wait');
  rng(c.capacity.workdays, 1, 7, 'Working days'); rng(c.capacity.overPct, 100, 300, 'Overloaded above %'); rng(c.capacity.slackPct, 10, 100, 'Has room below %'); rng(c.capacity.fillPct, 50, 100, 'Fill target %'); if (c.capacity.slackPct >= c.capacity.overPct) e.push('“Has room” must be below “Overloaded”');
  for (const [k, v] of Object.entries(c.signals)) rng(Number(v), 0, k.endsWith('Days') ? 30 : k === 'idleMinOwned' ? 1000 : 100, k);
  rng(c.sweep.staleDays, 1, 365, 'Sweep: stale days'); rng(c.sweep.ownerGraceDays, 0, 60, 'Sweep: owner grace'); rng(c.sweep.missingDays, 0, 90, 'Sweep: missing days'); rng(c.sweep.resolvedLookbackDays, 7, 730, 'Sweep: lookback');
  { const s = c.claimSignals; rng(s.repeatMin, 3, 1000, 'Repeat pattern: minimum claims'); rng(s.repeatSharePct, 1, 100, 'Repeat pattern: share of the payer’s denials %'); rng(s.repeatRecentDays, 7, 365, 'Repeat pattern: recent window (days)'); rng(s.repeatRecentPct, 0, 100, 'Repeat pattern: share that is recent %'); rng(s.paySlowMult, 1, 5, 'Slow payer multiplier'); rng(s.crossingFromDay, 30, 400, 'Crossing 90d: from day'); rng(s.lowValueBalance, 1, 5000, 'Low value: balance $'); rng(s.lowValueTouches, 1, 50, 'Low value: touches'); rng(s.untouchedBalance, 100, 1000000, 'High-dollar untouched: balance $'); rng(s.untouchedDays, 1, 365, 'High-dollar untouched: days'); rng(s.silentAppealDays, 7, 180, 'Silent appeal: days'); }
  rng(c.tools.hourlyCost, 0, 1000, 'Hourly cost'); rng(c.tools.appealWinPct, 0, 100, 'Default win chance'); rng(c.tools.minUnderDollars, 0, 10000, 'Underpayment minimum $'); rng(c.tools.minUnderPct, 0, 100, 'Underpayment minimum %'); return e;
}

export interface Nba { kind: NbaKind; label: string; why: string[]; /** 0–100, how soon it matters */ urgency: number; /** dollars this action can realistically move */ impact: number; confidence: 'high' | 'med' | 'low'; also: string[]; /** set for manager-defined rules */ color?: string; custom?: { id: string; action: RecAction } }
export interface NbaCtx { today: string; deadlines: (x: EClaim) => Deadline[]; limitsCfg: Parameters<typeof needsCorrected>[1]; env?: Env; custom?: CustomRec[]; underpay: Map<string, Underpayment>; appeals: Map<string, Appeal[]>; payerDays: (payer: string | null) => number | null; collect?: (x: EClaim) => Collectability | undefined; staleDays?: number; cfg?: IntelCfg; /** learned appeal odds by payer × denial code */ odds?: (payer: string | null, code: string | null) => { n: number; winRate: number; avgRecovered: number; level: string } | null }
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);
const us = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/** Highest-value next step for one claim, with the evidence behind it. Rules run in priority order; the first match is the recommendation, the rest are listed as alternatives. */
export function nextBestAction(x: EClaim, ctx: NbaCtx): Nba {
  const c = x.c; const hits: (Omit<Nba, 'label' | 'also'> & { label?: string })[] = []; const bal = Math.max(0, c.balance); const real = c.expected_amt && c.expected_amt > 0 ? Math.min(bal, c.expected_amt) : bal; const p = ctx.collect?.(x)?.p ?? 0.5;
  const ic = ctx.cfg || DEFAULT_INTEL_CFG; const dl = nearest(ctx.deadlines(x)); const myAppeals = ctx.appeals.get(c.id) || []; const openAppeal = myAppeals.find(isOpen); const denied = isDenied(c); const f = c.flags || [];
  const add = (kind: NbaKind, why: string[], urgency: number, impact: number, confidence: Nba['confidence']) => { if (ic.nba.disabled.includes(kind)) return; hits.push({ kind, why, urgency: Math.max(0, Math.min(100, Math.round(urgency + (ic.nba.boost[kind] || 0)))), impact: Math.round(impact), confidence } as any); };
  const promise = c.custom?.promise_date as string | undefined;
  if (c.closed_at) return { kind: 'monitor', label: NBA_LABEL.monitor, why: ['Claim is closed'], urgency: 0, impact: 0, confidence: 'high', also: [] };
  if (c.balance < 0) add('credit_balance', [`Negative balance of ${money(-c.balance)}`, 'Confirm the overpayment, then refund or transfer — payers and states set refund deadlines'], 72, -c.balance, 'high');
  if (promise && promise < ctx.today) add('promise_overdue', [`Payer promised payment by ${us(promise)}`, `${dayDiff(promise, ctx.today)} days past with no payment posted`], 82, real * p, 'high');
  if (f.includes('missing_review')) add('resolve_missing', [`Dropped off the aging file${c.missing_since ? ` on ${us(c.missing_since)}` : ''}`, 'A supervisor must mark it paid, written off or restore it'], 85, real, 'high');
  if (openAppeal?.due_on && openAppeal.due_on < ctx.today) add('appeal_overdue', [`Appeal due ${us(openAppeal.due_on)} is ${dayDiff(openAppeal.due_on, ctx.today)} days past`, 'Status is still ' + openAppeal.status], 95, real * p, 'high');
  if (dl && dl.left < 0 && denied && dl.kind !== 'ccfl') add('writeoff_review', [`${dl.kind.toUpperCase()} expired ${-dl.left} days ago`, 'Appeal only with proof of timely filing, otherwise write off'], 80, real * 0.15, 'med');
  if (dl && dl.kind === 'ccfl' && dl.left >= 0 && needsCorrected(c, ctx.limitsCfg)) add('corrected_claim', [`Denial is correctable (${c.denial_codes || c.pms_status})`, `Corrected-claim window closes in ${dl.left} days`], 90 - Math.min(40, dl.left / 2), real * p, 'high');
  else if (needsCorrected(c, ctx.limitsCfg) && !openAppeal) add('corrected_claim', [`Denial looks correctable (${c.denial_codes || c.rca || c.pms_status})`, 'A corrected claim is faster than an appeal'], 70, real * p, 'med');
  if (denied && !openAppeal && !needsCorrected(c, ctx.limitsCfg) && !myAppeals.some((a) => a.kind === 'appeal' && ['won', 'lost', 'partial'].includes(a.status) && a.level >= 3)) { const left = dl?.kind === 'afl' ? dl.left : null; if (left == null || left >= 0) add('appeal', [`Denied${c.denial_codes ? ` (${c.denial_codes})` : ''} and no appeal started`, left != null ? `${left} days left in the appeal window` : 'No appeal limit set for this payer — add it in Filing limits', ...(() => { const o = ctx.odds?.(c.payer, (c.denial_codes || '').split(/[,;\s]+/)[0]?.toUpperCase().replace(/^([A-Z]{2})(\d)/, '$1-$2') || null); return o ? [`Your history: ${Math.round(o.winRate * 100)}% of ${o.n} similar appeals won${o.avgRecovered ? ` (avg ${money(o.avgRecovered)})` : ''}`] : []; })()], 88 - (left != null ? Math.min(45, left / 2) : 30), real * p, left != null ? 'high' : 'med'); }
  const up = ctx.underpay.get(c.id); if (up) add('dispute_underpay', [`Paid ${money(up.received)} against ${money(up.expected)} expected`, `${money(up.variance)} short (${up.pct}%) — ${up.confidence === 'high' ? 'contract rate' : 'estimate'}`], 60 + Math.min(25, up.variance / 40), up.variance, up.confidence);
  if (c.patient_resp && c.patient_resp > 0 && bal > 0 && Math.abs(bal - c.patient_resp) <= Math.max(1, bal * (ic.nba.patientBillTolPct / 100))) add('patient_bill', [`Remaining balance ${money(bal)} equals patient responsibility`, 'Insurance has finished — move to patient billing'], 50, bal * 0.6, 'high');
  const pd = ctx.payerDays(c.payer); const since = c.last_billed || c.dos; const billedAgo = since ? dayDiff(since, ctx.today) : null;
  if (!denied && billedAgo != null && !openAppeal) { const normal = pd ?? ic.nba.defaultPayDays; if (billedAgo > normal * ic.nba.statusCallMult + ic.nba.statusCallPadDays) add('status_call', [`Billed ${billedAgo} days ago; ${c.payer || 'payer'} usually pays in ~${normal}`, 'No denial on file — verify it was received and is processing'], 55 + Math.min(25, (billedAgo - normal) / 4), real * p, pd != null ? 'high' : 'low'); }
  if (!c.assigned_to) add('assign', ['Nobody owns this claim'], 45 + (bal > 2000 ? 15 : 0), real * p * 0.3, 'high');
  if (!c.next_fu) add('set_followup', ['No follow-up date is scheduled'], 40, real * p * 0.2, 'high');
  if (x.stale || x.fuDue) add('work_now', [x.fuDue ? 'Follow-up is due' : `No touch in ${ctx.staleDays ?? ic.nba.staleDays}+ days`], x.fuDue ? 65 : 35, real * p * 0.4, 'med');
  if (ctx.env && ctx.custom?.length) { const env = { ...ctx.env, collect: () => p }; for (const r of ctx.custom) if (recMatches(r, c, env)) hits.push({ kind: 'custom', label: r.label, color: r.color, custom: { id: r.id, action: r.action }, why: [renderWhy(r.why || r.name, c, env, valueOf)], urgency: Math.max(0, Math.min(100, Math.round(r.urgency))), impact: Math.round(real * p * 0.5), confidence: 'med' }); }
  if (!hits.length) return { kind: 'monitor', label: NBA_LABEL.monitor, why: ['Owned, scheduled and inside every deadline'], urgency: 5, impact: 0, confidence: 'high', also: [] };
  hits.sort((a, b) => b.urgency - a.urgency || b.impact - a.impact); const top = hits[0];
  return { ...top, label: top.label ?? NBA_LABEL[top.kind], also: hits.slice(1, 3).map((h) => h.label ?? NBA_LABEL[h.kind]) };
}

// ───────── cash forecast ─────────
export interface CashWeek { week: string; expected: number; claims: number }
export interface CashForecast { weeks: CashWeek[]; total: number; byPayer: { payer: string; expected: number; claims: number }[]; assumptions: string[] }
/** When money is likely to arrive: each open claim's expected recovery lands in the week implied by the payer's normal pay time (denied claims: after the appeal/rework path). */
export function cashForecast(ecs: EClaim[], collect: (x: EClaim) => Collectability | undefined, payerDays: (p: string | null) => number | null, today: string, nWeeks = 12, fc = DEFAULT_INTEL_CFG.forecast, defaultPay = DEFAULT_INTEL_CFG.nba.defaultPayDays): CashForecast {
  const weeks: CashWeek[] = Array.from({ length: nWeeks }, (_, i) => ({ week: new Date(Date.parse(today + 'T12:00:00Z') + i * 7 * 864e5).toISOString().slice(0, 10), expected: 0, claims: 0 })); const by = new Map<string, { payer: string; expected: number; claims: number }>(); let total = 0;
  for (const x of ecs) {
    if (!x.open) continue; const col = collect(x); let exp = col?.expected ?? 0; if (x.c.expected_amt && x.c.expected_amt > 0 && col) exp = Math.min(exp, x.c.expected_amt * col.p); if (!(exp > 0)) continue;
    const since = x.c.last_billed || x.c.dos; const billedAgo = since ? dayDiff(since, today) : 0; const normal = payerDays(x.c.payer) ?? defaultPay; const denied = isDenied(x.c);
    const wait = denied ? Math.max(21, fc.deniedWaitDays - (x.c.denial_date ? 14 : 0)) : Math.max(fc.minWaitDays, normal - billedAgo); const idx = Math.min(nWeeks - 1, Math.max(0, Math.floor(wait / 7)));
    weeks[idx].expected += exp; weeks[idx].claims++; total += exp; const k = x.c.payer || 'Unknown'; const e = by.get(k) || { payer: k, expected: 0, claims: 0 }; e.expected += exp; e.claims++; by.set(k, e);
  }
  weeks.forEach((w) => (w.expected = Math.round(w.expected)));
  return { weeks, total: Math.round(total), byPayer: [...by.values()].map((p) => ({ ...p, expected: Math.round(p.expected) })).sort((a, b) => b.expected - a.expected).slice(0, 10), assumptions: ['Amount = probability-weighted expected recovery (age, root cause, payer history)', 'Timing = payer’s median days-to-pay (default 45) minus days already elapsed; denied claims wait 3–6 weeks for rework', 'Claims past the horizon are not shown'] };
}

// ───────── team capacity ─────────
export interface CapacityRow { userId: string; name: string; capacity: number; demand: number; ratio: number; status: 'over' | 'balanced' | 'slack' }
export interface Transfer { fromId: string; toId: string; from: string; to: string; n: number }
/** Weekly demand = owned open claims that need a touch this week (follow-up due, deadline ≤ 14 days, never touched or stale). Capacity = daily target × 5. */
export function capacityPlan(ecs: EClaim[], staff: Pick<Profile, 'id' | 'full_name' | 'daily_target'>[], needsTouch: (x: EClaim) => boolean, cc = DEFAULT_INTEL_CFG.capacity): { rows: CapacityRow[]; transfers: Transfer[]; unowned: number } {
  const demand = new Map<string, number>(); let unowned = 0;
  for (const x of ecs) { if (!x.open || !needsTouch(x)) continue; if (!x.c.assigned_to) { unowned++; continue; } demand.set(x.c.assigned_to, (demand.get(x.c.assigned_to) || 0) + 1); }
  const rows: CapacityRow[] = staff.map((s) => { const capacity = Math.max(1, (s.daily_target || 0) * cc.workdays); const d = demand.get(s.id) || 0; const ratio = Math.round((d / capacity) * 100) / 100; return { userId: s.id, name: s.full_name, capacity, demand: d, ratio, status: (ratio > cc.overPct / 100 ? 'over' : ratio < cc.slackPct / 100 ? 'slack' : 'balanced') as CapacityRow['status'] }; }).sort((a, b) => b.ratio - a.ratio);
  const over = rows.filter((r) => r.status === 'over').map((r) => ({ ...r, give: Math.ceil(r.demand - r.capacity) })); const slack = rows.filter((r) => r.status === 'slack').map((r) => ({ ...r, room: Math.floor(r.capacity * (cc.fillPct / 100) - r.demand) })); const transfers: Transfer[] = [];
  for (const o of over) for (const s of slack) { if (o.give <= 0) break; const n = Math.min(o.give, s.room); if (n > 0) { transfers.push({ fromId: o.userId, toId: s.userId, from: o.name, to: s.name, n }); o.give -= n; s.room -= n; } }
  return { rows, transfers, unowned };
}

// ───────── anomalies ─────────
export interface Anomaly { id: string; severity: 'high' | 'med' | 'low'; title: string; detail: string; link?: string }
export function detectAnomalies(o: { ecs: EClaim[]; batches: ImportBatch[]; workLog: WorkLog[]; staff: Pick<Profile, 'id' | 'full_name' | 'daily_target' | 'active'>[]; today: string; cfg?: IntelCfg['signals'] }): Anomaly[] {
  const sg = o.cfg || DEFAULT_INTEL_CFG.signals;
  const out: Anomaly[] = []; const open = o.ecs.filter((x) => x.open); const n = open.length; if (!n) return out;
  const bs = [...o.batches].filter((b) => b.total_balance != null && (b as any).status !== 'rolled_back').sort((a, b) => a.created_at.localeCompare(b.created_at));
  const byClient = new Map<string, ImportBatch[]>(); for (const b of bs) { const k = b.client_id || '-'; byClient.set(k, [...(byClient.get(k) || []), b]); }
  for (const [, l] of byClient) { if (l.length < 2) continue; const a = l[l.length - 2].total_balance, z = l[l.length - 1].total_balance; if (a > 0 && Math.abs(z - a) / a > sg.balanceJumpPct / 100) out.push({ id: 'jump:' + l[l.length - 1].id, severity: Math.abs(z - a) / a > sg.balanceHighPct / 100 ? 'high' : 'med', title: `Open A/R ${z > a ? 'jumped' : 'dropped'} ${Math.round((Math.abs(z - a) / a) * 100)}% since the last import`, detail: `${money(a)} → ${money(z)} (${l[l.length - 1].file_name || 'latest file'}). Check the file is complete and the right client.`, link: '/imports' }); }
  const unas = open.filter((x) => !x.c.assigned_to).length; if (unas / n > sg.unownedPct / 100) out.push({ id: 'unassigned', severity: unas / n > Math.max(0.5, sg.unownedPct * 2 / 100) ? 'high' : 'med', title: `${Math.round((unas / n) * 100)}% of open claims have no owner`, detail: `${unas} claims — allocate before they age.`, link: '/allocation' });
  const fu = open.filter((x) => x.fuDue).length; if (fu / n > sg.followupPct / 100) out.push({ id: 'fu', severity: 'med', title: `${fu} follow-ups are overdue (${Math.round((fu / n) * 100)}% of open)`, detail: 'Backlog is building — review capacity.', link: '/worklist?view=fu' });
  const dup = open.filter((x) => (x.c.flags || []).includes('possible_duplicate')).length; if (dup / n > sg.duplicatePct / 100) out.push({ id: 'dup', severity: 'med', title: `${dup} possible duplicate claims`, detail: 'More than 2% of open claims look duplicated — check the last import.', link: '/exceptions' });
  const old = open.filter((x) => (x.age ?? 0) > 120).length; if (old / n > sg.oldAgePct / 100) out.push({ id: 'old', severity: 'low', title: `${Math.round((old / n) * 100)}% of open claims are older than 120 days`, detail: 'Collectability falls sharply after 120 days — prioritise the oldest high-value accounts.', link: '/aging' });
  const days = Array.from({ length: sg.idleDays }, (_, i) => i + 1).map((i) => new Date(Date.parse(o.today + 'T12:00:00Z') - i * 864e5)).filter((d) => d.getUTCDay() % 6 !== 0).map((d) => d.toISOString().slice(0, 10));
  for (const s of o.staff) { if (!s.active || !(s.daily_target > 0) || days.length < 2) continue; const t = o.workLog.filter((w) => w.user_id === s.id && days.includes(w.work_date)).length; const owned = open.filter((x) => x.c.assigned_to === s.id).length; if (t === 0 && owned > sg.idleMinOwned) out.push({ id: 'idle:' + s.id, severity: 'low', title: `${s.full_name} logged no touches in the last ${days.length} working days`, detail: `${owned} claims are assigned. Check for leave or a logging gap.`, link: '/productivity' }); }
  const rank = { high: 0, med: 1, low: 2 }; return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
