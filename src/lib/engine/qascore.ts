// QA scorecards: default form, config resolution, scoring, results, auto-checks and KPI maths. Pure and unit-tested.
import type { Claim, QaConfig, QaCriterion, QaError, QaForm, QaReview, WorkLog } from '../types';
import { qaRisk } from './qa';
import type { Carc } from './carc';

export const DEFAULT_CRITERIA: QaCriterion[] = [
  { id: 'rca', label: 'Root cause category & detail are correct', weight: 15, help: 'Matches the denial/remit evidence and the payer’s stated reason.' },
  { id: 'action', label: 'End action & sub-category fit what was done', weight: 15, help: 'The action chosen is what actually happened on this touch.' },
  { id: 'resolution', label: 'Right next step toward payment', weight: 15, help: 'Appeal vs corrected claim vs records vs adjust — the most collectible path was chosen.' },
  { id: 'documentation', label: 'Note is complete, factual and dated', weight: 15, help: 'Who/what/when, rep name, reference #, amounts, next step.' },
  { id: 'followup', label: 'Follow-up date & workflow status set correctly', weight: 10, help: 'Date matches payer turnaround; status reflects the claim state.' },
  { id: 'evidence', label: 'Payer contact evidence captured', weight: 10, help: 'Call reference #, portal screenshot ID, fax/email proof.' },
  { id: 'deadline', label: 'Timely-filing / appeal deadlines respected', weight: 10, help: 'No window missed; proof of timely filing gathered when needed.' },
  { id: 'compliance', label: 'Compliance — approvals, PHI, no improper adjustment', weight: 10, critical: true, help: 'Adjustments/write-offs approved; no PHI in tags; policies followed.' },
];
export const DEFAULT_QA_CONFIG: QaConfig = {
  sample_rate_pct: 5, min_per_analyst_week: 5, new_hire_days: 30, new_hire_rate_pct: 20, risk_weighted: true, force_actions: ['Adjustments'], force_min_balance: 5000, calibration_pct: 5, dispute_window_days: 5, reviewer_source: 'internal', external_partner: '',
  forms: [{ id: 'ar_touch', name: 'AR follow-up touch', version: 1, pass_threshold: 85, criteria: DEFAULT_CRITERIA }],
  error_cats: [
    { id: 'wrong_rca', label: 'Wrong root cause', severity: 'major', type: 'accuracy' }, { id: 'wrong_action', label: 'Wrong end action', severity: 'major', type: 'accuracy' }, { id: 'wrong_path', label: 'Wrong resolution path', severity: 'major', type: 'process' },
    { id: 'incomplete_note', label: 'Incomplete / unclear note', severity: 'minor', type: 'documentation' }, { id: 'missing_ref', label: 'Missing reference #', severity: 'minor', type: 'documentation' }, { id: 'bad_followup', label: 'Wrong / missing follow-up', severity: 'minor', type: 'process' },
    { id: 'missed_deadline', label: 'Missed timely-filing / appeal window', severity: 'critical', type: 'financial', autofail: true }, { id: 'unauthorized_adj', label: 'Adjustment without approval', severity: 'critical', type: 'compliance', autofail: true }, { id: 'phi', label: 'PHI / compliance breach', severity: 'critical', type: 'compliance', autofail: true }, { id: 'other', label: 'Other', severity: 'minor', type: 'process' },
  ],
  scoring: { model: 'criteria', severityPoints: { critical: 40, major: 15, minor: 5 }, floor: 0 },
  kpi: { qa_score: 90, max_error_rate_pct: 8, review_tat_days: 3, max_dispute_pct: 10, min_coverage_pct: 5, touches_per_day: 40, max_rework_pct: 35 },
  perf_weights: { volume: 40, quality: 40, rework: 20 },
};
export function resolveQaConfig(raw?: Partial<QaConfig> | null): QaConfig {
  const r = (raw || {}) as Partial<QaConfig>; const d = DEFAULT_QA_CONFIG;
  return { ...d, ...r, kpi: { ...d.kpi, ...(r.kpi || {}) }, perf_weights: { ...d.perf_weights, ...(r.perf_weights || {}) }, scoring: { ...d.scoring!, ...(r.scoring || {}), severityPoints: { ...d.scoring!.severityPoints, ...(r.scoring?.severityPoints || {}) } }, forms: r.forms?.length ? r.forms : d.forms, error_cats: r.error_cats?.length ? r.error_cats : d.error_cats, force_actions: r.force_actions ?? d.force_actions };
}

