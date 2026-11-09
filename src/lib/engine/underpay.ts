// Underpayment detector: payer paid (or allowed) less than the contract / expectation — money that is never flagged as a denial.
import type { Claim } from '../types';
import type { ReimbCfg } from './reimb';

export type UnderKind = 'allowed_below_contract' | 'short_pay' | 'below_expected';
export const UNDER_LABEL: Record<UnderKind, string> = { allowed_below_contract: 'Allowed below contract', short_pay: 'Paid less than allowed', below_expected: 'Below expected (estimate)' };
export interface Underpayment { claim: Claim; expected: number; received: number; allowed: number | null; variance: number; pct: number; kind: UnderKind; confidence: 'high' | 'low'; writtenOff: boolean; evidence: string[] }
const r2 = (n: number) => Math.round(n * 100) / 100;

export function detectUnderpayments(claims: Claim[], cfg: ReimbCfg, today: string): Underpayment[] {
  const out: Underpayment[] = []; const cut = new Date(Date.parse(today + 'T12:00:00Z') - cfg.underpay.lookbackDays * 864e5).toISOString();
  for (const c of claims) {
    const paid = c.paid_amt; const exp = c.expected_amt; if (paid == null || paid <= 0 || !exp || exp <= 0 || !c.expected_src) continue;
    if (c.closed_at && c.closed_at < cut) continue;
    const pr = c.patient_resp ?? 0; const received = r2(paid + pr); const allowed = c.allowed_amt != null && c.allowed_amt > 0 ? c.allowed_amt : null; const fs = c.expected_src === 'fee_schedule';
    const ev: string[] = []; let kind: UnderKind; let variance: number;
    if (fs && allowed != null && exp - allowed >= 0.005) { kind = 'allowed_below_contract'; variance = r2(exp - allowed); ev.push(`Payer allowed ${allowed.toFixed(2)}; contract allows ${exp.toFixed(2)}`); }
    else { variance = r2(exp - received); kind = fs ? 'short_pay' : 'below_expected'; if (allowed != null && received < allowed - 0.005) ev.push(`Paid + patient ${received.toFixed(2)} is below the allowed amount ${allowed.toFixed(2)}`); else ev.push(`Received ${received.toFixed(2)} vs expected ${exp.toFixed(2)}`); }
    const pct = exp > 0 ? (variance / exp) * 100 : 0;
    if (variance < cfg.underpay.minDollars || pct < cfg.underpay.minPct) continue;
    if (c.denial_codes && paid <= 0) continue;
    const writtenOff = !!c.closed_at && c.resolution === 'adjusted';
    out.push({ claim: c, expected: exp, received, allowed, variance, pct: r2(pct), kind, confidence: fs ? 'high' : 'low', writtenOff, evidence: [...ev, `Expected via ${c.expected_src === 'fee_schedule' ? 'fee schedule' : c.expected_src === 'payer_pct' ? 'payer %' : 'client GCR'}`, ...(writtenOff ? ['Claim was closed as adjusted — the shortfall may have been written off'] : [])] });
  }
  return out.sort((a, b) => b.variance - a.variance);
}
export interface Systemic { payer: string; cpt: string; n: number; total: number; avgPct: number; clients: number }
/** same payer + CPT underpaid again and again → a contract dispute, not a one-off */
export function systemicUnderpay(items: Underpayment[], cfg: ReimbCfg): Systemic[] {
  const m = new Map<string, { payer: string; cpt: string; n: number; total: number; pct: number; clients: Set<string> }>();
  for (const u of items) { if (u.confidence !== 'high') continue; const cpt = (u.claim.cpt || '').split(/[,;\s]+/)[0] || '—'; const k = `${u.claim.payer}|${cpt}`; const e = m.get(k) || { payer: u.claim.payer || 'Unknown', cpt, n: 0, total: 0, pct: 0, clients: new Set<string>() }; e.n++; e.total += u.variance; e.pct += u.pct; e.clients.add(u.claim.client_id); m.set(k, e); }
  return [...m.values()].filter((e) => e.n >= cfg.underpay.systemicCount).map((e) => ({ payer: e.payer, cpt: e.cpt, n: e.n, total: r2(e.total), avgPct: r2(e.pct / e.n), clients: e.clients.size })).sort((a, b) => b.total - a.total);
}
