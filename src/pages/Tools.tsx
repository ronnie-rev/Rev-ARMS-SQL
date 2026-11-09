import { Link } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { CallsBoard, ParetoCard, HeatmapCard, PursueCard, DupeCard, StaffingCard } from '../components/ToolsAnalyze';
import { Tabs } from '../components/ui';
import { BulkLookup, CallPrep } from '../components/ToolkitExtras';
import { LetterReader } from '../components/LetterReader';
import { CodeLookup } from '../components/CodeLookup';
import { Card, Field, PageHeader } from '../components/ui';
import { useStore } from '../store';
import { resolveIntelCfg } from '../lib/engine/intelligence';
import { appealRoi, contractual, daysInAR, expectedFromGcr, filingDeadline, grossCollectionRate, netCollectionRate, patientSplit, underpaymentCheck } from '../lib/engine/tools';
import { fmtDate, money, todayISO } from '../lib/utils';

const N = (v: string) => (v === '' || isNaN(Number(v)) ? 0 : Number(v));
function Num({ label, v, set, hint }: { label: string; v: string; set: (s: string) => void; hint?: string }) { return <Field label={label} hint={hint}><input className="input" inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} /></Field>; }
function Out({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'bad' }) { return <div className="flex items-baseline justify-between gap-3 py-1 border-t hair first:border-0"><span className="text-xs muted">{label}</span><b className="tabular-nums" style={{ color: tone === 'good' ? '#22c55e' : tone === 'bad' ? '#ef4444' : undefined }}>{value}</b></div>; }
const pct = (n: number | null) => (n == null ? '—' : n + '%');

