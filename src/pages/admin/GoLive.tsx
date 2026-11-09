import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Plug } from 'lucide-react';
import { useStore } from '../../store';
import { Card, Chip, toast } from '../../components/ui';
import { hasSupabase } from '../../lib/db/supabase';
import { ALLOW_SIGNUP, MFA_ENABLED, SSO_DOMAIN, SSO_PROVIDER, SUPPORT_EMAIL } from '../../lib/auth';
import { monitoringLinked } from '../../lib/monitor';
import { COMPANY } from '../../lib/legal';

interface Item { id: string; group: string; title: string; how: string; /** true/false when the app can tell by itself */ auto?: boolean | null; /** built and tested, waiting for credentials or a switch */ placeholder?: boolean; env?: string }
/** Everything that must be linked or confirmed before real users sign in. Auto items tick themselves; the rest are confirmed by an administrator. */
export default function GoLive() {
  const { settings, setSetting, mode, clients, profiles, db_ } = useStore() as any; const done: Record<string, boolean> = settings.golive || {};
  const [summaryOk, setSummaryOk] = useState<boolean | null>(null);
  useEffect(() => { void (async () => { try { const r = await (useStore.getState() as any).probeSummary?.(); setSummaryOk(!!r); } catch { setSummaryOk(false); } })(); }, []);
  void db_;
  const live = hasSupabase && mode === 'supabase';
  const items: Item[] = [
    { id: 'sb', group: 'Database & sign-in', title: 'Connected to Supabase', how: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify, then redeploy.', auto: live, env: 'VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY' },
    { id: 'mig', group: 'Database & sign-in', title: 'Migrations 0001–0017 applied', how: 'Run each file in supabase/migrations in order (docs/CENTRAL_RULES.md). 0016 is detected automatically.', auto: live ? summaryOk : null },
    { id: 'signup', group: 'Database & sign-in', title: 'Public sign-up switched off', how: 'Supabase → Authentication → Sign In / Providers → turn off “Allow new users to sign up”. In this app it is off unless VITE_ALLOW_SIGNUP=true.', auto: !ALLOW_SIGNUP ? null : false },
    { id: 'urls', group: 'Database & sign-in', title: 'Redirect URLs set', how: 'Supabase → Authentication → URL Configuration: Site URL = your live URL; add it (and the Netlify preview URL) under Redirect URLs. Reset and invite links depend on this.' },
    { id: 'smtp', group: 'Database & sign-in', title: 'Branded email (SMTP) + templates', how: 'Supabase → Authentication → SMTP Settings (Resend/SendGrid). Edit the Invite and Reset-password templates. Without SMTP, Supabase limits emails to a few per hour.', placeholder: true },
    { id: 'pwd', group: 'Database & sign-in', title: 'Password policy (10+ characters)', how: 'Supabase → Authentication → Policies: minimum length 10 and leaked-password protection. The app enforces the same rule on its own screens.' },
    { id: 'mfa', group: 'Database & sign-in', title: 'Two-step verification (authenticator app)', how: 'Built (sign-in challenge + enrolment on My account). Enable MFA in Supabase → Authentication → Multi-Factor, then set VITE_MFA=on.', placeholder: true, auto: MFA_ENABLED ? true : null, env: 'VITE_MFA=on' },
    { id: 'sso', group: 'Database & sign-in', title: 'Single sign-on', how: 'Built. Configure a provider (Google/Microsoft) or SAML in Supabase, then set VITE_SSO_PROVIDER (e.g. azure) or VITE_SSO_DOMAIN (SAML).', placeholder: true, auto: SSO_PROVIDER || SSO_DOMAIN ? true : null, env: 'VITE_SSO_PROVIDER or VITE_SSO_DOMAIN' },
    { id: 'idle', group: 'Database & sign-in', title: 'Idle sign-out configured', how: 'Admin → Security & privacy → auto sign-out minutes (15 recommended).', auto: Number(settings.security?.idleMinutes || 0) > 0 },
    { id: 'users', group: 'People', title: 'Real users created with correct roles', how: 'Admin → Staff & roles. Users created in Supabase need a profiles row with a role.', auto: live ? profiles.length > 1 : null },
    { id: 'roles', group: 'People', title: 'Role access tested', how: 'Sign in as a Manager and a User; confirm Admin/Control are hidden for the User. Run Setup doctor.' },
    { id: 'client', group: 'Data', title: 'First real client configured', how: 'Admin → Clients & providers (PMS, timely-filing days, supervisor).', auto: live ? clients.length > 0 : null },
    { id: 'limits', group: 'Data', title: 'Payer filing limits verified against contracts', how: 'Admin → Filing limits: starter values are public guidance only. Confirm each payer you work.' },
    { id: 'reimb', group: 'Data', title: 'Reimbursement setup (GCR / fee schedules)', how: 'Admin → Reimbursement for each client, then Recalculate all.' },
    { id: 'demo', group: 'Data', title: 'Demo data removed', how: 'Production should run on Supabase, never on the in-browser demo store.', auto: live },
    { id: 'email', group: 'Integrations', title: 'Scheduled report & client emails', how: 'Netlify env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, REPORT_FROM (verified sender). Keep REPORTS_DRY_RUN=1 until a test email looks right.', placeholder: true, env: 'RESEND_API_KEY, REPORT_FROM, SUPABASE_SERVICE_ROLE_KEY' },
    { id: 'mon', group: 'Integrations', title: 'Error monitoring', how: 'Point VITE_ERROR_WEBHOOK at your logging endpoint, or replace reportError() in src/lib/monitor.ts with the vendor SDK. No PHI is sent.', placeholder: true, auto: monitoringLinked ? true : null, env: 'VITE_ERROR_WEBHOOK' },
    { id: 'clearing', group: 'Integrations', title: 'Clearinghouse / eligibility / payer-portal APIs', how: 'Not connected. ERA 835 files are imported manually today; an API link is a separate project.', placeholder: true },
    { id: 'support', group: 'Content & compliance', title: 'Support contact shown to users', how: 'Set VITE_SUPPORT_EMAIL in Netlify.', auto: !!SUPPORT_EMAIL, env: 'VITE_SUPPORT_EMAIL' },
    { id: 'legal', group: 'Content & compliance', title: 'Terms, Privacy and Security text approved', how: 'Replace the [BRACKETED] text in src/lib/legal.ts and have counsel review.', auto: COMPANY.name.includes('[') ? null : true },
    { id: 'baa', group: 'Content & compliance', title: 'Business associate agreements signed', how: 'Your organisation with each client, and with Supabase, Netlify and your email provider (HIPAA-eligible plans).' },
    { id: 'brand', group: 'Content & compliance', title: 'Branding set', how: 'Admin → Branding & workspace (name, accent colour).', auto: !!settings.branding?.appName },
    { id: 'bak', group: 'Operations', title: 'Backups / point-in-time recovery', how: 'Supabase → Database → Backups. Enable PITR on a paid plan before real data.' },
    { id: 'domain', group: 'Operations', title: 'Custom domain with HTTPS', how: 'Netlify → Domain management → add domain (HTTPS is automatic).', auto: !/netlify\.app$|localhost/.test(location.hostname) },
  ];
  const isDone = (i: Item) => i.auto === true || !!done[i.id]; const ok = items.filter(isDone).length; const groups = [...new Set(items.map((i) => i.group))];
  const toggle = async (id: string) => { await setSetting('golive', { ...done, [id]: !done[id] }); toast.ok('Saved'); };
  return (
    <div className="space-y-4">
      <Card title="Go-live checklist" actions={<Chip color={ok === items.length ? '#22c55e' : '#f59e0b'}>{ok} of {items.length} ready</Chip>}>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}><div className="h-full" style={{ width: `${(ok / items.length) * 100}%`, background: 'rgb(var(--b500))' }} /></div>
        <p className="text-xs muted mt-2">Items marked <b>Built — needs linking</b> are fully coded and tested; they switch on when you add the credentials listed. Automatic items tick themselves; confirm the rest by hand.</p></Card>
      {groups.map((g) => <Card key={g} title={g} pad={false}><div className="divide-y hair">{items.filter((i) => i.group === g).map((i) => { const d = isDone(i); return (
        <div key={i.id} className="flex gap-3 px-5 py-3"><button className="mt-0.5 shrink-0" disabled={i.auto === true} onClick={() => toggle(i.id)} aria-label={d ? 'Mark not done' : 'Mark done'}>{d ? <CheckCircle2 size={18} className="text-green-500" /> : <Circle size={18} className="muted" />}</button>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap text-[13.5px] font-medium">{i.title}{i.placeholder && !d && <Chip color="#f59e0b"><Plug size={10} />Built — needs linking</Chip>}{i.auto === true && <Chip color="#22c55e">Detected</Chip>}</div><div className="text-xs muted mt-0.5">{i.how}</div>{i.env && <div className="text-[11px] mt-1"><span className="muted">Env:</span> <code>{i.env}</code></div>}</div></div>); })}</div></Card>)}
    </div>
  );
}
