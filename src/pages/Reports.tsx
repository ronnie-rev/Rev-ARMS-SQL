import { QuickPacks } from '../components/QuickPacks';
import { useMemo, useState } from 'react';
import { radarDigest } from '../lib/engine/limits';
import { useSearchParams } from 'react-router-dom';
import { Star, Play, ChevronDown } from 'lucide-react';
import { Tabs } from '../components/ui';
import { REPORTS, REPORT_GROUPS, runReport, emptyParams, type ReportParams, type ReportResult } from '../lib/engine/reportdefs';
import { exportReport, copyTSV, formatCell, type ExportFormat } from '../lib/export';
import { enrichClaims } from '../lib/engine/enrich';
import { computeViolations } from '../store';
import { stageDefs } from '../lib/engine/stages';
import { HBars, Donut } from '../components/Charts';
import { usePhi, useLimits } from '../hooks';
import { DateRangeFilter } from '../components/DateRange';
import { DateField } from '../components/CalendarPicker';
import { VISIT_TYPES } from '../lib/engine/visit';
import { lifecycleDefs } from '../lib/engine/lifecycle';
import { FAMILIES } from '../lib/engine/families';
import { CHECKS } from '../lib/engine/checks';
import { FLAG_LABEL } from '../lib/engine/settings';
import { Multi } from '../components/Multi';
import { ExecSummary } from '../components/ExecSummary';
import { Copy, Download, FileBarChart2, Plus, Printer, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, Empty, Field, PageHeader, toast, useConfirm } from '../components/ui';
import { buildReport } from '../lib/engine/report';
import { usDate, bucketsFrom, downloadFile, relTime, todayISO, uid } from '../lib/utils';
import type { ReportSchedule } from '../lib/types';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function SchedulesPanel() {
  const st = useStore(); const { clients, schedules, save, del, has, claims, batches, recoveries, config } = st; const { confirm, node } = useConfirm(); const canManage = has('manage_reports');
  const [aud, setAud] = useState<'client' | 'internal'>('client'); const [cid, setCid] = useState(clients[0]?.id || '');
  const lim = useLimits(); const rep = useMemo(() => { try { return buildReport({ clients, claims, batches, recoveries, buckets: bucketsFrom(config), carc: st.carcMap(), today: todayISO(), payerTf: new Map(config.filter((o) => o.category === 'payer' && o.meta.tf_days).map((o) => [o.value.toLowerCase(), Number(o.meta.tf_days)])), radar: cid ? radarDigest(claims, lim.idx, lim.cfg, todayISO(), cid) : undefined }, aud, cid); } catch { return null; } }, [aud, cid, clients, claims, batches, recoveries, config, lim]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => { const s: ReportSchedule = { id: uid(), name: aud === 'internal' ? 'Weekly internal digest' : `Weekly summary — ${clients.find((c) => c.id === cid)?.name}`, client_id: aud === 'internal' ? null : cid, audience: aud, cadence: 'weekly', day: 1, hour_utc: 13, recipients: [], active: true, last_sent_at: null }; await save('report_schedules', [s] as any); };
  return (
    <div>
      <div className="grid xl:grid-cols-5 gap-4">
        <Card className="xl:col-span-3" title="Preview" actions={rep && <><button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(rep.html); toast.ok('HTML copied'); }}><Copy size={13} />HTML</button><button className="btn btn-sm" onClick={() => downloadFile('ar-report.html', rep.html, 'text/html')}><Download size={13} />Download</button><button className="btn btn-sm" onClick={() => { const w = window.open('', '_blank'); w?.document.write(rep.html); w?.document.close(); setTimeout(() => w?.print(), 300); }}><Printer size={13} />Print / PDF</button></>}>
          <div className="flex gap-2 mb-3"><select className="input !w-auto" value={aud} onChange={(e) => setAud(e.target.value as any)}><option value="client">Client report</option><option value="internal">Internal digest</option></select>{aud === 'client' && <select className="input !w-auto" value={cid} onChange={(e) => setCid(e.target.value)}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</div>
          {rep ? <><div className="text-xs muted mb-2">Subject: <b className="text-inherit">{rep.subject}</b></div><iframe title="report" className="w-full rounded-xl border hair bg-white" style={{ height: 620 }} srcDoc={rep.html} /></> : <Empty title="Nothing to preview" />}
        </Card>
        <Card className="xl:col-span-2" title="Schedules" actions={canManage && <button className="btn btn-primary btn-sm" onClick={add}><Plus size={13} />New</button>}>
          <p className="text-[11px] muted mb-3">Delivery runs in the Netlify scheduled function <code>send-reports</code> (hourly). It needs <code>SUPABASE_SERVICE_ROLE_KEY</code>, <code>RESEND_API_KEY</code> and <code>REPORT_FROM</code> set as Netlify environment variables — see the README.</p>
          {schedules.length === 0 ? <Empty title="No schedules" /> : <div className="space-y-3">{schedules.map((s) => (
            <div key={s.id} className="panel2 p-3 space-y-2"><div className="flex items-center gap-2"><input type="checkbox" checked={s.active} disabled={!canManage} onChange={() => save('report_schedules', [{ ...s, active: !s.active }] as any)} /><input className="input" disabled={!canManage} defaultValue={s.name} onBlur={(e) => save('report_schedules', [{ ...s, name: e.target.value }] as any)} />{canManage && <button className="btn btn-ghost btn-sm btn-danger" onClick={async () => (await confirm('Delete this schedule?')) && del('report_schedules', [s.id])}><Trash2 size={13} /></button>}</div>
              <div className="grid grid-cols-3 gap-2"><Field label="Cadence"><select className="input" disabled={!canManage} value={s.cadence} onChange={(e) => save('report_schedules', [{ ...s, cadence: e.target.value, day: e.target.value === 'weekly' ? 1 : 1 }] as any)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></Field>
                <Field label={s.cadence === 'weekly' ? 'Day' : 'Day of month'}>{s.cadence === 'weekly' ? <select className="input" disabled={!canManage} value={s.day} onChange={(e) => save('report_schedules', [{ ...s, day: Number(e.target.value) }] as any)}>{DOW.map((d, i) => <option key={d} value={i}>{d}</option>)}</select> : <input type="number" min={1} max={31} className="input" disabled={!canManage} defaultValue={s.day} onBlur={(e) => save('report_schedules', [{ ...s, day: Math.min(31, Math.max(1, Number(e.target.value))) }] as any)} />}</Field>
                <Field label="Hour (UTC)"><input type="number" min={0} max={23} className="input" disabled={!canManage} defaultValue={s.hour_utc} onBlur={(e) => save('report_schedules', [{ ...s, hour_utc: Math.min(23, Math.max(0, Number(e.target.value))) }] as any)} /></Field></div>
              <Field label="Recipients (comma-separated emails)"><input className="input" disabled={!canManage} defaultValue={s.recipients.join(', ')} onBlur={(e) => save('report_schedules', [{ ...s, recipients: e.target.value.split(/[,;\s]+/).filter((x) => /.+@.+\..+/.test(x)) }] as any)} /></Field>
              <div className="flex gap-2 text-[11px] muted"><Chip color={s.audience === 'client' ? '#06b6d4' : '#a855f7'}>{s.audience}</Chip>{s.client_id && <span>{clients.find((c) => c.id === s.client_id)?.name}</span>}<span className="ml-auto">{s.last_sent_at ? `last sent ${relTime(s.last_sent_at)}` : 'never sent'}</span></div></div>))}</div>}
        </Card>
      </div>{node}
    </div>
  );
}


const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const PRESETS = (t: string) => [
  { l: 'Today', f: t, to: t }, { l: 'Last 7 days', f: addDays(t, -6), to: t }, { l: 'Last 30 days', f: addDays(t, -29), to: t },
  { l: 'This month', f: t.slice(0, 8) + '01', to: t }, { l: 'Last month', f: (() => { const d = new Date(t.slice(0, 8) + '01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); })(), to: addDays(t.slice(0, 8) + '01', -1) },
  { l: 'Last 90 days', f: addDays(t, -89), to: t }, { l: 'Year to date', f: t.slice(0, 5) + '01-01', to: t },
];

interface Preset { id: string; name: string; report: string; params: Partial<ReportParams> }

function Runner() {
  const st = useStore(); const phi = usePhi(); const today = todayISO(); const [sp, setSp] = useSearchParams();
  const [rid, setRid] = useState(sp.get('r') || 'ar_summary'); const def = REPORTS.find((r) => r.id === rid) || REPORTS[0];
  const base = useMemo(() => ({ ...emptyParams(today), ...(def.dateDefaults?.(today) || {}), ...def.defaults }), [def, today]);
  const [p, setP] = useState<ReportParams>({ ...base, clients: st.clientScope }); const [res, setRes] = useState<{ result: ReportResult; params: ReportParams } | null>(null);
  const [sort, setSort] = useState<{ k: string; d: 1 | -1 } | null>(null); const [busy, setBusy] = useState(false); const [q, setQ] = useState('');
  const presets: Preset[] = st.userItems.filter((x) => x.kind === 'report_preset').map((x) => ({ id: x.id, name: x.name || 'View', report: x.body.report, params: x.body.params }));
  const f = def.filters; const set = (patch: Partial<ReportParams>) => setP((x) => ({ ...x, ...patch }));
  const pick = (id: string) => { const d = REPORTS.find((r) => r.id === id)!; setRid(id); setP({ ...emptyParams(today), ...(d.dateDefaults?.(today) || {}), ...d.defaults, clients: st.clientScope }); setRes(null); setSort(null); setSp({ r: id }, { replace: true }); };
  const payers = useMemo(() => [...new Set(st.claims.map((c) => c.payer).filter(Boolean) as string[])].sort(), [st.claims]);
  const stages = useMemo(() => stageDefs(st.config).map((s) => s.value), [st.config]); const bucketLabels = useMemo(() => bucketsFrom(st.config).map((b) => b.label), [st.config]);
  const statuses = useMemo(() => st.config.filter((o) => o.category === 'status').map((o) => o.value), [st.config]);
  const run = () => {
    setBusy(true);
    void st.loadSnapshots().then(() => setTimeout(() => { try {
      const ecs = enrichClaims(st.claims, { clients: st.clients, profiles: st.profiles, config: st.config, today, staleDays: st.settings.sla?.staleDays ?? 14, followupDefault: st.settings.workflow?.followupDays ?? 30, includeClosed: true, scope: [] });
      const violations = computeViolations(st as any, st.claims.filter((c) => !c.closed_at));
      const out = runReport(rid, { qaReviews: st.qaReviews, qaConfig: st.qaConfig, snapshots: useStore.getState().snapshots, ecs, claims: st.claims, workLog: st.workLog, recoveries: st.recoveries, batches: st.batches, profiles: st.profiles, clients: st.clients, config: st.config, carc: st.carcMap(), violations, today, showPhi: st.has('view_phi') && !st.settings.model?.maskPhi }, p);
      setRes({ result: out.result, params: out.params }); setSort(null);
    } catch (e: any) { toast.err('Report failed: ' + (e?.message || e)); } setBusy(false); }, 30));
  };
  const filterLines = useMemo(() => { const x: string[] = []; const nm = (ids: string[], list: { id: string; name: string }[]) => ids.map((i) => list.find((l) => l.id === i)?.name || i).join(', ');
    x.push('Clients: ' + (p.clients.length ? nm(p.clients, st.clients) : 'All')); if (f.includes('dates')) x.push(`${def.dateLabel || 'Period'}: ${usDate(p.from)} → ${usDate(p.to)}`); if (p.payers.length) x.push('Payers: ' + p.payers.join(', ')); if (p.buckets.length) x.push('Buckets: ' + p.buckets.join(', ')); if (p.stages.length) x.push('Queues: ' + p.stages.join(', ')); if (p.statuses.length) x.push('Status: ' + p.statuses.join(', ')); if (p.minBalance) x.push('Min balance: $' + p.minBalance); if (p.dosFrom || p.dosTo) x.push(`DOS: ${usDate(p.dosFrom) || '…'} → ${usDate(p.dosTo) || '…'}`); for (const [k, l] of [['providers', 'Providers'], ['visits', 'Visit types'], ['lifecycles', 'Lifecycle'], ['families', 'Work buckets'], ['rcas', 'Root causes'], ['flags', 'Flags'], ['severity', 'Severity']] as const) if ((p as any)[k].length) x.push(`${l}: ${(p as any)[k].join(', ')}`); if (p.groupBy) x.push('Group by: ' + p.groupBy); return x; }, [p, f, st.clients]);
  const rows = useMemo(() => { if (!res) return []; let r = res.result.rows; if (q) { const n = q.toLowerCase(); r = r.filter((row) => res.result.columns.some((c) => String(row[c.key] ?? '').toLowerCase().includes(n))); }
    if (sort) r = [...r].sort((a, b) => { const x = a[sort.k], y = b[sort.k]; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true })) * sort.d; }); return r; }, [res, sort, q]);
  const meta = { title: def.title, subtitle: `${st.settings.org?.name || 'Revantage ClaimsIQ'} · ${rows.length} rows`, filters: filterLines };
  const doExport = async (fmt: ExportFormat) => { if (!res) return; try { await exportReport(fmt, { ...res.result, rows }, meta, today); void st.audit_('export', `Exported report "${def.title}" as ${fmt}`, { rows: rows.length }, 'reports', rid); } catch (e: any) { toast.err('Export failed: ' + (e?.message || e)); } };
  const savePreset = async () => { const name = window.prompt('Name this report view'); if (!name) return; await st.saveItem('report_preset', { report: rid, params: p }, { name }); toast.ok('Saved'); };
  const loadPreset = (x: Preset) => { setRid(x.report); setP({ ...emptyParams(today), ...(REPORTS.find((r) => r.id === x.report)?.dateDefaults?.(today) || {}), ...x.params } as ReportParams); setRes(null); };
  const money = def && res ? res.result.chart?.money : false;
  const chartData = res?.result.chart ? rows.slice(0, 12).map((r) => ({ name: String(r[res.result.chart!.label] ?? ''), value: Number(r[res.result.chart!.value]) || 0 })) : [];
  const providers = useMemo(() => [...new Set(st.claims.map((c) => c.provider).filter(Boolean) as string[])].sort(), [st.claims]);
  const flagOpts = useMemo(() => [...Object.entries(FLAG_LABEL).map(([k, v]) => ({ v: k, l: v.label })), ...CHECKS.map((c) => ({ v: 'chk:' + c.id, l: c.title }))], []);
  const cl = st.clients.filter((c) => c.active).map((c) => ({ v: c.id, l: c.name }));
  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-4">
      <aside className="space-y-3">
        {REPORT_GROUPS.map((g) => { const l = REPORTS.filter((r) => r.group === g); return l.length ? <div key={g}><div className="label mb-1">{g}</div>{l.map((r) => <button key={r.id} onClick={() => pick(r.id)} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] ${r.id === rid ? 'bg-brand-500/15 text-brand-500 font-medium' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}>{r.title}</button>)}</div> : null; })}
        {presets.length > 0 && <div><div className="label mb-1">Saved views</div>{presets.map((x) => <div key={x.id} className="flex items-center group"><button className="flex-1 text-left px-2.5 py-1.5 rounded-lg text-[13px] hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1.5" onClick={() => loadPreset(x)}><Star size={12} className="text-amber-500" />{x.name}</button><button className="opacity-0 group-hover:opacity-100 p-1" onClick={() => st.delItem(x.id)}><Trash2 size={12} /></button></div>)}</div>}
      </aside>
      <div className="space-y-4 min-w-0">
        <ExecSummary />
        <Card title={def.title} actions={<><button className="btn btn-sm" onClick={savePreset}><Star size={13} />Save view</button><button className="btn btn-primary btn-sm" onClick={run} disabled={busy}><Play size={13} />{busy ? 'Running…' : 'Run report'}</button></>}>
          <p className="text-xs muted mb-3">{def.description}</p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {f.includes('clients') && <Multi label="Clients" options={cl} value={p.clients} onChange={(v) => set({ clients: v })} />}
            {f.includes('payers') && <Multi label="Payers" options={payers.map((x) => ({ v: x, l: x }))} value={p.payers} onChange={(v) => set({ payers: v })} />}
            {f.includes('buckets') && <Multi label="Aging buckets" options={bucketLabels.map((x) => ({ v: x, l: x }))} value={p.buckets} onChange={(v) => set({ buckets: v })} />}
            {f.includes('stages') && <Multi label="Claim queues" options={stages.map((x) => ({ v: x, l: x }))} value={p.stages} onChange={(v) => set({ stages: v })} />}
            {f.includes('statuses') && <Multi label="Status" options={statuses.map((x) => ({ v: x, l: x }))} value={p.statuses} onChange={(v) => set({ statuses: v })} />}
            {f.includes('owners') && <Multi label="Owner" options={[{ v: 'none', l: 'Unassigned' }, ...st.profiles.filter((x) => x.role !== 'client').map((x) => ({ v: x.id, l: x.full_name }))]} value={p.owners} onChange={(v) => set({ owners: v })} />}
            {f.includes('users') && <Multi label="Team members" options={st.profiles.filter((x) => x.role !== 'client').map((x) => ({ v: x.id, l: x.full_name }))} value={p.users} onChange={(v) => set({ users: v })} />}
            {f.includes('dates') && <div className="sm:col-span-2 xl:col-span-2"><div className="label">{def.dateLabel || 'Date range'}</div><DateRangeFilter from={p.from} to={p.to} onChange={(r) => set(r)} /></div>}
            {f.includes('providers') && <Multi label="Provider" options={providers.map((x) => ({ v: x, l: x }))} value={p.providers} onChange={(v) => set({ providers: v })} />}
            {f.includes('visits') && <Multi label="Visit type" options={VISIT_TYPES.map((x) => ({ v: x, l: x }))} value={p.visits} onChange={(v) => set({ visits: v })} />}
            {f.includes('lifecycles') && <Multi label="Lifecycle status" options={lifecycleDefs(st.config).map((d) => ({ v: d.code, l: `${d.code} · ${d.label}` }))} value={p.lifecycles} onChange={(v) => set({ lifecycles: v })} />}
            {f.includes('families') && <Multi label="Work bucket (cause)" options={FAMILIES.map((x) => ({ v: x.name, l: x.name }))} value={p.families} onChange={(v) => set({ families: v })} />}
            {f.includes('rcas') && <Multi label="Root cause" options={st.config.filter((o) => o.category === 'rca' && o.active).map((o) => ({ v: o.value, l: o.value }))} value={p.rcas} onChange={(v) => set({ rcas: v })} />}
            {f.includes('flags') && <Multi label="Issue flags" options={flagOpts} value={p.flags} onChange={(v) => set({ flags: v })} />}
            {f.includes('severity') && <Multi label="Severity" options={['high', 'med', 'low'].map((x) => ({ v: x, l: x }))} value={p.severity} onChange={(v) => set({ severity: v })} />}
            {f.includes('dos') && <div className="sm:col-span-2"><div className="label">Date of service</div><div className="flex items-center gap-2"><DateField className="!w-[150px]" placeholder="From" value={p.dosFrom || null} onChange={(d) => set({ dosFrom: d || '' })} /><span className="muted text-xs">to</span><DateField className="!w-[150px]" placeholder="To" value={p.dosTo || null} min={p.dosFrom || undefined} onChange={(d) => set({ dosTo: d || '' })} /></div></div>}
            {f.includes('minBalance') && <Field label="Min balance ($)"><input type="number" min={0} className="input" value={p.minBalance} onChange={(e) => set({ minBalance: Number(e.target.value) || 0 })} /></Field>}
            {f.includes('days') && <Field label="Days"><input type="number" min={1} className="input" value={p.days} onChange={(e) => set({ days: Number(e.target.value) || 30 })} /></Field>}
            {f.includes('topN') && <Field label="Top N (0 = all)"><input type="number" min={0} className="input" value={p.topN} onChange={(e) => set({ topN: Number(e.target.value) || 0 })} /></Field>}
            {def.groupBy && <Field label="Group by"><select className="input" value={p.groupBy || def.groupBy[0].value} onChange={(e) => set({ groupBy: e.target.value })}>{def.groupBy.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</select></Field>}
            {f.includes('includeClosed') && <label className="flex items-end gap-2 text-xs pb-2"><input type="checkbox" checked={p.includeClosed} onChange={(e) => set({ includeClosed: e.target.checked })} />Include closed claims</label>}
          </div>
        </Card>
        {res && <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{res.result.summary.map((s) => <div key={s.label} className="panel p-3"><div className="label">{s.label}</div><div className="text-xl font-semibold tabular-nums">{s.value}</div></div>)}</div>
          {res.result.notes?.map((n, i) => <div key={i} className="text-xs muted">ⓘ {n}</div>)}
          {res.result.chart && chartData.length > 0 && <Card title="Chart">{res.result.chart.kind === 'donut' ? <Donut data={chartData.map((d, i) => ({ ...d, color: ['#6366f1', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#a855f7', '#64748b', '#ec4899'][i % 8] }))} /> : <HBars data={chartData} money={!!money} height={Math.max(160, chartData.length * 28)} />}</Card>}
          <Card pad={false} title={`${rows.length.toLocaleString()} rows`} actions={<><input className="input !w-40" placeholder="Filter rows…" value={q} onChange={(e) => setQ(e.target.value)} />
            {(['csv', 'xlsx', 'pdf', 'html', 'json', 'print'] as ExportFormat[]).map((x) => <button key={x} className="btn btn-sm uppercase" onClick={() => doExport(x)}>{x === 'print' ? <Printer size={13} /> : <Download size={13} />}{x}</button>)}
            <button className="btn btn-sm" onClick={async () => { await copyTSV({ ...res.result, rows }); toast.ok('Copied — paste into Excel'); }}><Copy size={13} />Copy</button></>}>
            <div className="overflow-auto max-h-[60vh]"><table className="tbl w-full"><thead className="sticky top-0"><tr>{res.result.columns.map((c) => <th key={c.key} className={`cursor-pointer select-none ${c.type && c.type !== 'text' && c.type !== 'date' ? 'text-right' : ''}`} onClick={() => setSort(sort?.k === c.key ? { k: c.key, d: (sort.d * -1) as 1 | -1 } : { k: c.key, d: 1 })}>{c.label}{sort?.k === c.key ? (sort.d === 1 ? ' ▲' : ' ▼') : ''}</th>)}</tr></thead>
              <tbody>{rows.slice(0, 500).map((r, i) => <tr key={i}>{res.result.columns.map((c) => <td key={c.key} className={c.type && c.type !== 'text' && c.type !== 'date' ? 'text-right tabular-nums' : ''}>{formatCell(r[c.key], c.type)}</td>)}</tr>)}
                {res.result.totals && <tr className="font-semibold">{res.result.columns.map((c, i) => <td key={c.key} className={c.type && c.type !== 'text' && c.type !== 'date' ? 'text-right tabular-nums' : ''}>{i === 0 ? 'Total' : res.result.totals![c.key] != null ? formatCell(res.result.totals![c.key], c.type) : ''}</td>)}</tr>}</tbody></table></div>
            {rows.length > 500 && <div className="text-xs muted p-3">Showing first 500 rows — exports include all {rows.length.toLocaleString()}.</div>}
          </Card></>}
        {!res && <Empty title="Choose filters, then Run report" sub="Every report can be exported to CSV, Excel, PDF, HTML or JSON, and saved as a view." />}
      </div>
    </div>
  );
}

export default function Reports() {
  const [tab, setTab] = useState<'run' | 'sched'>('run');
  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2"><FileBarChart2 className="text-brand-400" />Reports</span>} sub="Build any report, filter by client, payer, queue, owner and date, then export. Scheduled emails contain aggregates only — never patient information." />
      <QuickPacks />
      <Tabs tabs={[{ id: 'run', label: 'Report builder' }, { id: 'sched', label: 'Scheduled emails' }]} value={tab} onChange={setTab} />
      <div className="mt-4">{tab === 'run' ? <Runner /> : <SchedulesPanel />}</div>
    </div>
  );
}
