import { HubBar } from '..//components/HubBar';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Copy } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, Field, PageHeader, toast } from '../components/ui';
import { useClaims } from '../hooks';
import { clientHealth, type ClientHealth } from '../lib/engine/finhealth';
import { clientReview } from '../lib/engine/reviewpack';
import { money, todayISO } from '../lib/utils';

const GRADE: Record<string, string> = { A: '#16a34a', B: '#65a30d', C: '#d97706', D: '#ea580c', F: '#dc2626' };
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const K = ({ l, v, sub, bad }: { l: string; v: string; sub?: string; bad?: boolean }) => <div className="panel2 p-3"><div className="text-[11px] muted">{l}</div><div className="text-lg font-semibold tabular-nums" style={{ color: bad ? '#dc2626' : undefined }}>{v}</div>{sub && <div className="text-[11px] muted">{sub}</div>}</div>;

/** Client financial health: one score per client, the A/R metrics behind it, what is dragging it down, and a ready-to-send update. */
export default function ClientHealthPage() {
  const { clients, recoveries, appeals, requests, settings, setSetting, has } = useStore(); const ecs = useClaims(); const today = todayISO(); const fin = (settings.client_fin || {}) as Record<string, { monthlyCharges?: number }>;
  const all = useMemo(() => clients.map((c) => ({ c, h: clientHealth(ecs, recoveries, appeals, c.id, today, { monthlyCharges: fin[c.id]?.monthlyCharges }) })).sort((a, b) => a.h.score - b.h.score), [clients, ecs, recoveries, appeals, today, settings.client_fin]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState(''); const cur = all.find((x) => x.c.id === sel) || all[0]; const h: ClientHealth | undefined = cur?.h;
  const draft = () => { if (!cur || !h) return ''; const rv = clientReview(ecs, recoveries, appeals, requests, cur.c.id, addDays(today, -30), today); return `Subject: ${cur.c.name} — A/R update ${today}\n\nHi team,\n\nQuick update on your accounts receivable:\n\n• Open A/R: ${money(h.openBalance)} across ${h.openClaims} claims (${h.pct90}% over 90 days)\n• Collected in the last 30 days: ${money(h.recovered30)}\n• Appeals: ${rv.appeals.filed} filed, ${rv.appeals.won} won, ${rv.appeals.lost} lost\n• Biggest payer exposure: ${h.topPayer ? `${h.topPayer.payer} (${h.topPayer.share}% of A/R)` : '—'}\n${h.drivers.length ? `\nWhat we are focused on:\n${h.drivers.map((d) => `• ${d.label}: ${d.value}`).join('\n')}\n` : ''}${rv.needsClient.n ? `\nWe need your help on ${rv.needsClient.n} item(s) — they are in the portal.\n` : ''}\nThanks,\n`; };
  if (!cur || !h) return <PageHeader title="Client health" sub="No clients yet" />;
  return (
    <div className="space-y-4">
      <HubBar group="clients" />
      <PageHeader title="Client financial health" sub="A/R health score, the metrics behind it, and what to fix" />
      <Card title="All clients — weakest first" pad={false}><div className="overflow-x-auto"><table className="tbl w-full text-sm"><thead><tr><th>Client</th><th>Score</th><th className="text-right">Open A/R</th><th className="text-right">Avg age</th><th className="text-right">&gt;90d</th><th className="text-right">Denied</th><th className="text-right">30d collected</th><th className="text-right">Velocity</th></tr></thead><tbody>
        {all.map(({ c, h: x }) => <tr key={c.id} className="cursor-pointer" style={c.id === cur.c.id ? { background: 'var(--panel2)' } : undefined} onClick={() => setSel(c.id)}><td className="font-medium">{c.name}</td><td><span className="inline-flex items-center gap-2"><b style={{ color: GRADE[x.grade] }}>{x.grade}</b><span className="tabular-nums">{x.score}</span></span></td><td className="text-right">{money(x.openBalance)}</td><td className="text-right">{x.avgAge}d</td><td className="text-right">{x.pct90}%</td><td className="text-right">{x.denialRate}%</td><td className="text-right">{money(x.recovered30)}</td><td className="text-right">{x.velocity}%</td></tr>)}</tbody></table></div></Card>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title={cur.c.name} className="lg:col-span-1">
          <div className="flex items-center gap-4"><div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white" style={{ background: GRADE[h.grade] }}>{h.grade}</div><div><div className="text-3xl font-semibold tabular-nums">{h.score}<span className="text-sm muted">/100</span></div><div className="text-xs muted">financial health</div></div></div>
          <div className="mt-4 space-y-2">{h.parts.map((p) => <div key={p.key}><div className="flex justify-between text-xs"><span>{p.label} <span className="muted">({p.weight}%)</span></span><b>{Math.round(p.score)}</b></div><div className="h-1.5 rounded bg-slate-200/60 overflow-hidden"><div className="h-full" style={{ width: p.score + '%', background: p.score >= 70 ? '#16a34a' : p.score >= 45 ? '#d97706' : '#dc2626' }} /></div><div className="text-[11px] muted">{p.value}</div></div>)}</div>
        </Card>
        <div className="lg:col-span-2 space-y-4">
          {h.drivers.length > 0 && <Card title="What is dragging the score down">{h.drivers.map((d) => <div key={d.key} className="mb-2 text-[13px]"><Chip color="#d97706">{d.label}</Chip> <b>{d.value}</b><div className="muted text-[12px]">{d.tip}</div></div>)}</Card>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <K l="Open A/R" v={money(h.openBalance)} sub={`${h.openClaims} claims`} /><K l="Days in A/R" v={h.dar != null ? String(h.dar) : '—'} sub={h.dar == null ? 'add monthly charges →' : 'AR ÷ daily charges'} bad={h.dar != null && h.dar > 50} /><K l="Avg age (balance-weighted)" v={`${h.avgAge}d`} /><K l="Over 60 / 90 / 120" v={`${h.pct60}/${h.pct90}/${h.pct120}%`} bad={h.pct90 > 25} />
            <K l="Collected 30d" v={money(h.recovered30)} sub={h.recoveryTrend != null ? `${h.recoveryTrend >= 0 ? '▲' : '▼'} ${Math.abs(h.recoveryTrend)}% vs prior pace` : undefined} /><K l="First-pass denial (90d)" v={h.firstPass.rate != null ? `${h.firstPass.rate}%` : '—'} sub={h.firstPass.rate != null ? `${h.firstPass.n} new claims` : `needs 20+ new claims (${h.firstPass.n})`} bad={(h.firstPass.rate ?? 0) > 20} /><K l="Denied now (open)" v={money(h.denialBalance)} sub={`${h.denialRate}% of open claims`} bad={h.denialRate > 25} /><K l="Filing at risk ≤30d" v={money(h.tfAtRisk)} sub={h.tfLost ? `${money(h.tfLost)} already past` : undefined} bad={h.tfAtRisk > 0} /><K l="Underpaid vs expected" v={money(h.underpaid)} bad={h.underpaid > 0} />
            <K l="Credit balances" v={money(h.credits)} bad={h.credits < 0} /><K l="Touched in 14d" v={`${h.touched14}%`} sub={`${h.untouched}% never touched`} /><K l="Payer concentration" v={h.topPayer ? `${h.topPayer.share}%` : '—'} sub={h.topPayer?.payer} /><K l="Appeal win rate" v={h.appealWin.rate != null ? `${h.appealWin.rate}%` : '—'} sub={`${h.appealWin.n} decided`} />
          </div>
          <Card title="Collections by week (last 8)"><div style={{ height: 180 }}><ResponsiveContainer><BarChart data={h.weeks}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="week" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="amount" fill="#22c55e" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
          <Card title="Make it exact & share" actions={<button className="btn btn-sm" onClick={() => { void navigator.clipboard.writeText(draft()); toast.ok('Update copied — paste into email'); }}><Copy size={13} />Copy client update</button>}>
            {has('manage_payer_rules') && <Field label="Average monthly charges $ (turns on true Days in A/R)" hint="From the client’s billing report; stored for this client only"><input type="number" className="input max-w-xs" defaultValue={fin[cur.c.id]?.monthlyCharges ?? ''} key={cur.c.id} onBlur={(e) => { const v = e.target.value === '' ? undefined : Number(e.target.value); void setSetting('client_fin', { ...fin, [cur.c.id]: { monthlyCharges: v } }).then(() => toast.ok('Saved')); }} /></Field>}
          </Card>
        </div>
      </div>
    </div>
  );
}
