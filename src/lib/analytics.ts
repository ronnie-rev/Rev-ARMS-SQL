// Transparent, explainable analytics. No black boxes: every score lists its factors, and the
// "learning" parts (payer resolution rates, next-best-action) are plain frequency statistics over your own history.
import type { EClaim } from './engine/eclaim';
import type { Activity, BatchSummary, Claim, ConfigOption, ImportBatch, WorkLog } from './types';
import { money, moneyShort, sum, todayISO } from './utils';

const ANCHORS: [number, number][] = [[0, 0.9], [30, 0.85], [60, 0.75], [90, 0.62], [120, 0.5], [150, 0.42], [180, 0.34], [270, 0.22], [365, 0.14], [540, 0.07]];
export function ageCurve(age: number): number {
  if (age <= 0) return ANCHORS[0][1];
  for (let i = 1; i < ANCHORS.length; i++) {
    const [x1, y1] = ANCHORS[i];
    if (age <= x1) { const [x0, y0] = ANCHORS[i - 1]; return y0 + ((y1 - y0) * (age - x0)) / (x1 - x0); }
  }
  return ANCHORS[ANCHORS.length - 1][1];
}

export interface Factor { label: string; effect: 'up' | 'down' | 'flat' }
export interface Collectability { p: number; expected: number; factors: Factor[] }
export interface Rec { action: string; sub?: string | null; rate: number; n: number; scope: 'payer' | 'root cause' | 'category' }

export interface Intel {
  rcaWeight: Map<string, number>;
  payerRate: Map<string, number>; globalRate: number;
  nba: Map<string, { n: number; s: number }>;
  rcaByPayer: Map<string, Map<string, number>>;
  minSupport: number;
}

const isWin = (c: Claim, terminal: Set<string>, reduced: Set<string>) => !!c.closed_at || terminal.has(c.status) || reduced.has(c.id);

export function buildIntel(claims: Claim[], workLog: WorkLog[], activity: Activity[], config: ConfigOption[], minSupport = 3): Intel {
  const terminal = new Set(config.filter((o) => o.category === 'status' && o.meta.terminal).map((o) => o.value));
  const reduced = new Set(activity.filter((a) => a.kind === 'balance' && /decreased/.test(a.summary)).map((a) => a.claim_id));
  const rcaWeight = new Map(config.filter((o) => o.category === 'rca').map((o) => [o.value, Number(o.meta.weight ?? 1)]));
  const byPayer = new Map<string, { w: number; t: number }>();
  let gw = 0;
  const win = new Map<string, boolean>();
  for (const c of claims) {
    const w = isWin(c, terminal, reduced); win.set(c.id, w);
    const k = (c.payer || 'Unknown').toLowerCase(); const e = byPayer.get(k) || { w: 0, t: 0 }; e.t++; if (w) e.w++; byPayer.set(k, e); if (w) gw++;
  }
  const globalRate = claims.length ? gw / claims.length : 0.3;
  const payerRate = new Map<string, number>();
  byPayer.forEach((v, k) => payerRate.set(k, (v.w + globalRate * 8) / (v.t + 8))); // shrink toward global
  const cm = new Map(claims.map((c) => [c.id, c]));
  const nba = new Map<string, { n: number; s: number }>();
  const rcaByPayer = new Map<string, Map<string, number>>();
  const bump = (k: string, s: boolean) => { const e = nba.get(k) || { n: 0, s: 0 }; e.n++; if (s) e.s++; nba.set(k, e); };
  const seen = new Set<string>();
  for (const w of workLog) {
    if (!w.end_action || !w.rca_detail) continue;
    const c = cm.get(w.claim_id); if (!c) continue;
    const p = (c.payer || 'Unknown').toLowerCase(); const s = win.get(c.id) || false;
    const dedupe = `${w.claim_id}|${w.end_action}|${w.rca_detail}`; if (seen.has(dedupe)) continue; seen.add(dedupe);
    bump(`p|${p}|${w.rca_detail}|${w.end_action}`, s); bump(`r|${w.rca_detail}|${w.end_action}`, s); bump(`c|${w.rca}|${w.end_action}`, s);
    const m = rcaByPayer.get(p) || new Map<string, number>(); m.set(w.rca_detail, (m.get(w.rca_detail) || 0) + 1); rcaByPayer.set(p, m);
  }
  return { rcaWeight, payerRate, globalRate, nba, rcaByPayer, minSupport };
}

