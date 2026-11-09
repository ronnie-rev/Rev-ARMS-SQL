import { HubBar } from '..//components/HubBar';
import { PayerBriefCard } from '../components/PayerBriefCard';
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, PhoneCall } from 'lucide-react';
import { useStore } from '../store';
import { useBuckets, useClaims, useIntel } from '../hooks';
import { Card, Chip, PageHeader, Stat } from '../components/ui';
import { BucketBars, HBars } from '../components/Charts';
import { collectability, payerStats } from '../lib/analytics';
import { payerRisk } from '../lib/engine/payerrisk';
import { moneyShort, num, pct, sum } from '../lib/utils';

export function PayersList() {
  const ecs = useClaims(); const intel = useIntel(); const claims = useStore((s) => s.claims);
  const stats = useMemo(() => payerStats(ecs, claims, intel), [ecs, claims, intel]);
  const max = Math.max(1, ...stats.map((s) => s.balance)); const appeals = useStore((s) => s.appeals); const everyClaim = useClaims(true); const risk = useMemo(() => payerRisk(everyClaim, appeals), [everyClaim, appeals]); const watch = risk.filter((r) => r.tier !== 'ok').slice(0, 6);
  return (
    <div>
      <HubBar group="payers" />
      <PageHeader title="Payer Intelligence" sub="Resolution rate, denial mix and filing exposure by payer" />
      {risk.length > 0 && <Card title={`Payer watchlist${watch.length ? ` — ${watch.length} to watch` : ''}`} className="mb-4" pad={false}>{watch.length === 0 ? <div className="px-5 py-4 text-sm muted">No payer is behaving unusually badly: denial rate, speed, appeal results, underpayments and filing exposure are all within normal range.</div> : <div className="divide-y hair">{watch.map((r) => <div key={r.payer} className="px-5 py-3 flex gap-3 items-start flex-wrap"><div className="w-14 text-center"><div className="text-xl font-extrabold" style={{ color: r.tier === 'high' ? '#dc2626' : '#d97706' }}>{r.score}</div><div className="text-[10px] muted">risk</div></div><div className="flex-1 min-w-[220px]"><Link className="font-semibold text-brand-400" to={`/payers/${encodeURIComponent(r.payer)}`}>{r.payer}</Link> <Chip color={r.tier === 'high' ? '#dc2626' : '#d97706'}>{r.tier === 'high' ? 'high risk' : 'watch'}</Chip><div className="text-xs muted">{num(r.open)} open · {moneyShort(r.balance)} open A/R{r.tfExposure ? ` · ${moneyShort(r.tfExposure)} near a filing limit` : ''}</div><ul className="text-[12.5px] mt-1 list-disc ml-4">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul></div><Link className="btn btn-sm" to={`/worklist?payer=${encodeURIComponent(r.payer)}`}>Open claims</Link></div>)}</div>}</Card>}
      <Card pad={false}><div className="overflow-auto px-4 pb-4"><table className="grid"><thead><tr><th>Payer</th><th>Open AR</th><th style={{ textAlign: 'right' }}>Claims</th><th style={{ textAlign: 'right' }}>Avg age</th><th style={{ textAlign: 'right' }}>&gt;120d</th><th style={{ textAlign: 'right' }}>Resolve rate</th><th style={{ textAlign: 'right' }}>Denial %</th><th style={{ textAlign: 'right' }}>Exp. recovery</th><th style={{ textAlign: 'right' }}>TF risk</th><th>Top root cause</th></tr></thead><tbody>
        {stats.map((p) => (<tr key={p.payer}><td><Link className="font-semibold text-brand-400" to={`/payers/${encodeURIComponent(p.payer)}`}>{p.payer}</Link></td>
          <td style={{ width: 160 }}><div className="flex items-center gap-2"><div className="flex-1 h-1.5 rounded-full panel2 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: (p.balance / max) * 100 + '%' }} /></div><span className="tabular-nums text-xs">{moneyShort(p.balance)}</span></div></td>
          <td style={{ textAlign: 'right' }}>{num(p.n)}</td><td style={{ textAlign: 'right' }}>{p.avgAge}d</td><td style={{ textAlign: 'right' }} className="text-red-400">{moneyShort(p.over120)}</td>
          <td style={{ textAlign: 'right' }}><Chip color={p.resolveRate >= intel.globalRate ? '#22c55e' : '#f59e0b'}>{pct(p.resolveRate)}</Chip></td><td style={{ textAlign: 'right' }}>{pct(p.denialShare)}</td>
          <td style={{ textAlign: 'right' }}>{moneyShort(p.expected)}</td><td style={{ textAlign: 'right' }} className={p.tfRisk ? 'text-red-400 font-semibold' : 'muted'}>{p.tfRisk ? moneyShort(p.tfRisk) : '—'}</td><td className="text-xs muted">{p.topRca[0]?.[0] || '—'}</td></tr>))}</tbody></table></div></Card>
    </div>
  );
}