export type Answer = 'pass' | 'fail' | 'na';
export interface ScoreOut { score: number; result: 'pass' | 'fail' | 'critical'; critical: boolean; failed: string[]; max: number; earned: number }
/** Weighted score over answered (non-N/A) criteria. A failed critical criterion makes the result "critical" regardless of the score. */
export function scoreReview(form: QaForm, answers: Record<string, Answer | undefined>, opt?: { errors?: QaError[]; cfg?: QaConfig }): ScoreOut {
  let max = 0, earned = 0, critical = false; const failed: string[] = [];
  for (const c of form.criteria) { const a = answers[c.id]; if (!a || a === 'na') continue; max += c.weight; if (a === 'pass') earned += c.weight; else { failed.push(c.id); if (c.critical) critical = true; } }
  let score = max ? Math.round((earned / max) * 1000) / 10 : 0;
  const sc = opt?.cfg?.scoring;
  if (sc && opt?.errors && sc.model !== 'criteria') {
    const ded = Math.max(sc.floor, Math.round((100 - opt.errors.reduce((a, e) => a + errorPoints(e, opt.cfg!), 0)) * 10) / 10);
    score = sc.model === 'deduction' ? ded : Math.min(score, ded);
  }
  if (opt?.cfg && opt.errors?.some((e) => opt.cfg!.error_cats.find((c) => c.id === e.category)?.autofail)) critical = true;
  return { score, result: critical ? 'critical' : score >= form.pass_threshold ? 'pass' : 'fail', critical, failed, max, earned };
}
/** Points one logged error costs: severity points × the category's weight (default 1). */
export const errorPoints = (e: QaError, cfg: QaConfig): number => { const cat = cfg.error_cats.find((c) => c.id === e.category); const sev = cat?.severity ?? e.severity; return (cfg.scoring?.severityPoints[sev] ?? 0) * (cat?.weight ?? 1); };
export const complete = (form: QaForm, answers: Record<string, Answer | undefined>) => form.criteria.every((c) => !!answers[c.id]);
export const validateForm = (f: QaForm): string[] => { const e: string[] = []; const t = f.criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0); if (!f.name.trim()) e.push('Form needs a name'); if (!f.criteria.length) e.push('Add at least one criterion'); if (t !== 100) e.push(`Weights must total 100 (now ${t})`); if (f.pass_threshold < 1 || f.pass_threshold > 100) e.push('Pass threshold must be 1–100'); if (new Set(f.criteria.map((c) => c.id)).size !== f.criteria.length) e.push('Duplicate criterion ids'); if (f.criteria.some((c) => !c.label.trim())) e.push('Every criterion needs a label'); return e; };

const MAP: [RegExp, string, string][] = [
  [/very short|quality|completeness/i, 'documentation', 'incomplete_note'], [/no reference|ref/i, 'evidence', 'missing_ref'], [/follow-up/i, 'followup', 'bad_followup'],
  [/conflicts with denial|contradict|says denied|payment but|still processing/i, 'rca', 'wrong_rca'], [/adjust/i, 'compliance', 'unauthorized_adj'], [/under 20 seconds/i, 'evidence', 'missing_ref'],
];
/** System pre-screen for one touch: which scorecard lines the evidence already questions, so the reviewer starts from facts. */
export function autoChecks(w: WorkLog, c: Claim | undefined, carc: Map<string, Carc>, terminal: Set<string>): { risk: number; findings: { criterion: string; category: string; reason: string }[] } {
  const r = qaRisk(w, c, carc, terminal); const findings = r.reasons.map((reason) => { const m = MAP.find(([re]) => re.test(reason)); return { criterion: m?.[1] || 'resolution', category: m?.[2] || 'other', reason }; });
  return { risk: r.risk, findings };
}

