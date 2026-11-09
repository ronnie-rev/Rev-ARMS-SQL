import { useEffect } from 'react';
import { Database } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, Stat } from './ui';
import { BucketBars } from './Charts';
import { money, num } from '../lib/utils';
import { useBuckets } from '../hooks';

/** Large-workspace banner + whole-workspace totals computed on the server (claim_summary), so the page never needs every claim in memory. */
export function LargeBanner() {
  const large = useStore((s) => s.large); const claims = useStore((s) => s.claims); const clients = useStore((s) => s.clients);
  if (!large) return null;
  return <div className="mb-4 rounded-xl px-4 py-2.5 text-[12.5px] flex items-center gap-2 flex-wrap" style={{ background: 'rgba(99,102,241,.10)', border: '1px solid rgba(99,102,241,.35)' }}><Database size={14} /><span><b>Large workspace</b> — {num(large.open)} open claims. {num(claims.length)} claims from {large.loaded.length} of {clients.length} clients are loaded; pick other clients in the scope switcher to load them. Totals below come from the server.</span></div>;
}
export function WorkspaceSummary() {
  const { summary, large, refreshSummary } = useStore(); const buckets = useBuckets();
  useEffect(() => { if (large) void refreshSummary(); }, [large?.open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!large || !summary) return null;
  const order = new Map(buckets.map((b) => [b.label, b])); const data = summary.by_bucket.map((b) => ({ name: b.label, value: b.balance, count: b.n, color: order.get(b.label)?.color || '#64748b' }));
  return (
    <div className="mb-4 space-y-3">
      <LargeBanner />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3"><Stat label="Open A/R (all clients)" value={money(summary.open_balance)} color="#6366f1" /><Stat label="Open claims" value={num(summary.open_claims)} color="#3b82f6" /><Stat label="Unassigned" value={num(summary.unassigned)} color="#f59e0b" /><Stat label="Follow-ups due" value={num(summary.followups_due)} color="#f97316" /><Stat label="Missing from file" value={num(summary.missing_review)} color="#ef4444" /></div>
      <div className="grid lg:grid-cols-2 gap-3"><Card title="Aging — whole workspace"><BucketBars data={data as any} /></Card>
        <Card title="By client" pad={false}><table className="tbl w-full text-sm"><tbody>{summary.by_client.slice(0, 12).map((c) => <tr key={c.client_id}><td>{c.name}</td><td className="text-right muted">{num(c.n)}</td><td className="text-right font-semibold">{money(c.balance)}</td></tr>)}</tbody></table>{summary.by_client.length > 12 && <div className="px-3 py-2 text-[11px] muted">+{summary.by_client.length - 12} more clients</div>}</Card></div>
      <div className="flex gap-1.5 flex-wrap">{summary.by_payer.slice(0, 8).map((p) => <Chip key={p.payer} color="#64748b">{p.payer} {money(p.balance)}</Chip>)}</div>
    </div>
  );
}
