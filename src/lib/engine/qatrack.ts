// QA quality tracking: score trends and weighted error breakdowns by week/month, analyst, client and error type. Pure and unit-tested.
import type { QaConfig, QaErrorType, QaReview } from '../types';
import { errorPoints } from './qascore';

export const ERROR_TYPE_LABEL: Record<QaErrorType, string> = { accuracy: 'Accuracy', process: 'Process', documentation: 'Documentation', compliance: 'Compliance', financial: 'Financial impact', communication: 'Communication' };
const done = (r: QaReview) => r.score != null && !r.is_calibration && ['completed', 'acknowledged', 'disputed', 'resolved'].includes(r.status);
const day = (r: QaReview) => (r.resolved_at || r.created_at || '').slice(0, 10);
const weekStart = (iso: string) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const bucketOf = (iso: string, by: 'week' | 'month') => (by === 'month' ? iso.slice(0, 7) : weekStart(iso));
const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);

export interface TrendPoint { bucket: string; n: number; avg: number | null; passRate: number | null; errors: number; points: number; errorsPer100: number | null; critical: number }
export interface TrendFilter { by?: 'week' | 'month'; analystId?: string; clientId?: string; from?: string; to?: string }
/** Score and error trend over time (completed, non-calibration reviews). */
export function qaTrend(reviews: QaReview[], cfg: QaConfig, f: TrendFilter = {}): TrendPoint[] {
  const by = f.by || 'week'; const m = new Map<string, QaReview[]>();
  for (const r of reviews) { if (!done(r)) continue; if (f.analystId && r.analyst_id !== f.analystId) continue; if (f.clientId && r.client_id !== f.clientId) continue; const d = day(r); if ((f.from && d < f.from) || (f.to && d > f.to)) continue; const k = bucketOf(d, by); const l = m.get(k); if (l) l.push(r); else m.set(k, [r]); }
  return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([bucket, l]) => {
    const errs = l.flatMap((r) => r.errors || []); const n = l.length;
    return { bucket, n, avg: avg(l.map((r) => r.score!)), passRate: Math.round((l.filter((r) => r.result === 'pass').length / n) * 1000) / 10, errors: errs.length, points: Math.round(errs.reduce((a, e) => a + errorPoints(e, cfg), 0) * 10) / 10, errorsPer100: Math.round((errs.length / n) * 1000) / 10, critical: l.filter((r) => r.result === 'critical').length };
  });
}
export interface TypeRow { type: QaErrorType | 'untyped'; label: string; count: number; points: number; share: number; cats: { id: string; label: string; count: number; points: number; severity: string }[] }
/** Where quality is lost: weighted error points grouped by error type, then category. */
export function errorsByType(reviews: QaReview[], cfg: QaConfig, f: TrendFilter = {}): TypeRow[] {
  const rows = new Map<string, TypeRow>(); let total = 0;
  for (const r of reviews) { if (!done(r)) continue; if (f.analystId && r.analyst_id !== f.analystId) continue; if (f.clientId && r.client_id !== f.clientId) continue; const d = day(r); if ((f.from && d < f.from) || (f.to && d > f.to)) continue;
    for (const e of r.errors || []) { const cat = cfg.error_cats.find((c) => c.id === e.category); const t = (cat?.type || 'untyped') as TypeRow['type']; const pts = errorPoints(e, cfg); total += pts; let row = rows.get(t); if (!row) rows.set(t, (row = { type: t, label: t === 'untyped' ? 'Uncategorised' : ERROR_TYPE_LABEL[t], count: 0, points: 0, share: 0, cats: [] })); row.count++; row.points += pts; let c = row.cats.find((x) => x.id === e.category); if (!c) row.cats.push((c = { id: e.category, label: cat?.label || e.category, count: 0, points: 0, severity: cat?.severity || e.severity })); c.count++; c.points += pts; } }
  return [...rows.values()].map((r) => ({ ...r, points: Math.round(r.points * 10) / 10, share: total ? Math.round((r.points / total) * 1000) / 10 : 0, cats: r.cats.sort((a, b) => b.points - a.points) })).sort((a, b) => b.points - a.points);
}
export interface AnalystRow { analystId: string; n: number; avg: number | null; prev: number | null; delta: number | null; errorsPer100: number | null; points: number; critical: number; topError: string | null }
/** Per-analyst quality: latest-window average vs the window before it (default 30 days each). */
export function analystQuality(reviews: QaReview[], cfg: QaConfig, today: string, windowDays = 30): AnalystRow[] {
  const cut = (n: number) => new Date(Date.parse(today + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10); const a0 = cut(windowDays), a1 = cut(windowDays * 2); const by = new Map<string, QaReview[]>();
  for (const r of reviews) if (done(r) && r.analyst_id) { const l = by.get(r.analyst_id); if (l) l.push(r); else by.set(r.analyst_id, [r]); }
  return [...by].map(([analystId, l]) => {
    const cur = l.filter((r) => day(r) >= a0), prv = l.filter((r) => day(r) >= a1 && day(r) < a0); const errs = cur.flatMap((r) => r.errors || []); const c = new Map<string, number>(); for (const e of errs) c.set(e.category, (c.get(e.category) || 0) + errorPoints(e, cfg));
    const top = [...c].sort((x, y) => y[1] - x[1])[0]?.[0]; const a = avg(cur.map((r) => r.score!)), p = avg(prv.map((r) => r.score!));
    return { analystId, n: cur.length, avg: a, prev: p, delta: a != null && p != null ? Math.round((a - p) * 10) / 10 : null, errorsPer100: cur.length ? Math.round((errs.length / cur.length) * 1000) / 10 : null, points: Math.round(errs.reduce((s, e) => s + errorPoints(e, cfg), 0) * 10) / 10, critical: cur.filter((r) => r.result === 'critical').length, topError: top ? cfg.error_cats.find((x) => x.id === top)?.label || top : null };
  }).filter((r) => r.n > 0).sort((a, b) => (a.avg ?? 101) - (b.avg ?? 101));
}
