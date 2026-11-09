// Payer trend alerts for the Radar: what is CHANGING with each payer — denial spikes, emerging denial codes, deadline waves and slowdowns — so you react before the dollars age out.
import { match } from 'ts-pattern';
import type { Claim } from '../types';
import type { EClaim } from './eclaim';
import { splitDenials } from '../kb';

export type TrendKind = 'denial_spike' | 'new_code' | 'deadline_wave' | 'slowdown';
export interface TrendAlert { payer: string; kind: TrendKind; severity: 'high' | 'med'; title: string; detail: string; amount: number; claims: number; code?: string; ids: string[] }
const dd = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const denialDate = (c: Claim) => (c.denial_date as string | null | undefined) || (splitDenials(c.denial_codes).length ? (c.last_touched_at || c.created_at || '').slice(0, 10) : '');
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export const KIND_LABEL: Record<TrendKind, string> = { denial_spike: 'Denial spike', new_code: 'New denial pattern', deadline_wave: 'Deadline wave', slowdown: 'Payer slowdown' };

/** Weekly denial counts for one payer, oldest first (8 weeks ending today). */
export function weeklyDenials(claims: Claim[], payer: string | null, today: string, weeks = 8): { label: string; n: number }[] {
  const out = Array.from({ length: weeks }, (_, i) => ({ label: '', n: 0, start: dd(today, today) - (weeks - 1 - i) * 7 })); const t0 = Date.parse(today + 'T12:00:00Z');
  for (const c of claims) { if (payer && (c.payer || 'Unknown') !== payer) continue; const d = denialDate(c); if (!d) continue; const age = dd(d, today); if (age < 0 || age >= weeks * 7) continue; out[weeks - 1 - Math.floor(age / 7)].n++; }
  return out.map((o, i) => ({ label: new Date(t0 - (weeks - 1 - i) * 7 * 864e5).toISOString().slice(5, 10), n: o.n }));
}

export function payerTrends(ecs: EClaim[], today: string, opts: { payerDays?: (p: string | null) => number | null; minDenials?: number } = {}): TrendAlert[] {
  const alerts: TrendAlert[] = []; const min = opts.minDenials ?? 5; const by = new Map<string, EClaim[]>(); for (const x of ecs) by.set(x.c.payer || 'Unknown', [...(by.get(x.c.payer || 'Unknown') || []), x]);
  for (const [payer, list] of by) {
    const claims = list.map((x) => x.c); const open = list.filter((x) => x.open);
    // 1) denial spike: last 7 days vs the average of the 4 weeks before
    const w = weeklyDenials(claims, payer, today, 6); const now = w[w.length - 1].n; const prev = w.slice(-5, -1); const avg = prev.reduce((a, x) => a + x.n, 0) / prev.length;
    if (now >= min && now >= avg * 1.6) { const recent = claims.filter((c) => { const d = denialDate(c); return d && dd(d, today) >= 0 && dd(d, today) < 7; }); alerts.push({ payer, kind: 'denial_spike', severity: now >= avg * 2.5 ? 'high' : 'med', title: `${payer}: ${now} denials this week (usual ${avg.toFixed(1)})`, detail: `${Math.round((now / Math.max(avg, 0.5) - 1) * 100)}% above the 4-week norm. Look for a payer policy change, a bad batch, or a front-end edit that broke.`, amount: recent.reduce((a, c) => a + Math.max(0, c.balance), 0), claims: recent.length, ids: recent.map((c) => c.id) }); }
    // 2) emerging denial code: frequent in the last 14 days, rare in the 8 weeks before
    const codeOf = (c: Claim) => splitDenials(c.denial_codes)[0]; const recentD = claims.filter((c) => { const d = denialDate(c); return d && dd(d, today) >= 0 && dd(d, today) < 14 && codeOf(c); }); const olderD = claims.filter((c) => { const d = denialDate(c); return d && dd(d, today) >= 14 && dd(d, today) < 70 && codeOf(c); });
    const cnt = (xs: Claim[]) => { const m = new Map<string, Claim[]>(); for (const c of xs) m.set(codeOf(c)!, [...(m.get(codeOf(c)!) || []), c]); return m; }; const r = cnt(recentD), o = cnt(olderD);
    for (const [code, cs] of r) { const share0 = (o.get(code)?.length || 0) / Math.max(1, olderD.length); if (cs.length >= 4 && share0 < 0.03) alerts.push({ payer, kind: 'new_code', severity: cs.length >= 8 ? 'high' : 'med', title: `${payer}: ${code} is new (${cs.length} in 14 days)`, detail: `Almost absent in the previous 8 weeks (${Math.round(share0 * 100)}% of denials). Read the latest payer bulletin and the denial wording; fix the cause before more claims drop.`, amount: cs.reduce((a, c) => a + Math.max(0, c.balance), 0), claims: cs.length, code, ids: cs.map((c) => c.id) }); }
    // 3) deadline wave: dollars that will fall inside 14 days of a filing/appeal deadline in the next 14 days
    const wave = open.filter((x) => x.tfLeft != null && x.tfLeft >= 15 && x.tfLeft <= 28); const wAmt = wave.reduce((a, x) => a + Math.max(0, x.c.balance), 0);
    if (wave.length >= 8 || wAmt >= 5000) alerts.push({ payer, kind: 'deadline_wave', severity: wAmt >= 20000 || wave.length >= 25 ? 'high' : 'med', title: `${payer}: ${wave.length} claims (${money(wAmt)}) hit the ≤14-day zone within two weeks`, detail: 'Work or file these now while there is still time to fix and resubmit; waiting turns them into write-offs.', amount: wAmt, claims: wave.length, ids: wave.map((x) => x.c.id) });
    // 4) slowdown: open, undenied claims much older than the payer's usual pay time
    const norm = opts.payerDays?.(payer === 'Unknown' ? null : payer); const und = open.filter((x) => !splitDenials(x.c.denial_codes).length && (x.age ?? 0) > 20);
    if (norm && und.length >= 10) { const med = median(und.map((x) => x.age ?? 0)); if (med > norm * 1.4) alerts.push({ payer, kind: 'slowdown', severity: med > norm * 2 ? 'high' : 'med', title: `${payer} is paying slower than normal`, detail: `Median age of ${und.length} undenied open claims is ${med} days against a usual ${norm}. Ask for a provider-rep escalation and check for an outage or a processing backlog.`, amount: und.reduce((a, x) => a + Math.max(0, x.c.balance), 0), claims: und.length, ids: und.map((x) => x.c.id) }); }
  }
  const sev = (a: TrendAlert) => match(a.severity).with('high', () => 2).with('med', () => 1).exhaustive();
  return alerts.sort((a, b) => sev(b) - sev(a) || b.amount - a.amount);
}
