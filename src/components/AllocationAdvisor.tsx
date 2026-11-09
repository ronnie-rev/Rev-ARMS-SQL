import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, Empty, toast, useConfirm } from './ui';
import { useClaims } from '../hooks';
import { useInsightIndex } from '../lib/useInsights';
import { adviseAllocation, peopleFrom } from '../lib/engine/allocadvice';
import { isProducer } from '../lib/roles';
import { money } from '../lib/utils';

/** Allocation → Advisor: the best owner for every unassigned claim (client coverage, payer skills, load), highest-urgency first, applied in one click per person or for everyone. */
export function AllocationAdvisor() {
  const { profiles, inScope, assign, has } = useStore(); const all = useClaims(); const ecs = useMemo(() => all.filter((x) => inScope(x.c.client_id)), [all, inScope]); const insights = useInsightIndex(ecs); const { confirm, node } = useConfirm(); const [busy, setBusy] = useState(false);
  const people = useMemo(() => peopleFrom(profiles.filter((p) => p.active && isProducer(p.role))), [profiles]);
  const plan = useMemo(() => adviseAllocation({ unassigned: ecs.filter((x) => x.open && !x.c.assigned_to), owned: ecs.filter((x) => x.open && x.c.assigned_to), people, insights }), [ecs, people, insights]);
  const apply = async (personId: string | null) => {
    const list = plan.suggestions.filter((s) => !personId || s.to === personId); if (!list.length) return; if (!(await confirm(`Assign ${list.length} claim${list.length > 1 ? 's' : ''} (${money(list.reduce((a, s) => a + Math.max(0, s.balance), 0))}) as suggested?`))) return;
    setBusy(true); try { const by = new Map<string, string[]>(); for (const s of list) by.set(s.to, [...(by.get(s.to) || []), s.claimId]); for (const [uid, ids] of by) await assign(ids, uid); toast.ok(`${list.length} claims assigned`); } finally { setBusy(false); }
  };
  if (!plan.suggestions.length) return <Card><Empty icon={<Sparkles size={28} />} title="Nothing to allocate" sub={plan.unplaceable ? `${plan.unplaceable} unassigned claims belong to clients nobody can see — check Client coverage.` : 'Every open claim has an owner.'} /></Card>;
  return (
    <div className="space-y-4">
      <Card title={<span className="flex items-center gap-2"><Sparkles size={15} />Suggested owners ({plan.suggestions.length} unassigned claims)</span>} actions={has('assign') && <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => apply(null)}>Apply all</button>} pad={false}>
        <p className="text-xs muted px-5 pt-1 pb-2">Most urgent and valuable claims are placed first. Each person is checked against client coverage, payer skills and how many claims they can keep warm.</p>
        <table className="tbl w-full text-sm"><thead><tr><th>Person</th><th className="text-right">Gets</th><th className="text-right">Dollars</th><th className="text-right">Load now → after</th><th /></tr></thead><tbody>{plan.byPerson.map((p) => <tr key={p.id}><td>{p.name}</td><td className="text-right">{p.n}</td><td className="text-right">{money(p.amount)}</td><td className="text-right" style={{ color: p.loadAfter > p.softCap ? '#dc2626' : undefined }}>{p.loadBefore} → {p.loadAfter} <span className="muted text-[11px]">(comfortable ≤ {p.softCap})</span></td><td>{has('assign') && <button className="btn btn-sm" disabled={busy} onClick={() => apply(p.id)}>Assign</button>}</td></tr>)}</tbody></table>
      </Card>
      <Card title="Top of the queue" pad={false}><div className="max-h-96 overflow-auto"><table className="tbl w-full text-sm"><thead><tr><th>Claim</th><th>Why it matters</th><th>Suggested owner</th></tr></thead><tbody>{plan.suggestions.slice(0, 30).map((s) => <tr key={s.claimId}><td><b>{s.claim_no}</b><div className="muted text-[11px]">{s.payer} · {s.client} · {money(s.balance)}</div></td><td className="text-[12px] max-w-[320px]">{s.why}</td><td>{s.toName}<div className="flex gap-1 flex-wrap mt-0.5">{s.reasons.map((r) => <Chip key={r} color="#64748b">{r}</Chip>)}</div></td></tr>)}</tbody></table></div></Card>
      {node}
    </div>
  );
}
