import { useMemo, useState } from 'react';
import { Eye, MailPlus, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { Card, Chip, Empty, Field, Modal, toast, useConfirm } from '../../components/ui';
import { Multi } from '../../components/Multi';
import { PORTAL_DEFAULTS, portalPerms, practiceIds, type PortalPerms, type Profile } from '../../lib/types';
import { uid } from '../../lib/utils';

const PERMS: { k: keyof PortalPerms; label: string; hint: string }[] = [
  { k: 'show_patient', label: 'See patient names', hint: 'Off = initials only (PHI-minimised)' },
  { k: 'can_message', label: 'Message the AR team', hint: 'Raise questions, send documents' },
  { k: 'can_approve', label: 'Approve adjustments', hint: 'Answer write-off / adjustment requests' },
  { k: 'can_download', label: 'Download claim lists (CSV)', hint: 'Export from the portal' },
];
export const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e.trim());

function PermToggles({ value, onChange }: { value: PortalPerms; onChange: (v: PortalPerms) => void }) {
  const eff = { ...PORTAL_DEFAULTS, ...value };
  return <div className="grid sm:grid-cols-2 gap-2">{PERMS.map((p) => <label key={p.k} className="flex items-start gap-2.5 rounded-2xl border hair px-3 py-2 cursor-pointer hover:bg-[var(--panel2)]"><input type="checkbox" className="mt-1" checked={!!eff[p.k]} onChange={(e) => onChange({ ...eff, [p.k]: e.target.checked })} /><span><span className="text-[13px] font-medium block">{p.label}</span><span className="text-[11.5px] muted">{p.hint}</span></span></label>)}</div>;
}

/** Client logins: which practices each person sees (read-only), and what they may do inside the portal. */
export function ClientAccess() {
  const st = useStore(); const nav = useNavigate(); const { confirm, node } = useConfirm();
  const clients = st.clients.filter((c) => c.active); const users = st.profiles.filter((p) => p.role === 'client'); const invites = st.invites.filter((i) => i.role === 'client');
  const [add, setAdd] = useState(false); const [f, setF] = useState({ full_name: '', email: '', ids: [] as string[], portal: {} as PortalPerms });
  const opts = useMemo(() => clients.map((c) => ({ v: c.id, l: c.name })), [clients]);
  const emailTaken = (e: string) => st.profiles.some((p) => p.email.toLowerCase() === e.trim().toLowerCase()) || st.invites.some((i) => i.email.toLowerCase() === e.trim().toLowerCase());
  const errors = [!f.full_name.trim() && 'Name is required', !validEmail(f.email) && 'Enter a valid email', validEmail(f.email) && emailTaken(f.email) && 'That email already has an account or invite', !f.ids.length && 'Pick at least one practice'].filter(Boolean) as string[];
  const upd = (p: Profile, patch: Partial<Profile>) => st.save('profiles', [{ ...p, ...patch }]);
  const setPractices = (p: Profile, ids: string[]) => upd(p, { client_ids: ids, client_id: ids[0] ?? null });
  const create = async () => {
    if (errors.length) return toast.err(errors[0]);
    if (st.mode === 'local') await st.save('profiles', [{ id: uid(), email: f.email.trim().toLowerCase(), full_name: f.full_name.trim(), emp_code: null, role: 'client', supervisor_id: null, daily_target: 0, active: true, client_id: f.ids[0], client_ids: f.ids, portal: { ...PORTAL_DEFAULTS, ...f.portal } } as Profile]);
    else await st.save('invites', [{ email: f.email.trim().toLowerCase(), role: 'client', client_id: f.ids[0], client_ids: f.ids, portal: { ...PORTAL_DEFAULTS, ...f.portal }, full_name: f.full_name.trim() } as any]);
    toast.ok(st.mode === 'local' ? 'Client user created' : 'Invite saved — ask them to sign up with that email'); setAdd(false); setF({ full_name: '', email: '', ids: [], portal: {} });
  };
  return (
    <div className="space-y-4">
      <Card title="Client users" actions={<button className="btn btn-primary btn-sm" onClick={() => setAdd(true)}><Plus size={13} />Add client user</button>}>
        <p className="text-[12.5px] muted mb-4 flex gap-2"><ShieldCheck size={15} className="shrink-0 mt-0.5" />Client users are <b>read-only</b>: they can only see the practices you assign (enforced in the database by row-level security). Messaging, approvals, patient names and downloads are switched per person below.</p>
        {users.length === 0 && invites.length === 0 ? <Empty title="No client logins yet" sub="Add one to give a practice its own dashboard." /> : <div className="space-y-3">
          {users.map((p) => { const ids = practiceIds(p); const perms = portalPerms(p); return (
            <div key={p.id} className="rounded-2xl border hair p-4"><div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><div className="font-semibold">{p.full_name}{!p.active && <span className="ml-2 tag">disabled</span>}</div><div className="text-[12px] muted">{p.email}</div></div>
              <div className="w-64"><Multi label="Practices (view-only)" options={opts} value={ids} onChange={(v) => setPractices(p, v)} /></div>
              <button className="btn btn-sm" disabled={!ids.length} onClick={() => nav(`/portal?as=${p.id}`)}><Eye size={13} />Preview portal</button>
              <label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={p.active} onChange={(e) => upd(p, { active: e.target.checked })} />Active</label></div>
              {ids.length === 0 && <div className="mt-2 text-[12px] pill-bad rounded-xl px-3 py-1.5">No practice assigned — this user will see an empty portal.</div>}
              <div className="mt-3"><PermToggles value={perms} onChange={(v) => upd(p, { portal: v })} /></div></div>); })}
          {invites.map((i) => <div key={i.email} className="rounded-2xl border hair border-dashed p-4 flex flex-wrap items-center gap-3"><MailPlus size={16} className="muted" /><div className="flex-1"><div className="font-medium">{i.full_name || i.email} <Chip color="#06b6d4">invited</Chip></div><div className="text-[12px] muted">{i.email} · {practiceIds(i).map((id) => clients.find((c) => c.id === id)?.name).filter(Boolean).join(', ') || '—'}</div></div><button className="btn btn-ghost btn-sm" onClick={async () => (await confirm(`Cancel the invite for ${i.email}?`)) && st.del('invites', [i.email])}><Trash2 size={13} /></button></div>)}
        </div>}
      </Card>
      <Modal open={add} onClose={() => setAdd(false)} title="Add client user" wide footer={<><button className="btn" onClick={() => setAdd(false)}>Cancel</button><button className="btn btn-primary" disabled={!!errors.length} onClick={create}>{st.mode === 'local' ? 'Create user' : 'Save invite'}</button></>}>
        <div className="space-y-4"><div className="grid sm:grid-cols-2 gap-3"><Field label="Full name"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoFocus /></Field><Field label="Email (they sign up with this)"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field></div>
          <div className="w-72"><Multi label="Practices they can see (view-only)" options={opts} value={f.ids} onChange={(v) => setF({ ...f, ids: v })} /></div>
          <div><div className="label">Permissions</div><PermToggles value={f.portal} onChange={(v) => setF({ ...f, portal: v })} /></div>
          {errors.length > 0 && (f.full_name || f.email || f.ids.length > 0) && <ul className="text-[12px] text-red-500 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}</div>
      </Modal>{node}
    </div>
  );
}
