// "Learning" from your own history — no black box, just transparent frequencies with sample sizes so managers can trust or ignore them.
import type { Appeal, Claim, WorkLog } from '../types';
import { splitDenials } from '../kb';
import { normCpt } from './normalize';

export interface Odds { n: number; wins: number; winRate: number; avgRecovered: number; level: 'payer+code' | 'payer' | 'code' }
const key = (...p: (string | null | undefined)[]) => p.map((x) => String(x || '').trim().toLowerCase()).join('|');
const primary = (c: Claim) => splitDenials(c.denial_codes)[0] || '';
const decided = (a: Appeal) => a.status === 'won' || a.status === 'lost' || a.status === 'partial';

/** Historical appeal success by payer × first denial code, falling back to payer-only then code-only when a cell is thin. */
export function appealOdds(appeals: Appeal[], claims: Claim[], minN = 3) {
  const byId = new Map(claims.map((c) => [c.id, c])); const cells = new Map<string, { n: number; w: number; rec: number }>();
  const bump = (k: string, a: Appeal) => { const e = cells.get(k) || { n: 0, w: 0, rec: 0 }; e.n++; if (a.status === 'won' || a.status === 'partial') { e.w++; e.rec += a.amount_recovered || 0; } cells.set(k, e); };
  for (const a of appeals) { if (!decided(a) || a.kind !== 'appeal') continue; const c = byId.get(a.claim_id); const pay = a.payer || c?.payer; const code = c ? primary(c) : ''; bump('pc:' + key(pay, code), a); bump('p:' + key(pay), a); if (code) bump('c:' + key(code), a); }
  const mk = (e: { n: number; w: number; rec: number } | undefined, level: Odds['level']): Odds | null => (e && e.n >= minN ? { n: e.n, wins: e.w, winRate: e.w / e.n, avgRecovered: e.w ? e.rec / e.w : 0, level } : null);
  return (payer: string | null | undefined, code: string | null | undefined): Odds | null => mk(cells.get('pc:' + key(payer, code)), 'payer+code') || mk(cells.get('p:' + key(payer)), 'payer') || mk(cells.get('c:' + key(code)), 'code');
}

export interface Risk { score: number; level: 'high' | 'med' | 'low'; reasons: string[]; n: number }
/** Denial risk by payer × CPT (and payer × provider): how often similar claims in your own aging file ended up denied. Smoothed so tiny samples don't shout. */
export function denialRisk(claims: Claim[], minN = 5) {
  const cell = new Map<string, { n: number; d: number }>(); let N = 0, D = 0;
  const add = (k: string, denied: boolean) => { const e = cell.get(k) || { n: 0, d: 0 }; e.n++; if (denied) e.d++; cell.set(k, e); };
  for (const c of claims) { const denied = splitDenials(c.denial_codes).length > 0; N++; if (denied) D++; add('pc:' + key(c.payer, normCpt(c.cpt)), denied); add('pp:' + key(c.payer, c.provider), denied); add('p:' + key(c.payer), denied); }
  const base = N ? D / N : 0; const k = 4;   // pseudo-count shrinkage toward the file-wide rate
  const rate = (e?: { n: number; d: number }) => (e ? (e.d + k * base) / (e.n + k) : base);
  const score = (c: { payer: string | null; cpt: string | null; provider: string | null }): Risk => {
    const a = cell.get('pc:' + key(c.payer, normCpt(c.cpt))); const b = cell.get('pp:' + key(c.payer, c.provider)); const p = cell.get('p:' + key(c.payer));
    const parts: [number, number][] = []; const reasons: string[] = [];
    if (a && a.n >= minN) { parts.push([rate(a), 0.5]); reasons.push(`${Math.round((a.d / a.n) * 100)}% of ${a.n} ${c.payer} claims for CPT ${normCpt(c.cpt)} were denied`); }
    if (b && b.n >= minN) { parts.push([rate(b), 0.3]); reasons.push(`${Math.round((b.d / b.n) * 100)}% of ${b.n} claims for this payer + provider were denied`); }
    if (p && p.n >= minN) { parts.push([rate(p), 0.2]); }
    const w = parts.reduce((s, x) => s + x[1], 0); const r = w ? parts.reduce((s, x) => s + x[0] * x[1], 0) / w : base; const sc = Math.round(Math.min(1, r) * 100);
    return { score: sc, level: sc >= Math.max(35, base * 100 * 2) ? 'high' : sc >= Math.max(20, base * 100 * 1.3) ? 'med' : 'low', reasons, n: a?.n || b?.n || p?.n || 0 };
  };
  return { score, base, top: (n = 15) => [...cell.entries()].filter(([k2, e]) => k2.startsWith('pc:') && e.n >= minN).map(([k2, e]) => ({ payer: k2.split('|')[0].slice(3), cpt: k2.split('|')[1], n: e.n, rate: e.d / e.n })).sort((x, y) => y.rate * Math.log1p(y.n) - x.rate * Math.log1p(x.n)).slice(0, n) };
}

