// Client financial health + the analytic tools around it. Pure functions over enriched claims; no I/O.
import type { Appeal, Recovery } from '../types';
import type { EClaim } from './eclaim';
import { splitDenials } from '../kb';

const r0 = (n: number) => Math.round(n); const r1 = (n: number) => Math.round(n * 10) / 10; const clamp = (n: number) => Math.max(0, Math.min(100, n));
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);

export interface HealthPart { key: string; label: string; weight: number; score: number; value: string; tip: string }
export interface ClientHealth {
  clientId: string; score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F'; parts: HealthPart[]; drivers: HealthPart[];
  openClaims: number; openBalance: number; avgAge: number; pct60: number; pct90: number; pct120: number; dar: number | null;
  denialRate: number; denialBalance: number; recovered30: number; recovered90: number; recoveryTrend: number | null; velocity: number;
  tfAtRisk: number; tfLost: number; underpaid: number; credits: number; touched14: number; untouched: number; topPayer: { payer: string; share: number } | null; hhi: number;
  /** share of claims first seen in the last 90 days that came back denied (open or since resolved) */ firstPass: { n: number; rate: number | null };
  appealWin: { n: number; rate: number | null }; weeks: { week: string; amount: number }[];
}
/** monthlyCharges (optional) turns the age profile into a true Days-in-A/R: AR ÷ (monthly charges ÷ 30). */
export function clientHealth(ecs: EClaim[], recoveries: Recovery[], appeals: Appeal[], clientId: string, today: string, opts: { monthlyCharges?: number | null } = {}): ClientHealth {
  const mine = ecs.filter((x) => x.c.client_id === clientId); const open = mine.filter((x) => x.open); const bal = (xs: EClaim[]) => xs.reduce((a, x) => a + x.c.balance, 0);
  const AR = bal(open); const share = (xs: EClaim[]) => (AR > 0 ? (bal(xs) / AR) * 100 : 0);
  const aged = (n: number) => share(open.filter((x) => (x.age ?? 0) > n));
  const avgAge = AR > 0 ? open.reduce((a, x) => a + (x.age ?? 0) * Math.max(0, x.c.balance), 0) / Math.max(1, open.reduce((a, x) => a + Math.max(0, x.c.balance), 0)) : 0;
  const den = open.filter((x) => splitDenials(x.c.denial_codes).length > 0); const denialRate = open.length ? (den.length / open.length) * 100 : 0;
  const rec = recoveries.filter((r) => r.client_id === clientId); const sumR = (from: string) => rec.filter((r) => r.occurred_on >= from && r.occurred_on <= today).reduce((a, r) => a + r.amount, 0);
  const r30 = sumR(addDays(today, -30)), r90 = sumR(addDays(today, -90)); const prev60 = r90 - r30; const trend = prev60 > 0 ? ((r30 - prev60 / 2) / (prev60 / 2)) * 100 : null;
  const velocity = AR > 0 ? (r30 / (AR + r30)) * 100 : 0;
  const tfAtRisk = bal(open.filter((x) => x.tfLeft != null && x.tfLeft >= 0 && x.tfLeft <= 30)); const tfLost = bal(open.filter((x) => x.tfLeft != null && x.tfLeft < 0));
  const underpaid = open.reduce((a, x) => a + (x.c.expected_amt != null && x.c.paid_amt != null && x.c.expected_amt - x.c.paid_amt > 1 ? x.c.expected_amt - x.c.paid_amt : 0), 0);
  const credits = open.reduce((a, x) => a + (x.c.balance < 0 ? x.c.balance : 0), 0);
  const touched14 = open.length ? (open.filter((x) => x.c.last_touched_at && dayDiff(x.c.last_touched_at, today) <= 14).length / open.length) * 100 : 0; const untouched = open.length ? (open.filter((x) => x.c.touch_count === 0).length / open.length) * 100 : 0;
  const pay = new Map<string, number>(); for (const x of open) pay.set(x.c.payer || 'Unknown', (pay.get(x.c.payer || 'Unknown') || 0) + Math.max(0, x.c.balance)); const tot = [...pay.values()].reduce((a, b) => a + b, 0) || 1;
  const top = [...pay.entries()].sort((a, b) => b[1] - a[1])[0]; const hhi = [...pay.values()].reduce((a, v) => a + (v / tot) ** 2, 0) * 10000;
  const recent = mine.filter((x) => x.c.created_at && dayDiff(x.c.created_at, today) <= 90 && dayDiff(x.c.created_at, today) >= 0); const fpDen = recent.filter((x) => splitDenials(x.c.denial_codes).length > 0 || !!x.c.denial_date).length; const firstPass = { n: recent.length, rate: recent.length >= 20 ? r1((fpDen / recent.length) * 100) : null };
  const ap = appeals.filter((a) => a.client_id === clientId && ['won', 'lost', 'partial'].includes(a.status)); const won = ap.filter((a) => a.status !== 'lost').length;
  const weeks: ClientHealth['weeks'] = []; for (let i = 7; i >= 0; i--) { const to = addDays(today, -i * 7), from = addDays(to, -6); weeks.push({ week: from.slice(5), amount: r0(rec.filter((r) => r.occurred_on >= from && r.occurred_on <= to).reduce((a, r) => a + r.amount, 0)) }); }
  const pct90 = aged(90), tfShare = share(open.filter((x) => x.tfLeft != null && x.tfLeft <= 30)); const topShare = top ? (top[1] / tot) * 100 : 0;
  const parts: HealthPart[] = [
    { key: 'aging', label: 'Aging', weight: 25, score: clamp(100 - pct90 * 2), value: `${r1(pct90)}% over 90 days`, tip: 'Work the oldest high-dollar claims first; anything over 120 days needs an appeal or write-off decision.' },
    { key: 'velocity', label: 'Cash velocity', weight: 20, score: clamp((velocity / 25) * 100), value: `${r1(velocity)}% of A/R collected in 30 days`, tip: 'Push claims that are promised or processed; check for payments received but unposted.' },
    { key: 'denials', label: 'Denials', weight: 15, score: clamp(100 - (firstPass.rate ?? denialRate) * 3.3), value: firstPass.rate != null ? `${firstPass.rate}% first-pass denial (last 90 days, ${firstPass.n} claims)` : `${r1(denialRate)}% of open claims denied`, tip: 'Find the top denial code on the Pareto tool and fix it at the front end.' },
    { key: 'filing', label: 'Filing risk', weight: 15, score: clamp(100 - tfShare * 10), value: `${r1(tfShare)}% of A/R within 30 days of timely filing`, tip: 'Open the Deadline radar and file or appeal the at-risk claims this week.' },
    { key: 'coverage', label: 'Work coverage', weight: 15, score: clamp(touched14), value: `${r1(touched14)}% touched in 14 days · ${r1(untouched)}% never touched`, tip: 'Assign unowned claims and clear the stale queue; check capacity on Intelligence.' },
    { key: 'concentration', label: 'Payer concentration', weight: 10, score: clamp(100 - Math.max(0, topShare - 35) * (100 / 45)), value: top ? `${top[0]} holds ${r1(topShare)}% of A/R` : '—', tip: 'A single slow payer dominates: escalate with a provider rep and review the contract.' },
  ];
  const score = r0(parts.reduce((a, p) => a + p.score * p.weight, 0) / parts.reduce((a, p) => a + p.weight, 0));
  const dar = opts.monthlyCharges && opts.monthlyCharges > 0 ? r1(AR / (opts.monthlyCharges / 30)) : null;
  return { clientId, score, grade: score >= 85 ? 'A' : score >= 72 ? 'B' : score >= 58 ? 'C' : score >= 45 ? 'D' : 'F', parts, drivers: [...parts].sort((a, b) => (100 - b.score) * b.weight - (100 - a.score) * a.weight).filter((p) => p.score < 80).slice(0, 3),
    openClaims: open.length, openBalance: r0(AR), avgAge: r0(avgAge), pct60: r1(aged(60)), pct90: r1(pct90), pct120: r1(aged(120)), dar, denialRate: r1(denialRate), denialBalance: r0(bal(den)), recovered30: r0(r30), recovered90: r0(r90), recoveryTrend: trend == null ? null : r0(trend), velocity: r1(velocity),
    tfAtRisk: r0(tfAtRisk), tfLost: r0(tfLost), underpaid: r0(underpaid), credits: r0(credits), touched14: r1(touched14), untouched: r1(untouched), topPayer: top ? { payer: top[0], share: r1(topShare) } : null, hhi: r0(hhi), firstPass, appealWin: { n: ap.length, rate: ap.length ? r1((won / ap.length) * 100) : null }, weeks };
}

