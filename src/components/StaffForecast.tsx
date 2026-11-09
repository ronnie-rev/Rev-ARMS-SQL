import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { useStore } from '../store';
import { Card, Field } from './ui';
import { LazyChart } from './LazyChart';
import { isProducer } from '../lib/roles';
import { forecastStaffing } from '../lib/engine/staffforecast';
import { todayISO } from '../lib/utils';

const Slider = ({ label, v, set, min, max, step = 1, unit = '' }: { label: string; v: number; set: (n: number) => void; min: number; max: number; step?: number; unit?: string }) => <Field label={`${label}: ${v}${unit}`}><input type="range" className="w-full" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} /></Field>;
/** Productivity → Forecast: will the team keep up for the next 8 weeks? Move the levers to test hiring, absence and volume. */
export function StaffForecast() {
  const { claims, workLog, profiles, inScope } = useStore(); const today = todayISO(); const people = useMemo(() => profiles.filter((p) => p.active && isProducer(p.role)), [profiles]);
  const [o, setO] = useState({ touches: 1.5, absence: 10, growth: 0, extra: 0 });
  const input = useMemo(() => ({ claims: claims.filter((c) => inScope(c.client_id)), workLog: workLog.filter((w) => inScope(w.client_id)), people, today }), [claims, workLog, people, today, inScope]);
  const f = useMemo(() => forecastStaffing(input, { touchesPerClaimPerMonth: o.touches, absencePct: o.absence, inflowGrowthPct: o.growth, extraFte: o.extra }), [input, o]); const zero = useMemo(() => forecastStaffing(input, { touchesPerClaimPerMonth: o.touches, absencePct: o.absence, inflowGrowthPct: o.growth, extraFte: 0 }), [input, o.touches, o.absence, o.growth]);
  const gapCol = (g: number) => (g > 0.5 ? '#dc2626' : g > 0 ? '#d97706' : '#16a34a');
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card title={<span className="flex items-center gap-2"><Users size={15} />Levers</span>}>
        <div className="space-y-3"><Slider label="Touches per claim / month" v={o.touches} set={(n) => setO({ ...o, touches: n })} min={0.5} max={4} step={0.5} /><Slider label="Absence / PTO" v={o.absence} set={(n) => setO({ ...o, absence: n })} min={0} max={30} unit="%" /><Slider label="New-claim volume change per week" v={o.growth} set={(n) => setO({ ...o, growth: n })} min={-10} max={20} unit="%" /><Slider label="Add people" v={o.extra} set={(n) => setO({ ...o, extra: n })} min={0} max={10} /></div>
        <div className="mt-4 text-[12.5px] space-y-1 panel2 p-3 rounded-lg"><div>Open now: <b>{f.base.openNow.toLocaleString('en-US')}</b></div><div>New claims / week: <b>{f.base.inflowPerWeek}</b> · closed / week: <b>{f.base.closedPerWeek}</b></div><div>Touches / week (actual): <b>{f.base.touchesPerWeek}</b></div><div>Team: <b>{f.base.fte}</b> × {f.base.targetPerFte} touches/week</div></div>
      </Card>
      <Card className="lg:col-span-2" title="Next 8 weeks" actions={<span className="text-xs" style={{ color: gapCol(f.peakGapFte) }}>{f.peakGapFte > 0 ? `short by up to ${f.peakGapFte} people` : 'capacity holds'}</span>}>
        <div className="rounded-lg p-2.5 text-[13px] mb-2" style={{ background: 'var(--panel2)' }}>{f.summary}{o.extra > 0 && <span className="muted"> Without the extra {o.extra}: {zero.summary}</span>}</div>
        <LazyChart type="bar" height={270} data={{ labels: f.weeks.map((w) => w.label), datasets: [{ type: 'bar' as const, label: 'Touches needed', data: f.weeks.map((w) => w.demand), backgroundColor: 'rgba(249,115,22,.55)', yAxisID: 'y' }, { type: 'line' as const, label: 'Team capacity', data: f.weeks.map((w) => w.capacity), borderColor: '#16a34a', pointRadius: 0, borderDash: [6, 4], yAxisID: 'y' }, { type: 'line' as const, label: 'Open claims (right)', data: f.weeks.map((w) => w.open), borderColor: '#6366f1', tension: 0.3, yAxisID: 'y1' }] }} options={{ scales: { y1: { position: 'right', grid: { drawOnChartArea: false }, beginAtZero: true } } }} />
        <table className="tbl w-full text-sm mt-3"><thead><tr><th>Week of</th><th className="text-right">Open</th><th className="text-right">In</th><th className="text-right">Closed</th><th className="text-right">Need</th><th className="text-right">Capacity</th><th className="text-right">People needed</th></tr></thead><tbody>{f.weeks.map((w) => <tr key={w.week}><td>{w.label}</td><td className="text-right">{w.open.toLocaleString('en-US')}</td><td className="text-right">{w.inflow}</td><td className="text-right">{w.closed}</td><td className="text-right">{w.demand.toLocaleString('en-US')}</td><td className="text-right">{w.capacity.toLocaleString('en-US')}</td><td className="text-right font-medium" style={{ color: gapCol(w.gapFte) }}>{w.fteNeeded}</td></tr>)}</tbody></table>
        <p className="text-[11px] muted mt-2">A projection from the last 8 weeks of intake, closures and touches. “Touches needed” = open claims × touches per claim per month ÷ 4.33. It assumes every person works to their daily target.</p>
      </Card>
    </div>
  );
}
