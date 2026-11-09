import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useStore } from '../store';
import { hasSupabase } from '../lib/db/supabase';
import { ALLOW_SIGNUP, MFA_ENABLED, SSO_DOMAIN, SSO_PROVIDER, SUPPORT_EMAIL, authApi, authMessage, passwordStrength } from '../lib/auth';
import { ROLE_LABEL } from '../lib/types';
import { Avatar } from '../components/ui';
import { BrandLockup } from '../components/Brand';
import { BRAND } from '../lib/brand';
import { supabase } from '../lib/db/supabase';

type Screen = 'in' | 'up' | 'forgot' | 'sent' | 'reset' | 'invite' | 'mfa';
const SCREENS: { id: Screen; label: string }[] = [{ id: 'in', label: 'Sign in' }, { id: 'forgot', label: 'Forgot password' }, { id: 'sent', label: 'Reset email sent' }, { id: 'reset', label: 'Set new password' }, { id: 'invite', label: 'Accept invite' }, { id: 'mfa', label: 'Two-step code' }, { id: 'up', label: 'Create account' }];

function Strength({ pw, hints }: { pw: string; hints: string[] }) {
  const s = useMemo(() => passwordStrength(pw, hints), [pw, hints]); if (!pw) return null; const col = ['#e5484d', '#e5484d', '#f59e0b', '#84cc16', '#22c55e'][s.score];
  return <div aria-live="polite"><div className="flex gap-1 mt-1.5">{[0, 1, 2, 3].map((i) => <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i < s.score ? col : 'var(--line)' }} />)}</div><div className="text-[11px] mt-1" style={{ color: col }}>{s.label}{s.missing.length ? ` — needs ${s.missing.join('; ')}` : ''}</div></div>;
}
function PasswordInput({ value, onChange, label = 'Password', autoComplete, id }: { value: string; onChange: (v: string) => void; label?: string; autoComplete: string; id: string }) {
  const [show, setShow] = useState(false); const [caps, setCaps] = useState(false);
  return <div><label className="label" htmlFor={id}>{label}</label><div className="relative"><Lock size={14} className="absolute left-3 top-[11px] muted" /><input id={id} className="input !pl-9 !pr-10" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') ?? false)} /><button type="button" className="absolute right-2 top-1.5 btn btn-ghost btn-sm !px-1.5" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>{caps && <div className="text-[11px] text-amber-500 mt-1">Caps Lock is on</div>}</div>;
}

