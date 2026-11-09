// Payer scorecards: denial rate, days to pay, appeal win rate and payment % per payer (and per payer × CPT), plus alerts when behaviour changes.
import type { Appeal, Claim } from '../types';

export interface ScoreCfg { windowDays: number; baselineDays: number; minN: number; thresholds: { denialPts: number; payDaysPct: number; appealWinPts: number; payPctPts: number; newCarcShare: number }; topCpts: number }
export const DEFAULT_SCORE_CFG: ScoreCfg = { windowDays: 60, baselineDays: 180, minN: 20, thresholds: { denialPts: 5, payDaysPct: 20, appealWinPts: 15, payPctPts: 8, newCarcShare: 12 }, topCpts: 8 };
export const resolveScoreCfg = (raw?: Partial<ScoreCfg> | null): ScoreCfg => { const r = (raw || {}) as Partial<ScoreCfg>; const d = DEFAULT_SCORE_CFG; return { ...d, ...r, thresholds: { ...d.thresholds, ...(r.thresholds || {}) } }; };
export const validateScoreCfg = (c: ScoreCfg): string[] => { const e: string[] = []; if (!(c.windowDays >= 7 && c.windowDays <= 365)) e.push('Recent window must be 7–365 days'); if (!(c.baselineDays >= c.windowDays)) e.push('Baseline must be at least as long as the recent window'); if (!(c.minN >= 3)) e.push('Minimum claims must be at least 3'); for (const [k, v] of Object.entries(c.thresholds)) if (!(v > 0)) e.push(`Threshold “${k}” must be positive`); return e; };

export interface Metrics { n: number; denied: number; denialRate: number | null; paidN: number; medianDaysToPay: number | null; avgPaidPct: number | null; appealsDecided: number; appealsWon: number; winRate: number | null; billed: number; top: { code: string; n: number }[] }
export interface PayerScore { payer: string; cpt: string | null; recent: Metrics; baseline: Metrics; trend: { denial: number | null; days: number | null; win: number | null; pay: number | null } }
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const diff = (a: string, b: string) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5);
const shift = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const isDenial = (c: Claim) => !!(c.denial_codes && c.denial_codes.trim()) || /denied/i.test(c.pms_status || '');
const first = (cpt: string | null) => ((cpt || '').toUpperCase().split(/[,;\s]+/)[0] || '').trim() || '—';
/** when the claim entered the payer's hands */ const filed = (c: Claim) => day(c.last_billed) || day(c.dos) || day(c.created_at);

function metrics(claims: Claim[], appeals: Appeal[], from: string, to: string): Metrics {
  const cohort = claims.filter((c) => { const f = filed(c); return f != null && f >= from && f <= to; });
  const denied = cohort.filter(isDenial); const codes = new Map<string, number>(); for (const c of denied) for (const k of (c.denial_codes || '').split(/[,;\s]+/).filter(Boolean)) codes.set(k.toUpperCase(), (codes.get(k.toUpperCase()) || 0) + 1);
  const paidClaims = claims.filter((c) => { const d = day(c.closed_at); return d != null && d >= from && d <= to && (c.resolution === 'paid' || (c.paid_amt || 0) > 0) && filed(c) != null; });
  const days = paidClaims.map((c) => diff(day(c.closed_at)!, filed(c)!)).filter((d) => d >= 0);
  const pct = paidClaims.filter((c) => (c.billed_amt || 0) > 0 && c.paid_amt != null).map((c) => (c.paid_amt! / c.billed_amt) * 100);
  const decided = appeals.filter((a) => ['won', 'partial', 'lost'].includes(a.status) && a.decided_on && a.decided_on >= from && a.decided_on <= to); const won = decided.filter((a) => a.status === 'won' || a.status === 'partial').length;
  return { n: cohort.length, denied: denied.length, denialRate: cohort.length ? (denied.length / cohort.length) * 100 : null, paidN: days.length, medianDaysToPay: median(days), avgPaidPct: pct.length ? pct.reduce((a, b) => a + b, 0) / pct.length : null, appealsDecided: decided.length, appealsWon: won, winRate: decided.length ? (won / decided.length) * 100 : null, billed: cohort.reduce((a, c) => a + (c.billed_amt || 0), 0), top: [...codes].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, n]) => ({ code, n })) };
}
const delta = (cur: number | null, base: number | null) => (cur != null && base != null ? cur - base : null);
const pctDelta = (cur: number | null, base: number | null) => (cur != null && base != null && base > 0 ? ((cur - base) / base) * 100 : null);