export interface KpiRow { key: string; label: string; value: number | null; target: number; unit: '%' | 'd' | 'x'; good: boolean | null; higherIsBetter: boolean }
export function qaKpis(reviews: QaReview[], touchesInPeriod: number, cfg: QaConfig): { rows: KpiRow[]; avg: number | null; passRate: number | null; coverage: number; errorRate: number | null; tat: number | null; disputePct: number | null; overturn: number | null; critical: number; completed: number } {
  const done = reviews.filter((r) => r.score != null && ['completed', 'acknowledged', 'disputed', 'resolved'].includes(r.status)); const n = done.length;
  const avg = n ? done.reduce((a, r) => a + (r.score || 0), 0) / n : null; const passRate = n ? done.filter((r) => r.result === 'pass').length / n : null;
  const coverage = touchesInPeriod ? n / touchesInPeriod : 0; const errs = done.reduce((a, r) => a + (r.errors?.length || 0), 0); const errorRate = n ? errs / n : null;
  const tats = done.filter((r) => r.reviewed_at && r.queued_at).map((r) => (new Date(r.reviewed_at!).getTime() - new Date(r.queued_at).getTime()) / 864e5); const tat = tats.length ? tats.reduce((a, b) => a + b, 0) / tats.length : null;
  const disputed = done.filter((r) => r.status === 'disputed' || r.dispute_outcome); const disputePct = n ? disputed.length / n : null; const resolved = disputed.filter((r) => r.dispute_outcome); const overturn = resolved.length ? resolved.filter((r) => r.dispute_outcome === 'overturned').length / resolved.length : null;
  const k = cfg.kpi; const mk = (key: string, label: string, value: number | null, target: number, unit: KpiRow['unit'], higher: boolean): KpiRow => ({ key, label, value, target, unit, higherIsBetter: higher, good: value == null ? null : higher ? value >= target : value <= target });
  return { avg, passRate, coverage, errorRate, tat, disputePct, overturn, critical: done.filter((r) => r.result === 'critical').length, completed: n, rows: [
    mk('score', 'Average QA score', avg, k.qa_score, '%', true), mk('coverage', 'Review coverage', coverage * 100, k.min_coverage_pct, '%', true),
    mk('errors', 'Errors per 100 reviews', errorRate == null ? null : errorRate * 100, k.max_error_rate_pct * 10, 'x', false), mk('tat', 'Review turnaround', tat, k.review_tat_days, 'd', false), mk('dispute', 'Dispute rate', disputePct == null ? null : disputePct * 100, k.max_dispute_pct, '%', false),
  ] };
}
export const errorPareto = (reviews: QaReview[], cats: { id: string; label: string }[]) => { const m = new Map<string, number>(); for (const r of reviews) for (const e of r.errors || []) m.set(e.category, (m.get(e.category) || 0) + 1); return [...m].map(([id, n]) => ({ id, label: cats.find((c) => c.id === id)?.label || id, n })).sort((a, b) => b.n - a.n); };
export const criterionFailRates = (reviews: QaReview[], form: QaForm) => form.criteria.map((c) => { const answered = reviews.filter((r) => r.score != null && r.answers?.[c.id] && r.answers[c.id] !== 'na'); const fails = answered.filter((r) => r.answers[c.id] === 'fail').length; return { id: c.id, label: c.label, n: answered.length, fails, rate: answered.length ? fails / answered.length : 0 }; });
export type { QaError };
