import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { useBuckets, useClaims, useCollect, useIntel, useOpts } from '../hooks';
import { rollForward } from '../lib/engine/analytics_extra';
import { Card, PageHeader, Stat, Tabs } from '../components/ui';
import Papa from 'papaparse';
import { Download } from 'lucide-react';
import type { EClaim } from '../hooks';
import Queues from './aging/Queues';
import { collectabilityCurve } from '../lib/engine/collectability';
import { Chip } from '../components/ui';
import { downloadFile, money, moneyShort, num, sum } from '../lib/utils';

type Dim = 'status' | 'payer' | 'owner' | 'rca' | 'client' | 'stage' | 'bucket2';
const DIMS: Record<Dim, { label: string; q: string; of: (x: EClaim, c: { owners: Map<string, string> }) => string }> = {
  status: { label: 'Workflow status', q: 'status', of: (x) => x.c.status || '—' }, payer: { label: 'Payer', q: 'payer', of: (x) => x.c.payer || 'Unknown' }, owner: { label: 'Owner', q: 'owner', of: (x, c) => (x.c.assigned_to ? c.owners.get(x.c.assigned_to) || '—' : 'Unassigned') },
  rca: { label: 'Root cause', q: 'rca', of: (x) => x.c.rca || 'Not worked' }, client: { label: 'Client', q: 'client', of: (x) => x.client?.name || '—' }, stage: { label: 'Queue', q: 'stage', of: (x) => x.stage || '—' }, bucket2: { label: 'Issue bucket', q: 'ibucket', of: (x) => String(x.c.custom?.issue_bucket || 'none') },
};

