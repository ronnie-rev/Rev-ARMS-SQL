// Central filing limits: TFL (timely filing), AFL (appeal filing), CCFL (corrected-claim filing). One cascade, one clock model, used by the claim
// drawer, worklist priority, the deadline radar, escalation, digests and reports. Pure and unit-tested.
import type { Claim, Client, LimitBasis, PayerLimit } from '../types';

export type LimitKind = 'tfl' | 'afl' | 'ccfl';
export const LIMIT_LABEL: Record<LimitKind, string> = { tfl: 'Timely filing', afl: 'Appeal filing', ccfl: 'Corrected-claim filing' };
export const LIMIT_SHORT: Record<LimitKind, string> = { tfl: 'TFL', afl: 'AFL', ccfl: 'CCFL' };
export type Tier = 'expired' | 'critical' | 'high' | 'warn' | 'watch' | 'ok';
export const TIER_ORDER: Tier[] = ['expired', 'critical', 'high', 'warn', 'watch', 'ok'];
export const TIER_COLOR: Record<Tier, string> = { expired: '#7f1d1d', critical: '#ef4444', high: '#f97316', warn: '#f59e0b', watch: '#3b82f6', ok: '#22c55e' };
export const TIER_LABEL: Record<Tier, string> = { expired: 'Expired', critical: 'Critical', high: 'High', warn: 'Soon', watch: 'Watch', ok: 'OK' };

export interface LimitsCfg {
  /** days left at or below which an item is critical / high / soon / watch */ tiers: { critical: number; high: number; warn: number; watch: number };
  /** days left at which each audience is told */ escalate: { owner: number; supervisor: number; manager: number };
  autoFlag: boolean; autoPriority: boolean; notify: boolean;
  /** fallbacks when nothing in the cascade defines a limit (null = no limit) */ defaults: { tfl: number | null; afl: number | null; ccfl: number | null };
  /** denial reasons whose root-cause categories can be fixed with a corrected claim */ correctableRcas: string[];
  digest: { weekday: number; horizonDays: number };
}
export const DEFAULT_LIMITS_CFG: LimitsCfg = {
  tiers: { critical: 7, high: 14, warn: 30, watch: 60 }, escalate: { owner: 30, supervisor: 14, manager: 7 }, autoFlag: true, autoPriority: true, notify: true,
  defaults: { tfl: null, afl: null, ccfl: null },
  correctableRcas: ['Billing Error', 'Coding', 'Demographics Issue', 'Eligibility or Benefits', 'Authorization', 'NPI or Non Par or Out of Network', 'Bundling or Inclusive Service', 'Additional Information Requested'],
  digest: { weekday: 1, horizonDays: 45 },
};
export const resolveLimitsCfg = (raw?: Partial<LimitsCfg> | null): LimitsCfg => { const r = (raw || {}) as Partial<LimitsCfg>; const d = DEFAULT_LIMITS_CFG; return { ...d, ...r, tiers: { ...d.tiers, ...(r.tiers || {}) }, escalate: { ...d.escalate, ...(r.escalate || {}) }, defaults: { ...d.defaults, ...(r.defaults || {}) }, digest: { ...d.digest, ...(r.digest || {}) }, correctableRcas: r.correctableRcas ?? d.correctableRcas }; };
export const validateLimitsCfg = (c: LimitsCfg): string[] => { const e: string[] = []; const t = c.tiers; if (!(t.critical >= 0 && t.critical < t.high && t.high < t.warn && t.warn < t.watch)) e.push('Tiers must increase: critical < high < soon < watch (days)'); const s = c.escalate; if (!(s.manager <= s.supervisor && s.supervisor <= s.owner)) e.push('Escalation: manager days ≤ supervisor days ≤ owner days'); for (const k of ['tfl', 'afl', 'ccfl'] as const) { const v = c.defaults[k]; if (v != null && (!Number.isInteger(v) || v < 1 || v > 3650)) e.push(`Default ${k.toUpperCase()} must be 1–3650 days or empty`); } return e; };

