// Reads a compiled pivot and says what matters in it: where the money concentrates, which rows are outliers, how long the tail is, and which dimension to drill into next.
import { mean, standardDeviation } from 'simple-statistics';
import type { Matrix, PNode, PRow } from './pivot';

export interface PivotFinding { kind: 'pareto' | 'concentration' | 'outlier' | 'tail' | 'drill'; text: string; strength: number; drillField?: string }
export interface PivotInsightOpts { measureLabel: string; additive: boolean; fmt: (v: number) => string; drillFields: { key: string; label: string }[]; usedFields: string[] }

const share = (rows: PRow[], f: string) => { const m = new Map<string, number>(); for (const r of rows) { const k = String(r[f] ?? '—'); m.set(k, (m.get(k) || 0) + 1); } const n = rows.length || 1; const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0]; return { distinct: m.size, topKey: top?.[0] || '—', topShare: top ? top[1] / n : 0 }; };

export function pivotInsights(m: Matrix, o: PivotInsightOpts): PivotFinding[] {
  const out: PivotFinding[] = []; const nodes: PNode[] = m.tree.filter((n) => Number.isFinite(n.total[0])); if (nodes.length < 3) return out; const vals = nodes.map((n) => n.total[0]); const total = vals.reduce((a, b) => a + b, 0);
  const sorted = [...nodes].sort((a, b) => b.total[0] - a.total[0]); const rowName = m.rowFields[0] || 'row';
  if (o.additive && total > 0) {
    const topShare = sorted[0].total[0] / total; if (topShare >= 0.4) out.push({ kind: 'concentration', strength: topShare, text: `${sorted[0].label} alone is ${Math.round(topShare * 100)}% of ${o.measureLabel.toLowerCase()} (${o.fmt(sorted[0].total[0])}) — a single ${rowName.replace(/_/g, ' ')} drives the result.` });
    let acc = 0, k = 0; for (const n of sorted) { acc += n.total[0]; k++; if (acc / total >= 0.8) break; } if (nodes.length >= 6 && k <= Math.ceil(nodes.length * 0.3)) out.push({ kind: 'pareto', strength: 1 - k / nodes.length, text: `${k} of ${nodes.length} rows (${sorted.slice(0, Math.min(k, 3)).map((n) => n.label).join(', ')}${k > 3 ? '…' : ''}) make up 80% of ${o.measureLabel.toLowerCase()}.` });
    const tiny = nodes.filter((n) => n.total[0] / total < 0.01).length; if (tiny >= 5 && tiny >= nodes.length * 0.4) out.push({ kind: 'tail', strength: tiny / nodes.length, text: `${tiny} of ${nodes.length} rows are each under 1% — a long tail that is probably not worth working one by one.` });
  }
  if (nodes.length >= 6) { const mu = mean(vals), sd = standardDeviation(vals); if (sd > 0) for (const n of nodes) { const z = (n.total[0] - mu) / sd; if (Math.abs(z) >= 2) out.push({ kind: 'outlier', strength: Math.min(1, Math.abs(z) / 4), text: `${n.label} is unusually ${z > 0 ? 'high' : 'low'} on ${o.measureLabel.toLowerCase()} (${o.fmt(n.total[0])} vs a typical ${o.fmt(mu)}).` }); } }
  const lead = sorted[0]; if (lead.rows.length >= 20) { const cands = o.drillFields.filter((f) => !o.usedFields.includes(f.key)).map((f) => ({ f, ...share(lead.rows, f.key) })).filter((c) => c.distinct >= 2 && c.distinct <= 40 && c.topKey !== '—' && c.topShare >= 0.45 && c.topShare < 0.98).sort((a, b) => b.topShare - a.topShare);
    if (cands[0]) out.push({ kind: 'drill', strength: cands[0].topShare, drillField: cands[0].f.key, text: `Drill into ${lead.label} by ${cands[0].f.label}: ${Math.round(cands[0].topShare * 100)}% of it sits in “${cands[0].topKey}”.` }); }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 5);
}
