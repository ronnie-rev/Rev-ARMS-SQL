// Pure enrichment of raw claims (age, bucket, timely filing, stage, owner…). Shared by the React hook, reports and the scheduled sender.
import type { Claim, Client, ConfigOption, Profile } from '../types';
import { ageDays, bucketFor, bucketsFrom, tfDaysLeft, workScore } from '../utils';
import { deriveStage, stageDefs } from './stages';
import type { EClaim } from './eclaim';
import { familyOf } from './families';
import { lifecycleOf } from './lifecycle';
import { autoTags, encounterKey, visitTypeOf } from './visit';

export interface EnrichOpts { clients: Client[]; profiles: Profile[]; config: ConfigOption[]; today: string; staleDays?: number; followupDefault?: number; includeClosed?: boolean; scope?: string[] }
export function enrichClaims(claims: Claim[], o: EnrichOpts): EClaim[] {
  const buckets = bucketsFrom(o.config); const cm = new Map(o.clients.map((c) => [c.id, c])); const pm = new Map(o.profiles.map((p) => [p.id, p]));
  const term = new Set(o.config.filter((x) => x.category === 'status' && x.meta.terminal).map((x) => x.value));
  const payerTf = new Map(o.config.filter((x) => x.category === 'payer' && x.meta.tf_days).map((x) => [x.value.toLowerCase(), Number(x.meta.tf_days)]));
  const defs = stageDefs(o.config); const fu = new Map(o.config.filter((x) => x.category === 'payer' && x.meta.followup_days).map((x) => [x.value.toLowerCase(), Number(x.meta.followup_days)]));
  const sctx = { today: o.today, followupDays: (p: string | null) => fu.get((p || '').toLowerCase()) ?? (o.followupDefault ?? 30) }; const staleDays = o.staleDays ?? 14; const now = new Date(o.today + 'T12:00:00Z').getTime();
  const out: EClaim[] = []; const enc = new Map<string, number>(); for (const c of claims) { const k = encounterKey(c); if (k) enc.set(k, (enc.get(k) || 0) + 1); }
  for (const c of claims) {
    if (o.scope?.length && !o.scope.includes(c.client_id)) continue; if (!o.includeClosed && c.closed_at) continue;
    const client = cm.get(c.client_id); const age = ageDays(c, client); const tfLeft = tfDaysLeft(c, client, payerTf.get((c.payer || '').toLowerCase())); const terminal = term.has(c.status);
    const last = c.last_touched_at ? (now - new Date(c.last_touched_at).getTime()) / 86400000 : null; const sg = deriveStage(c, defs, sctx);
    out.push({ stage: sg.value, stageColor: sg.color, patientAR: !!sg.patientAR, c, client, age, bucket: bucketFor(age, buckets), tfLeft, score: workScore(c, age, tfLeft), terminal, open: !c.closed_at && !terminal,
      lifecycle: lifecycleOf(c), family: familyOf(c), visit: visitTypeOf(c), tags: autoTags(c, { tfLeft, clientCode: client?.code, pms: client?.pms }), snoozed: !!c.custom?.snooze_until && c.custom.snooze_until > o.today, linked: Math.max(0, (enc.get(encounterKey(c) || '') || 1) - 1),
      owner: c.assigned_to ? pm.get(c.assigned_to) : undefined, fuDue: !!c.next_fu && c.next_fu <= o.today && !terminal, stale: !terminal && (last == null ? true : last > staleDays) });
  }
  return out;
}