/** starting values only — they MUST be verified against each payer contract / manual (the Source column says so) */
export const STARTER_LIMITS: Omit<PayerLimit, 'id'>[] = [
  { payer: 'Medicare', plan_type: 'Medicare', tfl_days: 365, afl_days: 120, ccfl_days: 365, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: 'CMS: 12 months to file; redetermination within 120 days of the initial determination; clerical reopening within 1 year — verify', notes: null, verified_on: null, active: true, client_id: null },
  { payer: 'Medicaid', plan_type: 'Medicaid', tfl_days: 180, afl_days: 90, ccfl_days: 180, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: 'Varies by state — set the state value', notes: null, verified_on: null, active: true, client_id: null },
  { payer: 'Aetna', plan_type: 'Commercial', tfl_days: 180, afl_days: 180, ccfl_days: 180, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: 'Starter — contract overrides', notes: null, verified_on: null, active: true, client_id: null },
  { payer: 'Cigna', plan_type: 'Commercial', tfl_days: 180, afl_days: 180, ccfl_days: 180, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: 'Starter — contract overrides', notes: null, verified_on: null, active: true, client_id: null },
  { payer: 'UnitedHealthcare', plan_type: 'Commercial', tfl_days: 90, afl_days: 180, ccfl_days: 90, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: 'Starter — contract overrides', notes: null, verified_on: null, active: true, client_id: null },
  { payer: 'Humana', plan_type: 'Commercial', tfl_days: 180, afl_days: 180, ccfl_days: 180, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: 'Starter — contract overrides', notes: null, verified_on: null, active: true, client_id: null },
  { payer: 'BCBS of Texas', plan_type: 'Commercial', tfl_days: 180, afl_days: 180, ccfl_days: 180, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: 'Starter — varies by plan', notes: null, verified_on: null, active: true, client_id: null },
  { payer: 'Anthem', plan_type: 'Commercial', tfl_days: 180, afl_days: 180, ccfl_days: 180, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: 'Starter — varies by state', notes: null, verified_on: null, active: true, client_id: null },
  { payer: 'Tricare', plan_type: 'Government', tfl_days: 365, afl_days: 90, ccfl_days: 365, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: 'Starter — verify', notes: null, verified_on: null, active: true, client_id: null },
  { payer: 'Molina', plan_type: 'Medicaid', tfl_days: 120, afl_days: 90, ccfl_days: 120, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: 'Starter — varies by state', notes: null, verified_on: null, active: true, client_id: null },
  { payer: 'Oscar', plan_type: 'Commercial', tfl_days: 90, afl_days: 180, ccfl_days: 90, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: 'Starter — contract overrides', notes: null, verified_on: null, active: true, client_id: null },
];