/** eCW / ModMed style bucket view: configurable buckets with counts + dollars, and a bucket × status matrix. */
export default function Aging() {
  const [tab, setTab] = useState<'buckets' | 'queues'>('buckets');
  const nav = useNavigate();
  const claims = useClaims();
  const buckets = useBuckets();
  const statuses = useOpts('status');
  const scope = useStore((s) => s.clientFilter); const profiles = useStore((s) => s.profiles);
  const active = useMemo(() => claims.filter((x) => x.open), [claims]);
  const intel = useIntel(); const col = useCollect(active, intel); const rf = useMemo(() => rollForward(active, buckets, col), [active, buckets, col]);
  const now = useMemo(() => ({ exp: sum(active.map((x) => col.get(x.c.id)?.expected ?? 0)), over180: sum(active.filter((x) => (x.age ?? 0) > 180).map((x) => x.c.balance)) }), [active, col]);
  const total = sum(active.map((x) => x.c.balance)); const everyClaim = useClaims(true); const curve = useMemo(() => collectabilityCurve(everyClaim), [everyClaim]);
  const go = (q: string) => nav('/worklist?' + q + (scope ? '&client=' + scope : ''));
  const stat = (b: string, s?: string) => { const l = active.filter((x) => x.bucket?.label === b && (!s || x.c.status === s)); return { n: l.length, v: sum(l.map((x) => x.c.balance)) }; };
  const [dim, setDim] = useState<Dim>('status'); const [metric, setMetric] = useState<'n' | 'v' | 'e'>('v'); const [payerF, setPayerF] = useState('');
  const payerList = useMemo(() => [...new Set(active.map((x) => x.c.payer || 'Unknown'))].sort(), [active]);
  const val = (x: (typeof active)[number]) => (metric === 'n' ? 1 : metric === 'e' ? x.c.expected_amt ?? 0 : x.c.balance); const fmtM = (n: number) => (metric === 'n' ? num(n) : moneyShort(n));
  const matrix = useMemo(() => {
    const rows = new Map<string, { key: string; cells: { n: number; val: number }[]; total: number }>(); const totals = buckets.map(() => 0); let grand = 0, max = 1;
    for (const x of active) { if (payerF && (x.c.payer || 'Unknown') !== payerF) continue; const bi = buckets.findIndex((b) => b.label === x.bucket?.label); if (bi < 0) continue; const k = DIMS[dim].of(x, { owners: new Map(profiles.map((p) => [p.id, p.full_name])) }); let r = rows.get(k); if (!r) rows.set(k, (r = { key: k, cells: buckets.map(() => ({ n: 0, val: 0 })), total: 0 })); const v = val(x); r.cells[bi].n++; r.cells[bi].val += v; r.total += v; totals[bi] += v; grand += v; }
    const list = [...rows.values()].sort((a, b) => b.total - a.total); for (const r of list) for (const c of r.cells) max = Math.max(max, c.val);
    return { rows: list, totals, grand, max };
  }, [active, buckets, dim, metric, payerF, profiles]); // eslint-disable-line react-hooks/exhaustive-deps
  const clients = useStore((s) => s.clients); const drill = (k: string) => (dim === 'owner' ? (k === 'Unassigned' ? 'none' : profiles.find((p) => p.full_name === k)?.id || k) : dim === 'client' ? clients.find((c) => c.name === k)?.id || k : k);
  const exportMatrix = () => downloadFile(`aging-by-${dim}.csv`, Papa.unparse([[DIMS[dim].label, ...buckets.map((b) => b.label), 'Total'], ...matrix.rows.map((r) => [r.key, ...r.cells.map((c) => c.val), r.total]), ['Total', ...matrix.totals, matrix.grand]]));
  const unassignedBy = (b: string) => active.filter((x) => x.bucket?.label === b && !x.c.assigned_to).length;

  return (
    <div>
      <PageHeader title="Aging & Queues" sub="Click any tile or cell to open the claims" />
      <div className="mb-5"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'buckets', label: 'Age buckets' }, { id: 'queues', label: 'Claim queues' }]} /></div>
      {tab === 'buckets' && curve.closedSample >= 20 && <Card title="Collectability — will it resolve?" className="mb-5" pad={false}><div className="px-5 pt-1 pb-2 text-xs muted">Learned from {num(curve.closedSample)} of your own closed claims: the chance an open claim resolves in the next 30 days at its current age, and the cash that implies (using your {curve.overallYield}% overall payment yield).</div><div className="overflow-x-auto"><table className="tbl w-full text-sm"><thead><tr><th>Age</th><th className="text-right">Open claims</th><th className="text-right">Open $</th><th className="text-right">Resolves in 30 days</th><th className="text-right">Yield</th><th className="text-right">Expected cash (30d)</th><th /></tr></thead><tbody>{curve.buckets.map((b) => <tr key={b.label}><td>{b.label}</td><td className="text-right">{num(b.open)}</td><td className="text-right">{money(b.balance)}</td><td className="text-right">{b.p30 == null ? <span className="muted">not enough history</span> : <span style={{ color: b.p30 >= 25 ? '#16a34a' : b.p30 >= 10 ? '#d97706' : '#dc2626' }}>{b.p30}%</span>}</td><td className="text-right">{b.yield}%</td><td className="text-right font-medium">{b.expected30 ? money(b.expected30) : '—'}</td><td>{b.writeoffRisk && b.balance > 0 && <Chip color="#dc2626">decide: pursue or write off</Chip>}{b.confidence === 'low' && b.p30 != null && <span className="text-[11px] muted"> low confidence</span>}</td></tr>)}</tbody><tfoot><tr><td colSpan={5} className="text-right font-semibold">Expected cash from open A/R in the next 30 days</td><td className="text-right font-bold">{money(curve.expected30)}</td><td /></tr></tfoot></table></div></Card>}
      {tab === 'queues' ? <Queues /> : <>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-4">
        {buckets.map((b) => { const s = stat(b.label); return (
          <button key={b.label} onClick={() => go('bucket=' + encodeURIComponent(b.label))} className="panel p-3.5 text-left hover:shadow-glow transition relative overflow-hidden animate-in">
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: b.color }} />
            <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: b.color }}>{b.label} days</div>
            <div className="text-2xl font-extrabold mt-1 tabular-nums">{num(s.n)}</div>
            <div className="text-xs muted">{moneyShort(s.v)} · {total ? Math.round((s.v / total) * 100) : 0}%</div>
            {unassignedBy(b.label) > 0 && <div className="text-[10px] mt-1.5 text-amber-500 font-semibold">{unassignedBy(b.label)} unassigned</div>}
          </button>); })}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
        <Stat label="Open A/R" value={moneyShort(total)} sub={`${num(active.length)} claims`} color="#6366f1" /><Stat label="Average age" value={`${active.length ? Math.round(sum(active.map((x) => x.age ?? 0)) / active.length) : 0}d`} color="#3b82f6" />
        <Stat label="Over 90 days" value={`${total ? Math.round((sum(active.filter((x) => (x.age ?? 0) > 90).map((x) => x.c.balance)) / total) * 100) : 0}%`} sub={moneyShort(sum(active.filter((x) => (x.age ?? 0) > 90).map((x) => x.c.balance)))} color="#f97316" onClick={() => go('minAge=90')} />
        <Stat label="Over 180 days" value={moneyShort(now.over180)} color="#ef4444" onClick={() => go('minAge=180')} /><Stat label="Unassigned" value={moneyShort(sum(active.filter((x) => !x.c.assigned_to).map((x) => x.c.balance)))} sub={`${active.filter((x) => !x.c.assigned_to).length} claims`} color="#f59e0b" onClick={() => go('owner=none')} /><Stat label="Expected recovery" value={moneyShort(now.exp)} sub="probability-weighted" color="#22c55e" />
      </div>
      <Card title={`Bucket × ${DIMS[dim].label.toLowerCase()}`} actions={<div className="flex gap-2 items-center flex-wrap">
        <select className="input !py-1 !w-auto" value={dim} onChange={(e) => setDim(e.target.value as Dim)}>{(Object.keys(DIMS) as Dim[]).map((d) => <option key={d} value={d}>By {DIMS[d].label.toLowerCase()}</option>)}</select>
        <select className="input !py-1 !w-auto" value={metric} onChange={(e) => setMetric(e.target.value as 'n' | 'v' | 'e')}><option value="v">Balance $</option><option value="n">Claim count</option><option value="e">Expected reimbursement $</option></select>
        <select className="input !py-1 !w-auto" value={payerF} onChange={(e) => setPayerF(e.target.value)}><option value="">All payers</option>{payerList.map((p) => <option key={p}>{p}</option>)}</select>
        <button className="btn btn-sm" onClick={exportMatrix}><Download size={13} />Export</button></div>} pad={false}>
        <div className="overflow-auto px-4 pb-4">
          <table className="grid"><thead><tr><th>{DIMS[dim].label}</th>{buckets.map((b) => <th key={b.label} style={{ textAlign: 'right' }}><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: b.color }} />{b.label}</th>)}<th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {matrix.rows.slice(0, 60).map((r) => (
                <tr key={r.key}><td className="max-w-[220px] truncate" title={r.key}>{r.key}</td>
                  {r.cells.map((c, i) => <td key={i} style={{ textAlign: 'right', cursor: c.n ? 'pointer' : undefined, background: c.n ? `rgba(99,102,241,${Math.min(0.28, (c.val / matrix.max) * 0.28)})` : undefined }} onClick={() => c.n && go(`bucket=${encodeURIComponent(buckets[i].label)}&${DIMS[dim].q}=${encodeURIComponent(drill(r.key))}${payerF ? '&payer=' + encodeURIComponent(payerF) : ''}`)}>{c.n ? <><b>{fmtM(c.val)}</b> <span className="muted text-[11px]">{metric === 'n' ? '' : c.n}</span></> : <span className="muted">·</span>}</td>)}
                  <td style={{ textAlign: 'right' }} className="font-bold">{fmtM(r.total)}</td></tr>))}
              <tr><td className="font-bold">Total</td>{matrix.totals.map((v, i) => <td key={i} style={{ textAlign: 'right' }} className="font-bold">{fmtM(v)}</td>)}<td style={{ textAlign: 'right' }} className="font-extrabold">{fmtM(matrix.grand)}</td></tr>
            </tbody></table>
          {matrix.rows.length > 60 && <div className="text-[11px] muted pt-2">Top 60 of {matrix.rows.length} rows shown — export for everything.</div>}
        </div>
      </Card>
      <Card title="Where to focus — biggest old balances by payer" className="mt-4" pad={false}><div className="overflow-x-auto"><table className="tbl w-full text-sm"><thead><tr><th>Payer</th><th className="text-right">Claims &gt; 90d</th><th className="text-right">Balance &gt; 90d</th><th className="text-right">% of payer A/R</th><th /></tr></thead><tbody>
        {(() => { const m = new Map<string, { n: number; v: number; all: number }>(); for (const x of active) { const k = x.c.payer || 'Unknown'; const e = m.get(k) || { n: 0, v: 0, all: 0 }; e.all += x.c.balance; if ((x.age ?? 0) > 90) { e.n++; e.v += x.c.balance; } m.set(k, e); } return [...m.entries()].filter(([, e]) => e.n > 0).sort((a, b) => b[1].v - a[1].v).slice(0, 6).map(([k, e]) => <tr key={k}><td>{k}</td><td className="text-right">{e.n}</td><td className="text-right font-medium">{moneyShort(e.v)}</td><td className="text-right">{e.all ? Math.round((e.v / e.all) * 100) : 0}%</td><td><button className="btn btn-sm" onClick={() => go('payer=' + encodeURIComponent(k) + '&minAge=90')}>Open in worklist</button></td></tr>); })()}</tbody></table></div></Card>
      <Card title="Oldest high-value claims" className="mt-4" pad={false}><div className="overflow-x-auto"><table className="tbl w-full text-sm"><thead><tr><th>Claim</th><th>Payer</th><th>Status</th><th className="text-right">Age</th><th className="text-right">Balance</th><th /></tr></thead><tbody>
        {[...active].sort((a, b) => (b.age ?? 0) * Math.log1p(b.c.balance) - (a.age ?? 0) * Math.log1p(a.c.balance)).slice(0, 10).map((x) => <tr key={x.c.id} className="cursor-pointer" onClick={() => useStore.getState().openClaim(x.c.id)}><td className="font-mono text-xs">{x.c.claim_no}</td><td>{x.c.payer}</td><td>{x.c.status}</td><td className="text-right">{x.age ?? '—'}d</td><td className="text-right">{money(x.c.balance)}</td><td className="text-right text-xs muted">{x.bucket?.label}</td></tr>)}</tbody></table></div></Card>
      <Card title="If nothing is worked — roll-forward" className="mt-4">
        <p className="text-xs muted mb-3">Every open claim ages forward and its collectability decays. The gap between today and day 90 is the cost of inaction.</p>
        <div className="grid md:grid-cols-4 gap-3">
          <div className="panel2 p-3"><div className="label">Today</div><div className="text-lg font-extrabold">{moneyShort(now.exp)}</div><div className="text-[11px] muted">expected recovery</div><div className="text-[11px] mt-1">{moneyShort(now.over180)} older than 180d</div></div>
          {rf.map((r) => (<div key={r.h} className="panel2 p-3"><div className="label">+{r.h} days</div><div className="text-lg font-extrabold">{moneyShort(r.expected)}</div><div className="text-[11px] text-red-400 font-semibold">{moneyShort(r.expected - now.exp)} vs today</div><div className="text-[11px] mt-1">{moneyShort(r.over180)} older than 180d</div></div>))}
        </div>
      </Card>
      </>}
    </div>
  );
}
