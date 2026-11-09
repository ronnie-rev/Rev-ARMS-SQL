import { useDraftAppeals } from '../components/appeal/CreateAppeal';
import { useMemo, useState } from 'react';
import { Download, ShieldQuestion } from 'lucide-react';
import Papa from 'papaparse';
import { useStore } from '../store';
import { Card, Chip, Empty, PageHeader, Stat, toast, useConfirm } from '../components/ui';
import { allocate } from '../lib/engine/alloc';
import { isProducer } from '../lib/roles';
import { BulkModal } from '../components/BulkModal';
import { resolveIntelCfg } from '../lib/engine/intelligence';
import { SWEEP_LABEL, unresolvedSweep, type SweepKind } from '../lib/engine/sweep';
import { downloadFile, fmtDate, money, todayISO } from '../lib/utils';

const SEV = { high: '#ef4444', med: '#f59e0b', low: '#64748b' } as const;
const FIX: Record<SweepKind, string> = { deadline_expired: 'Open each claim → decide appeal with proof or write-off.', appeal_overdue: 'Open the appeal in Appeals, file it or mark the outcome.', missing_pending: 'Decide in Missing from file (paid / written off / restore).', unconfirmed_close: 'Open the claim → set how it was resolved.', credit_balance: 'Confirm the overpayment on the EOB, then refund the payer or transfer the credit.', promise_overdue: 'Call the payer back; log the new promise date on the claim.', no_owner: 'Select all → Bulk actions → Reassign owner.', no_followup: 'Select all → Bulk actions → Set follow-up date.', stale: 'Select → Bulk actions → reassign or set a follow-up.', snooze_ended: 'Select → Bulk actions → set follow-up or snooze again.' };
/** Nothing is forgotten: every unresolved claim that has no owner, date, decision or progress, grouped by what is wrong. */
export default function Unresolved() {
  const draftAp = useDraftAppeals();
  const { claims, appeals, clients, profiles, inScope, openClaim, settings } = useStore(); const [kind, setKind] = useState<SweepKind | ''>(''); const [client, setClient] = useState(''); const [payer, setPayer] = useState(''); const [owner, setOwner] = useState(''); const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set()); const [bulk, setBulk] = useState(false); const { confirm, node: confirmNode } = useConfirm(); const { assign, patchClaims, has } = useStore();
  const targets = (l: typeof list) => (sel.size ? l.filter((c) => sel.has(c.id)) : l.slice(0, 200));
  const spread = async () => {
    const t = targets(list); const staff = profiles.filter((p) => p.active && isProducer(p.role)); if (!staff.length) return toast.err('No active production users to assign to');
    if (!(await confirm(`Spread ${t.length} unowned claims across ${staff.length} people, balanced by current workload?`))) return;
    const plan = allocate(t.map((c) => ({ c })) as any, staff.map((p) => p.id), 'balanced' as any, claims.filter((c) => !c.closed_at && c.assigned_to).map((c) => ({ c })) as any);
    const by = new Map<string, string[]>(); for (const [cid, uid] of plan) by.set(uid, [...(by.get(uid) || []), cid]); for (const [uid, ids] of by) await assign(ids, uid); toast.ok(`Assigned ${t.length} claims`); setSel(new Set());
  };
  const setFu = async (days: number) => {
    const t = targets(list); if (!(await confirm(`Set a follow-up ${days} days from today on ${t.length} claims?`))) return;
    const d = new Date(Date.parse(todayISO() + 'T12:00:00Z') + days * 864e5).toISOString().slice(0, 10); await patchClaims(t.map((c) => c.id), { next_fu: d }, `Follow-up → ${d} (unresolved tracker)`, 'followup'); toast.ok(`Follow-up set on ${t.length} claims`); setSel(new Set());
  };
  const pool = useMemo(() => claims.filter((c) => inScope(c.client_id) && (!client || c.client_id === client) && (!payer || (c.payer || 'Unknown') === payer) && (!owner || (owner === 'none' ? !c.assigned_to : c.assigned_to === owner)) && (!q || `${c.claim_no} ${c.claim_uid || ''} ${c.encounter_no || ''} ${c.patient_name || ''}`.toLowerCase().includes(q.toLowerCase()))), [claims, inScope, client, payer, owner, q]);
  const sweep = useMemo(() => unresolvedSweep(pool, appeals, todayISO(), resolveIntelCfg(settings.intel_cfg).sweep), [pool, appeals, settings.intel_cfg]);
  const kinds = (Object.keys(SWEEP_LABEL) as SweepKind[]).filter((k) => sweep[k].length); const cur = (kind && sweep[kind].length ? kind : kinds[0]) as SweepKind | undefined;
  const list = cur ? [...sweep[cur]].sort((a, b) => b.balance - a.balance) : []; const all = useMemo(() => { const m = new Map<string, number>(); for (const k of kinds) for (const c of sweep[k]) m.set(c.id, c.balance); return m; }, [sweep]); // eslint-disable-line react-hooks/exhaustive-deps
  const payers = useMemo(() => [...new Set(claims.filter((c) => !c.closed_at).map((c) => c.payer || 'Unknown'))].sort(), [claims]);
  const cn = (id: string) => clients.find((c) => c.id === id)?.name || ''; const who = (id: string | null) => profiles.find((p) => p.id === id)?.full_name || 'Unassigned';
  const byOwner = useMemo(() => { const m = new Map<string, { name: string; n: number; amt: number }>(); for (const k of kinds) for (const c of sweep[k]) { const e = m.get(c.assigned_to || '-') || { name: who(c.assigned_to), n: 0, amt: 0 }; e.n++; e.amt += c.balance; m.set(c.assigned_to || '-', e); } return [...m.values()].sort((a, b) => b.amt - a.amt).slice(0, 8); }, [sweep]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleAll = () => setSel((s) => (list.slice(0, 200).every((c) => s.has(c.id)) ? new Set() : new Set(list.slice(0, 200).map((c) => c.id))));
  const exportCSV = () => downloadFile('unresolved-claims.csv', Papa.unparse(kinds.flatMap((k) => sweep[k].map((c) => ({ Issue: SWEEP_LABEL[k].title, Client: cn(c.client_id), Claim: c.claim_no, UID: c.claim_uid || '', Payer: c.payer || '', Owner: who(c.assigned_to), Status: c.status, 'Next follow-up': c.next_fu || '', 'Last touch': c.last_touched_at?.slice(0, 10) || '', Balance: c.balance })))));
  return (
    <div className="space-y-4">{draftAp.node}
      <PageHeader title="Unresolved tracker" sub={all.size ? `${all.size.toLocaleString('en-US')} claims need a decision, an owner or a next step` : 'Every unresolved claim has an owner, a date and progress'} actions={<button className="btn btn-sm" onClick={exportCSV}><Download size={14} />Export all</button>} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3"><Stat label="Claims needing action" value={all.size} color="#6366f1" /><Stat label="Money involved" value={money([...all.values()].reduce((a, b) => a + b, 0))} color="#3b82f6" /><Stat label="Urgent" value={new Set((['deadline_expired', 'appeal_overdue', 'missing_pending', 'credit_balance'] as const).flatMap((k) => sweep[k].map((c) => c.id))).size} sub="deadline · appeal · missing" color="#ef4444" /><Stat label="No owner" value={sweep.no_owner.length} color="#f59e0b" onClick={() => setKind('no_owner')} /><Stat label="No follow-up date" value={sweep.no_followup.length} color="#f97316" onClick={() => setKind('no_followup')} /></div>
      <div className="flex gap-2 flex-wrap items-center">
        <input className="input !py-1 !w-56" placeholder="Search claim #, UID, encounter, patient…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !py-1 !w-auto" value={client} onChange={(e) => setClient(e.target.value)}><option value="">All clients</option>{clients.filter((c) => inScope(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input !py-1 !w-auto" value={payer} onChange={(e) => setPayer(e.target.value)}><option value="">All payers</option>{payers.map((p) => <option key={p}>{p}</option>)}</select>
        <select className="input !py-1 !w-auto" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Any owner</option><option value="none">Unassigned</option>{profiles.filter((p) => p.active && p.role !== 'client').map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
        {has('work_claims') && <button className="btn btn-sm" disabled={draftAp.busy} onClick={() => draftAp.run(targets(list).map((c) => c.id))}>Draft appeals{sel.size ? ` (${sel.size})` : ''}</button>}{cur === 'no_owner' && has('assign') && <button className="btn btn-sm" onClick={spread}>Spread across team{sel.size ? ` (${sel.size})` : ''}</button>}{cur === 'no_followup' && has('work_claims') && <><button className="btn btn-sm" onClick={() => setFu(3)}>Follow up in 3 days{sel.size ? ` (${sel.size})` : ''}</button><button className="btn btn-sm" onClick={() => setFu(7)}>in 7 days</button></>}{sel.size > 0 && <button className="btn btn-sm btn-primary ml-auto" onClick={() => setBulk(true)}>Bulk actions… ({sel.size})</button>}
      </div>
      {kinds.length === 0 ? <Card><Empty icon={<ShieldQuestion size={28} />} title="Nothing is slipping" sub="No claim is missing an owner, follow-up, decision or deadline action." /></Card> : <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
        <div className="space-y-4"><Card pad={false}>{kinds.map((k) => <button key={k} onClick={() => { setKind(k); setSel(new Set()); }} className="nav-item w-full text-left !py-2.5 !rounded-none" data-active={cur === k}><div className="flex items-center gap-2"><Chip color={SEV[SWEEP_LABEL[k].severity]}>{sweep[k].length}</Chip><span className="text-[13px] font-semibold">{SWEEP_LABEL[k].title}</span></div><div className="text-[11px] muted mt-0.5">{money(sweep[k].reduce((a, c) => a + c.balance, 0))} · {SWEEP_LABEL[k].help}</div></button>)}</Card>
          <Card title="Who is holding the most" pad={false}><table className="tbl w-full text-sm"><tbody>{byOwner.map((o) => <tr key={o.name}><td>{o.name}</td><td className="text-right muted">{o.n}</td><td className="text-right font-semibold">{money(o.amt)}</td></tr>)}</tbody></table></Card></div>
        <Card pad={false} title={cur ? SWEEP_LABEL[cur].title : ''} actions={cur ? <span className="text-xs muted">How to clear: {FIX[cur]}</span> : undefined}><div className="overflow-x-auto"><table className="tbl w-full text-sm"><thead><tr><th style={{ width: 28 }}><input type="checkbox" checked={list.length > 0 && list.slice(0, 200).every((c) => sel.has(c.id))} onChange={toggleAll} /></th><th>Claim</th><th>Client</th><th>Payer</th><th>Owner</th><th>Status</th><th>Next F/U</th><th>Last touch</th><th className="text-right">Balance</th></tr></thead><tbody>
          {list.slice(0, 200).map((c) => <tr key={c.id} className="cursor-pointer" onClick={() => openClaim(c.id)}><td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(c.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} /></td><td className="font-mono text-xs">{c.claim_no}</td><td>{cn(c.client_id)}</td><td>{c.payer}</td><td>{who(c.assigned_to)}</td><td>{c.status}</td><td>{c.next_fu ? fmtDate(c.next_fu) : <span className="text-amber-500">none</span>}</td><td>{c.last_touched_at ? fmtDate(c.last_touched_at.slice(0, 10)) : 'never'}</td><td className="text-right">{money(c.balance)}</td></tr>)}</tbody></table></div>{list.length > 200 && <div className="p-3 text-[11px] muted">Showing the 200 largest of {list.length.toLocaleString('en-US')} — export for all.</div>}</Card></div>}
      {confirmNode}
      {bulk && <BulkModal ids={[...sel]} onClose={() => setBulk(false)} onDone={() => setSel(new Set())} />}
    </div>
  );
}
