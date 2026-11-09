// Huddle 2.0: everything a team lead needs for a 15-minute stand-up, assembled from data we already have (touches, recoveries, appeals, claim signals, payer trends), with a time-boxed agenda.
import type { Appeal, Profile, Recovery, WorkLog } from '../types';
import type { EClaim } from './eclaim';
import type { Insight } from './insights';
import type { TrendAlert } from './payertrend';
import { chaseList, type Chase } from './appealstats';
import { promises, type Promise_ } from './calls';
import { splitDenials } from '../kb';

const dd = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const r0 = (n: number) => Math.round(n);
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export interface FireRow { id: string; claim_no: string; payer: string | null; client: string; balance: number; why: string; tone: Insight['tone'] }
export interface CapRow { id: string; name: string; open: number; dueToday: number; touchesPrev: number; target: number; attain: number; flag: 'idle' | 'overloaded' | 'ok' }
export interface Huddle2 {
  date: string; prevDay: string;
  kpis: { touches: number; target: number; attain: number; recovered: number; recoveredMTD: number; recoveredLastMonthToDate: number; followupsDue: number; overdue: number; unassigned: number; unassignedBalance: number; filing7: number; filing7Amt: number };
  wins: { recovered: number; top: { claim_no: string; payer: string | null; amount: number; by: string }[]; byClient: { client: string; amount: number }[] };
  fires: FireRow[]; filing: { payer: string; n: number; amount: number; soonest: number }[]; promises: Promise_[]; chase: (Chase & { claim_no: string })[]; blockers: TrendAlert[];
  capacity: CapRow[]; unassignedByClient: { client: string; n: number; amount: number }[]; crossing: { client: string; n: number; amount: number }[]; newDenials: { payer: string; code: string; n: number; amount: number }[];
  focus: FireRow[]; agenda: { title: string; minutes: number; line: string }[];
}
export interface Huddle2In { ecs: EClaim[]; workLog: WorkLog[]; recoveries: Recovery[]; appeals: Appeal[]; people: Pick<Profile, 'id' | 'full_name' | 'daily_target'>[]; insights: Map<string, Insight[]>; trends: TrendAlert[]; today: string; clientId?: string }

