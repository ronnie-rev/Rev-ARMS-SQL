import { appealOdds } from './lib/engine/learning';
import { useMemo } from 'react';
import { buildLimitIndex, deadlinesFor, resolveLimitsCfg } from './lib/engine/limits';
import { payerScorecards, resolveScoreCfg } from './lib/engine/scorecard';
import { detectUnderpayments } from './lib/engine/underpay';
import { resolveReimbCfg } from './lib/engine/reimb';
import type { CustomRec } from './lib/engine/customrec';
import type { Env } from './lib/engine/rules';
import { nextBestAction, resolveIntelCfg, type IntelCfg, type Nba, type NbaCtx } from './lib/engine/intelligence';
import type { Appeal } from './lib/types';
import { priorityOf, resolvePriorityCfg, type Priority } from './lib/engine/priority';
import { buildPayerIndex } from './lib/engine/payers';
import { useStore } from './store';
import type { Claim, Client, Profile } from './lib/types';
import { ageDays, bucketFor, bucketsFrom, tfDaysLeft, todayISO, workScore, type Bucket } from './lib/utils';
import { encounterKey } from './lib/engine/visit';
import { enrichClaims } from './lib/engine/enrich';

import type { EClaim } from './lib/engine/eclaim';
export type { EClaim };

export function useBuckets() {
  const config = useStore((s) => s.config);
  return useMemo(() => bucketsFrom(config), [config]);
}
export function useOpts(category: string, parent?: string | null) {
  const config = useStore((s) => s.config);
  return useMemo(() => config.filter((o) => o.category === category && o.active && (parent === undefined || o.parent === parent)).sort((a, b) => a.sort - b.sort), [config, category, parent]);
}

/** Enriched claims, scoped to the global client filter. */
export function useClaims(includeClosed = false): EClaim[] {
  const claims = useStore((s) => s.claims);
  const clients = useStore((s) => s.clients);
  const profiles = useStore((s) => s.profiles);
  const config = useStore((s) => s.config);
  const scope = useStore((s) => s.clientScope);
  const staleDays = useStore((s) => s.settings.sla?.staleDays ?? 14); const fuDefault = useStore((s) => s.settings.workflow?.followupDays ?? 30);
  return useMemo(() => enrichClaims(claims, { clients, profiles, config, today: todayISO(), staleDays, followupDefault: fuDefault, includeClosed, scope }), [claims, clients, profiles, config, scope, includeClosed, staleDays, fuDefault]);
}

/** One claim, enriched on its own (plus its encounter siblings) — opening a drawer must not re-enrich the whole inventory. */
export function useClaim(id: string | null): EClaim | undefined {
  const claims = useStore((s) => s.claims); const clients = useStore((s) => s.clients); const profiles = useStore((s) => s.profiles); const config = useStore((s) => s.config);
  const staleDays = useStore((s) => s.settings.sla?.staleDays ?? 14); const fuDefault = useStore((s) => s.settings.workflow?.followupDays ?? 30);
  const claim = useMemo(() => (id ? claims.find((c) => c.id === id) : undefined), [claims, id]);
  return useMemo(() => { if (!claim) return undefined; const k = encounterKey(claim); const peers = k ? claims.filter((c) => c.client_id === claim.client_id && encounterKey(c) === k) : [claim]; return enrichClaims(peers.some((p) => p.id === claim.id) ? peers : [claim, ...peers], { clients, profiles, config, today: todayISO(), staleDays, followupDefault: fuDefault, includeClosed: true, scope: [] }).find((x) => x.c.id === claim.id); }, [claim, claims, clients, profiles, config, staleDays, fuDefault]);
}

export function useScopedClients() {
  const clients = useStore((s) => s.clients);
  return useMemo(() => clients.filter((c) => c.active), [clients]);
}

import { buildIntel, collectability, type Collectability, type Intel } from './lib/analytics';

/** Learned statistics (payer resolution rates, next-best-action tables) over ALL claims, regardless of client scope. */
export function useIntel(): Intel {
  const claims = useStore((s) => s.claims); const workLog = useStore((s) => s.workLog); const activity = useStore((s) => s.activity);
  const config = useStore((s) => s.config); const min = useStore((s) => s.settings.model?.minSupport ?? 3);
  return useMemo(() => buildIntel(claims, workLog, activity, config, min), [claims, workLog, activity, config, min]);
}
export function useCollect(ecs: EClaim[], intel: Intel): Map<string, Collectability> {
  return useMemo(() => new Map(ecs.map((x) => [x.c.id, collectability(x, intel)])), [ecs, intel]);
}
/** Patient-name masking for PHI-minimised screens (Admin → Workspace). */
export function usePhi() {
  const mask = useStore((s) => !!s.settings.model?.maskPhi || !s.has('view_phi'));
  return (name: string | null | undefined) => {
    if (!name) return '—'; if (!mask) return name;
    return name.split(/[, ]+/).filter(Boolean).map((p) => p[0] + '•••').join(' ');
  };
}

