// Closed & resolved insights: how claims actually leave A/R — which payers close slowly or end in write-offs, and which closures still need a second look.
import type { Claim, Recovery } from '../types';

export interface PayerClose { payer: string; closed: number; medianDays: number | null; writeOffPct: number; paidPct: number; yieldPct: number | null }
export interface Insights { total: number; medianDays: number | null; writeOffPct: number; paidPct: number; recovered: number; billed: number; yieldPct: number | null; slowest: PayerClose[]; writeOffs: PayerClose[]; needsReview: { id: string; claim_no: string; why: string }[]; byReason: { reason: string; n: number }[] }
const days = (a?: string | null, b?: string | null) => (a && b ? Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5) : null);
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export function closedInsights(closed: Claim[], recoveries: Recovery[], o: { minPayerClaims?: number } = {}): Insights {
  const rec = new Map<string, number>(); for (const r of recoveries) if (r.claim_id) rec.set(r.claim_id, (rec.get(r.claim_id) || 0) + r.amount);
  const base = (c: Claim) => c.last_billed || c.dos || c.created_at; const dOf = (c: Claim) => days(base(c), c.closed_at); const res = (c: Claim) => c.resolution || 'unknown';
  const by = new Map<string, Claim[]>(); for (const c of closed) by.set(c.payer || 'Unknown', [...(by.get(c.payer || 'Unknown') || []), c]);
  const row = (payer: string, cs: Claim[]): PayerClose => { const b = cs.reduce((s, c) => s + (c.billed_amt || 0), 0); const r = cs.reduce((s, c) => s + (rec.get(c.id) || 0), 0); return { payer, closed: cs.length, medianDays: median(cs.map(dOf).filter((d): d is number => d != null && d >= 0)), writeOffPct: Math.round((cs.filter((c) => res(c) === 'adjusted').length / cs.length) * 100), paidPct: Math.round((cs.filter((c) => res(c) === 'paid').length / cs.length) * 100), yieldPct: b > 0 ? Math.round((r / b) * 100) : null }; };
  const rows = [...by.entries()].filter(([, cs]) => cs.length >= (o.minPayerClaims ?? 5)).map(([p, cs]) => row(p, cs));
  const all = row('All', closed); const billed = closed.reduce((s, c) => s + (c.billed_amt || 0), 0); const recovered = closed.reduce((s, c) => s + (rec.get(c.id) || 0), 0);
  const needsReview = closed.filter((c) => res(c) === 'unknown' || (res(c) === 'paid' && !(rec.get(c.id) || 0) && (c.billed_amt || 0) > 0)).slice(0, 8).map((c) => ({ id: c.id, claim_no: c.claim_no, why: res(c) === 'unknown' ? 'Closed without a confirmed outcome' : 'Marked paid but no payment is recorded' }));
  const reasons = new Map<string, number>(); for (const c of closed) { const r = (c.closed_reason || '').trim(); if (r) reasons.set(r.replace(/\d{2,}/g, '#'), (reasons.get(r.replace(/\d{2,}/g, '#')) || 0) + 1); }
  return { total: closed.length, medianDays: all.medianDays, writeOffPct: all.writeOffPct, paidPct: all.paidPct, recovered: Math.round(recovered), billed: Math.round(billed), yieldPct: billed > 0 ? Math.round((recovered / billed) * 100) : null, slowest: [...rows].filter((r) => r.medianDays != null).sort((a, b) => (b.medianDays || 0) - (a.medianDays || 0)).slice(0, 4), writeOffs: [...rows].filter((r) => r.writeOffPct >= 15).sort((a, b) => b.writeOffPct - a.writeOffPct).slice(0, 4), needsReview, byReason: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([reason, n]) => ({ reason, n })) };
}
