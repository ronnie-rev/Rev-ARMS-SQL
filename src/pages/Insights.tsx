import { HubBar } from '..//components/HubBar';
import { useMemo } from 'react';
import { isProducer } from '../lib/roles';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Brain, CheckCircle2, Info, TrendingUp } from 'lucide-react';
import { useStore } from '../store';
import { useBuckets, useClaims, useIntel } from '../hooks';
import { Card, Chip, PageHeader, Stat } from '../components/ui';
import { BucketBars, HBars, Trend } from '../components/Charts';
import { buildInsights, collectability, forecast, payerStats } from '../lib/analytics';
import { cn, moneyShort, num, pct, sum } from '../lib/utils';
import { format } from 'date-fns';

const SEV = { high: ['#ef4444', AlertTriangle], med: ['#f59e0b', AlertTriangle], info: ['#6366f1', Info], good: ['#22c55e', CheckCircle2] } as const;

export default function Insights() {
  const nav = useNavigate();
  const ecs = useClaims(); const intel = useIntel(); const buckets = useBuckets();
  const { workLog, batches, profiles, clientFilter, inScope, claims, settings } = useStore();
  const open = useMemo(() => ecs.filter((x) => x.open), [ecs]);
  const stats = useMemo(() => payerStats(ecs, claims, intel), [ecs, claims, intel]);
  const staff = useMemo(() => profiles.filter((p) => p.active && isProducer(p.role)).map((p) => ({ id: p.id, name: p.full_name, target: p.daily_target })), [profiles]);
  const insights = useMemo(() => buildInsights({ ecs, workLog, batches, intel, staff, payers: stats, scope: clientFilter }), [ecs, workLog, batches, intel, staff, stats, clientFilter]);
  const fc = useMemo(() => forecast(open, intel, settings.model?.forecast), [open, intel, settings]);
  const byBucket = buckets.map((b) => { const l = open.filter((x) => x.bucket?.label === b.label); return { name: b.label, value: sum(l.map((x) => collectability(x, intel).expected)), count: l.length, color: b.color }; });
  const trend = useMemo(() => {
    const m = new Map<string, number>();
    batches.filter((b) => (inScope(b.client_id || '')) && b.summary?.total != null).forEach((b) => { const k = b.created_at.slice(0, 10); m.set(k, (m.get(k) || 0) + (b.summary!.total || 0)); });
    return [...m].sort().map(([k, v]) => ({ name: format(new Date(k), 'MM/dd'), AR: Math.round(v) }));
  }, [batches, clientFilter]);
  const topRisk = useMemo(() => [...open].map((x) => ({ x, c: collectability(x, intel) })).sort((a, b) => (b.x.c.balance - b.c.expected) - (a.x.c.balance - a.c.expected)).slice(0, 8), [open, intel]);
  const rcaLoss = useMemo(() => { const m = new Map<string, number>(); open.forEach((x) => { if (x.c.rca) m.set(x.c.rca, (m.get(x.c.rca) || 0) + x.c.balance - collectability(x, intel).expected); }); return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8); }, [open, intel]);
  const nbaRows = useMemo(() => [...intel.nba].filter(([k, v]) => k.startsWith('r|') && v.n >= intel.minSupport).map(([k, v]) => { const [, d, a] = k.split('|'); return { d, a, rate: (v.s + 1) / (v.n + 2), n: v.n }; }).sort((a, b) => b.rate - a.rate).slice(0, 10), [intel]);

  return (
    <div>
      <HubBar group="insight" />
      <PageHeader title={<span className="flex items-center gap-2"><Brain className="text-brand-400" />Insights</span>} sub="Explainable analytics computed from your own data — scores list their factors, recommendations cite sample sizes." />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Stat label="Open AR" value={moneyShort(fc.balance)} sub={`${num(open.length)} claims`} />
        <Stat label="Expected recovery" value={moneyShort(fc.expected)} sub={`${pct(fc.rate)} of AR`} color="#22c55e" icon={<TrendingUp size={16} />} />
        <Stat label="30-day cash" value={moneyShort(fc.d30)} color="#06b6d4" sub="expected" />
        <Stat label="90-day cash" value={moneyShort(fc.d90)} color="#6366f1" sub="expected" />
        <Stat label="Write-off risk" value={moneyShort(fc.writeoffRisk)} color="#ef4444" sub="unlikely to collect" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="What needs attention" className="lg:col-span-2" pad={false}>
          <div className="px-3 pb-3 space-y-2">{insights.map((i) => { const [col, Icon] = SEV[i.sev]; return (
            <div key={i.id} className={cn('flex gap-3 p-3 rounded-xl panel2 items-start', i.to && 'cursor-pointer hover:border-brand-500')} onClick={() => i.to && nav(i.to)}>
              <span className="mt-0.5" style={{ color: col }}><Icon size={17} /></span><div className="flex-1 min-w-0"><div className="text-sm font-bold">{i.title}</div><div className="text-xs muted mt-0.5">{i.body}</div></div>
              {i.value && <Chip color={col}>{i.value}</Chip>}{i.to && <ArrowRight size={14} className="muted mt-1" />}</div>); })}
            {insights.length === 0 && <div className="p-8 text-center muted text-sm">Import aging data to generate insights.</div>}</div>
        </Card>
        <Card title="Expected recovery by bucket"><BucketBars data={byBucket} height={230} /></Card>
      </div>
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="AR trend (import snapshots)">{trend.length > 1 ? <Trend data={trend} keys={[{ key: 'AR', color: '#6366f1', name: 'Total AR $' }]} height={210} /> : <div className="muted text-sm py-10 text-center">Needs two or more imports.</div>}</Card>
        <Card title="Dollars at risk by root cause"><HBars data={rcaLoss} color="#ef4444" /></Card>
        <Card title="What works: top resolving actions" pad={false}>
          <div className="px-4 pb-3 max-h-72 overflow-auto"><table className="grid"><thead><tr><th>Root cause</th><th>Action</th><th style={{ textAlign: 'right' }}>Resolved</th></tr></thead><tbody>
            {nbaRows.map((r, i) => <tr key={i}><td className="max-w-[130px] truncate">{r.d}</td><td className="max-w-[130px] truncate">{r.a}</td><td style={{ textAlign: 'right' }}><b>{Math.round(r.rate * 100)}%</b> <span className="muted text-[10px]">n={r.n}</span></td></tr>)}
            {nbaRows.length === 0 && <tr><td colSpan={3} className="muted text-center py-6">Learns as claims are worked and resolved (min {intel.minSupport} cases).</td></tr>}</tbody></table></div>
        </Card>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Biggest recoverable-dollar gaps (balance − expected)" pad={false}>
          <div className="px-4 pb-3"><table className="grid"><thead><tr><th>Claim</th><th>Payer</th><th style={{ textAlign: 'right' }}>Balance</th><th style={{ textAlign: 'right' }}>P(collect)</th></tr></thead><tbody>
            {topRisk.map(({ x, c }) => <tr key={x.c.id} className="cursor-pointer" onClick={() => useStore.getState().openClaim(x.c.id)}><td className="font-semibold">{x.c.claim_no}</td><td>{x.c.payer}</td><td style={{ textAlign: 'right' }}>{moneyShort(x.c.balance)}</td><td style={{ textAlign: 'right' }}>{Math.round(c.p * 100)}%</td></tr>)}</tbody></table></div>
        </Card>
        <Card title="Payers to watch" pad={false}>
          <div className="px-4 pb-3"><table className="grid"><thead><tr><th>Payer</th><th style={{ textAlign: 'right' }}>AR</th><th style={{ textAlign: 'right' }}>Resolves</th><th style={{ textAlign: 'right' }}>Exp.</th></tr></thead><tbody>
            {stats.slice(0, 8).map((p) => <tr key={p.payer}><td><Link className="text-brand-400 font-semibold" to={`/payers/${encodeURIComponent(p.payer)}`}>{p.payer}</Link></td><td style={{ textAlign: 'right' }}>{moneyShort(p.balance)}</td><td style={{ textAlign: 'right' }}>{pct(p.resolveRate)}</td><td style={{ textAlign: 'right' }}>{pct(p.p)}</td></tr>)}</tbody></table></div>
        </Card>
      </div>
    </div>
  );
}
