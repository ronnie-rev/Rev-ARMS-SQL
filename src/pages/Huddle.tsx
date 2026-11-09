import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { useStore } from '../store';
import { Card, PageHeader, Stat, Tabs } from '../components/ui';
import { HuddleDaily } from '../components/HuddleDaily';
import { useClaims, useIntelligence } from '../hooks';
import { promises } from '../lib/engine/calls';
import { clientReview, huddle } from '../lib/engine/reviewpack';
import { downloadFile, money, todayISO } from '../lib/utils';

type Tab = 'huddle' | 'client';
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/** Daily huddle for the team lead + a client review pack for the account call. Both print cleanly (Ctrl/Cmd-P → Save as PDF). */
export default function Huddle() {
  const { workLog, recoveries, appeals, requests, clients, openClaim, has } = useStore(); const ecs = useClaims(); const { nba } = useIntelligence(ecs); const today = todayISO(); const [tab, setTab] = useState<Tab>('huddle');
  const urgent = useMemo(() => { const m = new Map<string, string>(); for (const [id, a] of nba) if (a.urgency >= 80 && a.kind !== 'monitor') m.set(id, a.label); return m; }, [nba]);
  const h = useMemo(() => huddle(ecs, workLog, recoveries, today, urgent), [ecs, workLog, recoveries, today, urgent]);
  const prom = useMemo(() => promises(ecs.map((x) => x.c), today).filter((p) => p.status !== 'upcoming' || p.days <= 3), [ecs, today]); const [cid, setCid] = useState(''); const [days, setDays] = useState(30); const client = cid || clients[0]?.id || '';
  const rv = useMemo(() => (client ? clientReview(ecs, recoveries, appeals, requests, client, addDays(today, -days), today) : null), [ecs, recoveries, appeals, requests, client, days, today]);
  const exportCsv = () => { if (!rv) return; const rows = [['Section', 'Item', 'Count', 'Balance'], ...rv.aging.map((a) => ['Aging', a.label, a.n, a.balance]), ...rv.topPayers.map((p) => ['Payer', p.payer, p.n, p.balance]), ...rv.topDenials.map((d) => ['Denial', d.code, d.n, d.balance])]; downloadFile(`client-review-${rv.to}.csv`, rows.map((r) => r.join(',')).join('\n'), 'text/csv'); };
  return (
    <div className="space-y-4">
      <PageHeader title="Huddle & client review" sub="Start the day informed; walk a client through the month" actions={<button className="btn btn-sm print:hidden" onClick={() => window.print()}><Printer size={13} />Print / PDF</button>} />
      <div className="print:hidden"><Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'huddle', label: 'Daily huddle' }, { id: 'client', label: 'Client review' }]} /></div>
      {tab === 'huddle' && <HuddleDaily />}
      {tab === 'client' && rv && <>
        <div className="flex gap-2 print:hidden"><select className="input !w-auto" value={client} onChange={(e) => setCid(e.target.value)}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select className="input !w-auto" value={days} onChange={(e) => setDays(+e.target.value)}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>{has('export') && <button className="btn btn-sm" onClick={exportCsv}>CSV</button>}</div>
        <h2 className="text-lg font-semibold hidden print:block">{clients.find((c) => c.id === client)?.name} — A/R review {rv.from} to {rv.to}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Open A/R" value={money(rv.openBalance)} sub={`${rv.openClaims} claims`} color="#6366f1" /><Stat label="Recovered" value={money(rv.recovered)} sub={`${rv.recoveries} payments`} color="#22c55e" /><Stat label="New claims" value={rv.newInPeriod.n} sub={money(rv.newInPeriod.balance)} color="#f97316" /><Stat label="Closed" value={rv.closedInPeriod.n} color="#06b6d4" /></div>
        {rv.highlights.length > 0 && <Card title="Highlights"><ul className="list-disc ml-5 text-sm space-y-1">{rv.highlights.map((x) => <li key={x}>{x}</li>)}</ul></Card>}
        <div className="grid lg:grid-cols-3 gap-4">
          <Card title="Aging" pad={false}><table className="tbl w-full text-sm"><tbody>{rv.aging.map((a) => <tr key={a.label}><td>{a.label}</td><td className="text-right">{a.n}</td><td className="text-right">{money(a.balance)}</td></tr>)}</tbody></table></Card>
          <Card title="Top payers" pad={false}><table className="tbl w-full text-sm"><tbody>{rv.topPayers.map((a) => <tr key={a.payer}><td>{a.payer}</td><td className="text-right">{a.n}</td><td className="text-right">{money(a.balance)}</td></tr>)}</tbody></table></Card>
          <Card title="Top denial reasons" pad={false}><table className="tbl w-full text-sm"><tbody>{rv.topDenials.map((a) => <tr key={a.code}><td>{a.code}</td><td className="text-right">{a.n}</td><td className="text-right">{money(a.balance)}</td></tr>)}</tbody></table></Card>
        </div>
        <Card title={`Appeals — ${rv.appeals.filed} filed · ${rv.appeals.won} won · ${rv.appeals.lost} lost · ${rv.appeals.pending} pending · ${money(rv.appeals.recovered)} recovered`}>{rv.needsClient.n > 0 ? <><div className="label">Waiting on the practice ({rv.needsClient.n})</div><ul className="text-sm space-y-1">{rv.needsClient.items.map((i, k) => <li key={k}><b>{i.claim_no}</b> · {i.kind} — {i.body}</li>)}</ul></> : <div className="text-sm muted">Nothing is waiting on the practice.</div>}</Card></>}
    </div>
  );
}
