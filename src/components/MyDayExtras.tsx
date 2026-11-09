import { useMemo } from 'react';
import { Copy } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, toast } from './ui';
import { promises } from '../lib/engine/calls';
import { chaseList } from '../lib/engine/appealstats';
import { money, todayISO } from '../lib/utils';
import type { EClaim } from '../hooks';

const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/** My Day extras: am I on pace, which payer promises and silent appeals are mine to chase, my week at a glance, and a one-click end-of-day summary. */
export function MyDayExtras({ mine, target }: { mine: EClaim[]; target: number }) {
  const { me: meFn, workLog, activity, recoveries, appeals, openClaim, has } = useStore(); const me = meFn(); const today = todayISO();
  const mineIds = useMemo(() => new Set(mine.map((x) => x.c.id)), [mine]);
  const myLog = useMemo(() => workLog.filter((w) => w.user_id === me?.id), [workLog, me]);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = addDays(today, i - 6); return { d, n: myLog.filter((w) => w.work_date === d).length }; }), [myLog, today]);
  const done = week[6].n; const h = new Date().getHours() + new Date().getMinutes() / 60; const expected = Math.round(target * Math.min(1, Math.max(0, (h - 8) / 9))); const pace = done - expected;
  const prom = useMemo(() => promises(mine.map((x) => x.c), today).filter((p) => p.status !== 'upcoming' || p.days <= 2), [mine, today]);
  const chase = useMemo(() => chaseList(appeals.filter((a) => mineIds.has(a.claim_id)), today, 30), [appeals, mineIds, today]);
  const calls = activity.filter((a) => a.kind === 'call' && a.actor_id === me?.id && a.created_at.slice(0, 10) === today).length;
  const rec = has('view_money') ? recoveries.filter((r) => r.user_id === me?.id && r.occurred_on >= addDays(today, -6)).reduce((a, r) => a + r.amount, 0) : null;
  const best = Math.max(1, ...week.map((w) => w.n));
  const wrap = () => { const lines = [`End of day ${today} — ${me?.full_name}`, `Touches: ${done}/${target}${pace < 0 ? ` (${-pace} behind pace)` : ''}`, `Payer calls logged: ${calls}`, `Follow-ups still due: ${mine.filter((x) => x.fuDue).length}`, `Promises to chase tomorrow: ${prom.length}`, `Appeals needing a chase: ${chase.length}`, ...(rec != null ? [`Recovered attributed this week: ${money(rec)}`] : [])]; void navigator.clipboard.writeText(lines.join('\n')); toast.ok('Summary copied'); };
  return (
    <div className="grid lg:grid-cols-3 gap-4 mb-4">
      <Card title="My week" actions={<button className="btn btn-sm" onClick={wrap}><Copy size={13} />End-of-day summary</button>}>
        <div className="flex items-end gap-1.5 h-20">{week.map((w) => <div key={w.d} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${w.d}: ${w.n} touches`}><div className="w-full rounded-t" style={{ height: Math.max(3, (w.n / best) * 64), background: w.d === today ? '#6366f1' : w.n >= target ? '#16a34a' : '#94a3b8' }} /><span className="text-[9px] muted">{w.d.slice(8)}</span></div>)}</div>
        <div className="text-[12.5px] mt-2">{pace >= 0 ? <span style={{ color: '#16a34a' }}>On pace ({done} of ~{expected} expected by now)</span> : <span style={{ color: '#d97706' }}>{-pace} behind pace ({done} of ~{expected} by now)</span>}{rec != null && <span className="muted"> · {money(rec)} attributed this week</span>}</div>
      </Card>
      <Card title={`Payer promises to chase (${prom.length})`} pad={false}><div className="px-3 pb-3 max-h-48 overflow-auto">{prom.slice(0, 8).map((p) => <div key={p.claim.id} className="flex items-center justify-between gap-2 py-1.5 text-[12.5px] cursor-pointer" onClick={() => openClaim(p.claim.id)}><span><b>{p.claim.claim_no}</b> <span className="muted">{p.claim.payer}</span></span><Chip color={p.status === 'broken' ? '#dc2626' : '#d97706'}>{p.status === 'broken' ? `${-p.days}d overdue` : p.status === 'due-today' ? 'today' : `in ${p.days}d`}</Chip></div>)}{!prom.length && <div className="muted text-sm py-4 text-center">None. Log a call with a promised date on Claim 360.</div>}</div></Card>
      <Card title={`Appeals with no answer (${chase.length})`} pad={false}><div className="px-3 pb-3 max-h-48 overflow-auto">{chase.slice(0, 8).map(({ appeal: a, daysOut, level }) => <div key={a.id} className="flex items-center justify-between gap-2 py-1.5 text-[12.5px] cursor-pointer" onClick={() => openClaim(a.claim_id)}><span><b>{mine.find((x) => x.c.id === a.claim_id)?.c.claim_no}</b> <span className="muted">L{a.level} · {a.payer}</span></span><Chip color={level === 'escalate' ? '#dc2626' : '#d97706'}>{daysOut}d</Chip></div>)}{!chase.length && <div className="muted text-sm py-4 text-center">Nothing waiting on a payer.</div>}</div></Card>
    </div>
  );
}