export default function Login() {
  const { profiles, login, needsProfile, logout, mode, authFlow } = useStore();
  const qs = new URLSearchParams(location.search); const previewParam = qs.get('auth') as Screen | null; const preview = mode === 'local' && !!previewParam && SCREENS.some((s) => s.id === previewParam);
  const [screen, setScreen] = useState<Screen>(preview ? previewParam! : authFlow || 'in');
  useEffect(() => { if (authFlow) setScreen(authFlow); }, [authFlow]);
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [name, setName] = useState(''); const [code, setCode] = useState('');
  const [err, setErr] = useState(''); const [info, setInfo] = useState(''); const [busy, setBusy] = useState(false); const [factor, setFactor] = useState<string | null>(null);
  const hints = [name, email.split('@')[0]].filter(Boolean); const strong = passwordStrength(pw, hints);
  const fail = (e: unknown) => { setErr(authMessage(e)); setBusy(false); };
  const run = (fn: () => Promise<void>) => async (e: React.FormEvent) => { e.preventDefault(); setErr(''); setInfo(''); if (preview || mode === 'local') { setInfo('Preview only — nothing was sent. This works against Supabase once keys are configured.'); if (screen === 'forgot') setScreen('sent'); return; } setBusy(true); try { await fn(); } catch (x) { fail(x); } finally { setBusy(false); } };

  const signIn = run(async () => { await authApi.signIn(email, pw); if (MFA_ENABLED && (await authApi.mfa.needsChallenge())) { const f = (await authApi.mfa.list()).find((x) => x.status === 'verified'); if (f) { setFactor(f.id); setScreen('mfa'); return; } } location.reload(); });
  const signUp = run(async () => { if (!strong.ok) throw new Error('Password does not meet the policy'); const r = await supabase!.auth.signUp({ email, password: pw, options: { data: { full_name: name } } }); if (r.error) throw r.error; if (!r.data.session) { setInfo('Check your email to confirm your account, then sign in.'); setScreen('in'); } else location.reload(); });
  const forgot = run(async () => { await authApi.requestReset(email); setScreen('sent'); });
  const setNew = run(async () => { if (pw !== pw2) throw new Error('Passwords do not match'); if (!strong.ok) throw new Error('Password does not meet the policy'); await authApi.setPassword(pw); history.replaceState({}, '', '/'); location.reload(); });
  const verify = run(async () => { await authApi.mfa.verify(factor!, code.trim()); location.reload(); });
  const sso = async () => { setErr(''); if (preview || mode === 'local') return setInfo('Preview only — single sign-on activates once a provider is configured.'); try { await authApi.sso(); } catch (x) { fail(x); } };
  const ssoOn = !!(SSO_PROVIDER || SSO_DOMAIN);

  const persona = mode === 'local' && !preview;
  return (
    <div className="h-full grid lg:grid-cols-[1.05fr_1fr]">
      <div className="hidden lg:flex relative flex-col justify-between p-12 overflow-hidden" style={{ background: 'linear-gradient(160deg, rgb(var(--b500) / .10), transparent 55%), var(--panel2)', borderRight: '1px solid var(--line)' }}>
        <BrandLockup size={54} />
        <div className="max-w-lg">
          <h1 className="display text-[44px] leading-[1.05]">{BRAND.tagline}</h1>
          <p className="mt-4 text-[15px] muted leading-relaxed">One workspace for your A/R team and your clients: identity-safe imports, a guided work loop, and numbers you can defend.</p>
          <ul className="mt-8 space-y-2.5 text-sm">{['Claims keep one identity across every weekly file', 'Filing deadlines and appeals tracked to the day', 'Role-based access with a complete audit trail'].map((t) => <li key={t} className="flex items-center gap-2.5"><ShieldCheck size={16} className="text-brand-500 shrink-0" />{t}</li>)}</ul>
        </div>
        <div className="text-[11px] muted">{BRAND.full} · {BRAND.byline}</div>
      </div>
      <div className="flex flex-col p-6 overflow-auto">
        <main className="flex-1 flex items-center justify-center"><div className="w-full max-w-sm">
          <div className="lg:hidden mb-8"><BrandLockup size={28} /></div>
          {preview && <div className="mb-4 rounded-lg px-3 py-2 text-[12px]" style={{ background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.4)' }}><b>Design preview</b> — forms don’t send anything. <a className="underline" href="/">Back to demo sign-in</a></div>}
          {persona ? (
            <>
              <h2 className="display text-[26px] mb-1">Choose a demo user</h2>
              <p className="text-xs muted mb-4">Demo mode — data lives in this browser. Pick a persona to explore each role.</p>
              <div className="grid grid-cols-2 gap-2 max-h-[52vh] overflow-auto pr-1">{profiles.map((p) => <button key={p.id} onClick={() => login(p.id)} className="flex items-center gap-2.5 p-2 rounded-lg border hair bg-[var(--panel)] hover:border-brand-400 hover:shadow-soft transition text-left min-w-0"><Avatar name={p.full_name} size={30} /><div className="flex-1 min-w-0"><div className="text-[13px] font-semibold truncate">{p.full_name}</div><div className="text-[11px] muted truncate">{ROLE_LABEL[p.role]}</div></div></button>)}</div>
              <details className="mt-5 text-xs"><summary className="cursor-pointer muted">Preview the real sign-in screens</summary><div className="flex flex-wrap gap-1.5 mt-2">{SCREENS.map((s) => <a key={s.id} className="btn btn-sm" href={`/?auth=${s.id}`}>{s.label}</a>)}</div></details>
            </>
          ) : needsProfile && !authFlow && !preview ? (
            <div><h2 className="display text-[26px] mb-2">Account not set up yet</h2><p className="text-sm muted">You’re signed in, but your profile hasn’t been created. Ask your administrator to add you{SUPPORT_EMAIL ? <> or write to <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></> : ''}.</p><button className="btn mt-4" onClick={() => logout()}>Sign out</button></div>
          ) : screen === 'mfa' ? (
            <form onSubmit={verify} className="space-y-4"><h2 className="display text-[26px]">Two-step verification</h2><p className="text-sm muted">Enter the 6-digit code from your authenticator app.</p>
              <div><label className="label" htmlFor="code">Code</label><div className="relative"><KeyRound size={14} className="absolute left-3 top-[11px] muted" /><input id="code" className="input !pl-9 tracking-[.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus /></div></div>
              <Msg err={err} info={info} /><button className="btn btn-primary w-full justify-center" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify'}</button><button type="button" className="text-xs muted underline w-full" onClick={() => logout()}>Use a different account</button></form>
          ) : screen === 'forgot' ? (
            <form onSubmit={forgot} className="space-y-4"><h2 className="display text-[26px]">Reset your password</h2><p className="text-sm muted">Enter your work email and we’ll send a link to choose a new password.</p>
              <EmailField id="email" value={email} onChange={setEmail} /><Msg err={err} info={info} /><button className="btn btn-primary w-full justify-center" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button><button type="button" className="text-xs muted underline w-full" onClick={() => setScreen('in')}>Back to sign in</button></form>
          ) : screen === 'sent' ? (
            <div className="space-y-4"><div className="w-11 h-11 rounded-full grid place-items-center" style={{ background: 'rgb(var(--b500) / .12)' }}><Mail size={20} className="text-brand-500" /></div><h2 className="display text-[26px]">Check your email</h2><p className="text-sm muted">If an account exists for <b>{email || 'that address'}</b>, a reset link is on its way. It expires in 1 hour. Not there? Check spam, or try again.</p><button className="btn w-full justify-center" onClick={() => setScreen('forgot')}>Send again</button><button className="text-xs muted underline w-full" onClick={() => setScreen('in')}>Back to sign in</button></div>
          ) : screen === 'reset' || screen === 'invite' ? (
            <form onSubmit={setNew} className="space-y-4"><h2 className="display text-[26px]">{screen === 'invite' ? 'Welcome — set your password' : 'Choose a new password'}</h2><p className="text-sm muted">{screen === 'invite' ? 'You’ve been invited to Revantage ClaimsIQ. Create a password to finish setting up your account.' : 'Use at least 10 characters with a mix of letters, numbers and symbols.'}</p>
              <div><PasswordInput id="np" label="New password" value={pw} onChange={setPw} autoComplete="new-password" /><Strength pw={pw} hints={hints} /></div><PasswordInput id="np2" label="Confirm password" value={pw2} onChange={setPw2} autoComplete="new-password" />{pw2 && pw !== pw2 && <div className="text-[11px] text-red-500 -mt-2">Passwords don’t match</div>}
              <Msg err={err} info={info} /><button className="btn btn-primary w-full justify-center" disabled={busy || !strong.ok || pw !== pw2}>{busy ? 'Saving…' : screen === 'invite' ? 'Create password & continue' : 'Update password'}</button></form>
          ) : screen === 'up' ? (
            <form onSubmit={signUp} className="space-y-4"><h2 className="display text-[26px]">Create account</h2><p className="text-sm muted">Accounts are normally created by your administrator.</p>
              <div><label className="label" htmlFor="nm">Full name</label><input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></div><EmailField id="email" value={email} onChange={setEmail} />
              <div><PasswordInput id="pw" value={pw} onChange={setPw} autoComplete="new-password" /><Strength pw={pw} hints={hints} /></div><Msg err={err} info={info} />
              <button className="btn btn-primary w-full justify-center" disabled={busy || !strong.ok}>{busy ? 'Creating…' : 'Create account'}</button><button type="button" className="text-xs muted underline w-full" onClick={() => setScreen('in')}>Have an account? Sign in</button></form>
          ) : (
            <form onSubmit={signIn} className="space-y-4"><div><h2 className="display text-[26px]">Sign in</h2><p className="text-sm muted mt-1">Welcome to {BRAND.full}. Enter your details to continue.</p></div>
              <EmailField id="email" value={email} onChange={setEmail} /><PasswordInput id="pw" value={pw} onChange={setPw} autoComplete="current-password" />
              <div className="flex items-center justify-between text-xs"><label className="flex items-center gap-1.5 muted"><input type="checkbox" defaultChecked /> Keep me signed in</label><button type="button" className="underline" onClick={() => { setErr(''); setInfo(''); setScreen('forgot'); }}>Forgot password?</button></div>
              <Msg err={err} info={info} /><button className="btn btn-primary w-full justify-center" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
              {(ssoOn || preview) && <><div className="flex items-center gap-3 text-[11px] muted"><span className="flex-1 border-t hair" />or<span className="flex-1 border-t hair" /></div><button type="button" className="btn w-full justify-center" onClick={sso}><ShieldCheck size={14} />Continue with single sign-on</button></>}
              {(ALLOW_SIGNUP || preview) && <button type="button" className="text-xs muted underline w-full" onClick={() => setScreen('up')}>New here? Create an account</button>}</form>
          )}
          {!hasSupabase && !preview && !persona && <p className="text-[11px] muted mt-6">Sign-in isn’t configured for this environment.</p>}
        </div></main>
        <footer className="text-[11px] muted flex flex-wrap gap-x-4 gap-y-1 justify-center pt-6"><a className="hover:underline" href="/legal/terms">Terms</a><a className="hover:underline" href="/legal/privacy">Privacy</a><a className="hover:underline" href="/legal/security">Security &amp; HIPAA</a>{SUPPORT_EMAIL ? <a className="hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>Support</a> : <span>Support: add VITE_SUPPORT_EMAIL</span>}</footer>
      </div>
    </div>
  );
}
function EmailField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) { return <div><label className="label" htmlFor={id}>Work email</label><div className="relative"><Mail size={14} className="absolute left-3 top-[11px] muted" /><input id={id} className="input !pl-9" type="email" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="username" required /></div></div>; }
function Msg({ err, info }: { err: string; info: string }) { return <>{err && <p role="alert" className="text-sm text-red-500">{err}</p>}{info && <p role="status" className="text-sm text-green-600 dark:text-green-400">{info}</p>}</>; }