/** Quick A/R calculators for the questions that come up on every call: deadlines, collection rates, patient split, underpayment and appeal ROI. */
export default function Tools() {
  const [tab, setTab] = useState<'analyze' | 'calls' | 'work' | 'calc'>('analyze');
  const [d, setD] = useState({ start: todayISO(), days: '180' }); const dl = filingDeadline(d.start || todayISO(), N(d.days), todayISO());
  const [k, setK] = useState({ ar: '', ch: '', days: '30' }); const [c, setC] = useState({ pay: '', ch: '', adj: '' }); const [a, setA] = useState({ billed: '', allowed: '' });
  const [p, setP] = useState({ allowed: '', paid: '', adj: '', eob: '' }); const [u, setU] = useState({ exp: '', paid: '', pat: '' }); const tc = resolveIntelCfg(useStore((st) => st.settings.intel_cfg)).tools; const [r, setR] = useState({ amt: '', win: String(tc.appealWinPct), hrs: '1', rate: String(tc.hourlyCost) }); const [g, setG] = useState({ billed: '', gcr: '' });
  const ps = patientSplit({ allowed: N(p.allowed), paid: N(p.paid), otherAdj: N(p.adj), eobPatient: p.eob === '' ? null : N(p.eob) }); const uc = underpaymentCheck(N(u.exp), N(u.paid), N(u.pat), tc.minUnderDollars, tc.minUnderPct); const roi = appealRoi(N(r.amt), N(r.win), N(r.hrs), N(r.rate)); const dar = daysInAR(N(k.ar), N(k.ch), N(k.days));
  return (
    <div className="space-y-4">
      <PageHeader title="Tools" sub="Letter reader, code lookup and quick A/R calculators" actions={<Link to="/ocr" className="btn btn-sm">Open Document OCR</Link>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'analyze', label: 'Analyze' }, { id: 'calls', label: 'Calls & promises' }, { id: 'work', label: 'Work a call / letter' }, { id: 'calc', label: 'Calculators' }]} />
      {tab === 'analyze' && <div className="grid lg:grid-cols-2 gap-4"><ParetoCard /><PursueCard /><div className="lg:col-span-2"><HeatmapCard /></div><DupeCard /><StaffingCard /></div>}
      {tab === 'calls' && <CallsBoard />}
      {tab === 'work' && <div className="grid md:grid-cols-2 gap-4"><BulkLookup /><CallPrep /><LetterReader /><CodeLookup /></div>}
      {tab === 'calc' && <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card title="Filing deadline"><div className="grid grid-cols-2 gap-3"><Field label="Clock starts (DOS / denial date)"><input type="date" className="input" value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} /></Field><Num label="Days allowed" v={d.days} set={(s) => setD({ ...d, days: s })} /></div><div className="mt-3"><Out label="Due date" value={fmtDate(dl.due)} /><Out label="Status" value={dl.status} tone={dl.left < 0 ? 'bad' : dl.left > 30 ? 'good' : undefined} /></div></Card>
        <Card title="Underpayment check"><div className="grid grid-cols-3 gap-3"><Num label="Expected $" v={u.exp} set={(s) => setU({ ...u, exp: s })} /><Num label="Paid $" v={u.paid} set={(s) => setU({ ...u, paid: s })} /><Num label="Patient resp $" v={u.pat} set={(s) => setU({ ...u, pat: s })} /></div><div className="mt-3"><Out label="Short by" value={`${money(uc.short, true)} (${uc.pct}%)`} /><Out label="Worth disputing?" value={uc.dispute ? 'Yes' : 'No'} tone={uc.dispute ? 'bad' : 'good'} /></div></Card>
        <Card title="Appeal: worth the time?"><div className="grid grid-cols-2 gap-3"><Num label="Amount at stake $" v={r.amt} set={(s) => setR({ ...r, amt: s })} /><Num label="Win chance %" v={r.win} set={(s) => setR({ ...r, win: s })} /><Num label="Hours to prepare" v={r.hrs} set={(s) => setR({ ...r, hrs: s })} /><Num label="Hourly cost $" v={r.rate} set={(s) => setR({ ...r, rate: s })} /></div><div className="mt-3"><Out label="Expected recovery" value={money(roi.expected, true)} /><Out label="Cost of effort" value={money(roi.cost, true)} /><Out label="Net" value={money(roi.net, true)} tone={roi.worthIt ? 'good' : 'bad'} /><Out label="Break-even win chance" value={pct(roi.breakEvenWinPct)} /></div></Card>
        <Card title="Patient responsibility"><div className="grid grid-cols-2 gap-3"><Num label="Allowed $" v={p.allowed} set={(s) => setP({ ...p, allowed: s })} /><Num label="Insurance paid $" v={p.paid} set={(s) => setP({ ...p, paid: s })} /><Num label="Other adjustments $" v={p.adj} set={(s) => setP({ ...p, adj: s })} /><Num label="EOB patient resp $" v={p.eob} set={(s) => setP({ ...p, eob: s })} hint="optional — to cross-check" /></div><div className="mt-3"><Out label="Patient owes" value={money(ps.patient, true)} /><Out label="Check" value={ps.note} tone={ps.mismatch || ps.note.includes('over') ? 'bad' : 'good'} /></div></Card>
        <Card title="Contractual write-off"><div className="grid grid-cols-2 gap-3"><Num label="Billed $" v={a.billed} set={(s) => setA({ ...a, billed: s })} /><Num label="Allowed $" v={a.allowed} set={(s) => setA({ ...a, allowed: s })} /></div><div className="mt-3"><Out label="Contractual adjustment" value={money(contractual(N(a.billed), N(a.allowed)).writeOff, true)} /><Out label="Allowed as % of billed" value={pct(contractual(N(a.billed), N(a.allowed)).pctOfBilled)} /></div></Card>
        <Card title="Days in A/R"><div className="grid grid-cols-3 gap-3"><Num label="Open A/R $" v={k.ar} set={(s) => setK({ ...k, ar: s })} /><Num label="Charges in period $" v={k.ch} set={(s) => setK({ ...k, ch: s })} /><Num label="Period (days)" v={k.days} set={(s) => setK({ ...k, days: s })} /></div><div className="mt-3"><Out label="Days in A/R" value={dar == null ? '—' : dar} tone={dar != null && dar > 45 ? 'bad' : undefined} /></div><p className="text-[11px] muted mt-1">Healthy practices run roughly 30–40.</p></Card>
        <Card title="Collection rates"><div className="grid grid-cols-3 gap-3"><Num label="Payments $" v={c.pay} set={(s) => setC({ ...c, pay: s })} /><Num label="Charges $" v={c.ch} set={(s) => setC({ ...c, ch: s })} /><Num label="Contractual adj $" v={c.adj} set={(s) => setC({ ...c, adj: s })} /></div><div className="mt-3"><Out label="Gross collection rate" value={pct(grossCollectionRate(N(c.pay), N(c.ch)))} /><Out label="Net collection rate" value={pct(netCollectionRate(N(c.pay), N(c.ch), N(c.adj)))} /></div></Card>
        <Card title="Expected from billed (GCR)"><div className="grid grid-cols-2 gap-3"><Num label="Billed $" v={g.billed} set={(s) => setG({ ...g, billed: s })} /><Num label="Client GCR %" v={g.gcr} set={(s) => setG({ ...g, gcr: s })} /></div><div className="mt-3"><Out label="Expected reimbursement" value={money(expectedFromGcr(N(g.billed), N(g.gcr)), true)} /></div></Card>
      </div>}
    </div>
  );
}