export function collectability(x: EClaim, intel: Intel): Collectability {
  const c = x.c; const f: Factor[] = [];
  const age = x.age ?? 90;
  let p = ageCurve(age);
  f.push({ label: `Age ${age}d → base ${Math.round(p * 100)}%`, effect: age > 180 ? 'down' : age < 60 ? 'up' : 'flat' });
  if (c.rca) { const w = intel.rcaWeight.get(c.rca) ?? 1; if (w !== 1) { p *= w; f.push({ label: `Root cause “${c.rca}” ×${w}`, effect: w > 1 ? 'up' : 'down' }); } }
  const pr = intel.payerRate.get((c.payer || 'Unknown').toLowerCase());
  if (pr != null && intel.globalRate > 0) {
    const pf = Math.min(1.35, Math.max(0.7, pr / intel.globalRate));
    if (Math.abs(pf - 1) > 0.05) { p *= pf; f.push({ label: `${c.payer} resolves ${Math.round(pr * 100)}% of claims (avg ${Math.round(intel.globalRate * 100)}%) ×${pf.toFixed(2)}`, effect: pf > 1 ? 'up' : 'down' }); }
  }
  if (x.tfLeft != null) {
    if (x.tfLeft <= 0) { p *= 0.3; f.push({ label: 'Timely-filing window passed ×0.30', effect: 'down' }); }
    else if (x.tfLeft <= 30) f.push({ label: `Only ${x.tfLeft}d of timely filing left — act now`, effect: 'down' });
  }
  if (c.balance < c.billed_amt * 0.9 && c.billed_amt > 0) { p *= 1.1; f.push({ label: 'Partially paid already ×1.10', effect: 'up' }); }
  if (c.touch_count >= 6) { p *= 0.8; f.push({ label: `${c.touch_count} touches without resolution ×0.80`, effect: 'down' }); }
  else if (c.touch_count === 0 && age < 45) { p *= 1.05; f.push({ label: 'Fresh and unworked ×1.05', effect: 'up' }); }
  p = Math.min(0.97, Math.max(0.02, p));
  return { p, expected: p * c.balance, factors: f };
}

export function recommend(c: Claim, intel: Intel): Rec[] {
  if (!c.rca_detail) return [];
  const pay = (c.payer || 'Unknown').toLowerCase();
  const out = new Map<string, Rec>();
  const scan = (prefix: string, scope: Rec['scope'], min: number) => {
    intel.nba.forEach((v, k) => {
      if (!k.startsWith(prefix) || v.n < min) return;
      const action = k.slice(prefix.length); const rate = (v.s + 1) / (v.n + 2);
      const cur = out.get(action);
      if (!cur || (scope === 'payer' && cur.scope !== 'payer')) out.set(action, { action, rate, n: v.n, scope });
    });
  };
  scan(`r|${c.rca_detail}|`, 'root cause', intel.minSupport);
  scan(`p|${pay}|${c.rca_detail}|`, 'payer', intel.minSupport);
  if (!out.size && c.rca) scan(`c|${c.rca}|`, 'category', intel.minSupport);
  return [...out.values()].sort((a, b) => b.rate - a.rate || b.n - a.n).slice(0, 3);
}
export function likelyRootCauses(payer: string | null, intel: Intel): string[] {
  const m = intel.rcaByPayer.get((payer || 'Unknown').toLowerCase()); if (!m) return [];
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
}