export type ParetoDim = 'code' | 'payer' | 'provider' | 'cpt' | 'client';
/** Where the money is stuck, ranked, with the cumulative share — the "fix these few things" list. */
export function pareto(ecs: EClaim[], dim: ParetoDim, onlyDenied = true) {
  const m = new Map<string, { n: number; balance: number }>();
  for (const x of ecs) { if (!x.open) continue; const codes = splitDenials(x.c.denial_codes); if (onlyDenied && !codes.length) continue;
    const key = dim === 'code' ? codes[0] || 'No code' : dim === 'payer' ? x.c.payer || 'Unknown' : dim === 'provider' ? x.c.provider || 'Unknown' : dim === 'cpt' ? (x.c.cpt || 'Unknown').split(/[,;\s]+/)[0] : x.client?.name || 'Unknown';
    const e = m.get(key) || { n: 0, balance: 0 }; e.n++; e.balance += Math.max(0, x.c.balance); m.set(key, e); }
  const rows = [...m.entries()].sort((a, b) => b[1].balance - a[1].balance); const tot = rows.reduce((a, [, v]) => a + v.balance, 0) || 1; let cum = 0;
  return rows.map(([key, v]) => { cum += v.balance; return { key, n: v.n, balance: r0(v.balance), share: r1((v.balance / tot) * 100), cum: r1((cum / tot) * 100) }; });
}
/** Payer × aging-bucket dollars. */
export function heatmap(ecs: EClaim[], bucketLabels: string[], top = 12) {
  const m = new Map<string, Map<string, number>>(); for (const x of ecs) { if (!x.open || x.c.balance <= 0) continue; const p = x.c.payer || 'Unknown'; const b = x.bucket?.label || 'Unaged'; const r = m.get(p) || new Map(); r.set(b, (r.get(b) || 0) + x.c.balance); m.set(p, r); }
  const rows = [...m.entries()].map(([payer, r]) => ({ payer, cells: bucketLabels.map((b) => r2(r.get(b) || 0)), total: r2([...r.values()].reduce((a, v) => a + v, 0)) })).sort((a, b) => b.total - a.total).slice(0, top);
  return { rows, max: Math.max(1, ...rows.flatMap((r) => r.cells)) };
}
const r2 = (n: number) => Math.round(n);

