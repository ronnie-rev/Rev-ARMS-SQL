// Two read-outs built from the same data: the daily team huddle and the periodic client review. Pure and unit-tested; the pages only render them.
import type { Appeal, ClientRequest, Recovery, WorkLog } from '../types';
import type { EClaim } from './eclaim';
import { splitDenials } from '../kb';

const r0 = (n: number) => Math.round(n); const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

export interface Huddle { date: string; yesterday: { date: string; touches: number; recovered: number; people: { name: string; touches: number }[] }; today: { followupsDue: number; overdue: number; unassigned: number; unassignedBalance: number; deadlines14: number }; urgent: { id: string; claim_no: string; payer: string | null; balance: number; why: string }[]; stale: { id: string; claim_no: string; payer: string | null; balance: number; days: number }[]; owners: { name: string; open: number; due: number }[] }
/** "What do we need to know before we start today": last working day's output, what is due, what is on fire, who is loaded. */
export function huddle(ecs: EClaim[], workLog: WorkLog[], recoveries: Recovery[], today: string, urgent?: Map<string, string>): Huddle {
  const open = ecs.filter((x) => x.open); const dow = new Date(today + 'T12:00:00Z').getUTCDay(); const y = addDays(today, dow === 1 ? -3 : dow === 0 ? -2 : -1);
  const yl = workLog.filter((w) => w.work_date === y); const by = new Map<string, number>(); for (const w of yl) by.set(w.user_name || 'Unknown', (by.get(w.user_name || 'Unknown') || 0) + 1);
  const un = open.filter((x) => !x.c.assigned_to); const due = open.filter((x) => x.fuDue);
  const owners = new Map<string, { open: number; due: number }>(); for (const x of open) { const n = x.owner?.full_name; if (!n) continue; const e = owners.get(n) || { open: 0, due: 0 }; e.open++; if (x.fuDue) e.due++; owners.set(n, e); }
  const urg = open.filter((x) => (x.tfLeft != null && x.tfLeft >= 0 && x.tfLeft <= 14) || urgent?.has(x.c.id)).sort((a, b) => b.c.balance - a.c.balance).slice(0, 10).map((x) => ({ id: x.c.id, claim_no: x.c.claim_no, payer: x.c.payer, balance: x.c.balance, why: urgent?.get(x.c.id) || `Timely filing in ${x.tfLeft} days` }));
  const stale = open.filter((x) => x.stale).sort((a, b) => b.c.balance - a.c.balance).slice(0, 8).map((x) => ({ id: x.c.id, claim_no: x.c.claim_no, payer: x.c.payer, balance: x.c.balance, days: x.c.last_touched_at ? Math.round((Date.parse(today) - Date.parse(x.c.last_touched_at.slice(0, 10))) / 864e5) : x.age ?? 0 }));
  return { date: today, yesterday: { date: y, touches: yl.length, recovered: r0(recoveries.filter((r) => r.occurred_on === y).reduce((a, r) => a + r.amount, 0)), people: [...by.entries()].map(([name, touches]) => ({ name, touches })).sort((a, b) => b.touches - a.touches) },
    today: { followupsDue: due.length, overdue: due.filter((x) => x.c.next_fu && x.c.next_fu < today).length, unassigned: un.length, unassignedBalance: r0(un.reduce((a, x) => a + x.c.balance, 0)), deadlines14: open.filter((x) => x.tfLeft != null && x.tfLeft >= 0 && x.tfLeft <= 14).length },
    urgent: urg, stale, owners: [...owners.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.due - a.due) };
}