// ───────── aggregates ─────────
export interface PayerStat {
  payer: string; n: number; balance: number; avgAge: number; over120: number; expected: number; p: number; resolveRate: number; denialShare: number;
  tfRisk: number; avgTouches: number; topRca: [string, number][]; untouched: number; unassigned: number;
}
export function payerStats(ecs: EClaim[], all: Claim[], intel: Intel): PayerStat[] {
  const open = ecs.filter((x) => x.open);
  const g = new Map<string, EClaim[]>(); open.forEach((x) => { const k = x.c.payer || 'Unknown'; g.set(k, [...(g.get(k) || []), x]); });
  return [...g].map(([payer, l]) => {
    const bal = sum(l.map((x) => x.c.balance)); const exp = sum(l.map((x) => collectability(x, intel).expected));
    const rc = new Map<string, number>(); l.forEach((x) => x.c.rca && rc.set(x.c.rca, (rc.get(x.c.rca) || 0) + 1));
    const allP = all.filter((c) => (c.payer || 'Unknown') === payer);
    return {
      payer, n: l.length, balance: bal, avgAge: Math.round(sum(l.map((x) => x.age ?? 0)) / l.length), over120: sum(l.filter((x) => (x.age ?? 0) > 120).map((x) => x.c.balance)),
      expected: exp, p: bal ? exp / bal : 0, resolveRate: intel.payerRate.get(payer.toLowerCase()) ?? 0, denialShare: l.filter((x) => x.c.denial_codes).length / l.length,
      tfRisk: sum(l.filter((x) => x.tfLeft != null && x.tfLeft <= 30).map((x) => x.c.balance)), avgTouches: allP.length ? sum(allP.map((c) => c.touch_count)) / allP.length : 0,
      topRca: [...rc].sort((a, b) => b[1] - a[1]).slice(0, 4), untouched: l.filter((x) => x.c.touch_count === 0).length, unassigned: l.filter((x) => !x.c.assigned_to).length,
    };
  }).sort((a, b) => b.balance - a.balance);
}

export function forecast(ecs: EClaim[], intel: Intel, curve: number[] = [0.35, 0.35, 0.3]) {
  const open = ecs.filter((x) => x.open);
  const exp = sum(open.map((x) => collectability(x, intel).expected));
  const bal = sum(open.map((x) => x.c.balance));
  return { expected: exp, balance: bal, rate: bal ? exp / bal : 0, d30: exp * curve[0], d60: exp * (curve[0] + curve[1]), d90: exp, writeoffRisk: bal - exp };
}

export function snapshot(ecs: EClaim[]): BatchSummary {
  const open = ecs.filter((x) => x.open); const buckets: Record<string, { n: number; v: number }> = {}; const payers: Record<string, number> = {};
  open.forEach((x) => { const b = x.bucket?.label || '?'; buckets[b] = buckets[b] || { n: 0, v: 0 }; buckets[b].n++; buckets[b].v += x.c.balance; const p = x.c.payer || 'Unknown'; payers[p] = (payers[p] || 0) + x.c.balance; });
  return { buckets, payers, total: sum(open.map((x) => x.c.balance)), count: open.length };
}

// ───────── insights ─────────
export interface Insight { id: string; sev: 'high' | 'med' | 'info' | 'good'; title: string; body: string; to?: string; value?: string }
export interface InsightCtx { ecs: EClaim[]; workLog: WorkLog[]; batches: ImportBatch[]; intel: Intel; staff: { id: string; name: string; target: number }[]; payers: PayerStat[]; scope?: string }

