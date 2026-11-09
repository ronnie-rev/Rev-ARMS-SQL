import { FocusStrip } from '../components/FocusStrip';
import { useMemo } from 'react';
import Papa from 'papaparse';
import { Download, Printer, SlidersHorizontal } from 'lucide-react';
import { WorkspaceSummary } from '../components/WorkspaceSummary';
import { isProducer } from '../lib/roles';
import { useNavigate } from 'react-router-dom';
import { AlarmClock, CalendarClock, Gauge, Hourglass, Landmark, UserX, Zap, CheckCheck } from 'lucide-react';
import { eachDayOfInterval, format, subDays } from 'date-fns';
import { useStore } from '../store';
import { useBuckets, useClaims, useIntel, useOpts } from '../hooks';
import { buildInsights, payerStats } from '../lib/analytics';
import { parseQuery } from '../lib/nlq';
import { Copy, Sparkles } from 'lucide-react';
import { Bar, Card, Chip, PageHeader, Stat } from '../components/ui';
import { BucketBars, Donut, HBars, Heatmap, Trend } from '../components/Charts';
import { downloadFile, money, moneyShort, num, pct, sum, todayISO, groupBy } from '../lib/utils';
import { useState } from 'react';
import { FAMILIES } from '../lib/engine/families';
import { lifecycleDefs } from '../lib/engine/lifecycle';
import { weeklyAnomalies } from '../lib/engine/anomaly';

