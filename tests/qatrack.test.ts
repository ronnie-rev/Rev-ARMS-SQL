import { describe, expect, it } from 'vitest';
import { DEFAULT_QA_CONFIG, resolveQaConfig, scoreReview, errorPoints } from '../src/lib/engine/qascore';
import { analystQuality, errorsByType, qaTrend } from '../src/lib/engine/qatrack';
const cfg = resolveQaConfig({ scoring: { model: 'deduction', severityPoints: { critical: 40, major: 15, minor: 5 }, floor: 0 } });
const form = DEFAULT_QA_CONFIG.forms[0]; const allPass = Object.fromEntries(form.criteria.map((c) => [c.id, 'pass' as const]));
const R = (o: any) => ({ id: Math.random().toString(), status: 'completed', is_calibration: false, errors: [], score: 90, result: 'pass', analyst_id: 'a1', client_id: 'c1', created_at: '2026-03-02T10:00:00Z', ...o });
describe('QA error weightage & scoring', () => {
  it('error points = severity points × category weight', () => { expect(errorPoints({ criterion: 'x', category: 'wrong_rca', severity: 'major', note: '' }, cfg)).toBe(15); const c2 = resolveQaConfig({ error_cats: [{ id: 'k', label: 'k', severity: 'minor', weight: 3 }] }); expect(errorPoints({ criterion: 'x', category: 'k', severity: 'minor', note: '' }, c2)).toBe(15); });
  it('criteria model ignores errors; deduction & hybrid use them', () => {
    const errs = [{ criterion: 'rca', category: 'wrong_rca', severity: 'major' as const, note: '' }, { criterion: 'documentation', category: 'incomplete_note', severity: 'minor' as const, note: '' }];
    expect(scoreReview(form, allPass, { errors: errs, cfg: DEFAULT_QA_CONFIG }).score).toBe(100);
    expect(scoreReview(form, allPass, { errors: errs, cfg }).score).toBe(80);
    expect(scoreReview(form, { ...allPass, rca: 'fail' }, { errors: errs, cfg: { ...cfg, scoring: { ...cfg.scoring!, model: 'hybrid' } } }).score).toBe(80);
  });
  it('autofail category forces a critical result; floor respected', () => {
    const e = [{ criterion: 'compliance', category: 'phi', severity: 'critical' as const, note: '' }]; expect(scoreReview(form, allPass, { errors: e, cfg }).result).toBe('critical');
    const many = Array.from({ length: 5 }, () => ({ criterion: 'x', category: 'wrong_rca', severity: 'major' as const, note: '' })); expect(scoreReview(form, allPass, { errors: many, cfg: { ...cfg, scoring: { ...cfg.scoring!, floor: 20 } } }).score).toBe(25);
  });
});
describe('QA trends', () => {
  const rv = [R({ score: 80, errors: [{ criterion: 'a', category: 'wrong_rca', severity: 'major', note: '' }] }), R({ score: 100, created_at: '2026-03-04T10:00:00Z' }), R({ score: 70, result: 'fail', created_at: '2026-03-10T10:00:00Z', errors: [{ criterion: 'a', category: 'incomplete_note', severity: 'minor', note: '' }, { criterion: 'a', category: 'phi', severity: 'critical', note: '' }] }), R({ is_calibration: true, score: 10 }), R({ status: 'queued', score: null })] as any[];
  it('buckets by week and skips calibration / unscored', () => { const t = qaTrend(rv, cfg); expect(t.map((x) => [x.bucket, x.n, x.avg])).toEqual([['2026-03-02', 2, 90], ['2026-03-09', 1, 70]]); expect(t[1].errorsPer100).toBe(200); });
  it('groups weighted points by error type', () => { const e = errorsByType(rv, cfg); expect(e[0].type).toBe('compliance'); expect(e[0].points).toBe(40); expect(e.reduce((a, r) => a + r.share, 0)).toBeCloseTo(100, 0); });
  it('analyst window compares against previous window', () => { const q = analystQuality(rv, cfg, '2026-03-20', 10); expect(q[0].analystId).toBe('a1'); expect(q[0].n).toBe(1); expect(q[0].avg).toBe(70); expect(q[0].prev).toBe(90); expect(q[0].delta).toBe(-20); });
});
