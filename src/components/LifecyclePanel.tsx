import { useState } from 'react';
import { BellOff, Link2, Tag, UserCog } from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';
import { useStore } from '../store';
import { Chip, Modal, Field, toast } from './ui';
import { CalendarPanel, DateField } from './CalendarPicker';
import type { EClaim } from '../hooks';
import { checkTransition, lifecycleDefs, lifecycleOf, REQ_LABEL, type Req } from '../lib/engine/lifecycle';
import { PROVIDER_ROLES, VISIT_TYPES, linkedClaims, rolesOf } from '../lib/engine/visit';
import { todayISO } from '../lib/utils';

export const DEFER_REASONS = ['Waiting on payer', 'Waiting on client / front office', 'Records requested', 'Payer portal / phone down', 'Appeal pending decision', 'Other'];
const QUICK = [['Tomorrow', 1], ['3 days', 3], ['1 week', 7], ['2 weeks', 14], ['30 days', 30]] as const;

/** One compact line: native status chip, guarded "Move to…", and Defer (hide the claim until a date, with a reason). */
export function LifecycleControls({ ec, canWork }: { ec: EClaim; canWork: boolean }) {
  const st = useStore(); const c = ec.c; const defs = lifecycleDefs(st.config); const cur = lifecycleOf(c); const def = defs.find((d) => d.code === cur);
  const [to, setTo] = useState<string | null>(null); const [f, setF] = useState<Record<string, string>>({}); const [defer, setDefer] = useState(false);
  const [until, setUntil] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd')); const [reason, setReason] = useState(DEFER_REASONS[0]); const [note, setNote] = useState('');
  const input = { reason: f.reason, amount: Number(f.amount) || null, approval: f.approval, due: f.due, method: f.method, evidence: f.evidence, owner: f.owner };
  const probe = to ? checkTransition(cur, to, input, defs) : null; const need: Req[] = probe?.missing ?? [];
  const submit = async () => { if (!to) return; const r = await st.setLifecycle(c.id, to, input); if (r.ok) { toast.ok('Status updated'); setTo(null); setF({}); } else toast.err(r.message || 'Not allowed'); };
  const doDefer = async () => { await st.snooze([c.id], until, reason + (note.trim() ? ' — ' + note.trim() : '')); toast.ok(`Deferred until ${format(parseISO(until), 'MM/dd')}`); setDefer(false); setNote(''); };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] muted">Status</span><Chip color={def?.color}>{cur} · {def?.label}</Chip>
      {canWork && <select aria-label="Move to status" className="input !w-auto !min-h-[28px] !py-0 !text-xs" value="" onChange={(e) => { setTo(e.target.value); setF({}); }}><option value="">Move to…</option>{defs.filter((d) => d.code !== cur).map((d) => <option key={d.code} value={d.code}>{d.code} — {d.label}</option>)}</select>}
      {ec.snoozed ? <><Chip color="#f26522"><BellOff size={11} className="inline mr-1" />Deferred to {format(parseISO(String(c.custom.snooze_until)), 'MM/dd')} · {String(c.custom.snooze_reason || '')}</Chip>{canWork && <button className="btn btn-sm" onClick={() => st.snooze([c.id], null, '')}>Bring back</button>}</>
        : canWork && <button className="btn btn-sm" onClick={() => setDefer(true)}><BellOff size={12} />Defer</button>}
      <Modal open={defer} onClose={() => setDefer(false)} title="Defer this claim" wide footer={<><button className="btn" onClick={() => setDefer(false)}>Cancel</button><button className="btn btn-primary" onClick={doDefer}>Defer until {format(parseISO(until), 'MM/dd/yyyy')}</button></>}>
        <p className="text-[12.5px] muted mb-3">The claim leaves your worklist and comes back on the date you choose. Use it when you are waiting on someone else — it is logged on the claim.</p>
        <div className="grid sm:grid-cols-[auto_1fr] gap-5 items-start"><CalendarPanel value={until} min={todayISO()} onChange={setUntil} />
          <div className="space-y-3"><div><div className="label">Quick pick</div><div className="flex flex-wrap gap-1.5">{QUICK.map(([l, n]) => <button key={l} className={`tag ${until === format(addDays(new Date(), n), 'yyyy-MM-dd') ? '!bg-[rgb(var(--b500)/.14)] !text-[rgb(var(--b600))] dark:!text-[rgb(var(--b300))]' : ''}`} onClick={() => setUntil(format(addDays(new Date(), n), 'yyyy-MM-dd'))}>{l}</button>)}</div></div>
            <Field label="Reason"><select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>{DEFER_REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. promised callback by Dana" /></Field></div></div>
      </Modal>
      <Modal open={!!to} onClose={() => setTo(null)} title={`Move ${cur} → ${to}`} footer={<><button className="btn" onClick={() => setTo(null)}>Cancel</button><button className="btn btn-primary" disabled={!!need.length} onClick={submit}>Confirm</button></>}>
        <p className="text-xs muted mb-3">{defs.find((d) => d.code === to)?.hint}</p>
        <div className="space-y-3">{(['reason', 'method', 'due', 'amount', 'approval', 'evidence', 'owner'] as Req[]).filter((r) => need.includes(r) || (f[r] ?? '') !== '').concat(need.filter((r) => (f[r] ?? '') === '')).filter((r, i, a) => a.indexOf(r) === i).map((r) => (
          <Field key={r} label={REQ_LABEL[r] + ' *'}>{r === 'due' ? <DateField value={f[r] || null} onChange={(d) => setF({ ...f, [r]: d || '' })} min={todayISO()} /> : <input className="input" type={r === 'amount' ? 'number' : 'text'} value={f[r] ?? ''} onChange={(e) => setF({ ...f, [r]: e.target.value })} />}</Field>))}
          {probe?.message && !need.length ? <div className="text-xs text-red-500">{probe.message}</div> : null}{!need.length && probe?.ok && <div className="text-xs muted">All requirements met.</div>}</div>
      </Modal>
    </div>
  );
}