export function PayerDetail() {
  const { name = '' } = useParams(); const payer = decodeURIComponent(name); const nav = useNavigate();
  const ecs = useClaims(); const intel = useIntel(); const buckets = useBuckets(); const { claims, config } = useStore();
  const mine = useMemo(() => ecs.filter((x) => x.open && (x.c.payer || 'Unknown') === payer), [ecs, payer]);
  const st = useMemo(() => payerStats(ecs, claims, intel).find((p) => p.payer === payer), [ecs, claims, intel, payer]);
  const meta = config.find((o) => o.category === 'payer' && o.value.toLowerCase() === payer.toLowerCase())?.meta;
  const bData = buckets.map((b) => { const l = mine.filter((x) => x.bucket?.label === b.label); return { name: b.label, value: sum(l.map((x) => x.c.balance)), count: l.length, color: b.color }; });
  const byRca = useMemo(() => { const m = new Map<string, number>(); mine.forEach((x) => x.c.rca && m.set(x.c.rca, (m.get(x.c.rca) || 0) + 1)); return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value); }, [mine]);
  const actions = useMemo(() => [...intel.nba].filter(([k, v]) => k.startsWith(`p|${payer.toLowerCase()}|`) && v.n >= 2).map(([k, v]) => { const [, , d, a] = k.split('|'); return { d, a, rate: (v.s + 1) / (v.n + 2), n: v.n }; }).sort((a, b) => b.rate - a.rate).slice(0, 8), [intel, payer]);
  const exp = sum(mine.map((x) => collectability(x, intel).expected));
  if (!mine.length && !st) return <div className="muted">No open claims for {payer}. <Link to="/payers" className="underline">Back</Link></div>;
  return (
    <div>
      <Link to="/payers" className="text-xs muted inline-flex items-center gap-1 mb-2"><ArrowLeft size={13} />Payers</Link>
      <PageHeader title={payer} sub={meta ? <span className="flex items-center gap-3"><span className="flex items-center gap-1"><PhoneCall size={12} />{meta.phone || '—'}</span>{meta.portal && <a className="text-brand-400 flex items-center gap-1" href={meta.portal} target="_blank" rel="noopener noreferrer">portal <ExternalLink size={11} /></a>}<span>TF {meta.tf_days ?? '—'}d · appeals {meta.appeal_days ?? '—'}d</span></span> : 'No contact intel yet — add in Admin → Payers'} actions={<button className="btn btn-primary" onClick={() => nav(`/worklist?payer=${encodeURIComponent(payer)}`)}>Open claims</button>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Stat label="Open AR" value={moneyShort(sum(mine.map((x) => x.c.balance)))} sub={`${mine.length} claims`} />
        <Stat label="Expected" value={moneyShort(exp)} color="#22c55e" />
        <Stat label="Resolve rate" value={pct(st?.resolveRate || 0)} color="#06b6d4" sub={`avg ${pct(intel.globalRate)}`} />
        <Stat label="Avg touches / claim" value={(st?.avgTouches || 0).toFixed(1)} color="#f59e0b" />
        <Stat label="TF at risk" value={moneyShort(st?.tfRisk || 0)} color="#ef4444" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <PayerBriefCard payer={payer} />
        <Card title="Aging" className="lg:col-span-2"><BucketBars data={bData} onClick={(b) => nav(`/worklist?payer=${encodeURIComponent(payer)}&bucket=${encodeURIComponent(b)}`)} /></Card>
        <Card title="Root causes (open)"><HBars data={byRca} money={false} color="#8b5cf6" onClick={(n) => nav(`/worklist?payer=${encodeURIComponent(payer)}&rca=${encodeURIComponent(n)}`)} /></Card>
        <Card title={`What works with ${payer}`} className="lg:col-span-3" pad={false}><div className="px-4 pb-3"><table className="grid"><thead><tr><th>Root cause detail</th><th>End action</th><th style={{ textAlign: 'right' }}>Resolved</th><th style={{ textAlign: 'right' }}>Cases</th></tr></thead><tbody>
          {actions.map((a, i) => <tr key={i}><td>{a.d}</td><td>{a.a}</td><td style={{ textAlign: 'right' }}><b>{Math.round(a.rate * 100)}%</b></td><td style={{ textAlign: 'right' }}>{a.n}</td></tr>)}
          {actions.length === 0 && <tr><td colSpan={4} className="muted text-center py-6">Not enough history for this payer yet.</td></tr>}</tbody></table></div></Card>
      </div>
    </div>
  );
}
