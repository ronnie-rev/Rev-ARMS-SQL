import { useEffect, useMemo, useState } from 'react';
import { SRC_LABEL, type ExpectedSrc } from '../lib/engine/reimb';
import { Link } from 'react-router-dom';
import { isProducer } from '../lib/roles';
import { CheckCircle2, Clock, Download, HelpCircle, Pin, Send, ShieldCheck, X, XCircle } from 'lucide-react';
import { useStore } from '../store';
import { useClaim, useClaims, useOpts, usePhi, usePriority } from '../hooks';
import { BAND_COLOR } from '../lib/engine/priority';
import { Avatar, Chip, Drawer, Empty, Field, Tabs, toast } from './ui';
import { ClaimWorkPanel } from './ClaimWorkPanel';
import { CreateAppealButton } from './appeal/CreateAppeal';
import { ClaimIntel } from './ClaimIntel';
import { Claim360 } from './Claim360';
import { SopBanner } from './SopBanner';
import { InsightChips } from './InsightChips';
import { ClaimClassification, LifecycleControls } from './LifecyclePanel';
import { DateField } from './CalendarPicker';
import { downloadFile, fmtDate, fmtDateTime, money, relTime } from '../lib/utils';
import Papa from 'papaparse';
import { CHECKS } from '../lib/engine/checks';
import { FLAG_LABEL } from '../lib/engine/settings';

type Tab = 'work' | 'c360' | 'notes' | 'timeline' | 'history' | 'details';

/** Global claim drawer — open any claim from anywhere with useStore.getState().openClaim(id). */
export function ClaimDrawer() {
  const claimId = useStore((s) => s.openClaimId); const close = () => useStore.getState().openClaim(null);
  const role = useStore((s) => s.me()?.role);
  const ec = useClaim(claimId);
  const [tab, setTab] = useState<Tab>('work');
  useEffect(() => setTab('work'), [claimId]);
  if (role === 'client') return <Drawer open={!!claimId} onClose={close} width={560}>{ec && <ClientClaimView ec={ec} onClose={close} />}</Drawer>;
  return (
    <Drawer open={!!claimId} onClose={close} width={760}>
      {ec && <StaffClaimView ec={ec} tab={tab} setTab={setTab} onClose={close} />}
    </Drawer>
  );
}

