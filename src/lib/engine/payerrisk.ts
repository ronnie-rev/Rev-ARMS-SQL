// Payer watchlist: one risk score per payer from how it actually behaves for us — denials, speed, appeal outcomes, underpayments and filing-limit exposure.
import type { Appeal } from '../types';
import type { EClaim } from './eclaim';

export interface PayerRisk { payer: string; score: number; tier: 'high' | 'watch' | 'ok'; claims: number; open: number; balance: number; denialRate: number; medianDaysToClose: number | null; appealWin: number | null; appealsDecided: number; underpayRate: number | null; tfExposure: number; reasons: string[] }
const BENIGN = /^(CO-?45|CO-?253|PR-?\d+|OA-?23)$/i;
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const days = (a?: string | null, b?: string | null) => (a && b ? Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5) : null);
const denied = (c: { denial_codes: string | null }) => (c.denial_codes || '').split(/[,;\s]+/).filter(Boolean).some((k) => !BENIGN.test(k));

export function payerRisk(ecs: EClaim[], appeals: Appeal[], o: { minClaims?: number } = {}): PayerRisk[] {
  const by = new Map<string, EClaim[]>(); for (const x of ecs) { const p = x.c.payer || 'Unknown'; by.set(p, [...(by.get(p) || []), x]); }
  const all = ecs.map((x) => x.c); const gDen = all.length ? all.filter(denied).length / all.length : 0; const gDays = median(all.map((c) => (c.closed_at ? days(c.last_billed || c.dos || c.created_at, c.closed_at) : null)).filter((d): d is number => d != null && d >= 0));
  const apByClaim = new Map<string, Appeal[]>(); for (const a of appeals) apByClaim.set(a.claim_id, [...(apByClaim.get(a.claim_id) || []), a]);
  const out: PayerRisk[] = [];
  for (const [payer, xs] of by) {
    if (xs.length < (o.minClaims ?? 8)) continue; const open = xs.filter((x) => x.open); const cs = xs.map((x) => x.c); const reasons: string[] = []; let score = 0;
    const denialRate = cs.filter(denied).length / cs.length; const dRel = gDen > 0 ? denialRate / gDen : 1; if (denialRate >= 0.12 && dRel >= 1.3) { score += Math.min(30, Math.round((dRel - 1) * 24 + denialRate * 40)); reasons.push(`Denies ${Math.round(denialRate * 100)}% of claims (${dRel.toFixed(1)}× the book average)`); }
    const med = median(cs.map((c) => (c.closed_at ? days(c.last_billed || c.dos || c.created_at, c.closed_at) : null)).filter((d): d is number => d != null && d >= 0)); if (med != null && gDays && med > gDays * 1.3) { score += Math.min(20, Math.round((med / gDays - 1) * 22)); reasons.push(`Slow: median ${med} days to close vs ${gDays} overall`); }
    const ap = cs.flatMap((c) => apByClaim.get(c.id) || []).filter((a) => ['won', 'partial', 'lost'].includes(a.status)); const win = ap.length >= 3 ? ap.filter((a) => a.status !== 'lost').length / ap.length : null; if (win != null && win < 0.4) { score += Math.min(15, Math.round((0.4 - win) * 38)); reasons.push(`Appeals win only ${Math.round(win * 100)}% (${ap.length} decided)`); }
    const paid = cs.filter((c) => (c.paid_amt || 0) > 0 && c.expected_amt); const under = paid.length >= 5 ? paid.filter((c) => (c.paid_amt || 0) + (c.patient_resp || 0) < (c.expected_amt || 0) * 0.95).length / paid.length : null; if (under != null && under >= 0.2) { score += Math.min(15, Math.round(under * 30)); reasons.push(`${Math.round(under * 100)}% of paid claims came in below expected`); }
    const bal = open.reduce((s, x) => s + Math.max(0, x.c.balance), 0); const tf = open.filter((x) => x.tfLeft != null && x.tfLeft >= 0 && x.tfLeft <= 30).reduce((s, x) => s + Math.max(0, x.c.balance), 0); if (tf > 0 && bal > 0) { const sh = tf / bal; score += Math.min(20, Math.round(sh * 60) + (tf >= 5000 ? 4 : 0)); reasons.push(`$${Math.round(tf).toLocaleString('en-US')} within 30 days of a filing limit`); }
    out.push({ payer, score: Math.min(100, score), tier: score >= 45 ? 'high' : score >= 22 ? 'watch' : 'ok', claims: cs.length, open: open.length, balance: Math.round(bal), denialRate: Math.round(denialRate * 1000) / 10, medianDaysToClose: med, appealWin: win == null ? null : Math.round(win * 100), appealsDecided: ap.length, underpayRate: under == null ? null : Math.round(under * 100), tfExposure: Math.round(tf), reasons });
  }
  return out.sort((a, b) => b.score - a.score || b.balance - a.balance);
}
