// Smart worklist order. One explainable score from: filing deadlines (TFL/AFL/CCFL tier), expected value, age, follow-up, staleness, payer win-rate
// and the boosts configured on allocation rules. Replaces the old "dollars × age" score; every point is shown to the analyst.
import type { AllocationRule } from '../types';
import type { EClaim } from './eclaim';
import { matches } from './alloc';
import { nearest, type Deadline, type Tier } from './limits';

export interface PriorityCfg {
  weights: { deadline: number; value: number; age: number; followup: number; stale: number; winProb: number };
  tierPoints: Record<Tier, number>;      // 0–1 share of the deadline weight
  valueCap: number;                      // $ at which the value component saturates
  ruleBoostMax: number;
}
export const DEFAULT_PRIORITY_CFG: PriorityCfg = { weights: { deadline: 40, value: 25, age: 15, followup: 10, stale: 5, winProb: 10 }, tierPoints: { expired: 1, critical: 0.9, high: 0.7, warn: 0.45, watch: 0.2, ok: 0 }, valueCap: 5000, ruleBoostMax: 30 };
export const resolvePriorityCfg = (raw?: Partial<PriorityCfg> | null): PriorityCfg => { const r = (raw || {}) as Partial<PriorityCfg>; const d = DEFAULT_PRIORITY_CFG; return { ...d, ...r, weights: { ...d.weights, ...(r.weights || {}) }, tierPoints: { ...d.tierPoints, ...(r.tierPoints || {}) } }; };
export const validatePriorityCfg = (c: PriorityCfg): string[] => { const e: string[] = []; for (const [k, v] of Object.entries(c.weights)) if (!(v >= 0 && v <= 100)) e.push(`Weight “${k}” must be 0–100`); if (!(c.valueCap > 0)) e.push('Value cap must be positive'); return e; };

export interface PriorityPart { key: string; label: string; pts: number }
export interface Priority { score: number; parts: PriorityPart[]; band: 'urgent' | 'high' | 'normal' | 'low'; deadline: Deadline | null }
export interface PriorityCtx { cfg: PriorityCfg; deadlines?: (x: EClaim) => Deadline[]; allocRules?: AllocationRule[]; /** payer → 0–1 chance an appeal / follow-up wins */ winProb?: (payer: string | null) => number | null }
const r1 = (n: number) => Math.round(n * 10) / 10;

export function priorityOf(x: EClaim, ctx: PriorityCtx): Priority {
  const w = ctx.cfg.weights; const parts: PriorityPart[] = []; const c = x.c;
  const dl = ctx.deadlines ? nearest(ctx.deadlines(x)) : null;
  if (dl) { const p = ctx.cfg.tierPoints[dl.tier] * w.deadline; if (p > 0) parts.push({ key: 'deadline', label: `${dl.kind.toUpperCase()} ${dl.left < 0 ? `expired ${-dl.left}d ago` : `${dl.left}d left`}`, pts: p }); }
  else if (x.tfLeft != null && x.tfLeft <= 60) { const f = x.tfLeft < 0 ? 1 : x.tfLeft <= 14 ? 0.8 : x.tfLeft <= 30 ? 0.5 : 0.2; parts.push({ key: 'deadline', label: `timely filing ${x.tfLeft < 0 ? 'passed' : x.tfLeft + 'd left'}`, pts: f * w.deadline }); }
  // what is realistically collectible: never more than the expected reimbursement (the rest of a billed-amount balance is contractual write-off)
  const value = c.expected_amt && c.expected_amt > 0 ? Math.min(Math.max(0, c.balance), c.expected_amt) : Math.max(0, c.balance);
  if (value > 0) parts.push({ key: 'value', label: `$${Math.round(value).toLocaleString('en-US')} at stake`, pts: Math.min(1, Math.log1p(value) / Math.log1p(ctx.cfg.valueCap)) * w.value });
  if (x.age != null && x.age > 0) parts.push({ key: 'age', label: `${x.age} days old`, pts: Math.min(1, x.age / 180) * w.age });
  if (x.fuDue) { const over = c.next_fu ? Math.max(0, Math.round((Date.now() - Date.parse(c.next_fu + 'T12:00:00Z')) / 864e5)) : 0; parts.push({ key: 'followup', label: over > 0 ? `follow-up ${over}d overdue` : 'follow-up due', pts: Math.min(1, 0.6 + over / 20) * w.followup }); }
  if (x.stale) parts.push({ key: 'stale', label: 'no recent touch', pts: w.stale });
  const wp = ctx.winProb?.(c.payer); if (wp != null) parts.push({ key: 'winProb', label: `payer wins ${Math.round(wp * 100)}%`, pts: wp * w.winProb });
  let boost = 0; const names: string[] = [];
  for (const r of ctx.allocRules || []) { const b = Number((r.criteria as any)?.boost || 0); if (!r.active || !b) continue; if (matches(x, r.criteria, r.client_id)) { boost += b; names.push(r.name); } }
  if (boost) parts.push({ key: 'rule', label: `rule “${names[0]}”${names.length > 1 ? ` +${names.length - 1}` : ''}`, pts: Math.max(-ctx.cfg.ruleBoostMax, Math.min(ctx.cfg.ruleBoostMax, boost)) });
  if (c.priority === 'Critical') parts.push({ key: 'manual', label: 'marked Critical', pts: 12 }); else if (c.priority === 'High') parts.push({ key: 'manual', label: 'marked High', pts: 6 });
  if (x.snoozed) parts.push({ key: 'snooze', label: 'snoozed', pts: -30 });
  const score = Math.max(0, r1(parts.reduce((a, p) => a + p.pts, 0)));
  return { score, parts: parts.map((p) => ({ ...p, pts: r1(p.pts) })).sort((a, b) => b.pts - a.pts), band: score >= 75 ? 'urgent' : score >= 55 ? 'high' : score >= 30 ? 'normal' : 'low', deadline: dl };
}
export const BAND_COLOR: Record<Priority['band'], string> = { urgent: '#ef4444', high: '#f97316', normal: '#6366f1', low: '#94a3b8' };