export function payerScorecards(claims: Claim[], appeals: Appeal[], cfg: ScoreCfg, today: string, opts: { byCpt?: boolean; clientIds?: string[]; canon?: (p: string) => string } = {}): PayerScore[] {
  const canon = opts.canon || ((p: string) => p); const rFrom = shift(today, -cfg.windowDays), bFrom = shift(today, -cfg.baselineDays), bTo = shift(today, -cfg.windowDays - 1);
  const keyOf = (c: Claim) => `${canon(c.payer || 'Unknown')}\u0001${opts.byCpt ? first(c.cpt) : ''}`; const by = new Map<string, Claim[]>();
  for (const c of claims) { if (opts.clientIds?.length && !opts.clientIds.includes(c.client_id)) continue; const k = keyOf(c); const l = by.get(k); if (l) l.push(c); else by.set(k, [c]); }
  const apByPayer = new Map<string, Appeal[]>(); const cm = new Map(claims.map((c) => [c.id, c])); for (const a of appeals) { const c = cm.get(a.claim_id); if (!c) continue; const k = keyOf(c); const l = apByPayer.get(k); if (l) l.push(a); else apByPayer.set(k, [a]); }
  const out: PayerScore[] = [];
  for (const [k, list] of by) {
    const [payer, cpt] = k.split('\u0001'); const ap = apByPayer.get(k) || []; const recent = metrics(list, ap, rFrom, today), baseline = metrics(list, ap, bFrom, bTo);
    if (recent.n + baseline.n === 0) continue; out.push({ payer, cpt: opts.byCpt ? cpt : null, recent, baseline, trend: { denial: delta(recent.denialRate, baseline.denialRate), days: pctDelta(recent.medianDaysToPay, baseline.medianDaysToPay), win: delta(recent.winRate, baseline.winRate), pay: delta(recent.avgPaidPct, baseline.avgPaidPct) } });
  }
  return out.sort((a, b) => b.recent.billed + b.baseline.billed - (a.recent.billed + a.baseline.billed));
}