export interface LimitSet {
  tfl: number | null; afl: number | null; ccfl: number | null; tflBasis: 'dos' | 'last_billed'; aflBasis: LimitBasis; ccflBasis: LimitBasis;
  /** where each value came from, e.g. 'client+payer', 'payer', 'directory', 'client', 'default' */ from: Record<LimitKind, string>; verified: string | null; planType: string | null;
}
const EMPTY: LimitSet = { tfl: null, afl: null, ccfl: null, tflBasis: 'dos', aflBasis: 'denial', ccflBasis: 'denial', from: { tfl: 'none', afl: 'none', ccfl: 'none' }, verified: null, planType: null };
const norm = (s: string | null | undefined) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export interface LimitIndex { resolve(payer: string | null | undefined, clientId: string, plan?: string | null): LimitSet; known(payer: string | null | undefined): boolean }
/** Cascade per field: client+payer(+plan) → client+payer → payer(+plan) → payer → payer directory meta → client default (TFL only) → central default. */
export function buildLimitIndex(o: { rows: PayerLimit[]; payerMeta?: Map<string, Record<string, any>>; clients: Pick<Client, 'id' | 'tf_days'>[]; cfg: LimitsCfg; canon?: (name: string) => string }): LimitIndex {
  const canon = o.canon || ((n: string) => n); const by = new Map<string, PayerLimit>(); const payers = new Set<string>();
  for (const r of o.rows) { if (!r.active) continue; const p = norm(canon(r.payer)); payers.add(p); by.set(`${r.client_id || '*'}|${p}|${norm(r.plan_type) || '*'}`, r); }
  const cm = new Map(o.clients.map((c) => [c.id, c])); const cache = new Map<string, LimitSet>();
  return {
    known: (payer) => !!payer && (payers.has(norm(canon(payer))) || !!o.payerMeta?.get(norm(canon(payer)))),
    resolve(payer, clientId, plan) {
      const p = norm(canon(payer || '')); const key = `${clientId}|${p}|${norm(plan) || '*'}`; const hit = cache.get(key); if (hit) return hit;
      const order = [`${clientId}|${p}|${norm(plan) || '*'}`, `${clientId}|${p}|*`, `*|${p}|${norm(plan) || '*'}`, `*|${p}|*`]; const rows = [...new Set(order)].map((k) => by.get(k)).filter(Boolean) as PayerLimit[];
      const meta = o.payerMeta?.get(p); const out: LimitSet = { ...EMPTY, from: { ...EMPTY.from }, planType: plan || null };
      const pick = (kind: LimitKind, field: 'tfl_days' | 'afl_days' | 'ccfl_days', metaKeys: string[], basis?: (r: PayerLimit) => void) => {
        const r = rows.find((x) => x[field] != null); if (r) { out[kind] = r[field] as number; out.from[kind] = (r.client_id ? 'client+payer' : 'payer'); basis?.(r); if (r.verified_on && (!out.verified || r.verified_on > out.verified)) out.verified = r.verified_on; return; }
        for (const k of metaKeys) { const v = Number(meta?.[k]); if (v > 0) { out[kind] = v; out.from[kind] = 'directory'; return; } }
        if (kind === 'tfl' && cm.get(clientId)?.tf_days) { out.tfl = cm.get(clientId)!.tf_days; out.from.tfl = 'client'; return; }
        const d = o.cfg.defaults[kind]; if (d != null) { out[kind] = d; out.from[kind] = 'default'; }
      };
      pick('tfl', 'tfl_days', ['tf_days', 'tfl_days'], (r) => { out.tflBasis = r.tfl_basis; }); pick('afl', 'afl_days', ['appeal_days', 'afl_days'], (r) => { out.aflBasis = r.afl_basis; }); pick('ccfl', 'ccfl_days', ['ccfl_days', 'corrected_days'], (r) => { out.ccflBasis = r.ccfl_basis; });
      cache.set(key, out); return out;
    },
  };
}

const DENIAL_RCA = new Set(['Authorization', 'Eligibility or Benefits', 'Bundling or Inclusive Service', 'Non Covered', 'NPI or Non Par or Out of Network', 'Timely Filing', 'No Referral', 'Billing Error', 'Coding', 'Demographics Issue', 'Medical Necessity']);
export const isDenied = (c: Claim): boolean => !!(c.denial_codes && c.denial_codes.trim()) || /denied|reject/i.test(c.pms_status || '') || ['DEN', 'APL'].includes(String(c.custom?.lifecycle || '')) || (!!c.rca && DENIAL_RCA.has(c.rca));
export const needsCorrected = (c: Claim, cfg: LimitsCfg): boolean => !c.closed_at && ((/reject/i.test(c.pms_status || '')) || (!!c.rca && cfg.correctableRcas.includes(c.rca) && isDenied(c)) || /corrected/i.test(c.end_action || '') || /\b(CO|PR)-?(4|5|6|9|10|11|16|31|109|140|181|182|183|185|197)\b/i.test(c.denial_codes || ''));
/** does the original-filing clock still matter for this claim? (not yet billed, rejected, or needs rebilling) */
export const tflMatters = (c: Claim, cfg: LimitsCfg): boolean => !c.last_billed || /unbilled|reject/i.test(c.pms_status || '') || needsCorrected(c, cfg);

const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diffDays = (a: string, b: string) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5);
export const tierOf = (left: number, cfg: LimitsCfg): Tier => (left < 0 ? 'expired' : left <= cfg.tiers.critical ? 'critical' : left <= cfg.tiers.high ? 'high' : left <= cfg.tiers.warn ? 'warn' : left <= cfg.tiers.watch ? 'watch' : 'ok');

