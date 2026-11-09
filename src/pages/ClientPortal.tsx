import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCheck, CircleDollarSign, Download, Eye, Landmark } from 'lucide-react';
import { enrichClaims } from '../lib/engine/enrich';
import type { EClaim } from '../lib/engine/eclaim';
import { portalPerms, practiceIds } from '../lib/types';
import { todayISO } from '../lib/utils';
import { Printer, Search } from 'lucide-react';
import { format } from 'date-fns';
import { useStore } from '../store';
import { useBuckets, useClaims, useOpts } from '../hooks';
import { Card, Chip, Empty, PageHeader, Stat } from '../components/ui';
import { BucketBars, Donut, HBars, Trend } from '../components/Charts';
import { downloadFile, fmtDate, groupBy, money, moneyShort, num, pct, sum } from '../lib/utils';

/** Everything a client user (or an admin previewing one with ?as=<profile id>) may see: their practices, permissions and enriched claims. */
export function usePortal() {
  const st = useStore(); const me = st.me(); const [sp, setSp] = useSearchParams();
  const asId = me && me.role !== 'client' ? sp.get('as') : null; const subject = asId ? st.profiles.find((x) => x.id === asId) : me;
  const allIds = practiceIds(subject); const practices = st.clients.filter((c) => allIds.includes(c.id)); const pick = sp.get('p');
  const ids = pick && allIds.includes(pick) ? [pick] : allIds; const perms = portalPerms(subject);
  const claims = useMemo(() => st.claims.filter((c) => ids.includes(c.client_id)), [st.claims, ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const ecs = useMemo(() => enrichClaims(claims, { clients: st.clients, profiles: st.profiles, config: st.config, today: todayISO(), includeClosed: true }), [claims, st.clients, st.profiles, st.config]);
  const open = useMemo(() => ecs.filter((x) => x.open), [ecs]);
  const snaps = useMemo(() => st.batches.filter((b) => b.summary?.total != null && ids.includes(b.client_id as string)).sort((a, b) => a.created_at.localeCompare(b.created_at)), [st.batches, ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const requests = st.requests.filter((r) => ids.includes(r.client_id)); const recoveries = st.recoveries.filter((r) => ids.includes(r.client_id));
  const name = (n: string | null | undefined) => (!n ? '—' : perms.show_patient ? n : n.split(/[, ]+/).filter(Boolean).map((x) => x[0] + '•••').join(' '));
  const keep = (extra: Record<string, string>) => { const q = new URLSearchParams(); if (asId) q.set('as', asId); if (pick) q.set('p', pick); Object.entries(extra).forEach(([k, v]) => (v ? q.set(k, v) : q.delete(k))); return q; };
  return { subject, preview: !!asId, asId, practices, allIds, ids, pick, perms, ecs, open, snaps, requests, recoveries, name, client: ids.length === 1 ? practices.find((c) => c.id === ids[0]) : undefined, setPractice: (id: string) => setSp(keep({ p: id }), { replace: true }) };
}
export const clientStatus = (x: EClaim): { label: string; color: string } => {
  const s = x.stage || '';
  if (s === 'Patient responsibility') return { label: 'With patient', color: '#84cc16' }; if (s === 'In appeal') return { label: 'Appeal in progress', color: '#8b5cf6' }; if (s === 'Waiting on documents') return { label: 'Needs your input', color: '#fb923c' };
  if (s === 'Denied' || s.startsWith('Rejected')) return { label: 'Being corrected', color: '#ef4444' }; if (s.startsWith('Secondary')) return { label: 'Billing secondary', color: '#0ea5e9' }; if (s.startsWith('Unbilled')) return { label: 'Preparing to bill', color: '#64748b' };
  if (s.startsWith('Credit')) return { label: 'Credit balance', color: '#06b6d4' }; if (!x.c.touch_count) return { label: 'Queued for our team', color: '#94a3b8' }; return { label: 'With payer', color: '#6366f1' };
};

function PracticePicker({ p }: { p: ReturnType<typeof usePortal> }) {
  if (p.allIds.length < 2) return null;
  return <div className="seg flex-wrap"><button className={!p.pick ? 'on' : ''} onClick={() => p.setPractice('')}>All practices</button>{p.practices.map((c) => <button key={c.id} className={p.pick === c.id ? 'on' : ''} onClick={() => p.setPractice(c.id)}>{c.name}</button>)}</div>;
}
function PreviewBanner({ p }: { p: ReturnType<typeof usePortal> }) {
  if (!p.preview) return null;
  return <div className="mb-4 rounded-2xl px-4 py-2.5 text-[13px] flex flex-wrap items-center gap-2 pill-warn"><Eye size={15} />Previewing as <b>{p.subject?.full_name}</b> — exactly what they see. Patient names {p.perms.show_patient ? 'visible' : 'masked'} · messaging {p.perms.can_message ? 'on' : 'off'} · downloads {p.perms.can_download ? 'on' : 'off'}.<span className="ml-auto flex gap-1.5">{[['Overview', '/portal'], ['Claims', '/portal/claims'], ['Report', '/portal/report']].map(([l, to]) => <Link key={to} className="btn btn-sm" to={`${to}?${p.asId ? 'as=' + p.asId : ''}${p.pick ? '&p=' + p.pick : ''}`}>{l}</Link>)}<Link className="btn btn-sm btn-primary" to="/admin?tab=access">Exit preview</Link></span></div>;
}

export function PortalOverview() {
  const p = usePortal(); const { open, ecs, snaps, perms, requests, recoveries } = p; const buckets = useBuckets();
  const total = sum(open.map((x) => x.c.balance)); const aged = sum(open.filter((x) => (x.age ?? 0) > 120).map((x) => x.c.balance));
  const bData = buckets.map((b) => { const l = open.filter((x) => x.bucket?.label === b.label); return { name: b.label, value: sum(l.map((x) => x.c.balance)), count: l.length, color: b.color }; });
  const payers = [...groupBy(open, (x) => x.c.payer || 'Unknown')].map(([name, l]) => ({ name, value: sum(l.map((x) => x.c.balance)) })).sort((a, b) => b.value - a.value).slice(0, 7);
  const sMap = groupBy(open, (x) => clientStatus(x).label); const sData = [...sMap].map(([name, l]) => ({ name, value: l.length, color: clientStatus(l[0]).color })).sort((a, b) => b.value - a.value);
  const reasons = [...groupBy(open.filter((x) => x.c.rca), (x) => x.c.rca!)].map(([name, l]) => ({ name, value: sum(l.map((x) => x.c.balance)) })).sort((a, b) => b.value - a.value).slice(0, 7);
  const trend = snaps.map((b) => ({ name: format(new Date(b.created_at), 'MM/dd'), 'Open AR': b.summary!.total as number, Resolved: b.summary!.resolved?.v || 0 }));
  const worked = open.filter((x) => x.c.touch_count > 0).length; const closed = ecs.filter((x) => x.c.closed_at).length; const resolvedTotal = sum(snaps.map((b) => b.summary!.resolved?.v || 0));
  const patientAR = sum(open.filter((x) => x.patientAR).map((x) => x.c.balance)); const rec90 = sum(recoveries.filter((r) => r.occurred_on >= format(new Date(Date.now() - 90 * 86400000), 'yyyy-MM-dd') && r.type === 'payment').map((r) => r.amount * (r.share ?? 1)));
  const needs = open.filter((x) => clientStatus(x).label === 'Needs your input'); const openReq = requests.filter((r) => r.status === 'open');
  const title = p.client?.name || (p.practices.length > 1 ? `${p.practices.length} practices` : 'Your practice');
  return (
    <div>
      <PreviewBanner p={p} />
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6"><div><h1 className="display text-[30px] leading-tight">{title}</h1><p className="muted mt-1">Accounts receivable overview · updated {snaps.length ? fmtDate(snaps[snaps.length - 1].created_at.slice(0, 10)) : '—'} · read-only view</p></div><PracticePicker p={p} /></div>
      <div className="grid md:grid-cols-3 gap-4 mb-4">
        <Stat label="Open A/R" icon={<Landmark size={15} />} value={moneyShort(total)} sub={`${num(open.length)} claims · ${pct(total ? aged / total : 0)} over 120 days`} spark={bData.map((d) => d.value)} />
        <Stat tone="lav" color="#7c5ce0" label="Collected (last 90 days)" icon={<CircleDollarSign size={15} />} value={moneyShort(rec90)} sub={`${moneyShort(resolvedTotal)} resolved across all updates · ${closed} claims closed`} spark={trend.slice(-10).map((t) => t.Resolved)} />
        <Stat tone="ink" label="Worked by our team" icon={<CheckCheck size={15} />} value={pct(open.length ? worked / open.length : 0)} sub={`${worked} of ${open.length} open claims touched`} spark={[2, 4, 3, 6, 5, 8, Math.max(2, Math.round((open.length ? worked / open.length : 0) * 10))]} />
      </div>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Needs your attention" className="lg:col-span-1" actions={perms.can_message ? <Link className="btn btn-sm" to={`/requests?${p.asId ? 'as=' + p.asId : ''}`}>Messages</Link> : undefined}>
          {needs.length === 0 && openReq.length === 0 ? <div className="text-sm muted py-6 text-center">Nothing needs you right now 🎉</div> : <div className="space-y-2">
            {openReq.slice(0, 4).map((r) => <div key={r.id} className="panel2 p-3 text-[12.5px]"><Chip color="#f59e0b">{r.kind}</Chip><div className="mt-1.5">{r.body}</div></div>)}
            {needs.length > 0 && <div className="panel2 p-3 text-[12.5px]"><b>{needs.length}</b> claims are waiting on documents or information from your office ({moneyShort(sum(needs.map((x) => x.c.balance)))}).</div>}</div>}
        </Card>
        <Card title="Where claims stand" className="lg:col-span-2"><div className="grid sm:grid-cols-2 gap-4 items-center"><Donut data={sData} /><div className="space-y-1.5">{sData.map((d) => <div key={d.name} className="flex items-center gap-2 text-[12.5px]"><span className="w-2 h-2 rounded-full" style={{ background: d.color }} />{d.name}<b className="ml-auto tabular-nums">{d.value}</b></div>)}</div></div></Card>
      </div>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Aging" className="lg:col-span-2"><BucketBars data={bData} /></Card>
        <Card title="Insurance vs patient A/R"><div className="flex h-3 rounded-full overflow-hidden hatch mt-2"><div style={{ width: pct(total ? (total - patientAR) / total : 0), background: 'rgb(var(--b500))' }} /><div style={{ width: pct(total ? patientAR / total : 0), background: '#84cc16' }} /></div><div className="mt-3 space-y-1 text-sm"><div className="flex justify-between"><span>Insurance</span><b>{moneyShort(total - patientAR)}</b></div><div className="flex justify-between"><span>Patient responsibility</span><b>{moneyShort(patientAR)}</b></div></div></Card>
        <Card title="Top payers by balance"><HBars data={payers} color="#06b6d4" /></Card>
        <Card title="Why claims are held up ($)"><HBars data={reasons} color="#8b5cf6" /></Card>
        <Card title="A/R trend & resolutions">{trend.length > 1 ? <Trend data={trend} keys={[{ key: 'Open AR', color: '#3b82ec' }, { key: 'Resolved', color: '#22c55e' }]} height={210} /> : <div className="muted text-sm py-10 text-center">Trend appears after two updates.</div>}</Card>
      </div>
    </div>
  );
}

export function PortalClaims() {
  const p = usePortal(); const { open, ecs, perms, name } = p; const buckets = useBuckets(); const openClaim = useStore((s) => s.openClaim);
  const [q, setQ] = useState(''); const [b, setB] = useState(''); const [py, setPy] = useState(''); const [closed, setClosed] = useState(false); const [stat, setStat] = useState('');
  const base = closed ? ecs.filter((x) => x.c.closed_at) : open;
  const rows = base.filter((x) => (!b || x.bucket?.label === b) && (!py || x.c.payer === py) && (!stat || clientStatus(x).label === stat) && (!q || `${x.c.claim_no} ${perms.show_patient ? x.c.patient_name : ''} ${x.c.payer}`.toLowerCase().includes(q.toLowerCase()))).sort((a, c) => c.c.balance - a.c.balance);
  const payers = [...new Set(base.map((x) => x.c.payer || ''))].sort(); const stats = [...new Set(base.map((x) => clientStatus(x).label))].sort();
  const exportCsv = () => { const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`; const head = ['Practice', 'Claim', ...(perms.show_patient ? ['Patient'] : []), 'Payer', 'DOS', 'Age', 'Balance', 'Status']; const lines = [head.join(','), ...rows.map((x) => [x.client?.name, x.c.claim_no, ...(perms.show_patient ? [x.c.patient_name] : []), x.c.payer, x.c.dos, x.age, x.c.balance, clientStatus(x).label].map(esc).join(','))]; downloadFile('claims.csv', '\uFEFF' + lines.join('\r\n')); };
  return (
    <div>
      <PreviewBanner p={p} />
      <PageHeader title="Claims" sub={`${num(rows.length)} claims · ${money(sum(rows.map((x) => x.c.balance)))} · read-only`} actions={<><PracticePicker p={p} />{perms.can_download && <button className="btn btn-sm" onClick={exportCsv}><Download size={13} />Export CSV</button>}</>} />
      <div className="panel p-3 mb-3 flex gap-2 flex-wrap"><div className="relative"><Search size={14} className="absolute left-3 top-3 muted" /><input className="input !pl-9 !w-56" placeholder={perms.show_patient ? 'Claim, patient, payer…' : 'Claim, payer…'} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input !w-auto" value={b} onChange={(e) => setB(e.target.value)}><option value="">All ages</option>{buckets.map((x) => <option key={x.label}>{x.label}</option>)}</select>
        <select className="input !w-auto" value={py} onChange={(e) => setPy(e.target.value)}><option value="">All payers</option>{payers.map((x) => <option key={x}>{x}</option>)}</select>
        <select className="input !w-auto" value={stat} onChange={(e) => setStat(e.target.value)}><option value="">Any status</option>{stats.map((x) => <option key={x}>{x}</option>)}</select>
        <label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />Show resolved</label></div>
      <div className="panel overflow-auto max-h-[calc(100vh-260px)]"><table className="grid"><thead><tr>{p.practices.length > 1 && <th>Practice</th>}<th>Claim</th>{perms.show_patient && <th>Patient</th>}<th>Payer</th><th>DOS</th><th style={{ textAlign: 'right' }}>Age</th><th style={{ textAlign: 'right' }}>Balance</th><th>Status</th><th>Latest action</th></tr></thead>
        <tbody>{rows.slice(0, 300).map((x) => { const cs = clientStatus(x); return <tr key={x.c.id} className={p.preview ? '' : 'cursor-pointer'} onClick={() => !p.preview && openClaim(x.c.id)}>{p.practices.length > 1 && <td className="muted">{x.client?.name}</td>}<td className="font-semibold">{x.c.claim_no}</td>{perms.show_patient && <td>{name(x.c.patient_name)}</td>}<td>{x.c.payer}</td><td>{fmtDate(x.c.dos)}</td><td style={{ textAlign: 'right' }}>{x.age}d</td><td style={{ textAlign: 'right' }} className="font-semibold tabular-nums">{money(x.c.balance)}</td><td><Chip color={cs.color}>{cs.label}</Chip></td><td className="muted max-w-[220px] truncate">{x.c.end_action ? `${x.c.end_action}${x.c.end_sub ? ' · ' + x.c.end_sub : ''}` : '—'}</td></tr>; })}</tbody></table>
        {rows.length === 0 && <Empty title="No claims match" />}</div>
    </div>
  );
}

export function PortalReport() {
  const p = usePortal(); const { open, snaps, ecs, practices } = p; const buckets = useBuckets();
  const total = sum(open.map((x) => x.c.balance)); const aged = sum(open.filter((x) => (x.age ?? 0) > 120).map((x) => x.c.balance));
  const payers = [...groupBy(open, (x) => x.c.payer || 'Unknown')].map(([n, l]) => ({ n, v: sum(l.map((x) => x.c.balance)), c: l.length })).sort((a, b) => b.v - a.v).slice(0, 8);
  const last = snaps[snaps.length - 1], prev = snaps[snaps.length - 2]; const delta = last && prev ? (last.summary!.total as number) - (prev.summary!.total as number) : 0;
  const title = practices.length === 1 ? practices[0].name : `${practices.length} practices`;
  return (
    <div className="max-w-4xl">
      <PreviewBanner p={p} />
      <PageHeader title="Monthly A/R report" sub="Print or save as PDF" actions={<><PracticePicker p={p} /><button className="btn btn-primary no-print" onClick={() => window.print()}><Printer size={14} />Print / PDF</button></>} />
      <div className="panel p-8 space-y-6 print:border-0">
        <div><div className="text-2xl font-extrabold">{title}</div><div className="muted text-sm">Accounts Receivable Summary · {format(new Date(), 'MMMM yyyy')}</div></div>
        <p className="text-sm leading-relaxed">Open accounts receivable is <b>{money(total)}</b> across <b>{open.length}</b> claims. {pct(total ? aged / total : 0)} ({money(aged)}) is older than 120 days. {prev ? <>Since the previous update, total A/R {delta <= 0 ? 'decreased' : 'increased'} by {money(Math.abs(delta))}.</> : null} Our team has worked {ecs.filter((x) => x.open && x.c.touch_count > 0).length} of {open.length} open claims.</p>
        {practices.length > 1 && <div><div className="label">By practice</div><table className="grid"><thead><tr><th>Practice</th><th style={{ textAlign: 'right' }}>Claims</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead><tbody>{practices.map((c) => { const l = open.filter((x) => x.c.client_id === c.id); return <tr key={c.id}><td>{c.name}</td><td style={{ textAlign: 'right' }}>{l.length}</td><td style={{ textAlign: 'right' }}>{money(sum(l.map((x) => x.c.balance)))}</td></tr>; })}</tbody></table></div>}
        <div><div className="label">Aging</div><table className="grid"><thead><tr><th>Bucket</th><th style={{ textAlign: 'right' }}>Claims</th><th style={{ textAlign: 'right' }}>Balance</th><th style={{ textAlign: 'right' }}>%</th></tr></thead><tbody>{buckets.map((b) => { const l = open.filter((x) => x.bucket?.label === b.label); const v = sum(l.map((x) => x.c.balance)); return <tr key={b.label}><td>{b.label}</td><td style={{ textAlign: 'right' }}>{l.length}</td><td style={{ textAlign: 'right' }}>{money(v)}</td><td style={{ textAlign: 'right' }}>{pct(total ? v / total : 0)}</td></tr>; })}</tbody></table></div>
        <div><div className="label">Top payers</div><table className="grid"><thead><tr><th>Payer</th><th style={{ textAlign: 'right' }}>Claims</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead><tbody>{payers.map((x) => <tr key={x.n}><td>{x.n}</td><td style={{ textAlign: 'right' }}>{x.c}</td><td style={{ textAlign: 'right' }}>{money(x.v)}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
}
