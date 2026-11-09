import { useMemo } from 'react';
import { isProducer } from '../../lib/roles';
import { eachDayOfInterval, format, isWeekend, parseISO } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { useStore } from '../../store';
import { Avatar, Bar, Card, Chip, Empty } from '../../components/ui';
import { cn, moneyShort, num, sum } from '../../lib/utils';
import type { Recovery, WorkLog } from '../../lib/types';

interface P { rows: WorkLog[]; from: string; to: string; recs: Recovery[] }

/** User × day matrix coloured against each person's daily target. */
export function TeamGrid({ rows, from, to }: P) {
  const { profiles } = useStore(); const staff = profiles.filter((p) => p.active && isProducer(p.role));
  const days = useMemo(() => eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).slice(-31), [from, to]);
  const by = useMemo(() => { const m = new Map<string, WorkLog[]>(); rows.forEach((w) => m.set(w.user_id || '', [...(m.get(w.user_id || '') || []), w])); return m; }, [rows]);
  const col = (n: number, t: number, we: boolean) => (we && !n ? 'transparent' : n >= t ? 'rgb(34 197 94 / .55)' : n >= t * 0.7 ? 'rgb(245 158 11 / .5)' : n > 0 ? 'rgb(239 68 68 / .45)' : 'rgb(239 68 68 / .12)');
  return (
    <Card title="Team grid — touches per day vs target" pad={false}>
      <div className="overflow-auto px-5 pb-5"><table className="grid"><thead><tr><th>Specialist</th>{days.map((d) => <th key={+d} style={{ textAlign: 'center', padding: '10px 4px', minWidth: 26 }}><div>{format(d, 'd')}</div><div className="opacity-60 font-normal normal-case tracking-normal">{format(d, 'EEEEE')}</div></th>)}<th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Avg min/touch</th><th style={{ textAlign: 'right' }}>Hours</th></tr></thead><tbody>
        {staff.map((p) => { const l = by.get(p.id) || []; const secs = sum(l.map((w) => w.time_spent_sec || 0)); const timed = l.filter((w) => w.time_spent_sec).length; return (
          <tr key={p.id}><td className="whitespace-nowrap"><div className="flex items-center gap-2"><Avatar name={p.full_name} size={22} /><div><div className="font-medium text-[13px]">{p.full_name}</div><div className="text-[10px] muted">target {p.daily_target}/day</div></div></div></td>
            {days.map((d) => { const k = format(d, 'yyyy-MM-dd'); const n = l.filter((w) => w.work_date === k).length; return <td key={k} title={`${format(d, 'MMM d')}: ${n}`} style={{ padding: 2, textAlign: 'center' }}><div className="rounded-md text-[10px] font-semibold h-6 flex items-center justify-center" style={{ background: col(n, p.daily_target, isWeekend(d)) }}>{n || ''}</div></td>; })}
            <td style={{ textAlign: 'right' }} className="font-semibold">{l.length}</td><td style={{ textAlign: 'right' }}>{timed ? (secs / timed / 60).toFixed(1) : '—'}</td><td style={{ textAlign: 'right' }}>{(secs / 3600).toFixed(1)}</td></tr>); })}</tbody></table>
        {!staff.length && <Empty title="No specialists" />}</div>
    </Card>
  );
}

/** Client × user touches; flags practices getting less attention than their size deserves. */
export function ByClient({ rows, recs }: P) {
  const { profiles, clients, claims, inScope } = useStore(); const staff = profiles.filter((p) => p.active && isProducer(p.role));
  const cl = clients.filter((c) => c.active && inScope(c.id));
  const open = useMemo(() => { const m = new Map<string, number>(); claims.forEach((c) => !c.closed_at && m.set(c.client_id, (m.get(c.client_id) || 0) + 1)); return m; }, [claims]);
  const totalOpen = sum([...open.values()]) || 1; const totalTouch = rows.length || 1;
  const cell = (cid: string, uid: string) => rows.filter((w) => w.client_id === cid && w.user_id === uid).length;
  const max = Math.max(1, ...cl.flatMap((c) => staff.map((p) => cell(c.id, p.id))));
  return (
    <Card title="Attention by client" pad={false}>
      <div className="overflow-auto px-5 pb-5"><table className="grid"><thead><tr><th>Client</th>{staff.map((p) => <th key={p.id} style={{ textAlign: 'center' }}>{p.full_name.split(' ')[0]}</th>)}<th style={{ textAlign: 'right' }}>Touches</th><th style={{ width: 150 }}>Share of work vs share of AR</th><th style={{ textAlign: 'right' }}>Recovered</th></tr></thead><tbody>
        {cl.map((c) => { const t = rows.filter((w) => w.client_id === c.id).length; const shareT = t / totalTouch, shareO = (open.get(c.id) || 0) / totalOpen; const under = shareO > 0.08 && shareT < shareO * 0.6; return (
          <tr key={c.id}><td className="whitespace-nowrap font-medium"><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: c.color }} />{c.name}</td>
            {staff.map((p) => { const n = cell(c.id, p.id); return <td key={p.id} style={{ textAlign: 'center', padding: 3 }}><div className="rounded-md h-7 flex items-center justify-center text-xs font-semibold" style={{ background: n ? `rgb(var(--b500) / ${0.12 + (n / max) * 0.6})` : 'transparent' }}>{n || '·'}</div></td>; })}
            <td style={{ textAlign: 'right' }} className="font-semibold">{t}</td>
            <td><div className="flex items-center gap-2"><div className="flex-1 space-y-1"><Bar value={shareT} max={1} color="rgb(91 91 214)" h={4} /><Bar value={shareO} max={1} color="#94a3b8" h={4} /></div>{under && <span title="Receives far less work than its share of open claims"><AlertTriangle size={14} className="text-amber-500" /></span>}</div></td>
            <td style={{ textAlign: 'right' }} className="tabular-nums">{moneyShort(sum(recs.filter((r) => r.client_id === c.id).map((r) => r.amount)))}</td></tr>); })}</tbody></table>
        <p className="text-[11px] muted mt-3">Top bar: share of touches · bottom bar: share of open claims. ⚠ = under-served practice.</p></div>
    </Card>
  );
}

