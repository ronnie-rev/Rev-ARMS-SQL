// Staffing forecast: project the open-claim backlog and the touches it demands against the team's real capacity, week by week, with what-if levers.
import type { Claim, WorkLog } from '../types';

export interface ForecastIn { claims: Claim[]; workLog: WorkLog[]; people: { daily_target: number }[]; today: string }
export interface ForecastOpts { weeks?: number; touchesPerClaimPerMonth?: number; absencePct?: number; inflowGrowthPct?: number; extraFte?: number; targetOverride?: number; workdays?: number }
export interface ForecastWeek { week: number; label: string; open: number; inflow: number; closed: number; demand: number; capacity: number; utilization: number; fteNeeded: number; gapFte: number }
export interface ForecastResult { base: { openNow: number; inflowPerWeek: number; closedPerWeek: number; touchesPerWeek: number; closuresPerTouch: number; fte: number; targetPerFte: number }; weeks: ForecastWeek[]; peakGapFte: number; breakWeek: number | null; summary: string }
const dd = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);

export function forecastStaffing(i: ForecastIn, o: ForecastOpts = {}): ForecastResult {
  const W = o.weeks ?? 8, cadence = (o.touchesPerClaimPerMonth ?? 1.5) / 4.33, absence = (o.absencePct ?? 10) / 100, growth = (o.inflowGrowthPct ?? 0) / 100, wd = o.workdays ?? 5;
  const open = i.claims.filter((c) => !c.closed_at).length; const lookback = 8;
  const inflow = i.claims.filter((c) => c.created_at && dd(c.created_at, i.today) >= 0 && dd(c.created_at, i.today) < lookback * 7).length / lookback;
  const closed = i.claims.filter((c) => c.closed_at && dd(c.closed_at, i.today) >= 0 && dd(c.closed_at, i.today) < lookback * 7).length / lookback;
  const touches = i.workLog.filter((w) => dd(w.work_date, i.today) >= 0 && dd(w.work_date, i.today) < lookback * 7).length / lookback; const cpt = touches > 0 ? Math.min(1, closed / touches) : 0.25;
  const fte = i.people.length + (o.extraFte ?? 0); const avgTarget = o.targetOverride ?? (i.people.length ? i.people.reduce((a, p) => a + (p.daily_target || 40), 0) / i.people.length : 40);
  const capacity = Math.round(fte * avgTarget * wd * (1 - absence)); const perFte = avgTarget * wd * (1 - absence);
  const weeks: ForecastWeek[] = []; let cur = open; let peak = -Infinity; let breakWeek: number | null = null; const t0 = Date.parse(i.today + 'T12:00:00Z');
  for (let k = 1; k <= W; k++) {
    const inf = inflow * Math.pow(1 + growth, k); const demand = cur * cadence; const done = Math.min(capacity, demand); const clo = Math.max(0, done * cpt * (demand ? 1 : 0)); const util = capacity ? demand / capacity : 0;
    const need = perFte ? demand / perFte : 0; const gap = need - fte; if (gap > peak) peak = gap; if (breakWeek == null && util > 1.05) breakWeek = k;
    weeks.push({ week: k, label: new Date(t0 + k * 7 * 864e5).toISOString().slice(5, 10), open: Math.round(cur), inflow: Math.round(inf), closed: Math.round(clo), demand: Math.round(demand), capacity, utilization: Math.round(util * 100) / 100, fteNeeded: Math.round(need * 10) / 10, gapFte: Math.round(gap * 10) / 10 });
    cur = Math.max(0, cur + inf - clo);
  }
  const last = weeks[weeks.length - 1]; const summary = breakWeek ? `At this pace demand passes capacity in week ${breakWeek}; by week ${W} you need about ${last.fteNeeded} people (you have ${fte}).` : `Capacity holds for ${W} weeks (peak need ${Math.max(...weeks.map((w) => w.fteNeeded))} of ${fte} people).`;
  return { base: { openNow: open, inflowPerWeek: Math.round(inflow), closedPerWeek: Math.round(closed), touchesPerWeek: Math.round(touches), closuresPerTouch: Math.round(cpt * 100) / 100, fte, targetPerFte: Math.round(perFte) }, weeks, peakGapFte: Math.round(Math.max(0, peak) * 10) / 10, breakWeek, summary };
}