export interface ActionStat { action: string; n: number; resolved: number; rate: number; medianDays: number | null }
/** Which end-actions actually led to the claim closing (within `windowDays`), per payer or overall — "what works here". */
export function actionSuccess(workLog: WorkLog[], claims: Claim[], opts: { payer?: string | null; windowDays?: number; minN?: number } = {}): ActionStat[] {
  const win = opts.windowDays ?? 45; const minN = opts.minN ?? 5; const byId = new Map(claims.map((c) => [c.id, c])); const agg = new Map<string, { n: number; ok: number; days: number[] }>();
  for (const w of workLog) { if (!w.end_action) continue; const c = byId.get(w.claim_id); if (!c) continue; if (opts.payer && (c.payer || '').toLowerCase() !== opts.payer.toLowerCase()) continue;
    const e = agg.get(w.end_action) || { n: 0, ok: 0, days: [] }; e.n++; if (c.closed_at) { const d = (Date.parse(c.closed_at.slice(0, 10)) - Date.parse(w.work_date)) / 864e5; if (d >= 0 && d <= win) { e.ok++; e.days.push(d); } } agg.set(w.end_action, e); }
  return [...agg.entries()].filter(([, e]) => e.n >= minN).map(([action, e]) => { const s = e.days.sort((a, b) => a - b); return { action, n: e.n, resolved: e.ok, rate: e.ok / e.n, medianDays: s.length ? s[Math.floor(s.length / 2)] : null }; }).sort((a, b) => b.rate - a.rate);
}

export interface CodeStats { code: string; claims: number; open: number; balance: number; resolvedPct: number | null; medianDaysToClose: number | null; appeals: { decided: number; winRate: number | null; avgRecovered: number }; topActions: { action: string; n: number; rate: number }[]; topPayers: { payer: string; n: number }[] }
/** "How does it actually go for us?" for one denial code: volume, how often and how fast it resolves, appeal results and which follow-up actions preceded closure. */
export function codeStats(code: string, claims: Claim[], appeals: Appeal[], workLog: WorkLog[]): CodeStats | null {
  const norm = (c: string) => c.toUpperCase().replace(/\s/g, '').replace(/^([A-Z]{2})(\d)/, '$1-$2'); const want = /^\d+$/.test(code.trim()) ? 'CO-' + code.trim() : norm(code); const mine = claims.filter((c) => splitDenials(c.denial_codes).some((x) => norm(x) === want)); if (!mine.length) return null;
  const closed = mine.filter((c) => c.closed_at); const days = closed.map((c) => (c.created_at && c.closed_at ? Math.round((Date.parse(c.closed_at.slice(0, 10)) - Date.parse(c.created_at.slice(0, 10))) / 864e5) : -1)).filter((d) => d >= 0).sort((a, b) => a - b);
  const ids = new Set(mine.map((c) => c.id)); const ap = appeals.filter((a) => ids.has(a.claim_id) && ['won', 'partial', 'lost'].includes(a.status)); const won = ap.filter((a) => a.status !== 'lost');
  const byAct = new Map<string, { n: number; ok: number }>(); const closedIds = new Set(closed.map((c) => c.id)); for (const w of workLog) { if (!ids.has(w.claim_id) || !w.end_action) continue; const e = byAct.get(w.end_action) || { n: 0, ok: 0 }; e.n++; if (closedIds.has(w.claim_id)) e.ok++; byAct.set(w.end_action, e); }
  const pay = new Map<string, number>(); for (const c of mine) pay.set(c.payer || 'Unknown', (pay.get(c.payer || 'Unknown') || 0) + 1);
  return { code: want, claims: mine.length, open: mine.length - closed.length, balance: Math.round(mine.filter((c) => !c.closed_at).reduce((a, c) => a + Math.max(0, c.balance), 0)), resolvedPct: Math.round((closed.length / mine.length) * 100), medianDaysToClose: days.length ? days[Math.floor(days.length / 2)] : null,
    appeals: { decided: ap.length, winRate: ap.length >= 2 ? Math.round((won.length / ap.length) * 100) : null, avgRecovered: won.length ? Math.round(won.reduce((a, x) => a + (x.amount_recovered || 0), 0) / won.length) : 0 },
    topActions: [...byAct.entries()].filter(([, e]) => e.n >= 3).map(([action, e]) => ({ action, n: e.n, rate: Math.round((e.ok / e.n) * 100) })).sort((a, b) => b.rate - a.rate).slice(0, 3), topPayers: [...pay.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([payer, n]) => ({ payer, n })) };
}