function StaffClaimView({ ec, tab, setTab, onClose }: { ec: ReturnType<typeof useClaims>[number]; tab: Tab; setTab: (t: Tab) => void; onClose: () => void }) {
  const { notes, activity, workLog, profiles, can, has, reopenClaim, patchClaims, assign, addNote, audit, save, setResolution } = useStore();
  const customFields = useOpts('field'); const statuses = useOpts('status'); const priorities = useOpts('priority'); const phi = usePhi();
  const claim = ec.c; const claimId = claim.id;
  const myNotes = useMemo(() => notes.filter((n) => n.claim_id === claimId).sort((a, b) => (a.pinned === b.pinned ? b.created_at.localeCompare(a.created_at) : a.pinned ? -1 : 1)), [notes, claimId]);
  const myAct = useMemo(() => activity.filter((a) => a.claim_id === claimId).sort((a, b) => b.created_at.localeCompare(a.created_at)), [activity, claimId]);
  const myLog = useMemo(() => workLog.filter((w) => w.claim_id === claimId).sort((a, b) => b.created_at.localeCompare(a.created_at)), [workLog, claimId]);
  const assignable = profiles.filter((p) => p.active && isProducer(p.role));
  const [allFlags, setAllFlags] = useState(false); const pri = usePriority([ec]).get(claim.id); const flags = (claim.flags || []).filter((f) => !f.startsWith('ign:')); const canAssign = has('assign'); const canWork = has('work_claims');
  return (
    <>
      <div className="px-5 pt-4 pb-3 border-b hair space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap"><h2 className="text-[17px] font-bold tracking-tight">{claim.claim_no}</h2>{claim.claim_uid && <button className="tag" title="Permanent claim UID — click to copy" onClick={() => { void navigator.clipboard?.writeText(claim.claim_uid!); toast.ok('UID copied'); }}>{claim.claim_uid}</button>}<Chip color={ec.client?.color}>{ec.client?.name}</Chip>{ec.stage && <Chip color={ec.stageColor || '#64748b'}>{ec.stage}</Chip>}{claim.closed_at && <Chip color="#64748b">Closed · {claim.closed_reason}</Chip>}</div>
            <div className="text-[13px] muted mt-0.5 truncate">{phi(claim.patient_name)} · {claim.payer} · DOS {fmtDate(claim.dos)}{claim.encounter_no ? ` · Enc ${claim.encounter_no}` : ''}</div>
          </div>
          <button className="btn btn-ghost btn-sm" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        {(flags.includes('missing_review') && !claim.closed_at) && <div className="rounded-xl px-3 py-2 text-[12.5px] flex items-center gap-2 flex-wrap" style={{ background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.35)' }}><b>Missing from the aging file since {fmtDate(claim.missing_since)}.</b> A supervisor/manager must mark it paid, written off, or restore it.{has('resolve_missing') && <Link className="btn btn-sm ml-auto" to="/missing" onClick={onClose}>Review &amp; resolve</Link>}</div>}
        {claim.closed_at && <div className="rounded-xl px-3 py-2 text-[12.5px] flex items-center gap-2 flex-wrap" style={{ background: 'rgba(100,116,139,.12)', border: '1px solid rgba(100,116,139,.3)' }}><span><b>Closed {fmtDate(claim.closed_at)}</b> · {claim.resolution ? `resolved as ${claim.resolution}` : 'resolution unconfirmed'}{claim.end_action ? ` · ${claim.end_action}` : ''}{claim.resolved_by ? ` · by ${profiles.find((p) => p.id === claim.resolved_by)?.full_name || 'a reviewer'}` : ''}{claim.resolution_note ? ` — “${claim.resolution_note}”` : ''}. Full history is in the tabs below.</span>{has('resolve_missing') && <button className="btn btn-sm ml-auto" onClick={async () => { const reason = window.prompt('Why is this claim being reopened?'); if (!reason) return; const r = await reopenClaim(claim.id, reason); r.ok ? toast.ok('Claim reopened') : toast.err(r.message || 'Could not reopen'); }}>Reopen</button>}</div>}
        <SopBanner claim={claim} />
        <InsightChips ec={ec} />
        <div className="flex items-center gap-x-5 gap-y-1 flex-wrap text-[13px]">
          <span><span className="muted text-[11px] mr-1.5">Balance</span><b className="tabular-nums text-[15px]">{money(claim.balance, true)}</b></span>
          <span className="flex items-center gap-1.5"><span className="muted text-[11px]">Age</span><b>{ec.age ?? '—'}d</b>{ec.bucket && <Chip color={ec.bucket.color}>{ec.bucket.label}</Chip>}</span>
          {claim.expected_amt != null && <span title={`Source: ${SRC_LABEL[claim.expected_src as ExpectedSrc] || claim.expected_src}`}><span className="muted text-[11px] mr-1.5">Expected</span><b className="tabular-nums">{money(claim.expected_amt, true)}</b>{claim.paid_amt != null && claim.paid_amt < claim.expected_amt - 0.5 && <span className="text-red-500 text-[11px] ml-1">paid {money(claim.paid_amt, true)}</span>}</span>}
          <span><span className="muted text-[11px] mr-1.5">Timely filing</span>{ec.tfLeft == null ? <span className="muted">not set</span> : <b className={ec.tfLeft <= 30 ? 'text-red-500' : ''}>{ec.tfLeft <= 0 ? `passed ${-ec.tfLeft}d ago` : `${ec.tfLeft}d left`}</b>}</span>
          <span className="flex items-center gap-1.5" title={pri ? pri.parts.slice(0, 5).map((x) => `${x.label}: +${x.pts}`).join('\n') : undefined}><span className="muted text-[11px]">Urgency</span><b>{Math.round(pri?.score ?? ec.score)}</b>{pri && <span className="inline-block w-2 h-2 rounded-full" style={{ background: BAND_COLOR[pri.band] }} />}{claim.next_fu && <span className="ml-3"><span className="muted text-[11px] mr-1.5">Follow-up</span><b className={ec.fuDue ? 'text-amber-500' : ''}>{fmtDate(claim.next_fu)}</b></span>}</span>
        </div>
        {flags.length > 0 && <div className="flex gap-1.5 flex-wrap items-center">{(allFlags ? flags : flags.slice(0, 2)).map((f) => { const ck = f.startsWith('chk:') ? CHECKS.find((c) => 'chk:' + c.id === f) : null; const m = FLAG_LABEL[f]; return <Chip key={f} color={ck ? (ck.severity === 'high' ? '#ef4444' : ck.severity === 'med' ? '#f59e0b' : '#64748b') : m ? (m.tone === 'red' ? '#ef4444' : m.tone === 'amber' ? '#f59e0b' : m.tone === 'blue' ? '#6366f1' : '#64748b') : '#a855f7'}>{ck ? ck.title : m ? m.label : f.replace(/_/g, ' ')}</Chip>; })}{flags.length > 2 && <button className="tag" onClick={() => setAllFlags(!allFlags)}>{allFlags ? 'less' : `+${flags.length - 2} more`}</button>}
          {claim.closed_at && canWork && <label className="text-[11px] muted flex items-center gap-1.5 ml-auto">Resolved as<select className="input !w-auto !py-0.5 !text-xs" value={claim.resolution || 'unknown'} onChange={(e) => e.target.value !== 'unknown' && setResolution(claim.id, e.target.value as any)}><option value="unknown">unconfirmed</option><option value="paid">paid</option><option value="adjusted">adjusted</option><option value="patient">to patient</option></select></label>}</div>}
        <div className="flex items-end gap-2 flex-wrap">
          <Mini label="Owner"><select className="input !min-h-[30px] !py-0 !text-xs !w-36" value={claim.assigned_to || ''} disabled={!canAssign && !(canWork && !claim.assigned_to)} onChange={(e) => assign([claim.id], e.target.value || null)}><option value="">Unassigned</option>{assignable.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Mini>
          <Mini label="Workflow status"><select className="input !min-h-[30px] !py-0 !text-xs !w-40" value={claim.status} disabled={!canWork} onChange={(e) => patchClaims([claim.id], { status: e.target.value }, `Status → ${e.target.value}`, 'status')}>{statuses.map((s) => <option key={s.id}>{s.value}</option>)}{!statuses.find((s) => s.value === claim.status) && <option>{claim.status}</option>}</select></Mini>
          <Mini label="Priority"><select className="input !min-h-[30px] !py-0 !text-xs !w-24" value={claim.priority} disabled={!canWork} onChange={(e) => patchClaims([claim.id], { priority: e.target.value }, `Priority → ${e.target.value}`)}>{priorities.map((s) => <option key={s.id}>{s.value}</option>)}</select></Mini>
        </div>
        <div className="flex items-center gap-2 flex-wrap"><LifecycleControls ec={ec} canWork={canWork} /><CreateAppealButton claimId={claim.id} /></div>
      </div>
      <div className="px-5 pt-2.5"><Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'work', label: 'Work claim' }, { id: 'c360', label: 'Claim 360' }, { id: 'notes', label: 'Notes', count: myNotes.length }, { id: 'history', label: 'Touch history', count: myLog.length }, { id: 'timeline', label: 'Activity', count: myAct.length }, { id: 'details', label: 'Details' }]} /></div>
      <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
        {tab === 'work' && (canWork ? <ClaimWorkPanel ec={ec} onSaved={() => setTab('history')} /> : <div className="space-y-4"><ClaimIntel ec={ec} /><Empty title="Read-only access" sub="Your role can view but not work claims." /></div>)}
        {tab === 'c360' && <Claim360 claim={claim} canWork={canWork} />}
        {tab === 'notes' && <Notes notes={myNotes} canWrite={canWork} onAdd={(b, v) => addNote(claim.id, b, false, v)} onPin={(n) => save('claim_notes', [{ ...n, pinned: !n.pinned }])} onShare={(n) => save('claim_notes', [{ ...n, client_visible: !n.client_visible }])} />}
        {tab === 'history' && (myLog.length === 0 ? <Empty icon={<Clock />} title="Not worked yet" sub="Every saved touch is recorded here automatically." /> : (
          <div className="space-y-3">{myLog.map((w) => (
            <div key={w.id} className="panel2 p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2"><Avatar name={w.user_name} /><div className="text-sm font-semibold">{w.user_name}</div><span className="text-xs muted">{fmtDate(w.work_date)} · {w.mode}{w.time_spent_sec ? ` · ${Math.max(1, Math.round(w.time_spent_sec / 60))}m` : ''}</span>{w.multi_touch && <Chip color="#f59e0b">Multi-touch</Chip>}{w.legacy && <Chip color="#64748b">Imported</Chip>}</div>
                <AuditChip s={w.audit_status} /></div>
              <div className="mt-2 text-[13px]"><b>{w.rca}</b> › {w.rca_detail}</div>
              <div className="text-[13px]"><b>{w.end_action}</b>{w.end_sub && <> › {w.end_sub}</>}{w.next_fu && <span className="muted"> · F/U {fmtDate(w.next_fu)}</span>}</div>
              {w.call_ref && <div className="text-xs muted mt-0.5">Call ref {w.call_ref}{w.contact_name ? ` · spoke with ${w.contact_name}` : ''}</div>}
              {w.comment && <div className="mt-1.5 text-[13px] muted italic whitespace-pre-wrap">“{w.comment}”</div>}
              {w.audit_remarks && <div className="mt-1.5 text-xs text-amber-500">QA: {w.audit_remarks}</div>}
              {has('audit_touches') && w.audit_status === 'pending' && <QuickAudit onSubmit={(s, r) => audit(w.id, s, r)} />}
            </div>))}</div>))}
        {tab === 'timeline' && myAct.length > 0 && <div className="flex justify-end mb-2"><button className="btn btn-sm" onClick={() => downloadFile(`audit-trail-${claim.claim_no}.csv`, Papa.unparse([['When', 'Who', 'Type', 'What'], ...[...myAct].reverse().map((a) => [a.created_at, a.actor_name || 'System', a.kind, a.summary])]))}><Download size={12} />Export audit trail</button></div>}
        {tab === 'timeline' && (myAct.length === 0 ? <Empty title="No activity" /> : (
          <ol className="relative border-l hair ml-2 space-y-4">{myAct.map((a) => (
            <li key={a.id} className="ml-4"><span className="absolute -left-1.5 w-3 h-3 rounded-full bg-brand-500 ring-4" style={{ ['--tw-ring-color' as any]: 'var(--panel)' }} />
              <div className="text-[13px]"><span className="font-semibold">{a.actor_name || 'System'}</span> <span className="muted">· {a.kind}</span></div><div className="text-[13px]">{a.summary}</div><div className="text-[11px] muted">{fmtDateTime(a.created_at)} · {relTime(a.created_at)}</div></li>))}</ol>))}
        {tab === 'details' && (
          <div className="space-y-4">
            <ClaimClassification ec={ec} canWork={canWork} />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">{[['Account ID', claim.account_id], ['Provider', claim.provider ? `${claim.provider} (${claim.provider_type || '—'})` : null], ['CPT', claim.cpt], ['Last billed', fmtDate(claim.last_billed)], ['PMS status', claim.pms_status], ['Denial codes', claim.denial_codes], ['First seen', fmtDate(claim.created_at.slice(0, 10))], ['Touches', String(claim.touch_count)]].map(([k, v]) => <div key={k as string}><dt className="label">{k}</dt><dd>{v || '—'}</dd></div>)}</dl>
            {customFields.length > 0 && <div><div className="label">Custom fields</div><div className="grid grid-cols-2 gap-3">{customFields.map((f) => (
              <Field key={f.id} label={f.value}>{f.meta.type === 'select' ? <select className="input" disabled={!canWork} value={claim.custom?.[f.value] ?? ''} onChange={(e) => patchClaims([claim.id], { custom: { ...claim.custom, [f.value]: e.target.value } })}><option value="">—</option>{String(f.meta.options || '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => <option key={o}>{o}</option>)}</select>
                : <input className="input" disabled={!canWork} type={f.meta.type === 'number' ? 'number' : f.meta.type === 'date' ? 'date' : 'text'} defaultValue={claim.custom?.[f.value] ?? ''} onBlur={(e) => e.target.value !== (claim.custom?.[f.value] ?? '') && patchClaims([claim.id], { custom: { ...claim.custom, [f.value]: e.target.value } })} />}</Field>))}</div></div>}
          </div>)}
      </div>
    </>
  );
}

function ClientClaimView({ ec, onClose }: { ec: ReturnType<typeof useClaims>[number]; onClose: () => void }) {
  const { notes, raiseRequest, requests } = useStore(); const claim = ec.c;
  const shared = notes.filter((n) => n.claim_id === claim.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const mine = requests.filter((r) => r.claim_id === claim.id);
  const [q, setQ] = useState('');
  return (
    <>
      <div className="p-5 border-b hair flex justify-between items-start"><div><h2 className="text-lg font-extrabold">{claim.claim_no}</h2><div className="text-sm muted">{claim.patient_name} · {claim.payer} · DOS {fmtDate(claim.dos)}</div></div><button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button></div>
      <div className="flex-1 overflow-auto p-5 space-y-5">
        <div className="grid grid-cols-3 gap-3"><div><div className="label">Balance</div><div className="text-lg font-extrabold">{money(claim.balance, true)}</div></div><div><div className="label">Age</div><div className="flex items-center gap-1.5"><b className="text-lg">{ec.age}d</b>{ec.bucket && <Chip color={ec.bucket.color}>{ec.bucket.label}</Chip>}</div></div><div><div className="label">Status</div><b>{claim.status}</b></div></div>
        <div className="panel2 p-3 text-sm"><div className="label">Where it stands</div>{claim.end_action ? <><b>{claim.end_action}</b>{claim.end_sub && <> › {claim.end_sub}</>}<div className="text-xs muted mt-1">Reason: {claim.rca}{claim.rca_detail ? ` › ${claim.rca_detail}` : ''} · last worked {claim.last_touched_at ? relTime(claim.last_touched_at) : '—'}</div></> : <span className="muted">Not yet worked — queued for the AR team.</span>}{claim.next_fu && <div className="text-xs mt-1">Next follow-up {fmtDate(claim.next_fu)}</div>}</div>
        <div><div className="label">Updates from your AR team</div>{shared.length === 0 ? <div className="text-sm muted">No shared notes yet.</div> : shared.map((n) => <div key={n.id} className="panel2 p-3 mb-2 text-[13px]"><div className="text-xs muted mb-1">{n.author_name} · {relTime(n.created_at)}</div>{n.body}</div>)}</div>
        <div><div className="label flex items-center gap-1"><HelpCircle size={12} />Ask about this claim</div>
          {mine.map((r) => <div key={r.id} className="panel2 p-3 mb-2 text-[13px]"><div className="text-xs muted">{relTime(r.created_at)} · <Chip color={r.status === 'open' ? '#f59e0b' : '#22c55e'}>{r.status}</Chip></div><div className="mt-1">{r.body}</div>{r.response && <div className="mt-2 pl-3 border-l-2 border-brand-500 text-brand-200">{r.response}</div>}</div>)}
          <div className="flex gap-2"><textarea className="input" rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Send a question or documents note to the AR team…" /><button className="btn btn-primary self-end" disabled={!q.trim()} onClick={async () => { await raiseRequest({ kind: 'question', body: q.trim(), claim_id: claim.id }); setQ(''); toast.ok('Sent to your AR team'); }}><Send size={14} /></button></div></div>
      </div>
    </>
  );
}

export function AuditChip({ s }: { s: string }) {
  if (s === 'pass') return <Chip color="#22c55e"><CheckCircle2 size={11} />QA pass</Chip>;
  if (s === 'fail') return <Chip color="#ef4444"><XCircle size={11} />QA fail</Chip>;
  if (s === 'na') return <Chip color="#64748b">QA n/a</Chip>;
  return <Chip color="#94a3b8"><ShieldCheck size={11} />Pending QA</Chip>;
}

function QuickAudit({ onSubmit }: { onSubmit: (s: 'pass' | 'fail', r: string) => void }) {
  const [r, setR] = useState('');
  return (<div className="mt-2 flex gap-2"><input className="input" placeholder="Audit remarks (required for fail)" value={r} onChange={(e) => setR(e.target.value)} /><button className="btn btn-sm" onClick={() => onSubmit('pass', r)}>Pass</button><button className="btn btn-sm btn-danger" onClick={() => (r.trim() ? onSubmit('fail', r) : toast.err('Add remarks to fail an audit'))}>Fail</button></div>);
}

function Notes({ notes, canWrite, onAdd, onPin, onShare }: { notes: any[]; canWrite: boolean; onAdd: (b: string, share: boolean) => void; onPin: (n: any) => void; onShare: (n: any) => void }) {
  const [t, setT] = useState(''); const [share, setShare] = useState(false);
  return (
    <div>
      {canWrite && <div className="mb-4"><div className="flex gap-2"><textarea className="input" rows={2} placeholder="Add a note — payer rep, call ref #, promises made…" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && t.trim()) { onAdd(t.trim(), share); setT(''); } }} />
        <button className="btn btn-primary self-end" disabled={!t.trim()} onClick={() => { onAdd(t.trim(), share); setT(''); }}><Send size={14} /></button></div>
        <label className="text-[11px] muted flex items-center gap-1.5 mt-1.5"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />Share this note with the client (visible in their portal)</label></div>}
      {notes.length === 0 ? <Empty title="No notes yet" /> : <div className="space-y-2">{notes.map((n) => (
        <div key={n.id} className="panel2 p-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs"><Avatar name={n.author_name} size={20} /><b>{n.author_name}</b><span className="muted">{relTime(n.created_at)}</span>{n.client_visible && <Chip color="#06b6d4">shared with client</Chip>}</div>
          <div className="flex gap-1">{canWrite && <button className="btn btn-ghost btn-sm text-[10px] muted" onClick={() => onShare(n)}>{n.client_visible ? 'Unshare' : 'Share'}</button>}<button className={'btn btn-ghost btn-sm ' + (n.pinned ? 'text-amber-500' : 'muted')} onClick={() => onPin(n)}><Pin size={13} /></button></div></div>
          <p className="text-[13px] mt-1.5 whitespace-pre-wrap">{n.body}</p></div>))}</div>}
    </div>
  );
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="text-[10.5px] muted block mb-0.5">{label}</span>{children}</label>; }
