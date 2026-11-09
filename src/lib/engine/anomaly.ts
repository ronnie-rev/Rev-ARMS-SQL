// "What changed this week": compares the last 7 days with the previous 8 weeks (simple-statistics, ISC) and reports only movements that are both statistically unusual and big enough to matter.
import { mean, standardDeviation } from 'simple-statistics';
import type { Claim, Recovery, WorkLog } from '../types';

export interface Anomaly { id: string; label: string; current: number; baseline: number; z: number; change: number; direction: 'up' | 'down'; good: boolean; unit: 'count' | 'money'; detail: string }
const day = (iso: string, n: number) => new Date(Date.parse(iso.slice(0, 10) + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const BENIGN = /^(CO-?45|CO-?253|PR-?\d+|OA-?23)$/i;
/** [0] = the last 7 days (excluding today), then each earlier week. */
const windows = (today: string, weeks: number) => Array.from({ length: weeks + 1 }, (_, k) => ({ from: day(today, -7 * (k + 1)), to: day(today, -7 * k - 1) }));

function detect(id: string, label: string, series: number[], o: { unit: Anomaly['unit']; goodWhenUp: boolean; minBase: number; detail: (cur: number, base: number) => string; zMin?: number; relMin?: number }): Anomaly | null {
  const cur = series[0]; const hist = series.slice(1); if (hist.length < 4) return null; const m = mean(hist); if (m < o.minBase) return null;
  const sd = standardDeviation(hist); const floor = Math.max(sd, m * 0.1, 1); const z = (cur - m) / floor; const rel = (cur - m) / m;
  if (Math.abs(z) < (o.zMin ?? 1.8) || Math.abs(rel) < (o.relMin ?? 0.2)) return null; const up = cur > m;
  return { id, label, current: Math.round(cur * 100) / 100, baseline: Math.round(m * 100) / 100, z: Math.round(z * 10) / 10, change: Math.round(rel * 100), direction: up ? 'up' : 'down', good: up === o.goodWhenUp, unit: o.unit, detail: o.detail(cur, m) };
}
export function weeklyAnomalies(i: { workLog: WorkLog[]; recoveries: Recovery[]; claims: Claim[]; today: string; weeks?: number }): Anomaly[] {
  const W = windows(i.today, i.weeks ?? 8); const out: Anomaly[] = []; const inW = (d: string | null | undefined, w: { from: string; to: string }) => !!d && d.slice(0, 10) >= w.from && d.slice(0, 10) <= w.to; const $ = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
  const touches = W.map((w) => i.workLog.filter((x) => inW(x.work_date, w)).length); const t = detect('touches', 'Touches logged', touches, { unit: 'count', goodWhenUp: true, minBase: 20, detail: (c, b) => `${c} touches in the last 7 days vs ${Math.round(b)} a week on average` }); if (t) out.push(t);
  const rec = W.map((w) => i.recoveries.filter((x) => inW(x.occurred_on, w)).reduce((s, x) => s + x.amount, 0)); const r = detect('recovered', 'Cash recovered', rec, { unit: 'money', goodWhenUp: true, minBase: 500, detail: (c, b) => `${$(c)} in the last 7 days vs ${$(b)} a week on average` }); if (r) out.push(r);
  const den = i.claims.filter((c) => (c as any).denial_date && (c.denial_codes || '').split(/[,;\s]+/).filter(Boolean).some((k) => !BENIGN.test(k)));
  const dn = W.map((w) => den.filter((c) => inW((c as any).denial_date, w)).length); const d = detect('denials', 'New denials', dn, { unit: 'count', goodWhenUp: false, minBase: 5, detail: (c, b) => `${c} new denials in the last 7 days vs ${Math.round(b)} a week on average` }); if (d) out.push(d);
  const payers = new Map<string, Claim[]>(); for (const c of den) payers.set(c.payer || 'Unknown', [...(payers.get(c.payer || 'Unknown') || []), c]);
  for (const [p, cs] of payers) { const s = W.map((w) => cs.filter((c) => inW((c as any).denial_date, w)).length); const a = detect('denials:' + p, `${p} denials`, s, { unit: 'count', goodWhenUp: false, minBase: 2, zMin: 2, relMin: 0.5, detail: (c, b) => `${p}: ${c} new denials in the last 7 days vs ${Math.round(b * 10) / 10} a week on average` }); if (a) out.push(a); }
  return out.sort((a, b) => Number(a.good) - Number(b.good) || Math.abs(b.z) - Math.abs(a.z)).slice(0, 6);
}
