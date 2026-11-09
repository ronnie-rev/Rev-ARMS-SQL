import { useEffect, useState } from 'react';
import { KeyRound, LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, Card, Chip, Field, PageHeader, toast, useConfirm } from '../components/ui';
import { MFA_ENABLED, authApi, authMessage, passwordStrength } from '../lib/auth';
import { ROLE_LABEL } from '../lib/types';
import { hasSupabase } from '../lib/db/supabase';

/** My account: profile, password, two-step verification, sessions. Password / MFA / session actions need Supabase (demo mode shows them as previews). */
export default function Account() {
  const { me, save, logout, dark, toggleDark, mode } = useStore(); const u = me(); const live = hasSupabase && mode === 'supabase'; const { confirm, node } = useConfirm();
  const [name, setName] = useState(u?.full_name || ''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false);
  const [factors, setFactors] = useState<{ id: string; status: string; friendly_name?: string }[]>([]); const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null); const [code, setCode] = useState('');
  const strong = passwordStrength(pw, [u?.full_name || '', (u?.email || '').split('@')[0]]);
  const mfaOn = MFA_ENABLED && live; useEffect(() => { if (mfaOn) void authApi.mfa.list().then((l) => setFactors(l as any)).catch(() => {}); }, [mfaOn]);
  if (!u) return null;
  const wrap = async (fn: () => Promise<void>, ok: string) => { setBusy(true); try { await fn(); toast.ok(ok); } catch (e) { toast.err(authMessage(e)); } finally { setBusy(false); } };
  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title="My account" sub="Profile, password and sign-in security" />
      <Card title="Profile"><div className="flex items-center gap-4 mb-4"><Avatar name={u.full_name} size={48} /><div><div className="font-semibold">{u.full_name}</div><div className="text-xs muted">{u.email} · {ROLE_LABEL[u.role]}</div></div></div>
        <div className="grid sm:grid-cols-2 gap-3 items-end"><Field label="Full name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field><div><button className="btn btn-primary" disabled={!name.trim() || name === u.full_name} onClick={async () => { await save('profiles', [{ ...u, full_name: name.trim() }]); toast.ok('Profile updated'); }}>Save name</button></div></div>
        <p className="text-[11px] muted mt-2">Email, role and supervisor are managed by your administrator.</p></Card>
      <Card title="Password"><div className="grid sm:grid-cols-2 gap-3">
        <Field label="New password"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field><Field label="Confirm new password"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field></div>
        {pw && <div className="text-[11px] mt-1.5" style={{ color: strong.ok ? '#22c55e' : '#e5484d' }}>{strong.label}{strong.missing.length ? ` — needs ${strong.missing.join('; ')}` : ''}</div>}
        <button className="btn btn-primary mt-3" disabled={busy || !strong.ok || pw !== pw2 || !live} onClick={() => wrap(async () => { await authApi.setPassword(pw); setPw(''); setPw2(''); }, 'Password updated')}>Update password</button>
        {!live && <span className="text-[11px] muted ml-3">Available once sign-in is connected to Supabase.</span>}</Card>
      <Card title={<span className="flex items-center gap-2"><ShieldCheck size={15} />Two-step verification {mfaOn ? factors.some((f) => f.status === 'verified') ? <Chip color="#22c55e">On</Chip> : <Chip color="#94a3b8">Off</Chip> : <Chip color="#f59e0b">Not activated</Chip>}</span>}>
        {!mfaOn ? <p className="text-sm muted">Authenticator-app codes add a second step at sign-in. This is built and waiting to be switched on by your administrator (set <code>VITE_MFA=on</code> and enable MFA in Supabase).</p> : <>
          {factors.filter((f) => f.status === 'verified').map((f) => <div key={f.id} className="flex items-center gap-2 text-sm py-1"><KeyRound size={14} />{f.friendly_name || 'Authenticator app'}<button className="btn btn-sm btn-ghost ml-auto" onClick={async () => { if (await confirm('Remove this authenticator? You will no longer be asked for a code.')) wrap(async () => { await authApi.mfa.remove(f.id); setFactors(factors.filter((x) => x.id !== f.id)); }, 'Removed'); }}><Trash2 size={13} /></button></div>)}
          {enroll ? <div className="mt-2 space-y-2"><img src={enroll.qr} alt="Scan with your authenticator app" className="w-40 h-40 bg-white rounded-lg p-1" /><p className="text-xs muted">Scan the code, or enter this key: <code>{enroll.secret}</code></p><div className="flex gap-2 max-w-xs"><input className="input tracking-[.3em]" inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /><button className="btn btn-primary" disabled={code.length !== 6 || busy} onClick={() => wrap(async () => { await authApi.mfa.verify(enroll.id, code); setEnroll(null); setCode(''); setFactors((await authApi.mfa.list()) as any); }, 'Two-step verification is on')}>Verify</button></div></div>
            : !factors.some((f) => f.status === 'verified') && <button className="btn btn-primary" disabled={busy} onClick={() => wrap(async () => { const d = await authApi.mfa.enroll(); setEnroll({ id: d.id, qr: d.totp.qr_code, secret: d.totp.secret }); }, 'Scan the code to continue')}>Set up authenticator app</button>}</>}</Card>
      <Card title="Sessions & preferences"><div className="flex flex-wrap gap-2"><button className="btn" onClick={() => logout()}><LogOut size={14} />Sign out</button><button className="btn" disabled={!live || busy} onClick={async () => { if (await confirm('Sign out of every device, including this one?')) wrap(async () => { await authApi.signOutEverywhere(); location.reload(); }, 'Signed out everywhere'); }}>Sign out on all devices</button><button className="btn" onClick={toggleDark}>{dark ? 'Switch to light theme' : 'Switch to dark theme'}</button></div>
        <p className="text-[11px] muted mt-3">Sessions end automatically after the inactivity period your administrator sets.</p></Card>
      {node}
    </div>
  );
}