export function buildInsights(ctx: InsightCtx): Insight[] {
  const { ecs, workLog, batches, intel, staff, payers } = ctx; const out: Insight[] = [];
  const open = ecs.filter((x) => x.open); if (!open.length) return out;
  const total = sum(open.map((x) => x.c.balance)); const sc = ctx.scope ? `&client=${ctx.scope}` : '';

  const tf = open.filter((x) => x.tfLeft != null && x.tfLeft > 0 && x.tfLeft <= 30);
  if (tf.length) out.push({ id: 'tf', sev: 'high', title: `${tf.length} claims hit timely filing within 30 days`, body: `${money(sum(tf.map((x) => x.c.balance)))} will become unrecoverable unless worked first. ${tf.filter((x) => !x.c.assigned_to).length} are unassigned.`, to: `/worklist?view=tf${sc}`, value: moneyShort(sum(tf.map((x) => x.c.balance))) });

  const aged = payers.filter((p) => p.over120 > 0).sort((a, b) => b.over120 - a.over120);
  const totAged = sum(aged.map((p) => p.over120));
  if (aged[0] && totAged && aged[0].over120 / totAged > 0.25) out.push({ id: 'conc', sev: 'med', title: `${aged[0].payer} is ${Math.round((aged[0].over120 / totAged) * 100)}% of all 120+ day AR`, body: `${moneyShort(aged[0].over120)} aged over 120 days. Top root causes: ${aged[0].topRca.map((r) => r[0]).join(', ') || 'not yet classified'}. A payer-level escalation may beat claim-by-claim calls.`, to: `/payers/${encodeURIComponent(aged[0].payer)}`, value: moneyShort(aged[0].over120) });

  const stale = open.filter((x) => x.stale && x.c.balance >= 1500);
  if (stale.length) out.push({ id: 'stale', sev: 'med', title: `${stale.length} high-value claims have gone cold`, body: `${money(sum(stale.map((x) => x.c.balance)))} over $1.5k each with no touch in ${'two weeks+'}. Highest: ${stale.sort((a, b) => b.c.balance - a.c.balance)[0].c.claim_no}.`, to: `/worklist?view=stale&minBal=1500${sc}`, value: String(stale.length) });

  const un = open.filter((x) => !x.c.assigned_to);
  if (un.length) out.push({ id: 'un', sev: un.length / open.length > 0.2 ? 'high' : 'info', title: `${un.length} claims (${moneyShort(sum(un.map((x) => x.c.balance)))}) have no owner`, body: 'Unowned claims age silently. Smart-allocate them in one click.', to: '/allocation', value: String(un.length) });

  const fu = open.filter((x) => x.fuDue);
  if (fu.length) out.push({ id: 'fu', sev: 'med', title: `${fu.length} follow-ups are due or overdue`, body: `Promised follow-ups slip first when queues grow. ${fu.filter((x) => x.c.next_fu! < todayISO()).length} are already past due.`, to: `/worklist?view=fu${sc}`, value: String(fu.length) });

  // root-cause spike: last 14d vs previous 14d
  const d = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const cur = new Map<string, number>(), prev = new Map<string, number>();
  workLog.forEach((w) => { if (!w.rca) return; if (w.work_date >= d(14)) cur.set(w.rca, (cur.get(w.rca) || 0) + 1); else if (w.work_date >= d(28)) prev.set(w.rca, (prev.get(w.rca) || 0) + 1); });
  let best: [string, number, number] | null = null;
  cur.forEach((n, k) => { const p = prev.get(k) || 0; if (n >= 8 && n > p * 1.5 && (!best || n - p > best[1] - best[2])) best = [k, n, p]; });
  if (best) { const b = best as [string, number, number]; out.push({ id: 'spike', sev: 'med', title: `“${b[0]}” denials are spiking`, body: `${b[1]} touches in the last 14 days vs ${b[2]} in the 14 before. Check for a payer rule change or a front-end process issue.`, to: `/insights`, value: `+${b[1] - b[2]}` }); }

  // per-payer lowest resolve rate with material balance
  const worst = payers.filter((p) => p.balance > total * 0.06).sort((a, b) => a.resolveRate - b.resolveRate)[0];
  if (worst && worst.resolveRate < intel.globalRate * 0.8) out.push({ id: 'slow', sev: 'info', title: `${worst.payer} resolves only ${Math.round(worst.resolveRate * 100)}% of claims`, body: `Versus ${Math.round(intel.globalRate * 100)}% overall. Budget extra touches or escalate through a provider-rep contact.`, to: `/payers/${encodeURIComponent(worst.payer)}` });

  // trend from import snapshots
  const snaps = batches.filter((b) => b.summary?.total != null).sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (snaps.length >= 2) {
    const a = snaps[snaps.length - 2].summary!, b = snaps[snaps.length - 1].summary!;
    const ag = (s: BatchSummary) => sum(Object.entries(s.buckets || {}).filter(([k]) => /^(1[2-9]\d|[2-9]\d\d|\d{4}|36)/.test(k) || k.endsWith('+')).map(([, v]) => v.v));
    const dAged = ag(b) - ag(a), dTot = (b.total || 0) - (a.total || 0);
    if (Math.abs(dAged) > (a.total || 1) * 0.02) out.push({ id: 'trend', sev: dAged > 0 ? 'med' : 'good', title: `120+ day AR ${dAged > 0 ? 'grew' : 'shrank'} ${moneyShort(Math.abs(dAged))} since the last import`, body: `Total AR moved ${dTot >= 0 ? '+' : '−'}${moneyShort(Math.abs(dTot))} over the same period.`, to: '/aging' });
    if (b.resolved && b.resolved.v > 0) out.push({ id: 'resolved', sev: 'good', title: `${moneyShort(b.resolved.v)} left AR in the latest import`, body: `${b.resolved.n} claims dropped off or were reduced since the previous snapshot.` });
  }

  // QA
  const byU = new Map<string, { p: number; f: number }>();
  workLog.forEach((w) => { if (!w.user_id) return; const e = byU.get(w.user_id) || { p: 0, f: 0 }; if (w.audit_status === 'pass') e.p++; if (w.audit_status === 'fail') e.f++; byU.set(w.user_id, e); });
  staff.forEach((s) => { const e = byU.get(s.id); if (e && e.p + e.f >= 8 && e.f / (e.p + e.f) > 0.25) out.push({ id: 'qa' + s.id, sev: 'med', title: `${s.name}: ${Math.round((e.f / (e.p + e.f)) * 100)}% of audited touches failed`, body: 'Consider coaching on the most common failure remarks.', to: '/qa' }); });

  // workload imbalance + capacity
  const loads = staff.map((s) => ({ s, n: open.filter((x) => x.c.assigned_to === s.id).length })).filter((l) => l.n > 0 || staff.length);
  if (loads.length > 2) { const mx = Math.max(...loads.map((l) => l.n)), mn = Math.min(...loads.map((l) => l.n)); if (mn > 0 ? mx / mn > 2 : mx > 30) out.push({ id: 'bal', sev: 'info', title: 'Workloads are unbalanced', body: `Heaviest queue has ${mx} claims, lightest ${mn}. Rebalance in Allocation.`, to: '/allocation' }); }
  const cap = sum(staff.map((s) => s.target));
  if (cap) { const days = Math.ceil(open.length / cap); out.push({ id: 'cap', sev: days > 15 ? 'med' : 'info', title: `Backlog = ${days} working days at full team capacity`, body: `${open.length} open claims ÷ ${cap} touches/day across ${staff.length} specialists, before any new inflow.` }); }

  const f = forecast(open, intel);
  out.push({ id: 'fc', sev: 'good', title: `Expected recovery: ${moneyShort(f.expected)} of ${moneyShort(f.balance)} (${Math.round(f.rate * 100)}%)`, body: `About ${moneyShort(f.d30)} in 30 days, ${moneyShort(f.d60)} in 60, ${moneyShort(f.d90)} in 90. ${moneyShort(f.writeoffRisk)} is at write-off risk.`, to: '/insights', value: moneyShort(f.expected) });
  const order = { high: 0, med: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.sev] - order[b.sev]);
}
