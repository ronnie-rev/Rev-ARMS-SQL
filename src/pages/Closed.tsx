import { useMemo, useState } from 'react';
import { Archive, Download, Search } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, Empty, PageHeader, Stat } from '../components/ui';
import { DateRangeFilter, rangeFor } from '../components/DateRange';
import { usePhi } from '../hooks';
import { closedInsights } from '../lib/engine/closedinsights';
import { downloadFile, fmtDate, money, toCSV, usDate } from '../lib/utils';

const PAGE = 100;
const RES_COLOR: Record<string, string> = { paid: '#22c55e', adjusted: '#f59e0b', patient: '#6366f1', duplicate: '#94a3b8', void: '#94a3b8', transferred: '#06b6d4', unknown: '#ef4444', rolled_back: '#64748b' };
const RES_LABEL: Record<string, string> = { paid: 'Paid', adjusted: 'Written off / adjusted', patient: 'To patient', duplicate: 'Duplicate', void: 'Voided', transferred: 'Transferred', unknown: 'Unconfirmed', rolled_back: 'Import undone' };
const basisOf = (c: { custom?: Record<string, any>; closed_reason?: string | null }) => (c.custom?.resolution_basis === 'missing_review' ? 'Supervisor review' : /zero balance/i.test(c.closed_reason || '') ? 'Zero balance on file' : /dropped/i.test(c.closed_reason || '') ? 'Dropped off file (auto)' : /rolled back/i.test(c.closed_reason || '') ? 'Import undone' : /write-off/i.test(c.closed_reason || '') ? 'Write-off approved' : 'Closed');

