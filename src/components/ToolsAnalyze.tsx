import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import { Card, Chip, Field } from './ui';
import { useClaims, useIntelligence } from '../hooks';
import { findDupes, heatmap, pareto, pursueRank, staffing, type ParetoDim } from '../lib/engine/finhealth';
import { bucketsFrom, downloadFile, fmtDate, money, todayISO } from '../lib/utils';
import { callsOf, payerContactRate, promises } from '../lib/engine/calls';

const DIMS: [ParetoDim, string][] = [['code', 'Denial code'], ['payer', 'Payer'], ['provider', 'Provider'], ['cpt', 'CPT'], ['client', 'Client']];
const Num = ({ label, v, set }: { label: string; v: number; set: (n: number) => void }) => <Field label={label}><input type="number" className="input" value={v} onChange={(e) => set(Number(e.target.value))} /></Field>;

export function ParetoCard() {
  const ecs = useClaims(); const [dim, setDim] = useState<ParetoDim>('code'); const [denied, setDenied] = useState(true); const rows = useMemo(() => pareto(ecs, dim, denied), [ecs, dim, denied]).slice(0, 12);
  return (
    <Card title="Pareto — what to fix first" actions={<><select className="input !w-auto !py-1 text-xs" value={dim} onChange={(e) => setDim(e.target.value as ParetoDim)}>{DIMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><label className="text-xs flex gap-1 items-center"><input type="checkbox" checked={denied} onChange={(e) => setDenied(e.target.checked)} />denied only</label></>}>
      {rows.length === 0 ? <div className="muted text-sm">Nothing to show.</div> : <><div style={{ height: 240 }}><ResponsiveContainer><ComposedChart data={rows}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="key" tick={{ fontSize: 10 }} /><YAxis yAxisId="a" tick={{ fontSize: 10 }} /><YAxis yAxisId="b" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" /><Tooltip /><Bar yAxisId="a" dataKey="balance" fill="#6366f1" radius={[4, 4, 0, 0]} /><Line yAxisId="b" dataKey="cum" stroke="#f97316" dot={false} /></ComposedChart></ResponsiveContainer></div>
        <div className="text-xs muted mt-1">{rows.filter((r) => r.cum <= 80).length + 1} items explain ~80% of the dollars. Bars = $, line = cumulative %.</div></>}
    </Card>
  );
}

export function HeatmapCard() {
  const { config } = useStore(); const ecs = useClaims(); const labels = useMemo(() => bucketsFrom(config).map((b) => b.label), [config]); const h = useMemo(() => heatmap(ecs, labels), [ecs, labels]);
  return (
    <Card title="Payer × aging heatmap" pad={false}><div className="overflow-x-auto"><table className="tbl w-full text-sm"><thead><tr><th>Payer</th>{labels.map((l) => <th key={l} className="text-right">{l}</th>)}<th className="text-right">Total</th></tr></thead><tbody>
      {h.rows.map((r) => <tr key={r.payer}><td>{r.payer}</td>{r.cells.map((v, i) => <td key={i} className="text-right tabular-nums" style={{ background: v ? `rgba(239,68,68,${Math.min(0.55, (v / h.max) * 0.7)})` : undefined }}>{v ? money(v) : ''}</td>)}<td className="text-right font-medium">{money(r.total)}</td></tr>)}</tbody></table></div></Card>
  );
}

export function PursueCard() {
  const ecs = useClaims(); const { collect } = useIntelligence(ecs); const { openClaim, has, createApproval } = useStore(); const [asked, setAsked] = useState<Set<string>>(new Set()); const [o, setO] = useState({ costPerTouch: 12, touchesDenied: 4, touchesOther: 2 }); const [f, setF] = useState<'review-write-off' | 'quick-win' | 'pursue'>('review-write-off');
  const rows = useMemo(() => pursueRank(ecs, (x) => collect(x)?.p, o), [ecs, collect, o]); const view = rows.filter((r) => r.verdict === f).sort((a, b) => (f === 'review-write-off' ? a.net - b.net : b.net - a.net)).slice(0, 12);
  const sum = (v: string) => rows.filter((r) => r.verdict === v).reduce((a, r) => a + r.balance, 0);
  return (
    <Card title="Pursue or write off?" actions={has('export') && <button className="btn btn-sm" onClick={() => downloadFile('pursue-or-write-off.csv', ['Claim,Payer,Balance,Age,Chance,Expected,Cost,Net,Verdict', ...rows.map((r) => [r.claim_no, r.payer, r.balance, r.age, r.p.toFixed(2), r.expected, r.cost, r.net, r.verdict].join(','))].join('\n'), 'text/csv')}>CSV</button>}>
      <div className="grid grid-cols-3 gap-3 mb-3"><Num label="Cost per touch $" v={o.costPerTouch} set={(n) => setO({ ...o, costPerTouch: n })} /><Num label="Touches · denied" v={o.touchesDenied} set={(n) => setO({ ...o, touchesDenied: n })} /><Num label="Touches · other" v={o.touchesOther} set={(n) => setO({ ...o, touchesOther: n })} /></div>
      <div className="flex gap-2 mb-2 text-xs flex-wrap">{([['review-write-off', 'Review for write-off'], ['quick-win', 'Quick wins'], ['pursue', 'Worth pursuing']] as const).map(([k, l]) => <button key={k} className={'btn btn-sm ' + (f === k ? 'btn-primary' : '')} onClick={() => setF(k)}>{l} · {money(sum(k))}</button>)}</div>
      <table className="tbl w-full text-sm"><tbody>{view.map((r) => <tr key={r.id} className="cursor-pointer" onClick={() => openClaim(r.id)}><td>{r.claim_no}</td><td>{r.payer}</td><td className="text-right">{money(r.balance)}</td><td className="text-right muted">{r.age ?? '—'}d</td><td className="text-right">{money(r.net)}</td><td className="text-[11.5px] muted">{r.why}</td>{f === 'review-write-off' && has('approve_adjustments') && <td onClick={(e) => e.stopPropagation()}>{asked.has(r.id) ? <Chip color="#16a34a">Requested</Chip> : <button className="btn btn-sm" onClick={async () => { await createApproval({ claim_id: r.id, amount: r.balance, body: `Write-off review: ${r.why}. Balance $${r.balance.toFixed(2)}.` }); setAsked(new Set([...asked, r.id])); }}>Ask client to approve</button>}</td>}</tr>)}{!view.length && <tr><td className="muted text-center py-5">None.</td></tr>}</tbody></table>
      <div className="text-[11px] muted mt-2">Net = chance to collect × balance − cost of the work. A suggestion for a human decision, never an automatic write-off; follow your client SOP approvals.</div>
    </Card>
  );
}

export function DupeCard() {
  const ecs = useClaims(); const { openClaim } = useStore(); const g = useMemo(() => findDupes(ecs), [ecs]);
  return (
    <Card title={`Possible duplicate claims (${g.length})`}>{g.length === 0 ? <div className="muted text-sm">No look-alike claims found. Checked account/encounter + date + CPT + charge.</div> : <div className="space-y-2 max-h-72 overflow-auto">{g.slice(0, 20).map((d) => <div key={d.key} className="panel2 p-2.5 text-[12.5px]"><div className="flex justify-between"><span className="muted">{d.why}</span><Chip color="#d97706">{money(d.balance)} at risk of double work</Chip></div><div className="flex gap-2 flex-wrap mt-1">{d.claims.map((c) => <button key={c.id} className="btn btn-sm" onClick={() => openClaim(c.id)}>{c.claim_no} · {money(c.balance)}</button>)}</div></div>)}</div>}</Card>
  );
}

export function StaffingCard() {
  const ecs = useClaims(); const open = ecs.filter((x) => x.open).length; const fte = useStore((s) => s.profiles.filter((p) => p.active && ['user_prod', 'user_prod_qa'].includes(p.role)).length);
  const [o, setO] = useState({ touchesPerClaimPerMonth: 1.5, touchesPerDay: 40, workdays: 21, fteAvailable: Math.max(1, fte) }); const s = staffing(open, o);
  return (
    <Card title="Staffing what-if"><div className="grid grid-cols-2 gap-3"><Num label="Touches per claim / month" v={o.touchesPerClaimPerMonth} set={(n) => setO({ ...o, touchesPerClaimPerMonth: n })} /><Num label="Touches per person / day" v={o.touchesPerDay} set={(n) => setO({ ...o, touchesPerDay: n })} /><Num label="Working days" v={o.workdays} set={(n) => setO({ ...o, workdays: n })} /><Num label="People available" v={o.fteAvailable} set={(n) => setO({ ...o, fteAvailable: n })} /></div>
      <div className="mt-3 text-sm space-y-1"><div>{open.toLocaleString('en-US')} open claims need <b>{s.touchesNeeded.toLocaleString('en-US')}</b> touches a month.</div><div>One person does ~{s.perFte.toLocaleString('en-US')}. You need <b>{s.fteNeeded}</b> people; you have {o.fteAvailable} → <b style={{ color: s.gap > 0.2 ? '#dc2626' : '#16a34a' }}>{s.gap > 0.2 ? `short by ${s.gap}` : 'covered'}</b> ({s.coverage}% coverage).</div></div></Card>
  );
}

export function CallsBoard() {
  const { activity, claims, openClaim } = useStore(); const today = todayISO(); const calls = useMemo(() => callsOf(activity), [activity]); const pr = useMemo(() => promises(claims, today), [claims, today]); const rate = useMemo(() => payerContactRate(calls, claims), [calls, claims]);
  const tone = (s: string) => (s === 'broken' ? '#dc2626' : s === 'due-today' ? '#d97706' : '#16a34a');
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title={`Promised payments (${pr.length})`} pad={false}><div className="max-h-96 overflow-auto"><table className="tbl w-full text-sm"><tbody>{pr.slice(0, 40).map((p) => <tr key={p.claim.id} className="cursor-pointer" onClick={() => openClaim(p.claim.id)}><td>{p.claim.claim_no}</td><td>{p.claim.payer}</td><td className="text-right">{money(p.claim.balance)}</td><td>{fmtDate(p.date)}</td><td><Chip color={tone(p.status)}>{p.status === 'broken' ? `${-p.days}d overdue` : p.status === 'due-today' ? 'due today' : `in ${p.days}d`}</Chip></td></tr>)}{!pr.length && <tr><td className="muted text-center py-6">Log a call with a promised date and it shows here.</td></tr>}</tbody></table></div></Card>
      <Card title="Payer reach rate (calls that got a human)" pad={false}><table className="tbl w-full text-sm"><thead><tr><th>Payer</th><th className="text-right">Calls</th><th className="text-right">Reached</th><th className="text-right">Promises</th></tr></thead><tbody>{rate.slice(0, 12).map((r) => <tr key={r.payer}><td>{r.payer}</td><td className="text-right">{r.calls}</td><td className="text-right font-medium" style={{ color: r.rate < 40 ? '#dc2626' : undefined }}>{r.rate}%</td><td className="text-right">{r.promised}</td></tr>)}{!rate.length && <tr><td colSpan={4} className="muted text-center py-6">No calls logged yet.</td></tr>}</tbody></table></Card>
      <Card title="Recent calls" className="lg:col-span-2" pad={false}><ul className="divide-y hair text-[12.5px] max-h-72 overflow-auto">{calls.slice(0, 30).map((c) => { const cl = claims.find((x) => x.id === c.claim_id); return <li key={c.id} className="px-5 py-1.5 cursor-pointer" onClick={() => cl && openClaim(cl.id)}><span className="muted mr-2">{c.at.slice(5, 10)}</span><b className="mr-1">{cl?.claim_no}</b>{c.by && <span className="muted mr-1">{c.by}:</span>}{c.summary}</li>; })}{!calls.length && <li className="px-5 py-6 muted text-center">No calls yet.</li>}</ul></Card>
    </div>
  );
}
