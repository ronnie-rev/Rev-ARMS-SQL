import { describe, it, expect } from 'vitest';
import { DEFAULT_QA_CONFIG, resolveQaConfig, scoreReview, validateForm, complete, qaKpis, errorPareto, criterionFailRates, autoChecks } from '../src/lib/engine/qascore';
import { planSample, isNewHire } from '../src/lib/engine/qasample';
import { analystPerformance } from '../src/lib/engine/performance';
import type { Profile, QaReview, WorkLog } from '../src/lib/types';
const form = DEFAULT_QA_CONFIG.forms[0];
const allPass = Object.fromEntries(form.criteria.map((c) => [c.id, 'pass'] as const));
describe('scorecard', () => {
  it('default form totals 100 and validates', () => { expect(validateForm(form)).toEqual([]); expect(validateForm({ ...form, criteria: [{ ...form.criteria[0], weight: 50 }] }).join()).toMatch(/total 100/); });
  it('scores weighted, N/A excluded', () => {
    expect(scoreReview(form, allPass)).toMatchObject({ score: 100, result: 'pass' });
    const s = scoreReview(form, { ...allPass, documentation: 'fail' }); expect(s.score).toBe(85); expect(s.result).toBe('pass'); expect(scoreReview(form, { ...allPass, documentation: 'fail', rca: 'fail' }).result).toBe('fail');
    expect(scoreReview(form, { ...allPass, deadline: 'na', evidence: 'na' }).score).toBe(100);
  });
  it('a failed critical criterion is critical whatever the score', () => { const s = scoreReview(form, { ...allPass, compliance: 'fail' }); expect(s.score).toBe(90); expect(s.result).toBe('critical'); expect(s.critical).toBe(true); });
  it('knows when a form is fully answered', () => { expect(complete(form, allPass)).toBe(true); expect(complete(form, { rca: 'pass' })).toBe(false); });
  it('config merge keeps defaults for missing keys', () => { const c = resolveQaConfig({ sample_rate_pct: 12, kpi: { qa_score: 95 } as any }); expect(c.sample_rate_pct).toBe(12); expect(c.kpi.qa_score).toBe(95); expect(c.kpi.max_dispute_pct).toBe(DEFAULT_QA_CONFIG.kpi.max_dispute_pct); expect(c.forms.length).toBe(1); });
});
const prof = (id: string, o: Partial<Profile> = {}): Profile => ({ id, email: id + '@x', full_name: id, emp_code: null, role: 'user_prod', supervisor_id: null, daily_target: 10, active: true, ...o } as Profile);
const touch = (i: number, user: string, o: Partial<WorkLog> = {}): WorkLog => ({ id: `${user}-${i}`, claim_id: 'c' + i, client_id: 'k', user_id: user, user_name: user, work_date: '2026-10-' + String(1 + (i % 7)).padStart(2, '0'), comment: 'x', balance: 100, end_action: 'Claim Submitted', multi_touch: i % 4 === 0, ...o } as WorkLog);
describe('sampling', () => {
  const profiles = [prof('a'), prof('b', { hire_date: '2026-09-25' })]; const touches = [...Array.from({ length: 100 }, (_, i) => touch(i, 'a')), ...Array.from({ length: 100 }, (_, i) => touch(i, 'b')), touch(999, 'a', { end_action: 'Adjustments' }), touch(998, 'a', { balance: 9000 })];
  const base = { touches, reviews: [] as QaReview[], profiles, claims: new Map(), config: resolveQaConfig({ sample_rate_pct: 10, min_per_analyst_week: 2 }), riskOf: (w: WorkLog) => ({ risk: w.id.endsWith('-7') ? 60 : 0, reasons: ['x'] }), from: '2026-10-01', to: '2026-10-07', today: '2026-10-20' };
  it('hits the rate, forces critical touches, and treats new hires with a higher rate', () => {
    const r = planSample(base); const a = r.plan.find((p) => p.analyst.id === 'a')!, b = r.plan.find((p) => p.analyst.id === 'b')!;
    expect(a.forced).toBe(2); expect(a.picked).toBeGreaterThanOrEqual(10); expect(b.newHire).toBe(true); expect(b.target).toBe(20); expect(b.picked).toBeGreaterThan(a.picked - 2);
    expect(r.picks.filter((p) => p.analyst.id === 'a' && p.source === 'critical').length).toBe(2);
  });
  it('is reproducible and never re-samples reviewed touches', () => {
    const one = planSample(base).picks.map((p) => p.touch.id).sort(); const two = planSample(base).picks.map((p) => p.touch.id).sort(); expect(one).toEqual(two);
    const done = [{ work_log_id: 'a-1' } as QaReview]; expect(planSample({ ...base, reviews: done }).picks.some((p) => p.touch.id === 'a-1')).toBe(false);
  });
  it('includes the highest-risk touches when risk-weighted, honours the minimum per analyst, skips inactive', () => {
    expect(planSample(base).picks.some((p) => p.touch.id === 'a-7' && ['risk', 'random'].includes(p.source))).toBe(true);
    const few = planSample({ ...base, touches: touches.slice(0, 3), config: resolveQaConfig({ sample_rate_pct: 1, min_per_analyst_week: 5 }) }); expect(few.picks.length).toBe(3);
    expect(planSample({ ...base, profiles: [prof('a', { active: false })] }).picks.length).toBe(0); expect(isNewHire(prof('x', { hire_date: '2026-01-01' }), '2026-10-20', 30)).toBe(false);
  });
});
const rev = (o: Partial<QaReview>): QaReview => ({ id: Math.random() + '', work_log_id: 'w', claim_id: null, client_id: null, analyst_id: 'a', reviewer_id: 'r', form_id: 'ar_touch', form_version: 1, status: 'completed', sample_source: 'random', risk: 0, answers: {}, errors: [], score: 90, result: 'pass', comments: null, coaching: null, is_calibration: false, calibration_group: null, analyst_ack_at: null, dispute_note: null, dispute_outcome: null, resolved_by: null, resolved_at: null, review_seconds: 60, queued_at: '2026-10-01T00:00:00Z', reviewed_at: '2026-10-03T00:00:00Z', created_at: '', updated_at: '', ...o });
describe('kpis & performance', () => {
  const rs = [rev({ score: 100 }), rev({ score: 80, result: 'fail', errors: [{ criterion: 'rca', category: 'wrong_rca', severity: 'major', note: '' }], status: 'disputed' }), rev({ score: 60, result: 'critical', errors: [{ criterion: 'compliance', category: 'unauthorized_adj', severity: 'critical', note: '' }, { criterion: 'rca', category: 'wrong_rca', severity: 'major', note: '' }] }), rev({ status: 'queued', score: null, result: null })];
  it('computes score, pass rate, coverage, errors, TAT, disputes', () => { const k = qaKpis(rs, 60, DEFAULT_QA_CONFIG); expect(k.completed).toBe(3); expect(k.avg).toBeCloseTo(80); expect(k.passRate).toBeCloseTo(1 / 3); expect(k.coverage).toBeCloseTo(0.05); expect(k.errorRate).toBeCloseTo(1); expect(k.tat).toBeCloseTo(2); expect(k.disputePct).toBeCloseTo(1 / 3); expect(k.critical).toBe(1); expect(k.rows.find((r) => r.key === 'score')!.good).toBe(false); });
  it('builds an error Pareto and per-criterion fail rates', () => { expect(errorPareto(rs, DEFAULT_QA_CONFIG.error_cats)[0]).toMatchObject({ id: 'wrong_rca', n: 2 }); const withAns = rs.map((r, i) => ({ ...r, answers: { rca: i === 0 ? 'pass' : 'fail' } as any })); expect(criterionFailRates(withAns, form).find((c) => c.id === 'rca')!.rate).toBeCloseTo(2 / 3); });
  it('composite weighs volume, quality and rework; missing QA redistributes weight', () => {
    const profiles = [prof('a'), prof('b')]; const t = [...Array.from({ length: 70 }, (_, i) => touch(i, 'a', { multi_touch: false })), ...Array.from({ length: 35 }, (_, i) => touch(i, 'b', { multi_touch: false }))];
    const out = analystPerformance({ profiles, touches: t, reviews: [rev({ analyst_id: 'a', score: 90 })], cfg: DEFAULT_QA_CONFIG, workdays: 7 }); const a = out.find((x) => x.p.id === 'a')!, b = out.find((x) => x.p.id === 'b')!;
    expect(a.attain).toBe(1); expect(a.composite).toBeCloseTo(0.4 * 100 + 0.4 * 90 + 0.2 * 100); expect(b.attain).toBe(0.5); expect(b.qaScore).toBeNull(); expect(b.composite).toBeCloseTo((0.4 * 50 + 0.2 * 100) / 0.6);
  });
  it('auto-checks map evidence to scorecard lines', () => { const w = touch(1, 'a', { comment: 'ok', mode: 'Call', call_ref: null, next_fu: null } as any); const r = autoChecks(w, undefined, new Map(), new Set()); expect(r.risk).toBeGreaterThan(0); expect(r.findings.some((f) => f.criterion === 'documentation')).toBe(true); expect(r.findings.some((f) => f.criterion === 'evidence')).toBe(true); });
});

import { runReport } from '../src/lib/engine/reportdefs';
import { buildSeed } from '../src/lib/seed';
describe('QA reports', () => {
  const s = buildSeed('demo'); const today = new Date().toISOString().slice(0, 10);
  const ctx: any = { qaReviews: s.qa_reviews, qaConfig: DEFAULT_QA_CONFIG, ecs: [], claims: s.claims, workLog: s.work_log, recoveries: [], batches: [], profiles: s.profiles, clients: s.clients, config: [], carc: new Map(), violations: [], today, showPhi: true };
  it('scorecard lists analysts with reviews', () => { const r = runReport('qa_scorecard', ctx, { from: '2000-01-01', to: today }); expect(r.result.rows.length).toBeGreaterThan(0); expect(r.result.rows[0]).toHaveProperty('score'); });
  it('error log honours the severity filter', () => { const all = runReport('qa_errors', ctx, { from: '2000-01-01', to: today }).result.rows; const crit = runReport('qa_errors', ctx, { from: '2000-01-01', to: today, severity: ['critical'] }).result.rows; expect(all.length).toBeGreaterThan(0); expect(crit.every((x) => x.severity === 'critical')).toBe(true); expect(crit.length).toBeLessThanOrEqual(all.length); });
});
