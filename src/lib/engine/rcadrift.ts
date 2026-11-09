// Root-cause drift: is the MIX of reasons we record for a payer changing? Compares the last `recentDays` of touches with the `baselineDays` before them and tests whether a shift is real (two-proportion z-test) rather than noise.
import type { WorkLog } from '../types';

export interface DriftRow { rca: string; recentN: number; baseN: number; recentShare: number; baseShare: number; deltaPP: number; z: number; significant: boolean; direction: 'up' | 'down' | 'steady' }
export interface DriftResult { payer: string; recentTotal: number; baseTotal: number; rows: DriftRow[]; headline: string | null }
const dd = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);

function zTest(x1: number, n1: number, x2: number, n2: number): number {
  if (!n1 || !n2) return 0; const p1 = x1 / n1, p2 = x2 / n2, p = (x1 + x2) / (n1 + n2); const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)); return se ? (p1 - p2) / se : 0;
}
/** Drift for one payer ('' = every payer). payerOf maps claim → payer. */
export function rcaDrift(log: WorkLog[], payerOf: (claimId: string) => string | null, today: string, o: { payer?: string; recentDays?: number; baselineDays?: number; minRecent?: number } = {}): DriftResult {
  const R = o.recentDays ?? 30, B = o.baselineDays ?? 90, minRecent = o.minRecent ?? 8;
  const rel = log.filter((w) => w.rca && (!o.payer || (payerOf(w.claim_id) || 'Unknown') === o.payer)); const recent = rel.filter((w) => { const a = dd(w.work_date, today); return a >= 0 && a < R; }); const base = rel.filter((w) => { const a = dd(w.work_date, today); return a >= R && a < R + B; });
  const count = (xs: WorkLog[]) => { const m = new Map<string, number>(); for (const w of xs) m.set(w.rca!, (m.get(w.rca!) || 0) + 1); return m; }; const rc = count(recent), bc = count(base);
  const rows: DriftRow[] = [...new Set([...rc.keys(), ...bc.keys()])].map((rca) => { const rn = rc.get(rca) || 0, bn = bc.get(rca) || 0; const rs = recent.length ? rn / recent.length : 0, bs = base.length ? bn / base.length : 0; const z = zTest(rn, recent.length, bn, base.length); const sig = recent.length >= minRecent && base.length >= minRecent * 2 && Math.abs(z) >= 1.96 && Math.abs(rs - bs) >= 0.04; return { rca, recentN: rn, baseN: bn, recentShare: rs, baseShare: bs, deltaPP: Math.round((rs - bs) * 1000) / 10, z: Math.round(z * 100) / 100, significant: sig, direction: (sig ? (rs > bs ? 'up' : 'down') : 'steady') as DriftRow['direction'] }; }).sort((a, b) => Math.abs(b.deltaPP) - Math.abs(a.deltaPP));
  const top = rows.find((r) => r.significant && r.direction === 'up');
  return { payer: o.payer || 'All payers', recentTotal: recent.length, baseTotal: base.length, rows, headline: top ? `“${top.rca}” rose from ${Math.round(top.baseShare * 100)}% to ${Math.round(top.recentShare * 100)}% of touches (${top.deltaPP > 0 ? '+' : ''}${top.deltaPP} pts).` : null };
}
/** Payers ranked by how much their reason mix moved (only payers with enough touches). */
export function driftLeaders(log: WorkLog[], payerOf: (claimId: string) => string | null, today: string, o: { recentDays?: number; baselineDays?: number; minRecent?: number } = {}, limit = 10): DriftResult[] {
  const payers = [...new Set(log.map((w) => payerOf(w.claim_id) || 'Unknown'))];
  return payers.map((p) => rcaDrift(log, payerOf, today, { ...o, payer: p })).filter((r) => r.rows.some((x) => x.significant)).sort((a, b) => Math.max(...b.rows.filter((x) => x.significant).map((x) => Math.abs(x.deltaPP))) - Math.max(...a.rows.filter((x) => x.significant).map((x) => Math.abs(x.deltaPP)))).slice(0, limit);
}
/** Weekly share of each of the top reasons for the chart (oldest first). */
export function rcaWeekly(log: WorkLog[], payerOf: (claimId: string) => string | null, today: string, payer: string, weeks = 12, topN = 5) {
  const rel = log.filter((w) => w.rca && (!payer || (payerOf(w.claim_id) || 'Unknown') === payer)); const tot = new Map<string, number>(); for (const w of rel) tot.set(w.rca!, (tot.get(w.rca!) || 0) + 1);
  const top = [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([k]) => k); const buckets = Array.from({ length: weeks }, () => ({ n: 0, by: new Map<string, number>() }));
  for (const w of rel) { const a = dd(w.work_date, today); if (a < 0 || a >= weeks * 7) continue; const b = buckets[weeks - 1 - Math.floor(a / 7)]; b.n++; b.by.set(w.rca!, (b.by.get(w.rca!) || 0) + 1); }
  const t0 = Date.parse(today + 'T12:00:00Z'); return { labels: buckets.map((_, i) => new Date(t0 - (weeks - 1 - i) * 7 * 864e5).toISOString().slice(5, 10)), series: top.map((rca) => ({ rca, data: buckets.map((b) => (b.n ? Math.round(((b.by.get(rca) || 0) / b.n) * 1000) / 10 : null)) })) };
}