const SECTIONS: [string, string][] = [['briefing', 'Daily briefing & ask'], ['kpis', 'KPI tiles'], ['aging', 'Aging & lifecycle'], ['payers', 'Payer heatmap & root causes'], ['families', 'Work buckets'], ['bottom', 'Team, payers & work next']];
export default function Dashboard() {
  const nav = useNavigate();
  const allEc = useClaims(); const [payerSel, setPayerSel] = useState<string[]>([]); const [range, setRange] = useState<'all' | '30' | '90' | '180' | '365' | 'custom'>('all'); const [dFrom, setDFrom] = useState(''); const [dTo, setDTo] = useState('');
  const [hidden, setHidden] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('arms:dash:hidden') || '[]'); } catch { return []; } }); const [cust, setCust] = useState(false);
  const store = useStore(); const anomalies = useMemo(() => weeklyAnomalies({ workLog: store.workLog.filter((w) => store.inScope(w.client_id)), recoveries: store.recoveries.filter((r) => store.inScope(r.client_id)), claims: store.claims.filter((c) => store.inScope(c.client_id)), today: todayISO() }), [store.workLog, store.recoveries, store.claims, store.clientScope]); // eslint-disable-line react-hooks/exhaustive-deps
  const show = (id: string) => !hidden.includes(id); const toggleSec = (id: string) => { const n = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]; setHidden(n); try { localStorage.setItem('arms:dash:hidden', JSON.stringify(n)); } catch { /* ignore */ } };
  const payerOpts = useMemo(() => [...new Set(allEc.map((x) => x.c.payer || 'Unknown'))].sort(), [allEc]);
  const claims = useMemo(() => { const from = range === 'custom' ? dFrom : range === 'all' ? '' : new Date(Date.now() - Number(range) * 864e5).toISOString().slice(0, 10); const to = range === 'custom' ? dTo : ''; return allEc.filter((x) => (!payerSel.length || payerSel.includes(x.c.payer || 'Unknown')) && (!from || (x.c.dos || '') >= from) && (!to || (x.c.dos || '9999') <= to)); }, [allEc, payerSel, range, dFrom, dTo]);
  const buckets = useBuckets();
  const statuses = useOpts('status');
  const workLog = useStore((s) => s.workLog);
  const scope = useStore((s) => s.clientFilter); const scopeArr = useStore((s) => s.clientScope);
  const active = useMemo(() => claims.filter((x) => x.open), [claims]);
  const intel = useIntel(); const { batches, profiles, claims: allClaims, config } = useStore(); const me = useStore((s) => s.me());
  const ins = useMemo(() => buildInsights({ ecs: claims, workLog, batches, intel, staff: profiles.filter((p) => isProducer(p.role)).map((p) => ({ id: p.id, name: p.full_name, target: p.daily_target })), payers: payerStats(claims, allClaims, intel), scope }), [claims, workLog, batches, intel, profiles, allClaims, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ask, setAsk] = useState('');
  const briefing = useMemo(() => {
    const t = sum(active.map((x) => x.c.balance)); const fu = active.filter((x) => x.fuDue).length; const tf = active.filter((x) => x.tfLeft != null && x.tfLeft > 0 && x.tfLeft <= 30);
    const snaps = batches.filter((b) => b.summary?.total != null && (!scope || b.client_id === scope)).sort((a, b) => a.created_at.localeCompare(b.created_at)); const byDate = new Map<string, number>(); snaps.forEach((b) => byDate.set(b.created_at.slice(0, 10), (byDate.get(b.created_at.slice(0, 10)) || 0) + (b.summary!.total || 0)));
    const dates = [...byDate.keys()].sort(); const d = dates.length > 1 ? byDate.get(dates[dates.length - 1])! - byDate.get(dates[dates.length - 2])! : null;
    const top = ins.filter((i) => i.sev === 'high' || i.sev === 'med').slice(0, 3);
    return `${new Date().getHours() < 12 ? 'Good morning' : 'Hello'}${me ? ', ' + me.full_name.split(' ')[0] : ''}. Open AR is ${moneyShort(t)} across ${num(active.length)} claims${d != null ? ` (${d <= 0 ? '−' : '+'}${moneyShort(Math.abs(d))} since the last import)` : ''}. Today: ${fu} follow-ups due, ${tf.length} claims inside the 30-day timely-filing window (${moneyShort(sum(tf.map((x) => x.c.balance)))}).${top.length ? ' Watch: ' + top.map((i) => i.title).join('; ') + '.' : ''}`;
  }, [active, batches, ins, scope, me]);

  const k = useMemo(() => {
    const total = sum(active.map((x) => x.c.balance));
    const aged = sum(active.filter((x) => (x.age ?? 0) > 120).map((x) => x.c.balance));
    const tfRisk = active.filter((x) => x.tfLeft != null && x.tfLeft <= 30);
    const unassigned = active.filter((x) => !x.c.assigned_to);
    const worked = active.filter((x) => x.c.touch_count > 0).length;
    const ages = active.filter((x) => x.age != null);
    return {
      total, n: active.length, aged, agedPct: total ? aged / total : 0, tfRisk, unassigned, worked,
      avgAge: ages.length ? Math.round(sum(ages.map((x) => x.age!)) / ages.length) : 0,
      fuDue: active.filter((x) => x.fuDue).length, closed: claims.length - active.length,
    };
  }, [active, claims]);

  const bucketData = buckets.map((b) => { const l = active.filter((x) => x.bucket?.label === b.label); return { name: b.label, value: sum(l.map((x) => x.c.balance)), count: l.length, color: b.color }; });
  const lcData = lifecycleDefs(config).map((d) => ({ name: d.code, label: d.label, value: claims.filter((x) => x.lifecycle === d.code && !x.c.closed_at).length, color: d.color })).filter((s) => s.value > 0);
  const famData = FAMILIES.map((f) => ({ name: f.name, color: f.color, n: claims.filter((x) => x.family === f.name && x.open).length, v: claims.filter((x) => x.family === f.name && x.open).reduce((a, x) => a + x.c.balance, 0) })).filter((f) => f.n > 0).sort((a, b) => b.v - a.v);
  const statusData = statuses.map((s) => ({ name: s.value, value: claims.filter((x) => x.c.status === s.value && !x.c.closed_at).length, color: s.color || '#6366f1' })).filter((s) => s.value > 0);
  const payers = useMemo(() => [...groupBy(active, (x) => x.c.payer || 'Unknown')].map(([name, l]) => ({ name, value: sum(l.map((x) => x.c.balance)) })).sort((a, b) => b.value - a.value), [active]);
  const rca = useMemo(() => [...groupBy(active.filter((x) => x.c.rca), (x) => x.c.rca!)].map(([name, l]) => ({ name, value: l.length })).sort((a, b) => b.value - a.value).slice(0, 8), [active]);
  const trend = useMemo(() => {
    const ids = new Set(claims.map((x) => x.c.id));
    const days = eachDayOfInterval({ start: subDays(new Date(), 13), end: new Date() });
    const cnt = new Map<string, number>();
    workLog.forEach((w) => { if (ids.has(w.claim_id)) cnt.set(w.work_date, (cnt.get(w.work_date) || 0) + 1); });
    return days.map((d) => ({ name: format(d, 'MM/dd'), touches: cnt.get(format(d, 'yyyy-MM-dd')) || 0 }));
  }, [workLog, claims]);
  const top = useMemo(() => [...active].sort((a, b) => b.score - a.score).slice(0, 7), [active]);
  const topPayers = payers.slice(0, 7).map((p) => p.name);
  const hr = new Date().getHours(); const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const exportDash = () => { const by = (f: (x: (typeof active)[number]) => string) => { const m = new Map<string, { n: number; v: number }>(); for (const x of active) { const k = f(x); const e = m.get(k) || { n: 0, v: 0 }; e.n++; e.v += x.c.balance; m.set(k, e); } return [...m].sort((a, b) => b[1].v - a[1].v); };
    const rows: (string | number)[][] = [['Section', 'Item', 'Claims', 'Balance'], ['Summary', 'Total A/R', active.length, Math.round(sum(active.map((x) => x.c.balance)) * 100) / 100], ...buckets.map((b) => { const l = active.filter((x) => x.bucket?.label === b.label); return ['Aging', b.label, l.length, Math.round(sum(l.map((x) => x.c.balance)) * 100) / 100]; }), ...by((x) => x.c.payer || 'Unknown').map(([k, e]) => ['Payer', k, e.n, Math.round(e.v * 100) / 100]), ...by((x) => x.c.status).map(([k, e]) => ['Status', k, e.n, Math.round(e.v * 100) / 100]), ...by((x) => x.c.rca || 'Not worked').map(([k, e]) => ['Root cause', k, e.n, Math.round(e.v * 100) / 100])];
    downloadFile(`dashboard-${todayISO()}.csv`, Papa.unparse(rows)); };
  const go = (q: string) => nav('/worklist?' + q + (scope ? '&client=' + scope : ''));

  return (
    <div>
      <WorkspaceSummary />
      <FocusStrip />
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6 animate-in">
        <div><h1 className="display text-[30px] leading-tight">{greet}, {(me?.full_name || '').split(' ')[0]}</h1><p className="muted mt-1">What would you like to know today? · {num(k.n)} open claims · {money(k.total)} in AR · {format(new Date(), 'EEE, MM/dd/yyyy')}</p></div>
        <button className="btn" onClick={() => nav('/pivot')}><Sparkles size={14} />Build an analysis</button></div>
      {anomalies.length > 0 && <div className="panel p-3 mb-4 no-print animate-in"><div className="label mb-1.5 flex items-center gap-1.5"><Zap size={12} />What changed in the last 7 days</div><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">{anomalies.map((a) => <div key={a.id} className="panel2 p-2.5 rounded-lg flex gap-2 items-start"><span className="text-lg leading-none" style={{ color: a.good ? '#16a34a' : '#dc2626' }}>{a.direction === 'up' ? '▲' : '▼'}</span><div><div className="text-[13px] font-semibold">{a.label} <span style={{ color: a.good ? '#16a34a' : '#dc2626' }}>{a.change > 0 ? '+' : ''}{a.change}%</span></div><div className="text-[12px] muted">{a.detail}</div></div></div>)}</div></div>}
      <div className="panel p-3 mb-4 flex flex-wrap gap-2 items-center no-print">
        <span className="text-[11px] muted font-semibold">Filter</span>
        <select className="input !py-1 !w-auto" value={range} onChange={(e) => setRange(e.target.value as typeof range)}><option value="all">All dates of service</option><option value="30">DOS last 30 days</option><option value="90">DOS last 90 days</option><option value="180">DOS last 180 days</option><option value="365">DOS last 12 months</option><option value="custom">Custom range…</option></select>
        {range === 'custom' && <><input type="date" className="input !py-1 !w-auto" value={dFrom} onChange={(e) => setDFrom(e.target.value)} /><span className="muted">to</span><input type="date" className="input !py-1 !w-auto" value={dTo} onChange={(e) => setDTo(e.target.value)} /></>}
        <select className="input !py-1 !w-auto" value="" onChange={(e) => e.target.value && setPayerSel([...new Set([...payerSel, e.target.value])])}><option value="">{payerSel.length ? `Payers (${payerSel.length}) — add…` : 'All payers — pick to filter'}</option>{payerOpts.filter((p) => !payerSel.includes(p)).map((p) => <option key={p}>{p}</option>)}</select>
        {payerSel.map((p) => <button key={p} className="chip" style={{ background: 'rgba(99,102,241,.15)', color: '#6366f1' }} onClick={() => setPayerSel(payerSel.filter((x) => x !== p))}>{p} ✕</button>)}
        {(payerSel.length > 0 || range !== 'all') && <button className="btn btn-ghost btn-sm" onClick={() => { setPayerSel([]); setRange('all'); }}>Reset</button>}
        <span className="muted text-xs">{num(claims.length)} of {num(allEc.length)} claims · client: use the scope switcher</span>
        <div className="ml-auto flex gap-2 relative"><button className="btn btn-sm" onClick={exportDash}><Download size={13} />Export CSV</button><button className="btn btn-sm" onClick={() => window.print()}><Printer size={13} />Print / PDF</button><button className="btn btn-sm" onClick={() => setCust(!cust)}><SlidersHorizontal size={13} />Customize</button>
          {cust && <div className="absolute right-0 top-9 z-30 panel p-3 w-56 shadow-lg">{SECTIONS.map(([id, l]) => <label key={id} className="flex gap-2 text-sm py-0.5"><input type="checkbox" checked={show(id)} onChange={() => toggleSec(id)} />{l}</label>)}</div>}</div>
      </div>
      {show('briefing') && <>
      <div className="panel tint-blue p-5 mb-4 animate-in">
        <div className="flex items-start gap-3"><Sparkles size={18} className="text-brand-400 mt-0.5 shrink-0" /><div className="flex-1"><div className="text-[11px] font-bold uppercase tracking-wider text-brand-300 mb-1">Daily briefing</div><p className="text-sm leading-relaxed">{briefing}</p></div>
          <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(briefing); }} title="Copy for stand-up"><Copy size={13} /></button></div>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const vocab = { payers: [...new Set(allClaims.map((c) => c.payer || ''))].filter(Boolean), clients: useStore.getState().clients.map((c) => ({ id: c.id, name: c.name })), statuses: config.filter((o) => o.category === 'status').map((o) => o.value), rcas: config.filter((o) => o.category === 'rca').map((o) => o.value), buckets: config.filter((o) => o.category === 'bucket').map((o) => o.value), actions: [] }; const r = parseQuery(ask, vocab); const sp = new URLSearchParams(r.params); if (r.rest) sp.set('q', r.rest); nav('/worklist?' + sp.toString()); }}>
          <input className="input" placeholder="Ask ClaimsIQ: “aetna over 180 days unassigned”, “timely filing”, “coding denials $2k”…" value={ask} onChange={(e) => setAsk(e.target.value)} /><button className="btn btn-primary" disabled={!ask.trim()}>Go</button></form></div>
      </>}
      {show('kpis') && <>
      <div className="grid md:grid-cols-3 gap-4 mb-4">
        <Stat label="Total A/R" icon={<Landmark size={15} />} value={moneyShort(k.total)} sub={`${num(k.n)} claims · avg age ${k.avgAge}d`} spark={bucketData.map((d) => d.value)} onClick={() => go('')} />
        <Stat tone="lav" label="Worked this inventory" color="#7c5ce0" icon={<CheckCheck size={15} />} value={pct(k.n ? k.worked / k.n : 0)} sub={`${num(k.worked)} of ${num(k.n)} claims touched · ${k.fuDue} follow-ups due`} spark={trend.slice(-14).map((d) => d.touches)} onClick={() => go('view=fu')} />
        <Stat tone="ink" label="Timely filing at risk" icon={<AlarmClock size={15} />} value={k.tfRisk.length} sub={`${moneyShort(sum(k.tfRisk.map((x) => x.c.balance)))} with ≤30 days left`} spark={[3, 5, 4, 7, 6, 9, k.tfRisk.length % 10 + 2]} onClick={() => go('view=tf')} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="> 120 days" value={pct(k.agedPct)} sub={moneyShort(k.aged)} color="#ef4444" />
        <Stat label="Unassigned" value={k.unassigned.length} sub={moneyShort(sum(k.unassigned.map((x) => x.c.balance)))} color="#a855f7" onClick={() => go('view=unassigned')} />
        <Stat label="Follow-ups due" value={k.fuDue} color="#f59e0b" onClick={() => go('view=fu')} />
        <Stat label="Closed out" value={num(k.closed)} sub="adjusted / paid / patient" color="#64748b" />
      </div>
      </>}
      {show('aging') && <>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Aging buckets · balance" className="lg:col-span-2" actions={<span className="text-xs muted">click a bar to drill in</span>}>
          <BucketBars data={bucketData} onClick={(b) => go('bucket=' + encodeURIComponent(b))} />
        </Card>
        <Card title="Lifecycle status"><Donut data={lcData} onClick={(s) => go('lifecycle=' + encodeURIComponent(s))} />
          <div className="flex flex-wrap gap-1.5 mt-2">{lcData.slice(0, 10).map((s) => <Chip key={s.name} color={s.color}>{s.name} {s.value}</Chip>)}</div></Card>
      </div>
      </>}
      {show('payers') && <>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Payer × aging heatmap" className="lg:col-span-2">
          <Heatmap rows={topPayers} cols={buckets.map((b) => ({ label: b.label, color: b.color }))}
            cell={(p, b) => { const l = active.filter((x) => (x.c.payer || 'Unknown') === p && x.bucket?.label === b); return { v: sum(l.map((x) => x.c.balance)), n: l.length }; }}
            onCell={(p, b) => go(`payer=${encodeURIComponent(p)}&bucket=${encodeURIComponent(b)}`)} />
        </Card>
        <Card title="Top root causes (open claims)"><HBars data={rca} money={false} color="#8b5cf6" onClick={(n) => go('rca=' + encodeURIComponent(n))} /></Card>
      </div>
      </>}
      {show('families') && <>
      <Card className="mb-4" title="Work buckets — why claims are stuck" actions={<button className="btn btn-ghost btn-sm" onClick={() => nav('/aging')}>All queues</button>}>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-1">{famData.map((f) => <button key={f.name} onClick={() => go('family=' + encodeURIComponent(f.name))} className="grid grid-cols-[170px_1fr_44px_64px] items-center gap-3 text-xs text-left hover:bg-black/[.03] dark:hover:bg-white/[.04] rounded px-1 py-1"><span className="flex items-center gap-2 truncate"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: f.color }} />{f.name}</span><span className="h-1.5 rounded-full bg-black/5 dark:bg-white/10"><span className="block h-full rounded-full" style={{ width: (f.v / (famData[0]?.v || 1)) * 100 + '%', background: f.color }} /></span><b className="tabular-nums text-right">{f.n}</b><span className="muted tabular-nums text-right">{moneyShort(f.v)}</span></button>)}</div></Card>
      </>}
      {show('bottom') && <>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Team touches · last 14 days"><Trend data={trend} keys={[{ key: 'touches', color: '#6366f1', name: 'Touches' }]} height={200} /></Card>
        <Card title="Top payers by balance"><HBars data={payers.slice(0, 7)} color="#06b6d4" onClick={(n) => go('payer=' + encodeURIComponent(n))} /></Card>
        <Card title={<span className="flex items-center gap-1.5"><Zap size={14} className="text-amber-400" />Work next</span>} pad={false}>
          <div className="px-2 pb-2">{top.map((x) => (
            <button key={x.c.id} onClick={() => useStore.getState().openClaim(x.c.id)} className="w-full text-left px-2 py-2 rounded-lg hover:bg-[var(--panel2)]">
              <div className="flex justify-between text-[13px]"><b>{x.c.claim_no}</b><span className="tabular-nums font-semibold">{money(x.c.balance)}</span></div>
              <div className="flex items-center gap-2 mt-1"><span className="text-[11px] muted truncate flex-1">{x.c.payer} · {x.age}d{x.fuDue ? ' · F/U due' : ''}{x.tfLeft != null && x.tfLeft <= 30 ? ' · TF risk' : ''}</span><div className="w-16"><Bar value={x.score} max={100} color="#ef4444" h={4} /></div></div>
            </button>))}
            {top.length === 0 && <div className="p-6 text-center text-sm muted">Nothing open — import an aging file to get started.</div>}</div>
        </Card>
      </div>
      </>}
      <span className="hidden">{todayISO()}</span>
    </div>
  );
}
