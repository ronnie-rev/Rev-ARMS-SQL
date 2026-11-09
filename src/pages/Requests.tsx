import { HubBar } from '..//components/HubBar';
import { useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, Empty, PageHeader, Tabs, toast } from '../components/ui';
import { relTime, todayISO } from '../lib/utils';
import { prioritise, slaStats, suggestReply } from '../lib/engine/requestsintel';
import { portalPerms } from '../lib/types';

/** Staff inbox for client portal requests; clients see the same list read/compose-only. */
export default function Requests() {
  const { requests, clients, claims, appeals, answerRequest, raiseRequest, openClaim, decideApproval } = useStore(); const me = useStore((s) => s.me());
  const isClient = me?.role === 'client'; const perms = portalPerms(me);
  const [tab, setTab] = useState<'open' | 'answered'>('open'); const [reply, setReply] = useState<Record<string, string>>({});
  const [nq, setNq] = useState(''); const [kind, setKind] = useState<'question' | 'documents' | 'escalation' | 'info'>('question');
  const today = todayISO(); const pri = prioritise(requests, claims, today); const priBy = new Map(pri.map((p) => [p.req.id, p])); const sla = slaStats(requests, today);
  const list = requests.filter((r) => (tab === 'open' ? r.status === 'open' : r.status !== 'open')).sort((a, b) => (tab === 'open' && !isClient ? (priBy.get(b.id)?.score || 0) - (priBy.get(a.id)?.score || 0) : b.created_at.localeCompare(a.created_at)));
  return (
    <div>
      <HubBar group="comms" />
      <PageHeader title={isClient ? 'Messages to your AR team' : 'Client requests'} sub={isClient ? 'Ask questions, flag documents, or escalate a claim. Replies appear here.' : 'Questions and escalations raised from client portals.'} />
      {isClient && !perms.can_message && <div className="panel2 p-3 mb-4 text-[13px] muted">Messaging is turned off for your account — contact your account manager to ask a question.</div>}
      {isClient && perms.can_message && <Card className="mb-4" title="New message"><div className="flex gap-2 flex-wrap"><select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value as any)}><option value="question">Question</option><option value="documents">Documents</option><option value="escalation">Escalate</option><option value="info">FYI</option></select>
        <input className="input flex-1 min-w-[240px]" value={nq} onChange={(e) => setNq(e.target.value)} placeholder="What do you need?" /><button className="btn btn-primary" disabled={!nq.trim()} onClick={async () => { await raiseRequest({ kind, body: nq.trim() }); setNq(''); toast.ok('Sent'); }}>Send</button></div></Card>}
      {!isClient && (sla.answered > 0 || sla.openOverdue > 0) && <div className="flex gap-2 flex-wrap mb-3 text-[12px]">{sla.openOverdue > 0 && <Chip color="#dc2626">{sla.openOverdue} open request{sla.openOverdue > 1 ? 's' : ''} past the 2-business-day target</Chip>}{sla.medianHours != null && <Chip color="#6366f1">Median first response {sla.medianHours < 48 ? sla.medianHours + ' h' : Math.round(sla.medianHours / 24) + ' days'}</Chip>}{sla.withinTargetPct != null && <Chip color={sla.withinTargetPct >= 80 ? '#16a34a' : '#d97706'}>{sla.withinTargetPct}% answered within target</Chip>}</div>}
      <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'open', label: 'Open', count: requests.filter((r) => r.status === 'open').length }, { id: 'answered', label: 'Answered / closed' }]} /></div>
      {list.length === 0 ? <Card><Empty icon={<MessageSquareText />} title="Nothing here" /></Card> : <div className="space-y-3">{list.map((r) => { const cl = claims.find((c) => c.id === r.claim_id); return (
        <div key={r.id} className="panel p-4 animate-in">
          <div className="flex items-center gap-2 flex-wrap text-xs"><Chip color="#6366f1">{r.kind}</Chip>{priBy.get(r.id)?.overdue && <Chip color="#dc2626">overdue · {priBy.get(r.id)!.ageDays}d</Chip>}{!isClient && (priBy.get(r.id)?.reasons || []).filter((x) => !/waiting/.test(x)).map((x) => <Chip key={x} color="#64748b">{x}</Chip>)}<b>{r.author_name}</b><span className="muted">{clients.find((c) => c.id === r.client_id)?.name} · {relTime(r.created_at)}</span>{cl && <button className="text-brand-400 font-semibold" onClick={() => openClaim(cl.id)}>{cl.claim_no}</button>}<Chip color={r.status === 'open' ? '#f59e0b' : '#22c55e'}>{r.status}</Chip></div>
          <p className="text-sm mt-2">{r.body}</p>
          {r.kind === 'approval' && <div className="mt-2 flex items-center gap-3 flex-wrap"><Chip color="#f59e0b">Adjustment ${(r.amount || 0).toFixed(2)}</Chip>{r.decision && <Chip color={r.decision === 'approved' ? '#22c55e' : '#ef4444'}>{r.decision}</Chip>}{isClient && perms.can_approve && r.status === 'open' && <><button className="btn btn-sm btn-primary" onClick={async () => { await decideApproval(r.id, 'approved'); toast.ok('Approved'); }}>Approve</button><button className="btn btn-sm btn-danger" onClick={async () => { await decideApproval(r.id, 'denied'); toast.ok('Declined'); }}>Decline</button></>}</div>}
          {r.response && <div className="mt-2 pl-3 border-l-2 border-brand-500 text-sm">{r.response}<div className="text-[11px] muted">{r.responded_at ? relTime(r.responded_at) : ''}</div></div>}
          {!isClient && r.status === 'open' && r.kind !== 'approval' && <div className="mt-3"><button className="text-[11.5px] underline muted mb-1" onClick={() => setReply({ ...reply, [r.id]: suggestReply(r, cl, appeals, today) })}>Draft a reply from the claim</button><div className="flex gap-2"><input className="input" placeholder="Reply to client…" value={reply[r.id] || ''} onChange={(e) => setReply({ ...reply, [r.id]: e.target.value })} /><button className="btn btn-primary" disabled={!reply[r.id]?.trim()} onClick={async () => { await answerRequest(r.id, reply[r.id].trim()); toast.ok('Replied'); }}>Reply</button><button className="btn" onClick={() => answerRequest(r.id, r.response || 'Closed', 'closed')}>Close</button></div></div>}
        </div>); })}</div>}
    </div>
  );
}
