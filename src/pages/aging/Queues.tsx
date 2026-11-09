import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gavel } from 'lucide-react';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { FAMILIES } from '../../lib/engine/families';
import { lifecycleDefs } from '../../lib/engine/lifecycle';
import { useStore } from '../../store';
import { useBuckets, useClaims } from '../../hooks';
import { Card, Chip, Empty } from '../../components/ui';
import { cn, fmtDate, money, moneyShort, num, pct, sum } from '../../lib/utils';

/** eCW/athena-style A/R queues: where each claim sits in the payer lifecycle, by age and by client, plus the appeals tracker. */
export default function Queues() {
  const nav = useNavigate(); const ecs = useClaims(); const buckets = useBuckets(); const { config, clients, clientScope } = useStore();
  const open = useMemo(() => ecs.filter((x) => x.open), [ecs]);
  const stages = useMemo(() => { const m = new Map<string, { name: string; color: string; patient: boolean; list: typeof open }>(); open.forEach((x) => { const k = x.stage || '—'; const e = m.get(k) || { name: k, color: x.stageColor || '#64748b', patient: !!x.patientAR, list: [] }; e.list.push(x); m.set(k, e); }); return [...m.values()]; }, [open]);
  const order = config.filter((o) => o.category === 'stage' && o.active).sort((a, b) => a.sort - b.sort).map((o) => o.value); const ordered = [...stages].sort((a, b) => (order.indexOf(a.name) + 99) % 99 - (order.indexOf(b.name) + 99) % 99);
  const total = sum(open.map((x) => x.c.balance)) || 1; const patientV = sum(stages.filter((s) => s.patient).flatMap((s) => s.list).map((x) => x.c.balance)); const insV = total - patientV;
  const fams = useMemo(() => FAMILIES.map((f) => { const l = open.filter((x) => x.family === f.name); return { ...f, n: l.length, v: sum(l.map((x) => x.c.balance)) }; }).filter((f) => f.n > 0), [open]);
  const lcs = useMemo(() => lifecycleDefs(config).map((d) => { const l = open.filter((x) => x.lifecycle === d.code); return { ...d, n: l.length, v: sum(l.map((x) => x.c.balance)) }; }).filter((d) => d.n > 0), [open, config]);
  const unknownVisit = open.filter((x) => x.visit === 'Unknown').length;
  const go = (q: string) => nav('/worklist?' + q);
  const cl = clients.filter((c) => c.active && (!clientScope.length || clientScope.includes(c.id)));
  const apDays = (payer: string | null) => Number(config.find((o) => o.category === 'payer' && o.value.toLowerCase() === (payer || '').toLowerCase())?.meta.appeal_days || 60);
  const appeals = useMemo(() => open.filter((x) => x.stage === 'In appeal').map((x) => { const since = (x.c.last_touched_at || x.c.updated_at).slice(0, 10); const due = format(addDays(parseISO(since), apDays(x.c.payer)), 'yyyy-MM-dd'); return { x, since, due, left: differenceInCalendarDays(parseISO(due), new Date()) }; }).sort((a, b) => a.left - b.left), [open, config]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4">
      <Card title="Insurance A/R vs Patient A/R"><div className="flex h-3 rounded-full overflow-hidden panel2"><div style={{ width: pct(insV / total), background: 'rgb(91 91 214)' }} /><div style={{ width: pct(patientV / total), background: '#84cc16' }} /></div>
        <div className="flex gap-6 mt-3 text-sm"><span><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: 'rgb(91 91 214)' }} />Insurance <b>{moneyShort(insV)}</b> <span className="muted">({pct(insV / total)})</span></span><span><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: '#84cc16' }} />Patient <b>{moneyShort(patientV)}</b> <span className="muted">({pct(patientV / total)})</span></span></div></Card>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">{ordered.map((s) => { const v = sum(s.list.map((x) => x.c.balance)); return (
        <button key={s.name} onClick={() => go('stage=' + encodeURIComponent(s.name))} className="panel p-4 text-left hover:shadow-soft hover:-translate-y-px transition relative overflow-hidden">
          <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: s.color }} /><div className="label !mb-1" style={{ color: s.color }}>{s.name}</div><div className="text-2xl font-semibold tabular-nums">{num(s.list.length)}</div>
          <div className="text-xs muted mt-0.5">{moneyShort(v)} · {pct(v / total)} · avg {Math.round(sum(s.list.map((x) => x.age ?? 0)) / Math.max(1, s.list.length))}d</div></button>); })}</div>
      <Card title="Work buckets — why claims are stuck" actions={<span className="text-[11px] muted">from root cause / end action · click to open</span>}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">{fams.map((f) => (
          <button key={f.name} onClick={() => go('family=' + encodeURIComponent(f.name))} className="text-left rounded-xl border hair px-3 py-2 hover:bg-black/[.03] dark:hover:bg-white/[.04] transition">
            <div className="flex items-center gap-2 text-xs font-medium"><span className="w-2 h-2 rounded-full" style={{ background: f.color }} />{f.name}</div>
            <div className="flex items-baseline gap-2 mt-1"><span className="text-lg font-semibold tabular-nums">{num(f.n)}</span><span className="text-xs muted">{moneyShort(f.v)}</span></div>
            <div className="h-1 rounded-full bg-black/5 dark:bg-white/10 mt-1.5"><div className="h-full rounded-full" style={{ width: pct(f.v / total), background: f.color }} /></div></button>))}</div></Card>
      <Card title="Lifecycle status" actions={unknownVisit > 0 ? <button className="btn btn-sm" onClick={() => go('visit=Unknown')}>{unknownVisit} need visit-type triage</button> : undefined}>
        <div className="flex flex-wrap gap-2">{lcs.map((l) => <button key={l.code} onClick={() => go('lifecycle=' + l.code)} className="rounded-lg border hair px-2.5 py-1.5 text-left hover:bg-black/[.03] dark:hover:bg-white/[.04]"><div className="text-[10px] font-semibold tracking-wide" style={{ color: l.color }}>{l.code}</div><div className="text-sm font-semibold tabular-nums">{num(l.n)}</div><div className="text-[10px] muted">{moneyShort(l.v)}</div></button>)}</div></Card>
      <Card title="Queue × age" pad={false}><div className="overflow-auto px-5 pb-5"><table className="grid"><thead><tr><th>Queue</th>{buckets.map((b) => <th key={b.label} style={{ textAlign: 'right' }}><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: b.color }} />{b.label}</th>)}<th style={{ textAlign: 'right' }}>Total</th></tr></thead><tbody>
        {ordered.map((s) => { const row = buckets.map((b) => { const l = s.list.filter((x) => x.bucket?.label === b.label); return { n: l.length, v: sum(l.map((x) => x.c.balance)) }; }); return (
          <tr key={s.name}><td className="font-medium whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: s.color }} />{s.name}</td>{row.map((c, i) => <td key={i} style={{ textAlign: 'right', cursor: c.n ? 'pointer' : undefined }} onClick={() => c.n && go(`stage=${encodeURIComponent(s.name)}&bucket=${encodeURIComponent(buckets[i].label)}`)}>{c.n ? <><b>{c.n}</b> <span className="muted text-[11px]">{moneyShort(c.v)}</span></> : <span className="muted">·</span>}</td>)}<td style={{ textAlign: 'right' }} className="font-semibold">{s.list.length} <span className="muted text-[11px] font-normal">{moneyShort(sum(s.list.map((x) => x.c.balance)))}</span></td></tr>); })}</tbody></table></div></Card>
      {cl.length > 1 && (
        <Card title="Client × queue (balance)" pad={false}><div className="overflow-auto px-5 pb-5"><table className="grid"><thead><tr><th>Client</th>{ordered.map((s) => <th key={s.name} style={{ textAlign: 'center' }}>{s.name.split(/[ /—(]/)[0]}</th>)}</tr></thead><tbody>
          {cl.map((c) => (<tr key={c.id}><td className="font-medium whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: c.color }} />{c.name}</td>{ordered.map((s) => { const l = s.list.filter((x) => x.c.client_id === c.id); const v = sum(l.map((x) => x.c.balance)); const mx = Math.max(1, ...cl.map((cc) => sum(s.list.filter((x) => x.c.client_id === cc.id).map((x) => x.c.balance)))); return <td key={s.name} style={{ textAlign: 'center', cursor: l.length ? 'pointer' : undefined, background: v ? `${s.color}${Math.round(20 + (v / mx) * 60).toString(16).padStart(2, '0')}` : undefined }} onClick={() => l.length && go(`client=${c.id}&stage=${encodeURIComponent(s.name)}`)} title={`${l.length} claims`}>{v ? moneyShort(v) : <span className="muted">·</span>}</td>; })}</tr>))}</tbody></table></div></Card>)}
      <Card title={<span className="flex items-center gap-2"><Gavel size={15} className="text-violet-500" />Appeals tracker</span>} pad={false} actions={<span className="text-[11px] muted">Deadline estimated from the last appeal touch + payer appeal window</span>}>
        <div className="px-5 pb-5 max-h-96 overflow-auto">{appeals.length === 0 ? <Empty title="No claims in appeal" /> : <table className="grid"><thead><tr><th>Claim</th><th>Client</th><th>Payer</th><th>Since</th><th>Est. deadline</th><th style={{ textAlign: 'right' }}>Days left</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead><tbody>
          {appeals.map(({ x, since, due, left }) => <tr key={x.c.id} className="cursor-pointer" onClick={() => useStore.getState().openClaim(x.c.id)}><td className="font-semibold">{x.c.claim_no}</td><td className="text-xs">{x.client?.name}</td><td>{x.c.payer}</td><td className="text-xs">{fmtDate(since)}</td><td className="text-xs">{fmtDate(due)}</td><td style={{ textAlign: 'right' }}><Chip color={left < 0 ? '#ef4444' : left <= 14 ? '#f59e0b' : '#22c55e'}>{left < 0 ? `${-left}d late` : `${left}d`}</Chip></td><td style={{ textAlign: 'right' }} className={cn('tabular-nums')}>{money(x.c.balance)}</td></tr>)}</tbody></table>}</div></Card>
    </div>
  );
}