export interface ClientReview { from: string; to: string; openClaims: number; openBalance: number; aging: { label: string; n: number; balance: number }[]; newInPeriod: { n: number; balance: number }; closedInPeriod: { n: number }; recovered: number; recoveries: number; appeals: { filed: number; won: number; lost: number; pending: number; recovered: number }; topPayers: { payer: string; n: number; balance: number }[]; topDenials: { code: string; n: number; balance: number }[]; needsClient: { n: number; items: { claim_no: string; kind: string; body: string }[] }; highlights: string[] }
/** One client, one period: where the money is, what came in, what the appeals did, what we need from them. */
export function clientReview(ecs: EClaim[], recoveries: Recovery[], appeals: Appeal[], requests: ClientRequest[], clientId: string, from: string, to: string): ClientReview {
  const mine = ecs.filter((x) => x.c.client_id === clientId); const open = mine.filter((x) => x.open); const inP = (d: string | null | undefined) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
  const aging = new Map<string, { n: number; balance: number }>(); for (const x of open) { const l = x.bucket?.label || 'Unaged'; const e = aging.get(l) || { n: 0, balance: 0 }; e.n++; e.balance += x.c.balance; aging.set(l, e); }
  const payers = new Map<string, { n: number; balance: number }>(); for (const x of open) { const p = x.c.payer || 'Unknown'; const e = payers.get(p) || { n: 0, balance: 0 }; e.n++; e.balance += x.c.balance; payers.set(p, e); }
  const den = new Map<string, { n: number; balance: number }>(); for (const x of open) for (const c of splitDenials(x.c.denial_codes).slice(0, 1)) { const e = den.get(c) || { n: 0, balance: 0 }; e.n++; e.balance += x.c.balance; den.set(c, e); }
  const rec = recoveries.filter((r) => r.client_id === clientId && inP(r.occurred_on)); const ap = appeals.filter((a) => a.client_id === clientId);
  const req = requests.filter((r) => r.client_id === clientId && r.status === 'open'); const cn = new Map(mine.map((x) => [x.c.id, x.c.claim_no]));
  const sorted = <T extends { balance: number }>(m: Map<string, T>) => [...m.entries()].sort((a, b) => b[1].balance - a[1].balance);
  const rv: ClientReview = { from, to, openClaims: open.length, openBalance: r0(open.reduce((a, x) => a + x.c.balance, 0)), aging: [...aging.entries()].map(([label, v]) => ({ label, n: v.n, balance: r0(v.balance) })),
    newInPeriod: { n: mine.filter((x) => inP(x.c.created_at)).length, balance: r0(mine.filter((x) => inP(x.c.created_at)).reduce((a, x) => a + x.c.balance, 0)) }, closedInPeriod: { n: mine.filter((x) => inP(x.c.closed_at)).length }, recovered: r0(rec.reduce((a, r) => a + r.amount, 0)), recoveries: rec.length,
    appeals: { filed: ap.filter((a) => inP(a.filed_on)).length, won: ap.filter((a) => (a.status === 'won' || a.status === 'partial') && inP(a.decided_on)).length, lost: ap.filter((a) => a.status === 'lost' && inP(a.decided_on)).length, pending: ap.filter((a) => a.status === 'sent' || a.status === 'pending').length, recovered: r0(ap.filter((a) => inP(a.decided_on)).reduce((s, a) => s + (a.amount_recovered || 0), 0)) },
    topPayers: sorted(payers).slice(0, 6).map(([payer, v]) => ({ payer, n: v.n, balance: r0(v.balance) })), topDenials: sorted(den).slice(0, 6).map(([code, v]) => ({ code, n: v.n, balance: r0(v.balance) })),
    needsClient: { n: req.length, items: req.slice(0, 8).map((r) => ({ claim_no: cn.get(r.claim_id || '') || '—', kind: r.kind, body: r.body.slice(0, 140) })) }, highlights: [] };
  if (rv.recovered) rv.highlights.push(`Recovered $${rv.recovered.toLocaleString('en-US')} across ${rv.recoveries} payments this period.`);
  const old = open.filter((x) => (x.age ?? 0) > 120); if (old.length) rv.highlights.push(`${old.length} claims ($${r0(old.reduce((a, x) => a + x.c.balance, 0)).toLocaleString('en-US')}) are older than 120 days.`);
  if (rv.appeals.won + rv.appeals.lost) rv.highlights.push(`Appeals decided: ${rv.appeals.won} won, ${rv.appeals.lost} lost.`);
  if (rv.needsClient.n) rv.highlights.push(`${rv.needsClient.n} item(s) are waiting on your team.`);
  return rv;
}
