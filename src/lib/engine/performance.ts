// Analyst performance: volume vs target, quality (QA), and rework — combined with configurable weights.
import type { Profile, QaConfig, QaReview, WorkLog } from '../types';
import { isProducer } from '../roles';

export interface Perf { p: Profile; touches: number; unique: number; perDay: number; target: number; attain: number; qaScore: number | null; qaCount: number; errorsPer100: number | null; critical: number; reworkPct: number; disputes: number; composite: number | null; components: { volume: number; quality: number | null; rework: number } }
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
export function analystPerformance(o: { profiles: Profile[]; touches: WorkLog[]; reviews: QaReview[]; cfg: QaConfig; workdays: number }): Perf[] {
  const w = o.cfg.perf_weights; const out: Perf[] = [];
  for (const p of o.profiles.filter((x) => x.active && isProducer(x.role))) {
    const t = o.touches.filter((x) => x.user_id === p.id); const rv = o.reviews.filter((r) => r.analyst_id === p.id && r.score != null && ['completed', 'acknowledged', 'disputed', 'resolved'].includes(r.status));
    const daily = p.daily_target || o.cfg.kpi.touches_per_day; const target = daily * Math.max(1, o.workdays); const attain = target ? t.length / target : 0; const rework = t.length ? t.filter((x) => x.multi_touch).length / t.length : 0;
    const qa = rv.length ? rv.reduce((a, r) => a + (r.score || 0), 0) / rv.length : null; const errs = rv.reduce((a, r) => a + (r.errors?.length || 0), 0);
    const volume = clamp(attain * 100); const reworkScore = clamp(100 - Math.max(0, rework * 100 - o.cfg.kpi.max_rework_pct) * 2);
    const parts: [number, number | null][] = [[w.volume, volume], [w.quality, qa], [w.rework, reworkScore]]; const wt = parts.filter(([, v]) => v != null).reduce((a, [x]) => a + x, 0);
    out.push({ p, touches: t.length, unique: new Set(t.map((x) => x.claim_id)).size, perDay: t.length / Math.max(1, o.workdays), target, attain, qaScore: qa, qaCount: rv.length, errorsPer100: rv.length ? (errs / rv.length) * 100 : null, critical: rv.filter((r) => r.result === 'critical').length, reworkPct: rework, disputes: rv.filter((r) => r.status === 'disputed' || r.dispute_outcome).length,
      composite: wt ? parts.reduce((a, [x, v]) => a + (v == null ? 0 : x * v), 0) / wt : null, components: { volume, quality: qa, rework: reworkScore } });
  }
  return out.sort((a, b) => (b.composite ?? -1) - (a.composite ?? -1));
}
