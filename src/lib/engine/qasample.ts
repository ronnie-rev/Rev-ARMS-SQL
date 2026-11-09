// QA sampling plan: fair, explainable and reproducible. Same inputs + same seed → same sample.
import type { Claim, Profile, QaConfig, QaReview, WorkLog } from '../types';
import { isProducer } from '../roles';

export interface Pick { touch: WorkLog; analyst: Profile; source: 'critical' | 'risk' | 'new_hire' | 'random'; risk: number; reasons: string[]; calibration: boolean }
export interface AnalystPlan { analyst: Profile; eligible: number; rate: number; target: number; forced: number; picked: number; newHire: boolean }
const hash = (s: string) => { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; };
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function isNewHire(p: Profile, today: string, days: number) { if (!p.hire_date) return false; return (new Date(today + 'T12:00:00Z').getTime() - new Date(p.hire_date + 'T12:00:00Z').getTime()) / 864e5 <= days; }

export function planSample(i: { touches: WorkLog[]; reviews: QaReview[]; profiles: Profile[]; claims: Map<string, Claim>; config: QaConfig; riskOf: (w: WorkLog) => { risk: number; reasons: string[] }; from: string; to: string; today: string; seed?: string; only?: string[] }): { picks: Pick[]; plan: AnalystPlan[] } {
  const cfg = i.config; const seen = new Set(i.reviews.map((r) => r.work_log_id)); const picks: Pick[] = []; const plan: AnalystPlan[] = [];
  const analysts = i.profiles.filter((p) => p.active && isProducer(p.role) && (!i.only?.length || i.only.includes(p.id)));
  const weeks = Math.max(1, Math.ceil((new Date(i.to).getTime() - new Date(i.from).getTime() + 864e5) / (7 * 864e5)));
  for (const a of analysts) {
    const mine = i.touches.filter((w) => w.user_id === a.id && w.work_date >= i.from && w.work_date <= i.to && !seen.has(w.id)); const nh = isNewHire(a, i.today, cfg.new_hire_days);
    const rate = (nh ? cfg.new_hire_rate_pct : cfg.sample_rate_pct) / 100; const target = Math.min(mine.length, Math.max(cfg.min_per_analyst_week * weeks, Math.ceil(mine.length * rate)));
    const scored = mine.map((w) => ({ w, ...i.riskOf(w) })); const chosen = new Map<string, Pick>(); const take = (x: { w: WorkLog; risk: number; reasons: string[] }, source: Pick['source']) => { if (!chosen.has(x.w.id)) chosen.set(x.w.id, { touch: x.w, analyst: a, source, risk: x.risk, reasons: x.reasons, calibration: false }); };
    const forced = scored.filter((x) => (x.w.end_action && cfg.force_actions.includes(x.w.end_action)) || (x.w.balance || 0) >= cfg.force_min_balance); forced.forEach((x) => take(x, 'critical'));
    const rest = scored.filter((x) => !chosen.has(x.w.id)); const need = Math.max(0, target - chosen.size); const rand = rng(hash((i.seed || 'qa') + a.id + i.from));
    const byRisk = [...rest].sort((p, q) => q.risk - p.risk || hash(p.w.id) - hash(q.w.id)); const riskSlots = cfg.risk_weighted ? Math.ceil(need / 2) : 0;
    byRisk.slice(0, riskSlots).filter((x) => x.risk > 0).forEach((x) => take(x, nh ? 'new_hire' : 'risk'));
    const pool = rest.filter((x) => !chosen.has(x.w.id)).map((x) => ({ x, k: rand() })).sort((p, q) => p.k - q.k); for (const { x } of pool) { if (chosen.size >= Math.max(target, forced.length)) break; take(x, nh ? 'new_hire' : 'random'); }
    const list = [...chosen.values()]; const calN = Math.round(list.length * (cfg.calibration_pct / 100)); list.sort((p, q) => hash(p.touch.id) - hash(q.touch.id)).slice(0, calN).forEach((c) => (c.calibration = true));
    picks.push(...list); plan.push({ analyst: a, eligible: mine.length, rate, target, forced: forced.length, picked: list.length, newHire: nh });
  }
  return { picks, plan };
}
