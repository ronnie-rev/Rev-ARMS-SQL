import { StaffForecast } from '../components/StaffForecast';
import { useMemo, useState } from 'react';
import { isIC, isProducer } from '../lib/roles';
import { Download } from 'lucide-react';
import { eachDayOfInterval, format, isWeekend, parseISO, startOfMonth, subDays } from 'date-fns';
import { useStore } from '../store';
import { Avatar, Bar, Card, Chip, PageHeader, Stat } from '../components/ui';
import { HBars, Trend } from '../components/Charts';
import { DateRangeFilter, rangeFor } from '../components/DateRange';
import { usDate, downloadFile, groupBy, money, moneyShort, num, pct, sum, toCSV } from '../lib/utils';
import { AuditChip } from '../components/ClaimDrawer';
import { ByClient, Capacity, TeamGrid } from './productivity/Extras';
import { PerfTable } from './productivity/Perf';
import { coaching } from '../lib/engine/coaching';
import { Tabs } from '../components/ui';

export default function Productivity() {
  const { workLog, claims, clients, profiles, inScope, recoveries, has, save, setResolution } = useStore();
  const me = useStore((s) => s.me());
  const [rng, setRng] = useState(() => rangeFor('mtd')); const [tab, setTab] = useState<'overview' | 'grid' | 'clients' | 'capacity' | 'performance' | 'coaching' | 'forecast'>('overview');
  const [user, setUser] = useState(isIC(me?.role) ? me!.id : '');
  const from = rng.from, to = rng.to;
  const cm = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]);
  const rows = useMemo(() => workLog.filter((w) => w.work_date >= from && w.work_date <= to && inScope(w.client_id) && (!user || w.user_id === user)), [workLog, from, to, inScope, user]);
  const days = useMemo(() => eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }), [from, to]);
  const workdays = days.filter((d) => !isWeekend(d)).length;
  const staff = profiles.filter((p) => p.active && isProducer(p.role));
  const money_ = has('view_money'); const recRows = useMemo(() => recoveries.filter((r) => r.occurred_on >= from && r.occurred_on <= to && inScope(r.client_id) && (!user || r.user_id === user)), [recoveries, from, to, inScope, user]);
  const byType = useMemo(() => { const m = new Map<string, number>(); recRows.forEach((r) => m.set(r.type, (m.get(r.type) || 0) + r.amount)); return m; }, [recRows]);

  const perUser = useMemo(() => staff.filter((p) => !user || p.id === user).map((p) => {
    const l = rows.filter((w) => w.user_id === p.id);
    const audited = l.filter((w) => w.audit_status === 'pass' || w.audit_status === 'fail');
    return { p, touches: l.length, uniq: new Set(l.map((w) => w.claim_id)).size, dollars: sum(l.map((w) => w.balance || 0)), target: p.daily_target * workdays,
      multi: l.filter((w) => w.multi_touch).length, qa: audited.length ? audited.filter((w) => w.audit_status === 'pass').length / audited.length : null, fails: l.filter((w) => w.audit_status === 'fail').length };
  }).sort((a, b) => b.touches - a.touches), [rows, staff, user, workdays]);

  const trend = days.map((d) => ({ name: format(d, 'MM/dd'), touches: rows.filter((w) => w.work_date === format(d, 'yyyy-MM-dd')).length }));
  const byEnd = [...groupBy(rows.filter((w) => w.end_action), (w) => w.end_action!)].map(([name, l]) => ({ name, value: l.length })).sort((a, b) => b.value - a.value).slice(0, 8);
  const byRca = [...groupBy(rows.filter((w) => w.rca), (w) => w.rca!)].map(([name, l]) => ({ name, value: l.length })).sort((a, b) => b.value - a.value).slice(0, 8);
  const last14 = days.slice(-14);
  const heatMax = Math.max(1, ...perUser.flatMap((u) => last14.map((d) => rows.filter((w) => w.user_id === u.p.id && w.work_date === format(d, 'yyyy-MM-dd')).length)));

  const exportTracker = () => {
    const data = rows.map((w) => {
      const c = cm.get(w.claim_id); const cl = clients.find((x) => x.id === w.client_id);
      const valid = !!(w.rca && w.rca_detail && w.end_action && w.mode);
      return {
        'Client Name': cl?.name, 'Supervisor Name': w.supervisor_name, 'Work Date': usDate(w.work_date), 'EMP Code': w.emp_code, 'User Name': w.user_name, 'Insurance Name': c?.payer,
        'CLAIM NUMBER': c?.claim_no, 'Account ID': c?.account_id, 'PT name': c?.patient_name, 'Service Date': usDate(c?.dos), 'CPT CODE': c?.cpt, 'Billed Amt': c?.billed_amt, 'Balance Amount': w.balance,
        'Provider Type': c?.provider_type, 'Provider': c?.provider, 'Claim Comment': w.comment, 'Root Cause Category': w.rca, 'Root Cause Detail': w.rca_detail, 'End Action': w.end_action,
        'End Action-Subcategory': w.end_sub, 'Mode of Resolution': w.mode, 'Error Check': valid ? '-' : 'Options are not selected correctly', Age: w.age_days, Aging: w.bucket,
        'Month- Worked': usDate(w.work_date.slice(0, 7) + '-01'), 'Multi Touch': w.multi_touch ? 'Yes' : '', 'Next F/U Date': usDate(w.next_fu), 'Audit remarks': w.audit_remarks, 'Audit By': profiles.find((p) => p.id === w.audit_by)?.full_name,
      };
    });
    downloadFile(`AR_Production_${from}_to_${to}.csv`, toCSV(data));
  };

  return (
    <div>
      <PageHeader title="Productivity" sub="Captured automatically from every claim touch" actions={<>
        <DateRangeFilter from={rng.from} to={rng.to} onChange={setRng} />
        {!isIC(me?.role) && <select className="input !w-auto" value={user} onChange={(e) => setUser(e.target.value)}><option value="">Whole team</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>}
        <button className="btn" onClick={exportTracker}><Download size={14} />Export tracker format</button></>} />
      <div className="mb-5"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'grid', label: 'Team grid' }, { id: 'clients', label: 'By client' }, { id: 'capacity', label: 'Capacity' }, { id: 'performance', label: 'Performance & QA' }, ...(isIC(me?.role) ? [] : [{ id: 'coaching' as const, label: 'Coaching' }, { id: 'forecast' as const, label: 'Staffing forecast' }])]} /></div>
      {tab === 'grid' && <TeamGrid rows={rows} from={from} to={to} recs={recRows} />}
      {tab === 'clients' && <ByClient rows={rows} from={from} to={to} recs={recRows} />}
      {tab === 'capacity' && <Capacity />}
      {tab === 'forecast' && !isIC(me?.role) && <StaffForecast />}
      {tab === 'coaching' && !isIC(me?.role) && <Card title="Coaching signals" pad={false}><p className="text-xs muted px-5 pt-1 pb-2">Built from the touch log for the selected date range. These are conversation starters for 1:1s, not verdicts — check the claims before you coach.</p>
        {(() => { const rows2 = coaching(workLog.filter((w) => inScope(w.client_id)), staff, from, to, workdays); return rows2.length === 0 ? <div className="p-6 text-sm muted">No touches in this range.</div> : <div className="divide-y hair">{rows2.map((r) => <div key={r.id} className="px-5 py-3 text-[13px]"><div className="flex items-center gap-3 flex-wrap"><b>{r.name}</b><span className="muted">{r.touches} touches · {r.perDay}/day · {r.attain}% of target{r.qa != null ? ` · QA ${r.qa}%` : ''}</span>{r.flags.length === 0 && <Chip color="#16a34a">On track</Chip>}</div>{r.flags.map((f) => <div key={f.msg} className="flex gap-2 mt-1"><Chip color={f.level === 'high' ? '#dc2626' : '#d97706'}>{f.level === 'high' ? 'Act' : 'Watch'}</Chip><span>{f.msg}</span></div>)}</div>)}</div>; })()}</Card>}
      {tab === 'coaching' && !isIC(me?.role) && (() => { const fails = rows.filter((w) => w.audit_status === 'fail'); const by = (f: (w: (typeof rows)[number]) => string | null) => { const m = new Map<string, number>(); for (const w of fails) { const k = f(w); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6); }; const acts = by((w) => w.end_action), rcas = by((w) => w.rca); return fails.length === 0 ? null : <Card title={`What fails QA most (${fails.length} fails in range)`}><div className="grid md:grid-cols-2 gap-6 text-[13px]"><div><div className="label">By end action</div>{acts.map(([k, n]) => <div key={k} className="flex justify-between"><span>{k}</span><b>{n}</b></div>)}</div><div><div className="label">By root cause chosen</div>{rcas.map(([k, n]) => <div key={k} className="flex justify-between"><span>{k}</span><b>{n}</b></div>)}</div></div></Card>; })()}
      {tab === 'performance' && <PerfTable rows={rows} from={from} to={to} />}
      {tab === 'overview' && <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Stat label="Touches" value={num(rows.length)} sub={`${(rows.length / Math.max(1, workdays)).toFixed(1)} / working day`} />
        <Stat label="Unique claims" value={num(new Set(rows.map((w) => w.claim_id)).size)} color="#06b6d4" />
        <Stat label="$ worked" value={moneyShort(sum(rows.map((w) => w.balance || 0)))} color="#22c55e" />
        <Stat label="Multi-touch" value={pct(rows.length ? rows.filter((w) => w.multi_touch).length / rows.length : 0)} color="#f59e0b" />
        <Stat label="QA pass rate" value={(() => { const a = rows.filter((w) => w.audit_status === 'pass' || w.audit_status === 'fail'); return a.length ? pct(a.filter((w) => w.audit_status === 'pass').length / a.length) : '—'; })()} color="#a855f7" sub={`${rows.filter((w) => w.audit_status === 'pending').length} pending audit`} />
      </div>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Daily touches" className="lg:col-span-2"><Trend data={trend} keys={[{ key: 'touches', color: '#6366f1' }]} /></Card>
        <Card title="End actions"><HBars data={byEnd} money={false} color="#06b6d4" /></Card>
      </div>
      <Card title="Team scorecard" className="mb-4" pad={false}>
        <div className="overflow-auto px-4 pb-4"><table className="grid"><thead><tr><th>Specialist</th><th>Touches</th><th style={{ width: 180 }}>vs target</th><th>Unique claims</th><th style={{ textAlign: 'right' }}>$ worked</th>{money_ && <th style={{ textAlign: 'right' }}>$ attributed</th>}<th>Multi-touch</th><th>QA pass</th><th>Last 14 days</th></tr></thead><tbody>
          {perUser.map((u) => (
            <tr key={u.p.id}><td><div className="flex items-center gap-2"><Avatar name={u.p.full_name} size={24} /><div><div className="font-semibold">{u.p.full_name}</div><div className="text-[10px] muted">{u.p.emp_code}</div></div></div></td>
              <td className="font-bold">{u.touches}</td>
              <td><div className="flex items-center gap-2"><Bar value={u.touches} max={u.target} color={u.touches >= u.target ? '#22c55e' : u.touches >= u.target * 0.7 ? '#f59e0b' : '#ef4444'} /><span className="text-[11px] muted w-20">{u.target ? Math.round((u.touches / u.target) * 100) : 0}% of {u.target}</span></div></td>
              <td>{u.uniq}</td><td style={{ textAlign: 'right' }}>{money(u.dollars)}</td>{money_ && <td style={{ textAlign: 'right' }} className="text-green-500 font-semibold">{money(sum(recRows.filter((r) => r.user_id === u.p.id).map((r) => r.amount)))}</td>}<td>{u.touches ? pct(u.multi / u.touches) : '—'}</td>
              <td>{u.qa == null ? <span className="muted">—</span> : <Chip color={u.qa >= 0.9 ? '#22c55e' : u.qa >= 0.75 ? '#f59e0b' : '#ef4444'}>{pct(u.qa)}</Chip>}{u.fails > 0 && <span className="text-[11px] text-red-400 ml-1">{u.fails} fail</span>}</td>
              <td><div className="flex gap-[3px]">{last14.map((d) => { const n = rows.filter((w) => w.user_id === u.p.id && w.work_date === format(d, 'yyyy-MM-dd')).length; return <div key={+d} title={`${format(d, 'MM/dd')}: ${n}`} className="w-3.5 h-5 rounded-[3px]" style={{ background: n ? `rgba(99,102,241,${0.2 + (n / heatMax) * 0.8})` : 'var(--panel2)' }} />; })}</div></td></tr>))}
          {perUser.length === 0 && <tr><td colSpan={8} className="text-center muted py-8">No activity in this range.</td></tr>}</tbody></table></div>
      </Card>
      {money_ && (
        <Card title="Recovery ledger — balance reductions attributed to work" className="mb-4" pad={false} actions={has('export') && <button className="btn btn-sm" onClick={() => downloadFile(`recoveries_${from}_${to}.csv`, toCSV(recRows.map((r) => ({ date: r.occurred_on, client: clients.find((c) => c.id === r.client_id)?.name, claim: cm.get(r.claim_id || '')?.claim_no, user: r.user_name, amount: r.amount, type: r.type, basis: r.basis, share: r.share }))))}><Download size={13} />CSV</button>}>
          <div className="px-4 pb-4"><div className="flex gap-2 flex-wrap mb-3"><Chip color="#22c55e">Total {money(sum(recRows.map((r) => r.amount)))}</Chip>{[...byType].map(([t, v]) => <Chip key={t} color={t === 'payment' ? '#22c55e' : t === 'adjustment' ? '#f59e0b' : t === 'patient' ? '#06b6d4' : '#64748b'}>{t === 'unknown' ? 'unconfirmed' : t} {money(v)}</Chip>)}<span className="text-[11px] muted self-center">Aging files can’t tell cash from write-off — “unconfirmed” rows can be classified here or on the claim.</span></div>
            <div className="max-h-72 overflow-auto"><table className="grid"><thead><tr><th>Date</th><th>Claim</th><th>Credited to</th><th style={{ textAlign: 'right' }}>Amount</th><th>Type</th><th>Basis</th></tr></thead><tbody>{[...recRows].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)).slice(0, 80).map((r) => <tr key={r.id}><td className="whitespace-nowrap text-xs">{usDate(r.occurred_on)}</td><td className="font-semibold">{r.claim_id ? <button className="text-brand-400" onClick={() => useStore.getState().openClaim(r.claim_id!)}>{cm.get(r.claim_id)?.claim_no || 'claim'}</button> : '—'}</td><td className="text-xs">{r.user_name || <span className="muted">unattributed</span>}{r.basis === 'split' && <span className="muted"> ({Math.round(r.share * 100)}%)</span>}</td><td style={{ textAlign: 'right' }} className="tabular-nums">{money(r.amount, true)}</td>
              <td><select className="input !py-0.5 !text-xs" value={r.type} onChange={async (e) => { await save('recoveries', [{ ...r, type: e.target.value }] as any); if (r.claim_id && e.target.value !== 'unknown') await setResolution(r.claim_id, e.target.value === 'payment' ? 'paid' : e.target.value === 'adjustment' ? 'adjusted' : 'patient'); }}><option value="unknown">unconfirmed</option><option value="payment">payment</option><option value="adjustment">adjustment</option><option value="patient">to patient</option></select></td><td className="text-[11px] muted">{r.basis}</td></tr>)}</tbody></table>{recRows.length === 0 && <div className="text-center muted text-sm py-8">No recoveries in this range — they are created when imports reduce or close balances.</div>}</div></div></Card>)}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Root causes worked"><HBars data={byRca} money={false} color="#8b5cf6" /></Card>
        <Card title="Recent touches" pad={false}><div className="max-h-80 overflow-auto px-4 pb-3"><table className="grid"><thead><tr><th>Date</th><th>User</th><th>Claim</th><th>End action</th><th>QA</th></tr></thead><tbody>
          {[...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40).map((w) => <tr key={w.id}><td className="whitespace-nowrap">{w.work_date.slice(5)}</td><td>{w.user_name?.split(' ')[0]}</td><td>{cm.get(w.claim_id)?.claim_no}</td><td className="max-w-[160px] truncate">{w.end_action}</td><td><AuditChip s={w.audit_status} /></td></tr>)}</tbody></table></div></Card>
      </div>
      </>}
    </div>
  );
}