const SHOW_NS = ['VISIT', 'ROLE', 'DOC', 'RISK', 'FIN'];
/** Visit type, provider roles, the few tags worth showing, and same-encounter claims — kept off the main work screen. */
export function ClaimClassification({ ec, canWork }: { ec: EClaim; canWork: boolean }) {
  const st = useStore(); const c = ec.c; const linked = linkedClaims(c, st.claims); const roles = rolesOf(c);
  const setCustom = (patch: Record<string, any>, msg: string) => st.patchClaims([c.id], { custom: { ...c.custom, ...patch } }, msg);
  const tags = (ec.tags || []).filter((t) => SHOW_NS.includes(t.split(':')[0]));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap"><Tag size={13} className="muted" />{tags.length ? tags.map((t) => <span key={t} className="tag">{t}</span>) : <span className="text-xs muted">No tags</span>}</div>
      <div className="flex items-center gap-2"><span className="text-xs muted w-20">Visit type</span><select className="input !w-auto !py-1 text-xs" disabled={!canWork} value={ec.visit} onChange={(e) => setCustom({ visit_type: e.target.value }, `Visit type → ${e.target.value}`)}>{VISIT_TYPES.map((v) => <option key={v}>{v}</option>)}</select></div>
      <div className="flex items-center gap-2 flex-wrap"><UserCog size={13} className="muted" /><span className="text-xs muted w-[62px]">Roles</span>{roles.map((r, i) => <span key={i} className="tag">{r.role}: {r.provider}</span>)}
        {canWork && <button className="underline text-xs muted" onClick={() => { const role = window.prompt(`Role (${PROVIDER_ROLES.join(', ')})`, 'Assistant Surgeon'); if (!role) return; const pr = window.prompt('Provider name'); if (pr) void setCustom({ roles: [...roles, { role, provider: pr }] }, `Added ${role}: ${pr}`); }}>+ role</button>}</div>
      {linked.length > 0 && <div className="flex items-center gap-2 flex-wrap"><Link2 size={13} className="muted" /><span className="text-xs muted">Same encounter</span>{linked.slice(0, 8).map((l) => <button key={l.id} className="tag font-mono" onClick={() => st.openClaim(l.id)}>{l.claim_no} · ${Math.round(l.balance)}</button>)}</div>}
    </div>
  );
}