export interface Deadline { kind: LimitKind; days: number; basis: LimitBasis; start: string; startSrc: 'exact' | 'estimated'; due: string; left: number; tier: Tier; relevant: boolean; satisfied: boolean; from: string }
/** when did the appeal / corrected-claim clock start? denial date → remit date → last touch on a denied claim → last billed (estimated) */
export function denialStart(c: Claim): { date: string | null; exact: boolean } {
  const d = c.denial_date || c.custom?.denial_date || c.custom?.era?.date; if (d && /^\d{4}-\d{2}-\d{2}/.test(String(d))) return { date: String(d).slice(0, 10), exact: true };
  if (c.last_touched_at && isDenied(c)) return { date: c.last_touched_at.slice(0, 10), exact: false };
  return { date: c.last_billed || c.dos || null, exact: false };
}
export function deadlinesFor(c: Claim, set: LimitSet, today: string, cfg: LimitsCfg): Deadline[] {
  const out: Deadline[] = []; const den = denialStart(c); const denied = isDenied(c) && !c.closed_at; const corr = needsCorrected(c, cfg);
  const mk = (kind: LimitKind, days: number | null, basis: LimitBasis, relevant: boolean): void => {
    if (!days) return; let start: string | null = null; let exact = true;
    if (basis === 'dos') start = c.dos; else if (basis === 'last_billed') start = c.last_billed || c.dos; else { start = den.date; exact = den.exact; }
    if (!start) return; const due = addDays(start, days); const left = diffDays(due, today); const satisfied = kind === 'tfl' && !!c.last_billed && !!c.dos && diffDays(c.last_billed, c.dos) <= days && !relevant;
    out.push({ kind, days, basis, start, startSrc: exact ? 'exact' : 'estimated', due, left, tier: tierOf(left, cfg), relevant: relevant && !c.closed_at, satisfied, from: set.from[kind] });
  };
  mk('tfl', set.tfl, set.tflBasis, tflMatters(c, cfg)); mk('afl', set.afl, set.aflBasis, denied); mk('ccfl', set.ccfl, set.ccflBasis, denied && corr);
  return out;
}
export const nearest = (d: Deadline[]): Deadline | null => d.filter((x) => x.relevant).sort((a, b) => a.left - b.left)[0] || null;

export interface RadarItem { claim: Claim; deadline: Deadline; all: Deadline[] }
export function radarItems(claims: Claim[], idx: LimitIndex, cfg: LimitsCfg, today: string, opts: { clientIds?: string[]; canon?: (p: string) => string } = {}): RadarItem[] {
  const out: RadarItem[] = [];
  for (const c of claims) {
    if (c.closed_at || (opts.clientIds?.length && !opts.clientIds.includes(c.client_id))) continue;
    const all = deadlinesFor(c, idx.resolve(c.payer, c.client_id, c.custom?.plan_type), today, cfg); const n = nearest(all); if (n) out.push({ claim: c, deadline: n, all });
  }
  return out.sort((a, b) => a.deadline.left - b.deadline.left || b.claim.balance - a.claim.balance);
}

