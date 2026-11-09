import { ClientPanel } from '../components/ClientPanel';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useStore } from '../store';
import { useBuckets, useClaims } from '../hooks';
import { Avatar, Bar, Card, Chip, PageHeader, Stat } from '../components/ui';
import { BucketBars, Donut, HBars, Heatmap } from '../components/Charts';
import { fmtDate, groupBy, money, moneyShort, num, pct, sum } from '../lib/utils';
import { clientHealth } from '../lib/engine/analytics_extra';

export default function ClientDetail() {
  const { id } = useParams(); const nav = useNavigate();
  const { clients, profiles, batches, workLog, providers } = useStore();
  const client = clients.find((c) => c.id === id);
  const all = useClaims(true); const buckets = useBuckets();
  const [by, setBy] = useState<'payer' | 'provider'>('payer');
  const claims = useMemo(() => all.filter((x) => x.c.client_id === id), [all, id]);
  const active = useMemo(() => claims.filter((x) => x.open), [claims]);
  const health = clientHealth(active, batches.filter((b) => b.client_id === id));
  if (!client) return <div className="muted">Client not found. <Link to="/clients" className="underline">Back</Link></div>;
  const bal = sum(active.map((x) => x.c.balance));
  const go = (q: string) => nav(`/worklist?client=${id}&${q}`);
  const bucketData = buckets.map((b) => { const l = active.filter((x) => x.bucket?.label === b.label); return { name: b.label, value: sum(l.map((x) => x.c.balance)), count: l.length, color: b.color }; });
  const rows = [...groupBy(active, (x) => (by === 'payer' ? x.c.payer : x.c.provider) || 'Unknown')].map(([n, l]) => [n, sum(l.map((x) => x.c.balance))] as const).sort((a, b) => b[1] - a[1]).slice(0, 10).map((r) => r[0]);
  const rca = [...groupBy(active.filter((x) => x.c.rca), (x) => x.c.rca!)].map(([name, l]) => ({ name, value: sum(l.map((x) => x.c.balance)) })).sort((a, b) => b.value - a.value).slice(0, 8);
  const staff = [...groupBy(active.filter((x) => x.owner), (x) => x.owner!.id)].map(([uid, l]) => ({ p: profiles.find((p) => p.id === uid)!, n: l.length, v: sum(l.map((x) => x.c.balance)), worked: l.filter((x) => x.c.touch_count > 0).length })).sort((a, b) => b.v - a.v);
  const myBatches = batches.filter((b) => b.client_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const touches30 = workLog.filter((w) => w.client_id === id && w.work_date >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).length;
  const statusMap = [...groupBy(claims.filter((x) => !x.c.closed_at), (x) => x.c.status)].map(([name, l]) => ({ name, value: l.length, color: '#6366f1' }));
  const palette = ['#6366f1', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#f97316', '#84cc16', '#ec4899', '#64748b', '#0ea5e9'];
  statusMap.forEach((s, i) => (s.color = palette[i % palette.length]));

  return (
    <div>
      <Link to="/clients" className="text-xs muted inline-flex items-center gap-1 mb-2 hover:text-[color:var(--text)]"><ArrowLeft size={13} />Clients</Link>
      <PageHeader title={<span className="flex items-center gap-3"><span className="w-3 h-8 rounded-full" style={{ background: client.color }} />{client.name}</span>}
        sub={<span>{client.pms} · supervisor {profiles.find((p) => p.id === client.supervisor_id)?.full_name || '—'} · aging by {client.aging_basis === 'dos' ? 'date of service' : 'last billed date'}{client.tf_days ? ` · TF ${client.tf_days}d` : ''}</span>}
        actions={<button className="btn btn-primary" onClick={() => go('')}>Open worklist</button>} />
      <ClientPanel client={client} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Stat label="Open AR" value={moneyShort(bal)} sub={`${num(active.length)} claims`} />
        <Stat label="> 120 days" value={pct(bal ? sum(active.filter((x) => (x.age ?? 0) > 120).map((x) => x.c.balance)) / bal : 0)} color="#ef4444" />
        <Stat label="Worked" value={pct(active.length ? active.filter((x) => x.c.touch_count > 0).length / active.length : 0)} color="#22c55e" />
        <Stat label="Touches · 30d" value={num(touches30)} color="#06b6d4" />
        <Stat label="Follow-ups due" value={active.filter((x) => x.fuDue).length} color="#f59e0b" onClick={() => go('view=fu')} />
      </div>
      <Card title={`Client health — ${health.score} (${health.grade})`} className="mb-4"><div className="grid grid-cols-2 md:grid-cols-5 gap-3">{health.parts.map((p) => <div key={p.label} className="panel2 p-3"><div className="label">{p.label}</div><div className="text-lg font-extrabold">{p.value}</div><Bar value={p.pts} max={p.max} color={p.pts / p.max > 0.7 ? '#22c55e' : p.pts / p.max > 0.4 ? '#f59e0b' : '#ef4444'} h={4} /><div className="text-[10px] muted mt-1">{p.pts}/{p.max} pts</div></div>)}</div></Card>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Aging" className="lg:col-span-2"><BucketBars data={bucketData} onClick={(b) => go('bucket=' + encodeURIComponent(b))} /></Card>
        <Card title="Claims by status"><Donut data={statusMap} onClick={(s) => go('status=' + encodeURIComponent(s))} /></Card>
      </div>
      <Card title={<div className="flex items-center gap-3">Heatmap by <select className="input !w-auto !py-1" value={by} onChange={(e) => setBy(e.target.value as any)}><option value="payer">payer</option><option value="provider">provider</option></select></div>} className="mb-4">
        <Heatmap rows={rows} cols={buckets.map((b) => ({ label: b.label, color: b.color }))}
          cell={(r, b) => { const l = active.filter((x) => ((by === 'payer' ? x.c.payer : x.c.provider) || 'Unknown') === r && x.bucket?.label === b); return { v: sum(l.map((x) => x.c.balance)), n: l.length }; }}
          onCell={(r, b) => go(`${by}=${encodeURIComponent(r)}&bucket=${encodeURIComponent(b)}`)} />
      </Card>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Root causes by $"><HBars data={rca} color="#8b5cf6" onClick={(n) => go('rca=' + encodeURIComponent(n))} /></Card>
        <Card title="Team on this account">
          {staff.length === 0 ? <div className="muted text-sm py-6 text-center">No claims assigned yet.</div> : <div className="space-y-3">{staff.map((s) => (
            <div key={s.p.id}><div className="flex items-center gap-2 text-sm"><Avatar name={s.p.full_name} size={22} /><span className="font-semibold flex-1">{s.p.full_name}</span><span className="muted text-xs">{s.n} claims · {moneyShort(s.v)}</span></div><div className="mt-1"><Bar value={s.worked} max={s.n} color="#22c55e" h={4} /></div></div>))}</div>}
        </Card>
        <Card title="Import history">
          {myBatches.length === 0 ? <div className="muted text-sm py-6 text-center">No imports yet.</div> : <div className="space-y-2.5">{myBatches.slice(0, 6).map((b) => (
            <div key={b.id} className="panel2 p-2.5 text-xs"><div className="flex justify-between"><b>{b.template_name}</b><span className="muted">{fmtDate(b.created_at.slice(0, 10))}</span></div>
              <div className="muted mt-0.5">{b.file_name}</div><div className="flex gap-1.5 mt-1.5 flex-wrap"><Chip color="#22c55e">+{b.new_rows} new</Chip><Chip color="#06b6d4">{b.updated_rows} updated</Chip><Chip color="#f59e0b">{b.dropped_rows} dropped</Chip><Chip color="#64748b">{money(b.total_balance)}</Chip></div></div>))}</div>}
        </Card>
      </div>
      <span className="hidden">{providers.length}</span>
    </div>
  );
}
