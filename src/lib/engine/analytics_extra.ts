import type { EClaim } from './eclaim';
import type { ImportBatch } from '../types';
import { ageCurve } from '../analytics';
import { sum, type Bucket } from '../utils';
import type { Collectability } from '../analytics';

/** If nothing is worked: where does the inventory sit in 30/60/90 days, and what is still collectable? Pure ageing + decay. */
export function rollForward(open: EClaim[], buckets: Bucket[], col: Map<string, Collectability>, horizons = [30, 60, 90]) {
  const label = (age: number) => (buckets.find((b) => age >= b.min && (b.max == null || age <= b.max)) || buckets[buckets.length - 1])?.label;
  return horizons.map((h) => {
    const b: Record<string, { n: number; v: number }> = {}; let exp = 0;
    for (const x of open) { const age = (x.age ?? 0) + h; const k = label(age) || '?'; b[k] = b[k] || { n: 0, v: 0 }; b[k].n++; b[k].v += x.c.balance; const base = ageCurve(x.age ?? 0) || 0.01; exp += (col.get(x.c.id)?.p ?? 0.3) * x.c.balance * Math.min(1, ageCurve(age) / base); }
    return { h, buckets: b, expected: exp, over180: sum(Object.entries(b).filter(([k]) => buckets.find((x) => x.label === k && x.min >= 181)).map(([, v]) => v.v)) };
  });
}

export interface Health { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F'; parts: { label: string; value: string; pts: number; max: number }[] }
/** 0–100 client health: aging mix, timely-filing exposure, work coverage, ownership, resolution momentum. */
export function clientHealth(open: EClaim[], batches: ImportBatch[]): Health {
  const tot = sum(open.map((x) => x.c.balance)) || 1; const n = open.length || 1;
  const over120 = sum(open.filter((x) => (x.age ?? 0) > 120).map((x) => x.c.balance)) / tot;
  const tf = sum(open.filter((x) => x.tfLeft != null && x.tfLeft <= 30).map((x) => x.c.balance)) / tot;
  const worked = open.filter((x) => x.c.touch_count > 0).length / n; const owned = open.filter((x) => x.c.assigned_to).length / n;
  const snaps = batches.filter((b) => b.summary?.total).sort((a, b) => a.created_at.localeCompare(b.created_at)); const a = snaps[snaps.length - 2]?.summary?.total, z = snaps[snaps.length - 1]?.summary?.total;
  const trend = a && z ? (z - a) / a : 0;
  const parts = [
    { label: 'Aging mix (>120d)', value: `${Math.round(over120 * 100)}%`, pts: Math.round(35 * (1 - Math.min(1, over120 / 0.6))), max: 35 },
    { label: 'Timely-filing exposure', value: `${Math.round(tf * 100)}%`, pts: Math.round(15 * (1 - Math.min(1, tf / 0.15))), max: 15 },
    { label: 'Work coverage', value: `${Math.round(worked * 100)}%`, pts: Math.round(20 * worked), max: 20 },
    { label: 'Ownership', value: `${Math.round(owned * 100)}%`, pts: Math.round(10 * owned), max: 10 },
    { label: 'AR momentum', value: `${trend >= 0 ? '+' : ''}${(trend * 100).toFixed(1)}%`, pts: Math.round(20 * (trend <= -0.05 ? 1 : trend >= 0.1 ? 0 : 1 - (trend + 0.05) / 0.15)), max: 20 },
  ];
  const score = Math.max(0, Math.min(100, parts.reduce((s, p) => s + p.pts, 0)));
  return { score, grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F', parts };
}