export function buildHuddle(i: Huddle2In): Huddle2 {
  const today = i.today; const dow = new Date(today + 'T12:00:00Z').getUTCDay(); const prev = addDays(today, dow === 1 ? -3 : dow === 0 ? -2 : -1);
  const ecs = i.clientId ? i.ecs.filter((x) => x.c.client_id === i.clientId) : i.ecs; const open = ecs.filter((x) => x.open); const ids = new Set(ecs.map((x) => x.c.id)); const byId = new Map(ecs.map((x) => [x.c.id, x]));
  const log = i.workLog.filter((w) => !i.clientId || w.client_id === i.clientId); const rec = i.recoveries.filter((r) => !i.clientId || r.client_id === i.clientId);
  const yl = log.filter((w) => w.work_date === prev); const target = i.people.reduce((a, p) => a + (p.daily_target || 40), 0);
  const month0 = today.slice(0, 8) + '01'; const lmStart = addDays(month0, -1).slice(0, 8) + '01'; const dom = Number(today.slice(8, 10)); const lmEnd = lmStart.slice(0, 8) + String(dom).padStart(2, '0');
  const sum = (xs: Recovery[]) => xs.reduce((a, r) => a + r.amount, 0);
  const recY = rec.filter((r) => r.occurred_on === prev); const clientName = (id: string) => byId.get(id)?.client?.name || '';
  const due = open.filter((x) => x.fuDue); const un = open.filter((x) => !x.c.assigned_to); const f7 = open.filter((x) => x.tfLeft != null && x.tfLeft >= 0 && x.tfLeft <= 7);
  const rowOf = (x: EClaim, n: Insight): FireRow => ({ id: x.c.id, claim_no: x.c.claim_no, payer: x.c.payer, client: x.client?.name || '', balance: x.c.balance, why: n.detail, tone: n.tone });
  const scored = open.map((x) => { const l = i.insights.get(x.c.id) || []; const top = l[0]; return top ? { x, top, s: top.weight * Math.log10(Math.max(10, x.c.balance + 10)) } : null; }).filter(Boolean) as { x: EClaim; top: Insight; s: number }[];
  const fires = scored.filter((r) => r.top.tone === 'bad').sort((a, b) => b.s - a.s).slice(0, 12).map((r) => rowOf(r.x, r.top)); const focus = scored.sort((a, b) => b.s - a.s).slice(0, 5).map((r) => rowOf(r.x, r.top));
  const fm = new Map<string, { n: number; amount: number; soonest: number }>(); for (const x of open) if (x.tfLeft != null && x.tfLeft >= 0 && x.tfLeft <= 14) { const k = x.c.payer || 'Unknown'; const e = fm.get(k) || { n: 0, amount: 0, soonest: 99 }; e.n++; e.amount += Math.max(0, x.c.balance); e.soonest = Math.min(e.soonest, x.tfLeft); fm.set(k, e); }
  const prom = promises(open.map((x) => x.c), today).filter((p) => p.status !== 'upcoming' || p.days <= 3);
  const chase = chaseList(i.appeals.filter((a) => ids.has(a.claim_id)), today, 30).map((c) => ({ ...c, claim_no: byId.get(c.appeal.claim_id)?.c.claim_no || '—' }));
  const owners = new Map<string, EClaim[]>(); for (const x of open) if (x.c.assigned_to) owners.set(x.c.assigned_to, [...(owners.get(x.c.assigned_to) || []), x]);
  const avgOpen = i.people.length ? [...owners.values()].reduce((a, l) => a + l.length, 0) / i.people.length : 0; const workdayPrev = new Date(prev + 'T12:00:00Z').getUTCDay();
  const capacity: CapRow[] = i.people.map((p) => { const mine = owners.get(p.id) || []; const t = yl.filter((w) => w.user_id === p.id).length; const tg = p.daily_target || 40; const attain = r0((t / tg) * 100); return { id: p.id, name: p.full_name, open: mine.length, dueToday: mine.filter((x) => x.fuDue).length, touchesPrev: t, target: tg, attain, flag: (mine.length > Math.max(20, avgOpen * 1.6) ? 'overloaded' : workdayPrev !== 0 && workdayPrev !== 6 && mine.length > 0 && attain < 40 ? 'idle' : 'ok') as CapRow['flag'] }; }).sort((a, b) => (a.flag === 'ok' ? 1 : 0) - (b.flag === 'ok' ? 1 : 0) || b.dueToday - a.dueToday);
  const group = (xs: EClaim[]) => { const m = new Map<string, { n: number; amount: number }>(); for (const x of xs) { const k = x.client?.name || ''; const e = m.get(k) || { n: 0, amount: 0 }; e.n++; e.amount += Math.max(0, x.c.balance); m.set(k, e); } return [...m.entries()].map(([client, v]) => ({ client, n: v.n, amount: r0(v.amount) })).sort((a, b) => b.amount - a.amount).slice(0, 8); };
  const nd = new Map<string, { n: number; amount: number }>(); for (const x of open) { const d = (x.c.denial_date as string | null | undefined) || ''; const code = splitDenials(x.c.denial_codes)[0]; if (!d || !code || dd(d, today) > 2 || dd(d, today) < 0) continue; const k = (x.c.payer || 'Unknown') + '|' + code; const e = nd.get(k) || { n: 0, amount: 0 }; e.n++; e.amount += Math.max(0, x.c.balance); nd.set(k, e); }
  const topPay = recY.sort((a, b) => b.amount - a.amount).slice(0, 5).map((r) => ({ claim_no: byId.get(r.claim_id || '')?.c.claim_no || '—', payer: byId.get(r.claim_id || '')?.c.payer ?? null, amount: r0(r.amount), by: r.user_name || '' }));
  const winByClient = new Map<string, number>(); for (const r of recY) winByClient.set(clientName(r.client_id) || '', (winByClient.get(clientName(r.client_id) || '') || 0) + r.amount);
  const h: Huddle2 = {
    date: today, prevDay: prev,
    kpis: { touches: yl.length, target, attain: target ? r0((yl.length / target) * 100) : 0, recovered: r0(sum(recY)), recoveredMTD: r0(sum(rec.filter((r) => r.occurred_on >= month0 && r.occurred_on <= today))), recoveredLastMonthToDate: r0(sum(rec.filter((r) => r.occurred_on >= lmStart && r.occurred_on <= lmEnd))), followupsDue: due.length, overdue: due.filter((x) => x.c.next_fu && x.c.next_fu < today).length, unassigned: un.length, unassignedBalance: r0(un.reduce((a, x) => a + Math.max(0, x.c.balance), 0)), filing7: f7.length, filing7Amt: r0(f7.reduce((a, x) => a + Math.max(0, x.c.balance), 0)) },
    wins: { recovered: r0(sum(recY)), top: topPay, byClient: [...winByClient.entries()].map(([client, amount]) => ({ client, amount: r0(amount) })).sort((a, b) => b.amount - a.amount).slice(0, 5) },
    fires, filing: [...fm.entries()].map(([payer, v]) => ({ payer, n: v.n, amount: r0(v.amount), soonest: v.soonest })).sort((a, b) => a.soonest - b.soonest || b.amount - a.amount).slice(0, 8), promises: prom, chase: chase.slice(0, 8), blockers: i.trends.slice(0, 5),
    capacity, unassignedByClient: group(un), crossing: group(open.filter((x) => (x.age ?? 0) >= 83 && (x.age ?? 0) < 90)), newDenials: [...nd.entries()].map(([k, v]) => ({ payer: k.split('|')[0], code: k.split('|')[1], n: v.n, amount: r0(v.amount) })).sort((a, b) => b.amount - a.amount).slice(0, 6), focus, agenda: [],
  };
  h.agenda = [
    { title: 'Wins', minutes: 2, line: h.wins.recovered ? `${money(h.wins.recovered)} recovered on ${prev.slice(5)}${h.wins.top[0] ? `; biggest ${money(h.wins.top[0].amount)} on ${h.wins.top[0].claim_no}` : ''}.` : 'No recoveries posted on the last working day.' },
    { title: 'Fires', minutes: 4, line: `${fires.length} urgent claim${fires.length === 1 ? '' : 's'}; ${f7.length} with filing ≤ 7 days (${money(h.kpis.filing7Amt)}); ${prom.filter((p) => p.status === 'broken').length} broken promises; ${chase.length} appeals unanswered.` },
    { title: 'Payer blockers', minutes: 3, line: h.blockers.length ? h.blockers.slice(0, 2).map((b) => b.title).join(' · ') : 'No payer is behaving unusually.' },
    { title: 'People & capacity', minutes: 3, line: `${capacity.filter((c) => c.flag === 'overloaded').length} overloaded, ${capacity.filter((c) => c.flag === 'idle').length} under-worked yesterday; ${un.length} unassigned (${money(h.kpis.unassignedBalance)}).` },
    { title: 'Focus for today', minutes: 3, line: focus.length ? `Top target: ${focus[0].claim_no} — ${focus[0].why.slice(0, 90)}` : 'Work the follow-up queue in order.' },
  ];
  return h;
}
/** Slack/Teams-ready text version of the huddle. */
export function huddleText(h: Huddle2): string {
  const L: string[] = [`*Daily huddle — ${h.date}*`, '', `*Yesterday (${h.prevDay.slice(5)}):* ${h.kpis.touches} touches (${h.kpis.attain}% of target) · ${money(h.kpis.recovered)} recovered · MTD ${money(h.kpis.recoveredMTD)} (last month to date ${money(h.kpis.recoveredLastMonthToDate)})`, `*Due today:* ${h.kpis.followupsDue} follow-ups (${h.kpis.overdue} overdue) · ${h.kpis.unassigned} unassigned (${money(h.kpis.unassignedBalance)}) · ${h.kpis.filing7} claims with filing ≤7 days (${money(h.kpis.filing7Amt)})`, ''];
  if (h.fires.length) L.push('*Fires*', ...h.fires.slice(0, 6).map((f) => `• ${f.claim_no} (${f.payer || '—'}, ${money(f.balance)}) — ${f.why}`), '');
  if (h.blockers.length) L.push('*Payer blockers*', ...h.blockers.map((b) => `• ${b.title}`), '');
  if (h.focus.length) L.push('*Focus*', ...h.focus.map((f) => `• ${f.claim_no} — ${f.why}`));
  return L.join('\n');
}