export interface BehaviourAlert { key: string; payer: string; cpt: string | null; kind: 'denial_up' | 'denial_down' | 'slower_pay' | 'appeal_win_down' | 'payment_pct_down' | 'new_denial_code'; metric: string; prev: number | null; curr: number | null; n: number; severity: 'high' | 'warn' | 'info'; title: string; detail: string }
/** Compare the recent window with the baseline: only payers/CPTs with enough volume in BOTH windows can raise an alert. */
export function behaviourAlerts(cards: PayerScore[], cfg: ScoreCfg, today: string): BehaviourAlert[] {
  const out: BehaviourAlert[] = []; const per = today.slice(0, 7); const t = cfg.thresholds; const f1 = (n: number | null) => (n == null ? '—' : n.toFixed(1));
  for (const c of cards) {
    const who = c.cpt ? `${c.payer} · ${c.cpt}` : c.payer; const key = (k: string) => `${k}|${c.payer}|${c.cpt || ''}|${per}`; const R = c.recent, B = c.baseline;
    const volume = R.n >= cfg.minN && B.n >= cfg.minN;
    if (volume && c.trend.denial != null) { if (c.trend.denial >= t.denialPts) out.push({ key: key('denial_up'), payer: c.payer, cpt: c.cpt, kind: 'denial_up', metric: 'denial rate', prev: B.denialRate, curr: R.denialRate, n: R.n, severity: c.trend.denial >= t.denialPts * 2 ? 'high' : 'warn', title: `${who}: denials up ${c.trend.denial.toFixed(1)} pts`, detail: `Denial rate ${f1(B.denialRate)}% → ${f1(R.denialRate)}% (${R.denied} of ${R.n} claims in the last ${cfg.windowDays} days). Top reasons: ${R.top.map((x) => `${x.code} ×${x.n}`).join(', ') || '—'}.` }); else if (c.trend.denial <= -t.denialPts) out.push({ key: key('denial_down'), payer: c.payer, cpt: c.cpt, kind: 'denial_down', metric: 'denial rate', prev: B.denialRate, curr: R.denialRate, n: R.n, severity: 'info', title: `${who}: denials down ${(-c.trend.denial).toFixed(1)} pts`, detail: `Denial rate ${f1(B.denialRate)}% → ${f1(R.denialRate)}%.` }); }
    if (R.paidN >= cfg.minN / 2 && B.paidN >= cfg.minN / 2 && c.trend.days != null && c.trend.days >= t.payDaysPct) out.push({ key: key('slower_pay'), payer: c.payer, cpt: c.cpt, kind: 'slower_pay', metric: 'days to pay', prev: B.medianDaysToPay, curr: R.medianDaysToPay, n: R.paidN, severity: c.trend.days >= t.payDaysPct * 2 ? 'high' : 'warn', title: `${who}: paying ${c.trend.days.toFixed(0)}% slower`, detail: `Median days to pay ${f1(B.medianDaysToPay)} → ${f1(R.medianDaysToPay)} (${R.paidN} paid claims).` });
    if (R.appealsDecided >= 5 && B.appealsDecided >= 5 && c.trend.win != null && c.trend.win <= -t.appealWinPts) out.push({ key: key('appeal_win_down'), payer: c.payer, cpt: c.cpt, kind: 'appeal_win_down', metric: 'appeal win rate', prev: B.winRate, curr: R.winRate, n: R.appealsDecided, severity: 'warn', title: `${who}: appeal win rate down ${(-c.trend.win).toFixed(0)} pts`, detail: `Win rate ${f1(B.winRate)}% → ${f1(R.winRate)}% (${R.appealsDecided} decided appeals). Review the letters and evidence being sent.` });
    if (R.paidN >= 5 && B.paidN >= 5 && c.trend.pay != null && c.trend.pay <= -t.payPctPts) out.push({ key: key('payment_pct_down'), payer: c.payer, cpt: c.cpt, kind: 'payment_pct_down', metric: 'paid % of billed', prev: B.avgPaidPct, curr: R.avgPaidPct, n: R.paidN, severity: 'warn', title: `${who}: paying ${(-c.trend.pay).toFixed(1)} pts less of billed`, detail: `Average payment ${f1(B.avgPaidPct)}% → ${f1(R.avgPaidPct)}% of billed — check for underpayments.` });
    if (volume && R.denied >= 5) { const baseCodes = new Set(B.top.map((x) => x.code)); const nw = R.top.find((x) => !baseCodes.has(x.code) && (x.n / R.denied) * 100 >= t.newCarcShare); if (nw) out.push({ key: key('new_denial_code'), payer: c.payer, cpt: c.cpt, kind: 'new_denial_code', metric: 'new denial code', prev: null, curr: nw.n, n: R.denied, severity: 'warn', title: `${who}: new denial reason ${nw.code}`, detail: `${nw.code} is now ${Math.round((nw.n / R.denied) * 100)}% of denials and was not in the previous top reasons.` }); }
  }
  return out.sort((a, b) => ({ high: 0, warn: 1, info: 2 }[a.severity] - { high: 0, warn: 1, info: 2 }[b.severity]));
}
