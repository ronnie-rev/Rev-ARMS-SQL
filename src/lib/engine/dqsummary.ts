// Data-quality summary for the Exceptions page: where the rule violations concentrate, what they put at risk, and which client is cleanest.
import type { Claim } from '../types';
import type { Violation } from './checks';

export interface CheckRank { check_id: string; claims: number; balance: number; high: number }
export interface ClientQuality { client_id: string; open: number; flagged: number; cleanPct: number; balanceAtRisk: number }
export interface DqSummary { claimsFlagged: number; open: number; cleanPct: number; balanceAtRisk: number; topChecks: CheckRank[]; clients: ClientQuality[] }

export function dqSummary(open: Claim[], viol: Violation[]): DqSummary {
  const byId = new Map(open.map((c) => [c.id, c])); const perClaim = new Map<string, Violation[]>(); for (const v of viol) if (byId.has(v.claim_id)) perClaim.set(v.claim_id, [...(perClaim.get(v.claim_id) || []), v]);
  const checks = new Map<string, { claims: Set<string>; balance: number; high: number }>(); for (const v of viol) { const c = byId.get(v.claim_id); if (!c) continue; const e = checks.get(v.check_id) || { claims: new Set<string>(), balance: 0, high: 0 }; if (!e.claims.has(c.id)) { e.claims.add(c.id); e.balance += Math.max(0, c.balance); } if (v.severity === 'high') e.high++; checks.set(v.check_id, e); }
  const cl = new Map<string, { open: number; flagged: number; bal: number }>(); for (const c of open) { const e = cl.get(c.client_id) || { open: 0, flagged: 0, bal: 0 }; e.open++; if (perClaim.has(c.id)) { e.flagged++; e.bal += Math.max(0, c.balance); } cl.set(c.client_id, e); }
  const flagged = perClaim.size; const bal = [...perClaim.keys()].reduce((s, id) => s + Math.max(0, byId.get(id)!.balance), 0);
  return { claimsFlagged: flagged, open: open.length, cleanPct: open.length ? Math.round(((open.length - flagged) / open.length) * 100) : 100, balanceAtRisk: Math.round(bal),
    topChecks: [...checks.entries()].map(([check_id, e]) => ({ check_id, claims: e.claims.size, balance: Math.round(e.balance), high: e.high })).sort((a, b) => b.balance - a.balance).slice(0, 5),
    clients: [...cl.entries()].map(([client_id, e]) => ({ client_id, open: e.open, flagged: e.flagged, cleanPct: e.open ? Math.round(((e.open - e.flagged) / e.open) * 100) : 100, balanceAtRisk: Math.round(e.bal) })).sort((a, b) => a.cleanPct - b.cleanPct) };
}