// ───────── automatic escalation ─────────
export type Stage = 's60' | 's30' | 's14' | 's7' | 's0';
const stageOf = (left: number, cfg: LimitsCfg): Stage | null => (left < 0 ? 's0' : left <= cfg.escalate.manager ? 's7' : left <= cfg.escalate.supervisor ? 's14' : left <= cfg.escalate.owner ? 's30' : left <= cfg.tiers.watch ? 's60' : null);
const RANK: Record<Stage, number> = { s60: 1, s30: 2, s14: 3, s7: 4, s0: 5 };
export interface Escalation { claimId: string; stage: Stage; kind: LimitKind; due: string; left: number; notify: { audience: 'owner' | 'supervisor' | 'manager'; title: string; body: string; severity: 'info' | 'warn' | 'high' }[]; priority: 'High' | 'Critical' | null; flags: { add: string[]; remove: string[] }; activity: string }
/** What should happen now? Only acts when a claim crosses into a MORE severe stage than the one already recorded (custom.radar), so re-running is idempotent. */
export function escalationPlan(items: RadarItem[], cfg: LimitsCfg, opts: { fmt?: (iso: string) => string } = {}): Escalation[] {
  const fmt = opts.fmt || ((d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`); const out: Escalation[] = [];
  for (const { claim: c, deadline: d } of items) {
    const st = stageOf(d.left, cfg); const prev = c.custom?.radar as { stage?: Stage; kind?: LimitKind; due?: string } | undefined; const flags = (c.flags || []);
    const add: string[] = [], remove: string[] = []; const want = d.left <= cfg.tiers.warn ? (d.left < 0 ? 'deadline_expired' : 'deadline_risk') : null;
    if (cfg.autoFlag) { for (const f of ['deadline_risk', 'deadline_expired']) { if (f === want && !flags.includes(f)) add.push(f); if (f !== want && flags.includes(f)) remove.push(f); } }
    if (!st || st === 's60') { if (add.length || remove.length) out.push({ claimId: c.id, stage: 's60', kind: d.kind, due: d.due, left: d.left, notify: [], priority: null, flags: { add, remove }, activity: '' }); continue; }
    const advanced = !prev?.stage || prev.kind !== d.kind || prev.due !== d.due || RANK[st] > RANK[prev.stage];
    if (!advanced && !add.length && !remove.length) continue;
    const notify: Escalation['notify'] = []; const what = `${LIMIT_SHORT[d.kind]} ${d.left < 0 ? `expired ${-d.left}d ago` : `in ${d.left}d`} (${fmt(d.due)})`; const body = `${c.claim_no} · ${c.payer || 'payer'} · $${Math.round(c.balance).toLocaleString('en-US')}${d.startSrc === 'estimated' ? ' · clock start is estimated — add the denial date' : ''}`;
    if (advanced && cfg.notify) { if (st === 's30') notify.push({ audience: 'owner', title: `${what} — ${LIMIT_LABEL[d.kind].toLowerCase()} deadline approaching`, body, severity: 'warn' }); if (st === 's14') notify.push({ audience: 'owner', title: `${what} — act now`, body, severity: 'warn' }, { audience: 'supervisor', title: `${what} — claim needs attention`, body, severity: 'high' }); if (st === 's7') notify.push({ audience: 'owner', title: `${what} — critical`, body, severity: 'high' }, { audience: 'supervisor', title: `${what} — critical`, body, severity: 'high' }, { audience: 'manager', title: `${what} — critical, $${Math.round(c.balance).toLocaleString('en-US')} at risk`, body, severity: 'high' }); if (st === 's0') notify.push({ audience: 'supervisor', title: `${LIMIT_SHORT[d.kind]} expired — decide: appeal with proof, or write off`, body, severity: 'high' }, { audience: 'manager', title: `${LIMIT_SHORT[d.kind]} expired on ${c.claim_no}`, body, severity: 'high' }); }
    const priority = cfg.autoPriority && advanced ? (st === 's7' || st === 's0' ? 'Critical' : st === 's14' ? 'High' : null) : null;
    out.push({ claimId: c.id, stage: st, kind: d.kind, due: d.due, left: d.left, notify, priority, flags: { add, remove }, activity: advanced ? `${what} — escalated${notify.length ? ' to ' + [...new Set(notify.map((n) => n.audience))].join(', ') : ''}` : '' });
  }
  return out;
}

// ───────── insights ─────────
export interface LimitInsight { id: string; level: 'high' | 'med' | 'low'; title: string; detail: string; count: number; amount: number; payers?: string[] }
export function limitInsights(claims: Claim[], idx: LimitIndex, cfg: LimitsCfg, today: string): LimitInsight[] {
  const open = claims.filter((c) => !c.closed_at); const noLimit = new Map<string, { n: number; amt: number }>(); let est = 0, estAmt = 0, expired = 0, expAmt = 0, crit = 0, critAmt = 0, denNoDate = 0;
  for (const c of open) {
    const set = idx.resolve(c.payer, c.client_id, c.custom?.plan_type); if (!set.tfl && !set.afl) { const k = c.payer || 'Unknown'; const e = noLimit.get(k) || { n: 0, amt: 0 }; e.n++; e.amt += c.balance; noLimit.set(k, e); }
    const dl = deadlinesFor(c, set, today, cfg).filter((d) => d.relevant); const n = dl.sort((a, b) => a.left - b.left)[0]; if (!n) continue;
    if (n.startSrc === 'estimated' && n.kind !== 'tfl') { est++; estAmt += c.balance; if (isDenied(c) && !c.denial_date) denNoDate++; }
    if (n.left < 0) { expired++; expAmt += c.balance; } else if (n.left <= cfg.tiers.critical) { crit++; critAmt += c.balance; }
  }
  const out: LimitInsight[] = []; const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  if (noLimit.size) out.push({ id: 'no_limits', level: 'high', title: `${noLimit.size} payer${noLimit.size === 1 ? '' : 's'} have no filing limits`, detail: 'Claims for these payers cannot show deadlines. Add TFL / AFL / CCFL in Admin → Filing limits.', count: sum([...noLimit.values()].map((x) => x.n)), amount: sum([...noLimit.values()].map((x) => x.amt)), payers: [...noLimit].sort((a, b) => b[1].amt - a[1].amt).map(([p]) => p).slice(0, 12) });
  if (expired) out.push({ id: 'expired', level: 'high', title: `${expired} open claim${expired === 1 ? '' : 's'} past a filing deadline`, detail: 'Appeal with proof of timely filing, or decide on an adjustment.', count: expired, amount: expAmt });
  if (crit) out.push({ id: 'critical', level: 'high', title: `${crit} deadline${crit === 1 ? '' : 's'} in the next ${cfg.tiers.critical} days`, detail: 'Work these first.', count: crit, amount: critAmt });
  if (est) out.push({ id: 'estimated', level: 'med', title: `${est} appeal / corrected-claim clocks are estimated`, detail: `${denNoDate} denied claims have no denial date. Map a "Denial Date" column in the aging file or post the 835 so the clock starts on the real date.`, count: est, amount: estAmt });
  return out;
}

// ───────── weekly client digest (PHI-free aggregates) ─────────
export interface RadarDigest { expired: { n: number; amount: number }; critical: { n: number; amount: number }; soon: { n: number; amount: number }; rows: { payer: string; kind: LimitKind; n: number; amount: number; soonest: number }[]; horizonDays: number }
/** Counts and dollars about to expire for one client, grouped by payer and limit type — no patient or claim identifiers. */
export function radarDigest(claims: Claim[], idx: LimitIndex, cfg: LimitsCfg, today: string, clientId: string): RadarDigest {
  const items = radarItems(claims.filter((c) => c.client_id === clientId), idx, cfg, today); const h = cfg.digest.horizonDays;
  const tot = (f: (i: RadarItem) => boolean) => { const l = items.filter(f); return { n: l.length, amount: l.reduce((a, i) => a + i.claim.balance, 0) }; };
  const by = new Map<string, { payer: string; kind: LimitKind; n: number; amount: number; soonest: number }>();
  for (const i of items) { if (i.deadline.left > h) continue; const k = `${i.claim.payer || 'Unknown'}|${i.deadline.kind}`; const e = by.get(k) || { payer: i.claim.payer || 'Unknown', kind: i.deadline.kind, n: 0, amount: 0, soonest: 9999 }; e.n++; e.amount += i.claim.balance; e.soonest = Math.min(e.soonest, i.deadline.left); by.set(k, e); }
  return { expired: tot((i) => i.deadline.left < 0), critical: tot((i) => i.deadline.left >= 0 && i.deadline.left <= cfg.tiers.critical), soon: tot((i) => i.deadline.left > cfg.tiers.critical && i.deadline.left <= h), rows: [...by.values()].sort((a, b) => a.soonest - b.soonest || b.amount - a.amount).slice(0, 10), horizonDays: h };
}
