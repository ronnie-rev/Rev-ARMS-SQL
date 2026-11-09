// QA coaching & calibration intelligence: what each analyst keeps getting wrong versus the team, what to coach, and whether reviewers score consistently.
import type { QaReview } from '../types';

export interface CoachItem { category: string; count: number; rate: number; teamRate: number; severity: 'critical' | 'major' | 'minor'; example: string; tip: string }
export interface AnalystCoach { analystId: string; reviews: number; avg: number | null; prevAvg: number | null; trend: 'up' | 'down' | 'flat' | null; failRate: number; items: CoachItem[]; priority: number; disputeOverturned: number }
export interface Calibration { group: string; reviewers: { id: string; score: number }[]; spread: number; mean: number }
export interface ReviewerBias { reviewerId: string; groups: number; bias: number; label: 'lenient' | 'strict' | 'aligned'; overturnedRate: number | null; disputes: number }

const TIPS: [RegExp, string][] = [
  [/document|note|comment/i, 'Walk through a model touch note together: who you spoke to, reference number, outcome and the next date. Notes should stand on their own for the next person.'],
  [/follow.?up|next\s*(step|action)|due/i, 'Set a follow-up date on every touch — practise choosing the date from the payer’s promised turnaround, not a default.'],
  [/accura|wrong|incorrect|data|code|amount/i, 'Do a short accuracy drill: re-check codes, amounts and dates against the source before saving. Pair review five of their claims.'],
  [/compliance|hipaa|phi|policy/i, 'Refresh the compliance policy with a worked example. Compliance misses are never minor — review the same day.'],
  [/escalat|supervisor|sla/i, 'Review the escalation rules and the filing-deadline radar; practise spotting claims inside 30 days of a limit.'],
  [/denial|appeal|rca|root/i, 'Review the denial playbook for the codes they miss; have them draft one appeal with the Strategy tab and compare.'],
  [/communi|tone|call|contact/i, 'Role-play a payer call using the call flow; focus on opening, the ask, and confirming the reference number.'],
  [/financ|balance|adjust|writeoff|write-off/i, 'Revisit adjustment and write-off authority limits and the approval path.'],
];
export const coachTip = (cat: string) => TIPS.find(([re]) => re.test(cat))?.[1] || 'Review three recent examples together and agree one specific behaviour to change this week.';
const SEV_W = { critical: 3, major: 2, minor: 1 } as const;
const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** One row per analyst: top recurring error categories (vs the team's rate), score trend and a coaching priority. */
export function coachingPlan(reviews: QaReview[], o: { today: string; days?: number; minReviews?: number }): AnalystCoach[] {
  const days = o.days ?? 60; const cut = iso(new Date(Date.parse(o.today + 'T12:00:00Z') - days * 864e5)); const cut2 = iso(new Date(Date.parse(o.today + 'T12:00:00Z') - days * 2 * 864e5));
  const done = reviews.filter((r) => r.analyst_id && r.score != null && !r.is_calibration && (r.reviewed_at || r.created_at).slice(0, 10) >= cut2); const recent = done.filter((r) => (r.reviewed_at || r.created_at).slice(0, 10) >= cut);
  const teamN = Math.max(1, recent.length); const teamCats = new Map<string, number>(); for (const r of recent) for (const e of r.errors || []) teamCats.set(e.category, (teamCats.get(e.category) || 0) + 1);
  const by = new Map<string, QaReview[]>(); for (const r of recent) by.set(r.analyst_id!, [...(by.get(r.analyst_id!) || []), r]);
  const out: AnalystCoach[] = [];
  for (const [id, rs] of by) {
    if (rs.length < (o.minReviews ?? 3)) continue; const cats = new Map<string, { n: number; sev: CoachItem['severity']; ex: string }>();
    for (const r of rs) for (const e of r.errors || []) { const c = cats.get(e.category) || { n: 0, sev: e.severity, ex: e.note || e.criterion }; c.n++; if (SEV_W[e.severity] > SEV_W[c.sev]) c.sev = e.severity; if (!c.ex && (e.note || e.criterion)) c.ex = e.note || e.criterion; cats.set(e.category, c); }
    const items: CoachItem[] = [...cats.entries()].map(([category, c]) => ({ category, count: c.n, rate: Math.round((c.n / rs.length) * 100) / 100, teamRate: Math.round(((teamCats.get(category) || 0) / teamN) * 100) / 100, severity: c.sev, example: c.ex, tip: coachTip(category) })).filter((x) => x.count >= 2 && x.rate > x.teamRate * 1.25).sort((a, b) => SEV_W[b.severity] * b.count - SEV_W[a.severity] * a.count).slice(0, 3);
    const prev = done.filter((r) => r.analyst_id === id && (r.reviewed_at || r.created_at).slice(0, 10) < cut); const a = avg(rs.map((r) => r.score!)); const p = avg(prev.map((r) => r.score!)); const fails = rs.filter((r) => r.result === 'fail' || r.result === 'critical').length;
    const disputed = reviews.filter((r) => r.analyst_id === id && r.dispute_outcome); const over = disputed.filter((r) => r.dispute_outcome === 'overturned').length;
    const trend: AnalystCoach['trend'] = a != null && p != null ? (a - p >= 3 ? 'up' : a - p <= -3 ? 'down' : 'flat') : null;
    const priority = Math.round(items.reduce((s, x) => s + SEV_W[x.severity] * x.count, 0) + fails * 2 + (trend === 'down' ? 6 : 0) + (a != null ? Math.max(0, 90 - a) / 2 : 0));
    out.push({ analystId: id, reviews: rs.length, avg: a, prevAvg: p, trend, failRate: Math.round((fails / rs.length) * 100), items, priority, disputeOverturned: over });
  }
  return out.sort((x, y) => y.priority - x.priority);
}

/** Calibration groups: several reviewers scoring the same work. A wide spread means the rubric is read differently. */
export function calibrationGroups(reviews: QaReview[]): Calibration[] {
  const g = new Map<string, QaReview[]>(); for (const r of reviews) if (r.is_calibration && r.calibration_group && r.score != null && r.reviewer_id) g.set(r.calibration_group, [...(g.get(r.calibration_group) || []), r]);
  return [...g.entries()].filter(([, rs]) => new Set(rs.map((r) => r.reviewer_id)).size >= 2).map(([group, rs]) => { const sc = rs.map((r) => r.score!); const mean = sc.reduce((a, b) => a + b, 0) / sc.length; return { group, reviewers: rs.map((r) => ({ id: r.reviewer_id!, score: r.score! })), spread: Math.round(Math.max(...sc) - Math.min(...sc)), mean: Math.round(mean * 10) / 10 }; }).sort((a, b) => b.spread - a.spread);
}
/** Per reviewer: average distance from the group mean (positive = lenient) and how often their findings were overturned on dispute. */
export function reviewerBias(reviews: QaReview[], groups = calibrationGroups(reviews)): ReviewerBias[] {
  const dev = new Map<string, number[]>(); for (const g of groups) for (const r of g.reviewers) dev.set(r.id, [...(dev.get(r.id) || []), r.score - g.mean]);
  const ids = new Set([...dev.keys(), ...reviews.filter((r) => r.dispute_outcome && r.reviewer_id).map((r) => r.reviewer_id!)]);
  return [...ids].map((id) => { const d = dev.get(id) || []; const bias = d.length ? Math.round((d.reduce((a, b) => a + b, 0) / d.length) * 10) / 10 : 0; const dis = reviews.filter((r) => r.reviewer_id === id && r.dispute_outcome); const over = dis.filter((r) => r.dispute_outcome === 'overturned').length;
    return { reviewerId: id, groups: d.length, bias, label: bias >= 4 ? 'lenient' : bias <= -4 ? 'strict' : 'aligned', overturnedRate: dis.length >= 3 ? Math.round((over / dis.length) * 100) : null, disputes: dis.length } as ReviewerBias; }).sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias));
}
