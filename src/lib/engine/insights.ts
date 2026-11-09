// "Claim brain": one pass over the open claims that turns every signal we have (deadlines, promises, appeals, payer behaviour, duplicates, underpayments, client SOPs, effort vs value)
// into short, ranked insight chips. Used by the Worklist, the claim drawer and My Day so every screen says the same thing.
import type { Appeal, Claim } from '../types';
import type { EClaim } from './eclaim';
import { splitDenials } from '../kb';
import { sopsFor, type ClientSop } from './sops';

export type InsightId = 'promise_broken' | 'tf_critical' | 'tf_soon' | 'crossing_90' | 'lost_appeal' | 'appeal_silent' | 'payer_slow' | 'pay_soon' | 'duplicate' | 'underpaid' | 'low_value' | 'sop_must' | 'untouched_high' | 'credit' | 'repeat_payer_code';
export interface Insight { id: InsightId; label: string; detail: string; tone: 'bad' | 'warn' | 'good' | 'info'; weight: number }
export const INSIGHT_LABEL: Record<InsightId, string> = { promise_broken: 'Broken promise', tf_critical: 'Filing ≤ 14d', tf_soon: 'Filing ≤ 30d', crossing_90: 'Crossing 90d', lost_appeal: 'Lost appeal', appeal_silent: 'Appeal unanswered', payer_slow: 'Older than payer norm', pay_soon: 'Due to pay soon', duplicate: 'Possible duplicate', underpaid: 'Underpaid', low_value: 'Low value / high effort', sop_must: 'Client rule applies', untouched_high: 'High $ untouched', credit: 'Credit balance', repeat_payer_code: 'Repeat denial pattern' };
export const TONE_COLOR = { bad: '#dc2626', warn: '#d97706', good: '#16a34a', info: '#6366f1' } as const;
const dd = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export interface SignalCfg { repeatMin: number; repeatSharePct: number; repeatRecentDays: number; repeatRecentPct: number; paySlowMult: number; crossingFromDay: number; lowValueBalance: number; lowValueTouches: number; untouchedBalance: number; untouchedDays: number; silentAppealDays: number }
export const DEFAULT_SIGNAL_CFG: SignalCfg = { repeatMin: 12, repeatSharePct: 20, repeatRecentDays: 45, repeatRecentPct: 35, paySlowMult: 1.5, crossingFromDay: 82, lowValueBalance: 50, lowValueTouches: 3, untouchedBalance: 1000, untouchedDays: 14, silentAppealDays: 30 };
/** Codes that describe how a payer normally adjusts, not a fixable problem (contractual write-off, patient cost share). */
const BENIGN = /^(CO-?45|CO-?253|PR-?\d+|OA-?23)$/i;
export interface InsightIn { cfg?: Partial<SignalCfg>; ecs: EClaim[]; appeals: Appeal[]; today: string; payerDays: (payer: string | null) => number | null; collect?: (x: EClaim) => { p: number } | undefined; dupIds?: Set<string>; underpay?: Map<string, { variance: number }>; sops?: ClientSop[]; allClaims?: Claim[] }
export function buildInsightIndex(i: InsightIn): Map<string, Insight[]> {
  const cfg: SignalCfg = { ...DEFAULT_SIGNAL_CFG, ...(i.cfg || {}) }; const out = new Map<string, Insight[]>(); const byClaim = new Map<string, Appeal[]>(); for (const a of i.appeals) byClaim.set(a.claim_id, [...(byClaim.get(a.claim_id) || []), a]);
  // payer × code pattern: only a LIVE, SIGNIFICANT, FIXABLE pattern — enough claims, a real share of that payer's denials, mostly recent, and not a routine adjustment code
  const pool = (i.allClaims || i.ecs.map((x) => x.c)).filter((c) => !c.closed_at); const payerDen = new Map<string, number>(); const pc = new Map<string, { n: number; recent: number }>();
  for (const c of pool) { const code = splitDenials(c.denial_codes)[0]; if (!code) continue; const pk = c.payer || ''; payerDen.set(pk, (payerDen.get(pk) || 0) + 1); const k = pk + '|' + code; const e = pc.get(k) || { n: 0, recent: 0 }; e.n++; const d = (c.denial_date as string | null | undefined) || (c.last_touched_at || c.created_at || '').slice(0, 10); if (d && dd(d, i.today) <= cfg.repeatRecentDays) e.recent++; pc.set(k, e); }
  for (const x of i.ecs) {
    if (!x.open) continue; const c = x.c; const list: Insight[] = []; const add = (id: InsightId, detail: string, tone: Insight['tone'], weight: number) => list.push({ id, label: INSIGHT_LABEL[id], detail, tone, weight });
    const age = x.age ?? 0; const pdays = i.payerDays(c.payer); const apps = byClaim.get(c.id) || []; const denied = splitDenials(c.denial_codes).length > 0;
    const promise = c.custom?.promise_date as string | undefined; if (promise && promise < i.today) add('promise_broken', `Payer promised payment by ${promise} (${dd(promise, i.today)} days ago) and nothing posted — call back.`, 'bad', 95);
    if (x.tfLeft != null && x.tfLeft >= 0 && x.tfLeft <= 14) add('tf_critical', `${x.tfLeft} days left to file/appeal — act today.`, 'bad', 92); else if (x.tfLeft != null && x.tfLeft >= 0 && x.tfLeft <= 30) add('tf_soon', `${x.tfLeft} days left in the filing window.`, 'warn', 70);
    if (age >= cfg.crossingFromDay && age < 90) add('crossing_90', `Crosses 90 days in ${90 - age} days — the A/R bucket your client reports on.`, 'warn', 60);
    const lost = apps.filter((a) => a.status === 'lost'); if (lost.length) add('lost_appeal', `Lost at level ${Math.max(...lost.map((a) => a.level))} — escalate only with new evidence.`, 'warn', 80);
    const silent = apps.find((a) => (a.status === 'sent' || a.status === 'pending') && a.filed_on && dd(a.filed_on, i.today) >= cfg.silentAppealDays); if (silent) add('appeal_silent', `Appeal sent ${dd(silent.filed_on!, i.today)} days ago with no decision — chase the payer.`, 'warn', 85);
    if (pdays != null && !denied && age > pdays * cfg.paySlowMult && age > 45) add('payer_slow', `${age} days old; ${c.payer} usually pays in ~${pdays}. Ask for status, escalate to a provider rep.`, 'warn', 65);
    const p = i.collect?.(x)?.p; if (pdays != null && !denied && age >= pdays * 0.8 && age <= pdays * 1.2 && (p ?? 0) >= 0.55) add('pay_soon', `Within the usual ${pdays}-day window for ${c.payer} — check status before escalating.`, 'good', 40);
    if (i.dupIds?.has(c.id)) add('duplicate', 'Another open claim has the same account/encounter, date, CPT and charge — verify before working both.', 'warn', 75);
    const u = i.underpay?.get(c.id); if (u && u.variance > 1) add('underpaid', `Paid ${money(u.variance)} below the expected amount — dispute with the contract rate.`, 'warn', 78);
    if (c.balance < 0) add('credit', `Credit balance ${money(c.balance)} — verify and refund or apply.`, 'info', 66);
    if (c.balance > 0 && c.balance < cfg.lowValueBalance && c.touch_count >= cfg.lowValueTouches) add('low_value', `${money(c.balance)} after ${c.touch_count} touches — consider small-balance write-off review.`, 'info', 30);
    if (c.balance >= cfg.untouchedBalance && c.touch_count === 0 && age > cfg.untouchedDays) add('untouched_high', `${money(c.balance)} never worked and ${age} days old.`, 'bad', 88);
    const code = splitDenials(c.denial_codes)[0]; if (code && !BENIGN.test(code)) { const e = pc.get((c.payer || '') + '|' + code); const share = e ? (e.n / Math.max(1, payerDen.get(c.payer || '') || 1)) * 100 : 0; if (e && e.n >= cfg.repeatMin && share >= cfg.repeatSharePct && (e.recent / e.n) * 100 >= cfg.repeatRecentPct) add('repeat_payer_code', `${e.n} open ${c.payer} claims carry ${code} (${Math.round(share)}% of that payer’s denials, ${Math.round((e.recent / e.n) * 100)}% in the last ${cfg.repeatRecentDays} days) — a live pattern worth fixing at the source.`, 'info', 35); }
    const must = i.sops ? sopsFor(i.sops, c).find((s) => s.level === 'must') : null; if (must) add('sop_must', must.instruction, 'bad', 90);
    if (list.length) out.set(c.id, list.sort((a, b) => b.weight - a.weight));
  }
  return out;
}
