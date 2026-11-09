// Day planner for people who cover several clients: splits today's capacity across practices by urgency, not just volume.
import type { EClaim } from './eclaim';

export interface ClientLoad { clientId: string; open: number; due: number; tfRisk: number; untouched: number; value: number; weight: number }
export interface PlanRow extends ClientLoad { share: number; quota: number; done: number; remaining: number; minutes: number }

/** Urgency weight per claim bundle: follow-ups due ×3, timely-filing risk ×4, never-worked ×1, plus a log-dollar term so big balances count. */
export function clientLoads(mine: EClaim[]): ClientLoad[] {
  const m = new Map<string, ClientLoad>();
  for (const x of mine) {
    if (!x.open) continue;
    const e = m.get(x.c.client_id) || { clientId: x.c.client_id, open: 0, due: 0, tfRisk: 0, untouched: 0, value: 0, weight: 0 };
    e.open++; e.value += x.c.balance; if (x.fuDue) e.due++; if (x.tfLeft != null && x.tfLeft > 0 && x.tfLeft <= 30) e.tfRisk++; if (x.c.touch_count === 0) e.untouched++;
    m.set(x.c.client_id, e);
  }
  for (const e of m.values()) e.weight = e.due * 3 + e.tfRisk * 4 + e.untouched * 1 + Math.log10(1 + e.value) * 2 + e.open * 0.15;
  return [...m.values()];
}

/** Proportional split of the day's target touches (and minutes) with a floor so no covered client is starved. */
export function planDay(loads: ClientLoad[], target: number, doneByClient: Map<string, number>, minutesTotal = 420, floorPct = 0.08): PlanRow[] {
  const live = loads.filter((l) => l.open > 0); if (!live.length) return [];
  const tw = live.reduce((s, l) => s + l.weight, 0) || 1;
  let shares = live.map((l) => Math.max(floorPct, l.weight / tw)); const ts = shares.reduce((a, b) => a + b, 0); shares = shares.map((s) => s / ts);
  const rows = live.map((l, i) => { const quota = Math.max(1, Math.round(target * shares[i])); const done = doneByClient.get(l.clientId) || 0; return { ...l, share: shares[i], quota, done, remaining: Math.max(0, quota - done), minutes: Math.round(minutesTotal * shares[i]) }; });
  return rows.sort((a, b) => b.weight - a.weight);
}