/** Resolved filing-limit index (TFL/AFL/CCFL) + config for the current workspace. */
export function useLimits() {
  const payerLimits = useStore((s) => s.payerLimits); const config = useStore((s) => s.config); const clients = useStore((s) => s.clients); const raw = useStore((s) => s.settings.limits_cfg);
  return useMemo(() => {
    const cfg = resolveLimitsCfg(raw); const dir = config.filter((o) => o.category === 'payer' && o.active); const pi = buildPayerIndex(dir.map((o) => ({ value: o.value, aliases: o.meta.aliases })));
    const canon = (n: string) => pi.canon(n).name;
    const idx = buildLimitIndex({ rows: payerLimits, payerMeta: new Map(dir.map((o) => [o.value, o.meta || {}])), clients, cfg, canon });
    return { cfg, idx, canon };
  }, [payerLimits, config, clients, raw]);
}

/** Smart priority per open claim: deadline criticality (TFL/AFL/CCFL), value, age, follow-ups and allocation-rule boosts. */
export function usePriority(claims: EClaim[]) {
  const { cfg: lcfg, idx } = useLimits(); const rules = useStore((s) => s.rules); const raw = useStore((s) => s.settings.priority_cfg);
  return useMemo(() => {
    const cfg = resolvePriorityCfg(raw); const today = todayISO(); const m = new Map<string, Priority>();
    const ctx = { cfg, allocRules: rules, deadlines: (x: EClaim) => deadlinesFor(x.c, idx.resolve(x.c.payer, x.c.client_id, x.c.custom?.plan_type), today, lcfg) };
    for (const x of claims) if (x.open) m.set(x.c.id, priorityOf(x, ctx));
    return m;
  }, [claims, rules, raw, idx, lcfg]);
}

/** Intelligence layer context: payer pay-time norms, underpayments, appeals and deadlines feeding next-best-action, forecast and capacity. */
export function useIntelligence(ecs: EClaim[], override?: IntelCfg) {
  const { cfg, idx, canon } = useLimits(); const appeals = useStore((s) => s.appeals); const claims = useStore((s) => s.claims); const settings = useStore((s) => s.settings); const intel = useIntel();
  const icfg = useMemo(() => override || resolveIntelCfg(settings.intel_cfg), [override, settings.intel_cfg]); const staleDays = icfg.nba.staleDays;
  const payerDays = useMemo(() => {
    const m = new Map<string, number>(); const cards = payerScorecards(claims, appeals, resolveScoreCfg(settings.score_cfg), todayISO(), { canon });
    for (const s of cards) { const d = s.recent.medianDaysToPay ?? s.baseline.medianDaysToPay; if (d != null) m.set(s.payer.toLowerCase(), d); } return (p: string | null) => m.get(canon(p || 'Unknown').toLowerCase()) ?? null;
  }, [claims, appeals, settings.score_cfg, canon]);
  const underpay = useMemo(() => new Map(detectUnderpayments(claims, resolveReimbCfg(settings.reimb_cfg), todayISO()).map((u) => [u.claim.id, u])), [claims, settings.reimb_cfg]);
  const collect = useMemo(() => { const m = new Map<string, ReturnType<typeof collectability>>(); return (x: EClaim) => { let v = m.get(x.c.id); if (!v) { v = collectability(x, intel); m.set(x.c.id, v); } return v; }; }, [intel]);
  const rawRecs = useStore((st) => st.settings.custom_recs); const customRecs = useMemo<CustomRec[]>(() => (rawRecs?.rules as CustomRec[]) || [], [rawRecs]); const clientsAll = useStore((st) => st.clients); const configAll = useStore((st) => st.config); const carcMapFn = useStore((st) => st.carcMap);
  const recEnv = useMemo<Env | undefined>(() => customRecs.length ? { today: todayISO(), buckets: bucketsFrom(configAll), clients: new Map(clientsAll.map((c) => [c.id, c])), payerTf: new Map(configAll.filter((o) => o.category === 'payer' && o.meta.tf_days).map((o) => [o.value.toLowerCase(), Number(o.meta.tf_days)])), carc: carcMapFn() } as Env : undefined, [customRecs, clientsAll, configAll, carcMapFn]);
  const odds = useMemo(() => appealOdds(appeals, claims), [appeals, claims]);
  const ctx = useMemo<NbaCtx>(() => { const am = new Map<string, Appeal[]>(); for (const a of appeals) { const l = am.get(a.claim_id); if (l) l.push(a); else am.set(a.claim_id, [a]); } return { today: todayISO(), limitsCfg: cfg, deadlines: (x) => deadlinesFor(x.c, idx.resolve(x.c.payer, x.c.client_id, x.c.custom?.plan_type), todayISO(), cfg), underpay, appeals: am, payerDays, collect, staleDays, cfg: icfg, env: recEnv, custom: customRecs, odds }; }, [cfg, idx, underpay, appeals, payerDays, collect, staleDays, icfg, recEnv, customRecs, odds]);
  const nba = useMemo(() => { const m = new Map<string, Nba>(); for (const x of ecs) if (x.open) m.set(x.c.id, nextBestAction(x, ctx)); return m; }, [ecs, ctx]);
  return { nba, ctx, payerDays, collect, icfg };
}
