// Collectability curve: how likely is an open claim to resolve in the next 30 days, given how long it has already been open — learned from this workspace's own closed claims.
import type { EClaim } from './eclaim';

export interface CurveBucket { label: string; from: number; to: number; open: number; balance: number; closedHere: number; p30: number | null; yield: number; expected30: number; writeoffRisk: boolean; confidence: 'high' | 'low' }
const EDGES = [0, 30, 60, 90, 120, 180, 270, 365, 100000]; const label = (a: number, b: number) => (b >= 100000 ? `${a}+ days` : `${a}–${b}`);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);

/** Survival-style estimate. At-risk = claims that were open at the start of the bucket (closed later or still open); events = those that closed inside the next 30 days. */
export function collectabilityCurve(ecs: EClaim[]): { buckets: CurveBucket[]; closedSample: number; overallYield: number; expected30: number } {
  const ages: { age: number; closedAge: number | null; balance: number; paid: number; billed: number }[] = [];
  for (const x of ecs) { const c = x.c; const base = c.last_billed || c.dos || c.created_at; if (!base) continue; if (c.closed_at) { const a = dayDiff(base, c.closed_at); if (a >= 0) ages.push({ age: a, closedAge: a, balance: 0, paid: c.paid_amt || 0, billed: c.billed_amt || 0 }); } else if (x.open && x.age != null && x.age >= 0) ages.push({ age: x.age, closedAge: null, balance: Math.max(0, c.balance), paid: 0, billed: c.billed_amt || 0 }); }
  const closed = ages.filter((a) => a.closedAge != null); const paidRows = closed.filter((a) => a.paid > 0 && a.billed > 0); const overallYield = paidRows.length >= 10 ? Math.min(1, paidRows.reduce((s, a) => s + a.paid, 0) / paidRows.reduce((s, a) => s + a.billed, 0)) : 0.55;
  const buckets: CurveBucket[] = []; let total = 0;
  for (let i = 0; i < EDGES.length - 1; i++) {
    const from = EDGES[i], to = EDGES[i + 1]; const openHere = ages.filter((a) => a.closedAge == null && a.age >= from && a.age < to); const atRisk = ages.filter((a) => (a.closedAge != null ? a.closedAge >= from : a.age >= from)); const ev = closed.filter((a) => a.closedAge! >= from && a.closedAge! < from + 30); const p30 = atRisk.length >= 8 ? Math.min(1, ev.length / atRisk.length) : null; const bal = openHere.reduce((s, a) => s + a.balance, 0); const y = (() => { const pr = closed.filter((a) => a.closedAge! >= from && a.closedAge! < to + 90 && a.paid > 0 && a.billed > 0); return pr.length >= 6 ? Math.min(1, pr.reduce((s, a) => s + a.paid, 0) / pr.reduce((s, a) => s + a.billed, 0)) : overallYield; })();
    const exp = p30 == null ? 0 : bal * p30 * y; total += exp; buckets.push({ label: label(from, to), from, to, open: openHere.length, balance: Math.round(bal), closedHere: ev.length, p30: p30 == null ? null : Math.round(p30 * 100), yield: Math.round(y * 100), expected30: Math.round(exp), writeoffRisk: p30 != null && p30 < 0.05 && from >= 180, confidence: atRisk.length >= 30 ? 'high' : 'low' });
  }
  return { buckets: buckets.filter((b) => b.open > 0 || b.closedHere > 0), closedSample: closed.length, overallYield: Math.round(overallYield * 100), expected30: Math.round(total) };
}