/** Every closed / resolved claim, how it closed, who decided, and one click to its full history. */
export default function Closed() {
  const { claims, clients, profiles, recoveries, inScope, openClaim, has } = useStore(); const phi = usePhi();
  const [rng, setRng] = useState(() => rangeFor('90')); const [client, setClient] = useState(''); const [res, setRes] = useState(''); const [basis, setBasis] = useState(''); const [by, setBy] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const closed = useMemo(() => claims.filter((c) => c.closed_at && inScope(c.client_id)), [claims, inScope]);
  const rec = useMemo(() => { const m = new Map<string, number>(); for (const r of recoveries) if (r.claim_id) m.set(r.claim_id, (m.get(r.claim_id) || 0) + r.amount); return m; }, [recoveries]);
  const pm = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]); const cm = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const list = useMemo(() => closed.filter((c) => { const d = c.closed_at!.slice(0, 10); return d >= rng.from && d <= rng.to && (!client || c.client_id === client) && (!res || (c.resolution || 'unknown') === res) && (!basis || basisOf(c) === basis) && (!by || c.resolved_by === by) && (!q || `${c.claim_no} ${c.claim_uid || ''} ${c.encounter_no || ''} ${c.patient_name || ''} ${c.payer || ''}`.toLowerCase().includes(q.toLowerCase())); }).sort((a, b) => b.closed_at!.localeCompare(a.closed_at!)), [closed, rng, client, res, basis, by, q]);
  const cnt = (r: string) => list.filter((c) => (c.resolution || 'unknown') === r).length; const recovered = list.reduce((a, c) => a + (rec.get(c.id) || 0), 0);
  const deciders = [...new Set(closed.map((c) => c.resolved_by).filter(Boolean))] as string[];
  const exportCsv = () => downloadFile(`ClaimsIQ_closed_claims_${rng.from}_${rng.to}.csv`, toCSV(list.map((c) => ({ Client: cm.get(c.client_id) || '', 'Claim #': c.claim_no, UID: c.claim_uid || '', 'Encounter #': c.encounter_no || '', Payer: c.payer || '', DOS: usDate(c.dos), 'Closed on': usDate(c.closed_at!.slice(0, 10)), Resolution: RES_LABEL[c.resolution || 'unknown'] || c.resolution, Basis: basisOf(c), 'End action': c.end_action || '', 'Resolved by': pm.get(c.resolved_by || '') || '', Note: c.resolution_note || '', 'Recovered $': (rec.get(c.id) || 0).toFixed(2) }))));
  const shown = list.slice(0, page * PAGE); const ins = useMemo(() => closedInsights(list, recoveries), [list, recoveries]);
  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2"><Archive className="text-brand-500" size={26} />Closed & resolved</span>} sub="Every claim that left A/R, how it closed and who decided. Open any row for its full history: touches, notes, imports and the closing decision." actions={has('export') && <button className="btn" onClick={exportCsv}><Download size={14} />Export CSV</button>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4"><Stat label="Closed in range" value={list.length.toLocaleString('en-US')} /><Stat label="Paid" value={cnt('paid')} color="#22c55e" /><Stat label="Written off / adjusted" value={cnt('adjusted')} color="#f59e0b" /><Stat label="Unconfirmed" value={cnt('unknown')} color="#ef4444" sub="closed without a stated outcome" /><Stat label="Recovered credited" value={money(recovered)} color="#6366f1" /></div>
      {ins.total >= 10 && <Card title="Resolution insights" className="mb-4"><div className="grid md:grid-cols-4 gap-3 text-[13px] mb-3"><div><div className="label">Median days to close</div><b className="text-lg">{ins.medianDays ?? '—'}</b></div><div><div className="label">Closed as paid</div><b className="text-lg">{ins.paidPct}%</b></div><div><div className="label">Written off / adjusted</div><b className="text-lg" style={{ color: ins.writeOffPct >= 25 ? '#dc2626' : undefined }}>{ins.writeOffPct}%</b></div><div><div className="label">Recovered vs billed</div><b className="text-lg">{ins.yieldPct == null ? '—' : ins.yieldPct + '%'}</b><div className="text-[11px] muted">{money(ins.recovered)} of {money(ins.billed)}</div></div></div>
        <div className="grid md:grid-cols-3 gap-4 text-[13px]"><div><div className="label mb-1">Slowest payers to close</div>{ins.slowest.length === 0 ? <span className="muted">Not enough closed claims per payer yet</span> : ins.slowest.map((p) => <div key={p.payer} className="flex justify-between"><span>{p.payer}</span><span className="muted">{p.medianDays} days · {p.closed} claims</span></div>)}</div>
          <div><div className="label mb-1">Highest write-off rates</div>{ins.writeOffs.length === 0 ? <span className="muted">No payer above 15% write-offs</span> : ins.writeOffs.map((p) => <div key={p.payer} className="flex justify-between"><span>{p.payer}</span><span style={{ color: '#dc2626' }}>{p.writeOffPct}% of {p.closed}</span></div>)}</div>
          <div><div className="label mb-1">Closed — worth a second look</div>{ins.needsReview.length === 0 ? <span className="muted">Every closure has a confirmed outcome</span> : ins.needsReview.slice(0, 5).map((r) => <button key={r.id} className="block w-full text-left hover:bg-white/5 rounded px-1" onClick={() => openClaim(r.id)}><b className="font-mono text-xs">{r.claim_no}</b> <span className="muted">{r.why}</span></button>)}</div></div></Card>}
      <div className="flex flex-wrap gap-2 items-center mb-3"><DateRangeFilter from={rng.from} to={rng.to} onChange={(r) => { setRng(r); setPage(1); }} presets={['7', '30', '90', 'mtd', 'last_month', 'ytd']} />
        <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 muted" /><input className="input !pl-8 !w-56" placeholder="Claim #, UID, patient…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <select className="input !w-auto" value={client} onChange={(e) => { setClient(e.target.value); setPage(1); }}><option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input !w-auto" value={res} onChange={(e) => { setRes(e.target.value); setPage(1); }}><option value="">Any resolution</option>{Object.entries(RES_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input !w-auto" value={basis} onChange={(e) => { setBasis(e.target.value); setPage(1); }}><option value="">Any basis</option>{['Supervisor review', 'Zero balance on file', 'Dropped off file (auto)', 'Write-off approved', 'Import undone', 'Closed'].map((b) => <option key={b}>{b}</option>)}</select>
        <select className="input !w-auto" value={by} onChange={(e) => { setBy(e.target.value); setPage(1); }}><option value="">Anyone</option>{deciders.map((id) => <option key={id} value={id}>{pm.get(id)}</option>)}</select></div>
      {list.length === 0 ? <Card><Empty title="No closed claims match" sub="Widen the date range or clear a filter." /></Card> : (
        <Card pad={false}><div className="overflow-auto"><table className="grid"><thead><tr><th>Claim</th><th>Client · payer</th><th>Closed</th><th>Resolution</th><th>How</th><th>Decided by</th><th style={{ textAlign: 'right' }}>Recovered</th></tr></thead><tbody>
          {shown.map((c) => (<tr key={c.id} className="cursor-pointer hover:bg-[var(--panel2)]" onClick={() => openClaim(c.id)}>
            <td><span className="font-semibold text-brand-400">{c.claim_no}</span><div className="text-[11px] muted">{c.claim_uid || ''}{c.encounter_no ? ` · Enc ${c.encounter_no}` : ''}</div><div className="text-[11px] muted">{phi(c.patient_name)} · DOS {fmtDate(c.dos)}</div></td>
            <td className="text-[12.5px]">{cm.get(c.client_id)}<div className="muted text-[11px]">{c.payer}</div></td>
            <td className="text-[12.5px]">{fmtDate(c.closed_at)}</td>
            <td><Chip color={RES_COLOR[c.resolution || 'unknown'] || '#64748b'}>{RES_LABEL[c.resolution || 'unknown'] || c.resolution}</Chip>{c.end_action && <div className="text-[11px] muted mt-0.5">{c.end_action}</div>}</td>
            <td className="text-[12px]">{basisOf(c)}{c.resolution_note && <div className="text-[11px] muted max-w-[260px] truncate" title={c.resolution_note}>{c.resolution_note}</div>}</td>
            <td className="text-[12.5px]">{pm.get(c.resolved_by || '') || <span className="muted">—</span>}</td>
            <td style={{ textAlign: 'right' }} className="tabular-nums">{money(rec.get(c.id) || 0, true)}</td></tr>))}
        </tbody></table></div>{list.length > shown.length && <div className="p-3 text-center"><button className="btn btn-sm" onClick={() => setPage((p) => p + 1)}>Show more ({(list.length - shown.length).toLocaleString('en-US')} left)</button></div>}</Card>)}
    </div>
  );
}