export interface PursueRow { id: string; claim_no: string; payer: string | null; balance: number; age: number | null; p: number; expected: number; cost: number; net: number; verdict: 'pursue' | 'quick-win' | 'review-write-off'; why: string }
/** Pursue-or-write-off: expected recovery minus the cost of the work, with the timely-filing wall. Cost per touch is yours to set. */
export function pursueRank(ecs: EClaim[], p: (x: EClaim) => number | undefined, o: { costPerTouch: number; touchesDenied: number; touchesOther: number }): PursueRow[] {
  return ecs.filter((x) => x.open && x.c.balance > 0).map((x) => {
    const denied = splitDenials(x.c.denial_codes).length > 0; const prob = p(x) ?? 0.5; const cost = o.costPerTouch * (denied ? o.touchesDenied : o.touchesOther); const exp = x.c.balance * prob; const net = exp - cost;
    const lost = x.tfLeft != null && x.tfLeft < 0 && denied; const verdict: PursueRow['verdict'] = net <= 0 || (lost && prob < 0.25) ? 'review-write-off' : exp > 0 && cost / Math.max(1, exp) < 0.1 && (x.age ?? 0) < 60 ? 'quick-win' : 'pursue';
    return { id: x.c.id, claim_no: x.c.claim_no, payer: x.c.payer, balance: x.c.balance, age: x.age, p: prob, expected: r0(exp), cost: r0(cost), net: r0(net), verdict, why: net <= 0 ? `Expected ${r0(exp)} does not cover ~${r0(cost)} of work` : lost ? 'Timely filing already passed' : `${r0(prob * 100)}% likely to collect` };
  }).sort((a, b) => b.net - a.net);
}

export interface DupeGroup { key: string; claims: { id: string; claim_no: string; balance: number; status: string; client: string }[]; balance: number; why: string }
/** Possible duplicate claims: different claim numbers describing the same service (same account/encounter, date, CPT and charge). */
export function findDupes(ecs: EClaim[]): DupeGroup[] {
  const m = new Map<string, EClaim[]>();
  for (const x of ecs) { if (!x.open) continue; const c = x.c; const who = c.account_id || c.encounter_no; if (!who || !c.dos || !c.cpt) continue; const k = [c.client_id, who, c.dos, (c.cpt || '').replace(/\s/g, ''), Math.round((c.billed_amt || 0) * 100)].join('|'); m.set(k, [...(m.get(k) || []), x]); }
  return [...m.entries()].filter(([, v]) => new Set(v.map((x) => x.c.claim_no)).size > 1).map(([key, v]) => ({ key, claims: v.map((x) => ({ id: x.c.id, claim_no: x.c.claim_no, balance: x.c.balance, status: x.c.status, client: x.client?.name || '' })), balance: r0(v.slice(1).reduce((a, x) => a + x.c.balance, 0)), why: `${v.length} claims share account/encounter, DOS, CPT and charge` })).sort((a, b) => b.balance - a.balance);
}

/** FTEs needed to keep every open claim touched at the desired cadence. */
export function staffing(openClaims: number, o: { touchesPerClaimPerMonth: number; touchesPerDay: number; workdays: number; fteAvailable: number }) {
  const need = openClaims * o.touchesPerClaimPerMonth; const perFte = o.touchesPerDay * o.workdays; const fte = perFte > 0 ? need / perFte : 0;
  return { touchesNeeded: r0(need), perFte: r0(perFte), fteNeeded: r1(fte), gap: r1(fte - o.fteAvailable), coverage: fte > 0 ? r0(Math.min(100, (o.fteAvailable / fte) * 100)) : 100 };
}
