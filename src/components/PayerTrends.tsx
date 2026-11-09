import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { match } from 'ts-pattern';
import { useStore } from '../store';
import { Card, Chip, Empty } from './ui';
import { LazyChart } from './LazyChart';
import { useClaims, useIntelligence } from '../hooks';
import { KIND_LABEL, payerTrends, weeklyDenials, type TrendAlert } from '../lib/engine/payertrend';
import { money, todayISO } from '../lib/utils';

const kindColor = (k: TrendAlert['kind']) => match(k).with('denial_spike', () => '#dc2626').with('new_code', () => '#a855f7').with('deadline_wave', () => '#f97316').with('slowdown', () => '#0ea5e9').exhaustive();
/** Radar → Payer trends: what is changing with each payer, with the weekly denial curve behind it. */
export function PayerTrends({ onCount }: { onCount?: (n: number) => void }) {
  const ecs = useClaims(); const { payerDays } = useIntelligence(ecs); const { claims } = useStore(); const today = todayISO(); const [payer, setPayer] = useState('');
  const alerts = useMemo(() => payerTrends(ecs, today, { payerDays }), [ecs, today, payerDays]); useMemo(() => onCount?.(alerts.length), [alerts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const payers = useMemo(() => [...new Set(claims.map((c) => c.payer || 'Unknown'))].sort(), [claims]); const sel = payer || alerts[0]?.payer || payers[0] || '';
  const series = useMemo(() => weeklyDenials(claims, sel, today, 8), [claims, sel, today]); const overall = useMemo(() => weeklyDenials(claims, null, today, 8), [claims, today]);
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2" title={<span className="flex items-center gap-2"><TrendingUp size={15} />What is changing ({alerts.length})</span>} pad={false}>
        {alerts.length === 0 ? <Empty title="No payer is behaving unusually" sub="Denial volume, denial codes, deadline exposure and payment speed are all within normal ranges." /> :
          <ul className="divide-y hair max-h-[560px] overflow-auto">{alerts.map((a, i) => <li key={a.payer + a.kind + (a.code || '') + i} className="px-5 py-3 text-[13px]">
            <div className="flex items-center gap-2 flex-wrap"><Chip color={kindColor(a.kind)}>{KIND_LABEL[a.kind]}</Chip><Chip color={a.severity === 'high' ? '#dc2626' : '#d97706'}>{a.severity === 'high' ? 'Act now' : 'Watch'}</Chip><b>{a.title}</b></div>
            <div className="mt-1 muted">{a.detail}</div>
            <div className="mt-1.5 flex items-center gap-3 text-[12px]"><span>{a.claims} claims · {money(a.amount)}</span><button className="link" onClick={() => setPayer(a.payer)}>Show curve</button><Link className="link" to={`/worklist?payer=${encodeURIComponent(a.payer)}${a.kind === 'deadline_wave' ? '&view=tf' : a.kind === 'new_code' && a.code ? `&q=${encodeURIComponent(a.code)}` : ''}`}>Open in worklist</Link></div></li>)}</ul>}
      </Card>
      <Card title="Weekly denials" actions={<select className="input !w-auto !py-1 text-xs" value={sel} onChange={(e) => setPayer(e.target.value)}>{payers.map((p) => <option key={p}>{p}</option>)}</select>}>
        <LazyChart type="line" height={230} data={{ labels: series.map((s) => s.label), datasets: [{ label: sel, data: series.map((s) => s.n), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.15)', fill: true, tension: 0.3 }, { label: 'All payers ÷ number of payers', data: overall.map((s) => Math.round((s.n / Math.max(1, payers.length)) * 10) / 10), borderColor: '#94a3b8', borderDash: [5, 4], pointRadius: 0, tension: 0.3 }] }} />
        <p className="text-[11px] muted mt-2">Counted by denial date. A payer line climbing well above the dashed average is the signal the alerts watch for.</p>
      </Card>
    </div>
  );
}