/** Capacity vs demand over the next 10 working days, per client. Assumes each open claim needs a touch roughly every 14 days. */
export function Capacity() {
  const { profiles, clients, claims, inScope } = useStore(); const staff = profiles.filter((p) => p.active && isProducer(p.role)); const H = 10;
  const rows = useMemo(() => clients.filter((c) => c.active && inScope(c.id)).map((c) => {
    const open = claims.filter((x) => x.client_id === c.id && !x.closed_at); const horizon = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    const due = open.filter((x) => x.next_fu && x.next_fu <= horizon).length; const fresh = open.filter((x) => !x.touch_count).length;
    const need = Math.round((open.length / 14) * H + fresh * 0.5 + due * 0.5);
    const coverers = staff.filter((p) => (p.client_ids || []).includes(c.id)); const pool = coverers.length ? coverers : staff;
    const cap = Math.round(sum(pool.map((p) => (p.daily_target / Math.max(1, (p.client_ids || []).length || clients.length)) * H)));
    return { c, open: open.length, need, cap, util: cap ? need / cap : 2, coverers: coverers.length };
  }), [clients, claims, staff, inScope]);
  const totalNeed = sum(rows.map((r) => r.need)), totalCap = sum(staff.map((p) => p.daily_target * H));
  return (
    <Card title="Capacity planner — next 10 working days" pad={false}>
      <div className="px-5 pb-5">
        <div className="grid grid-cols-3 gap-3 mb-4">{[['Touches needed', num(totalNeed)], ['Team capacity', num(totalCap)], ['Utilisation', `${totalCap ? Math.round((totalNeed / totalCap) * 100) : 0}%`]].map(([l, v]) => <div key={l} className="panel2 p-3"><div className="label">{l}</div><div className="text-xl font-semibold tabular-nums">{v}</div></div>)}</div>
        <table className="grid"><thead><tr><th>Client</th><th style={{ textAlign: 'right' }}>Open</th><th style={{ textAlign: 'right' }}>Touches needed</th><th style={{ textAlign: 'right' }}>Capacity</th><th style={{ width: 180 }}>Load</th><th>Coverage</th></tr></thead><tbody>
          {[...rows].sort((a, b) => b.util - a.util).map((r) => (<tr key={r.c.id}><td className="font-medium"><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: r.c.color }} />{r.c.name}</td><td style={{ textAlign: 'right' }}>{num(r.open)}</td><td style={{ textAlign: 'right' }}>{r.need}</td><td style={{ textAlign: 'right' }}>{r.cap}</td>
            <td><div className="flex items-center gap-2"><div className="flex-1"><Bar value={Math.min(r.util, 1.5)} max={1.5} color={r.util > 1.1 ? '#ef4444' : r.util > 0.85 ? '#f59e0b' : '#22c55e'} h={6} /></div><span className={cn('text-xs font-semibold tabular-nums w-10 text-right', r.util > 1.1 && 'text-red-500')}>{Math.round(r.util * 100)}%</span></div></td>
            <td>{r.coverers ? <Chip color="#22c55e">{r.coverers} assigned</Chip> : <Chip color="#f59e0b">no one assigned</Chip>}</td></tr>))}</tbody></table>
        <p className="text-[11px] muted mt-3">Capacity splits each specialist’s daily target across the clients they cover (Allocation → Coverage). Over 110 % means that practice will fall behind without rebalancing or help.</p></div>
    </Card>
  );
}
