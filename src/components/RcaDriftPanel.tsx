import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, Shuffle } from 'lucide-react';
import { match } from 'ts-pattern';
import { useStore } from '../store';
import { Card, Chip, Empty } from './ui';
import { LazyChart } from './LazyChart';
import { PALETTE } from './chartPalette';
import { driftLeaders, rcaDrift, rcaWeekly, type DriftRow } from '../lib/engine/rcadrift';
import { todayISO } from '../lib/utils';

const Arrow = ({ d }: { d: DriftRow['direction'] }) => match(d).with('up', () => <ArrowUpRight size={14} className="text-red-500" />).with('down', () => <ArrowDownRight size={14} className="text-green-600" />).with('steady', () => <Minus size={14} className="muted" />).exhaustive();
/** Scorecards → Root-cause drift: is the reason mix for a payer changing, and is the change real? */
export function RcaDriftPanel() {
  const { workLog, claims } = useStore(); const today = todayISO(); const [days, setDays] = useState(30); const [payer, setPayer] = useState('');
  const payerOf = useMemo(() => { const m = new Map(claims.map((c) => [c.id, c.payer || 'Unknown'])); return (id: string) => m.get(id) || null; }, [claims]);
  const leaders = useMemo(() => driftLeaders(workLog, payerOf, today, { recentDays: days, baselineDays: days * 3 }), [workLog, payerOf, today, days]); const sel = payer ?? '';
  const cur = useMemo(() => rcaDrift(workLog, payerOf, today, { payer: sel || undefined, recentDays: days, baselineDays: days * 3 }), [workLog, payerOf, today, sel, days]); const weekly = useMemo(() => rcaWeekly(workLog, payerOf, today, sel, 12, 5), [workLog, payerOf, today, sel]);
  const payers = useMemo(() => [...new Set(claims.map((c) => c.payer || 'Unknown'))].sort(), [claims]); const top = cur.rows.filter((r) => r.recentN + r.baseN > 0).slice(0, 8);
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card title={<span className="flex items-center gap-2"><Shuffle size={15} />Biggest shifts by payer</span>} pad={false}>
        {leaders.length === 0 ? <Empty title="No significant shifts" sub={`The reasons recorded in the last ${days} days look like the previous ${days * 3}.`} /> : <ul className="divide-y hair max-h-[420px] overflow-auto">{leaders.map((l) => <li key={l.payer} className="px-4 py-2.5 text-[13px] cursor-pointer hover:bg-[var(--panel2)]" onClick={() => setPayer(l.payer)}><b>{l.payer}</b><div className="muted text-[12px]">{l.headline || 'Mix changed'}</div></li>)}</ul>}
      </Card>
      <Card className="lg:col-span-2" title={`${cur.payer} — reason mix`} actions={<><select className="input !w-auto !py-1 text-xs" value={sel} onChange={(e) => setPayer(e.target.value)}><option value="">All payers</option>{payers.map((p) => <option key={p}>{p}</option>)}</select><select className="input !w-auto !py-1 text-xs" value={days} onChange={(e) => setDays(+e.target.value)}><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option><option value={60}>Last 60 days</option></select></>}>
        {cur.recentTotal === 0 ? <Empty title="No touches in this window" /> : <>
          {cur.headline && <div className="rounded-lg p-2.5 mb-3 text-[13px]" style={{ background: 'rgba(245,158,11,.12)' }}><b>Drift:</b> {cur.headline}</div>}
          <div className="grid md:grid-cols-2 gap-4"><div><div className="label">Share of touches: now vs before</div><LazyChart type="radar" height={250} data={{ labels: top.map((r) => r.rca), datasets: [{ label: `Last ${days}d`, data: top.map((r) => Math.round(r.recentShare * 100)), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.2)' }, { label: `Previous ${days * 3}d`, data: top.map((r) => Math.round(r.baseShare * 100)), borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,.12)' }] }} /></div>
            <div><div className="label">Weekly share of the top reasons (%)</div><LazyChart type="line" height={250} data={{ labels: weekly.labels, datasets: weekly.series.map((s, i) => ({ label: s.rca, data: s.data, borderColor: PALETTE[i % PALETTE.length], backgroundColor: PALETTE[i % PALETTE.length], tension: 0.3, spanGaps: true, pointRadius: 2 })) }} /></div></div>
          <table className="tbl w-full text-sm mt-3"><thead><tr><th>Root cause</th><th className="text-right">Now</th><th className="text-right">Before</th><th className="text-right">Change</th><th>Real?</th></tr></thead><tbody>{top.map((r) => <tr key={r.rca}><td>{r.rca}</td><td className="text-right">{Math.round(r.recentShare * 100)}% <span className="muted text-[11px]">({r.recentN})</span></td><td className="text-right">{Math.round(r.baseShare * 100)}% <span className="muted text-[11px]">({r.baseN})</span></td><td className="text-right"><span className="inline-flex items-center gap-1"><Arrow d={r.direction} />{r.deltaPP > 0 ? '+' : ''}{r.deltaPP} pts</span></td><td>{r.significant ? <Chip color={r.direction === 'up' ? '#dc2626' : '#16a34a'}>Significant</Chip> : <span className="muted text-[12px]">noise</span>}</td></tr>)}</tbody></table>
          <p className="text-[11px] muted mt-2">“Significant” means a two-proportion test says the shift is unlikely to be chance (needs enough touches in both windows). A rising reason means the same problem is showing up more often — fix the cause, not just the claims.</p></>}
      </Card>
    </div>
  );
}
