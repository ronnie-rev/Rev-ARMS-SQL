import { useMemo } from 'react';
import { useStore } from '../store';
import { useIntelligence, type EClaim } from '../hooks';
import { buildInsightIndex, type Insight } from './engine/insights';
import { resolveIntelCfg } from './engine/intelligence';
import { findDupes } from './engine/finhealth';
import type { ClientSop } from './engine/sops';
import { todayISO } from './utils';

/** Insight chips for every open claim in `ecs` (computed once per data change, shared by Worklist, claim drawer and My Day). */
export function useInsightIndex(ecs: EClaim[]): Map<string, Insight[]> {
  const { appeals, claims, settings } = useStore(); const { ctx, payerDays, collect } = useIntelligence(ecs);
  const dupIds = useMemo(() => new Set(findDupes(ecs).flatMap((g) => g.claims.map((c) => c.id))), [ecs]);
  const sops = (settings.client_sops?.sops || []) as ClientSop[]; const cfg = useMemo(() => resolveIntelCfg(settings.intel_cfg).claimSignals, [settings.intel_cfg]);
  return useMemo(() => buildInsightIndex({ cfg, ecs, appeals, today: todayISO(), payerDays, collect: (x) => collect(x), dupIds, underpay: ctx.underpay as any, sops, allClaims: claims }), [cfg, ecs, appeals, payerDays, collect, dupIds, ctx.underpay, sops, claims]);
}

/** Insights for ONE claim (claim drawer): same rules, without the file-wide duplicate/pattern scan. */
export function useClaimInsights(ec: EClaim): Insight[] {
  const { appeals, settings } = useStore(); const { ctx, payerDays, collect } = useIntelligence([ec]); const sops = (settings.client_sops?.sops || []) as ClientSop[]; const cfg = useMemo(() => resolveIntelCfg(settings.intel_cfg).claimSignals, [settings.intel_cfg]);
  return useMemo(() => buildInsightIndex({ cfg, ecs: [ec], appeals, today: todayISO(), payerDays, collect: (x) => collect(x), underpay: ctx.underpay as any, sops }).get(ec.c.id) || [], [ec, appeals, payerDays, collect, ctx.underpay, sops]);
}
