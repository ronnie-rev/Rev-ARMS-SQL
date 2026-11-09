import { Link } from 'react-router-dom';
import { BookOpen, Keyboard, LifeBuoy, Mail } from 'lucide-react';
import { Card, PageHeader } from '../components/ui';
import { SUPPORT_EMAIL } from '../lib/auth';
import { monitoringLinked } from '../lib/monitor';

const SHORTCUTS: [string, string][] = [['Ctrl/⌘ + K', 'Search claims, jump to pages, ask a question'], ['?', 'Show all keyboard shortcuts'], ['Esc', 'Close dialogs and drawers']];
/** Help & support. Support contact is a PLACEHOLDER until VITE_SUPPORT_EMAIL is set. */
export default function Help() {
  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title="Help & support" sub="Guides, shortcuts and who to contact" />
      <div className="grid sm:grid-cols-2 gap-4">
        <Card title={<span className="flex items-center gap-2"><BookOpen size={15} />Learn the workflow</span>}><p className="text-sm muted">Denial guides, call scripts, appeal templates and the academy are in the Knowledge hub.</p><Link className="btn btn-sm mt-3" to="/knowledge">Open Knowledge hub</Link></Card>
        <Card title={<span className="flex items-center gap-2"><LifeBuoy size={15} />Contact support</span>}>{SUPPORT_EMAIL ? <><p className="text-sm muted">Include the page, what you expected, and the “Ref” code if an error screen appeared. Never include patient names.</p><a className="btn btn-primary btn-sm mt-3" href={`mailto:${SUPPORT_EMAIL}?subject=ClaimsIQ support`}><Mail size={13} />{SUPPORT_EMAIL}</a></> : <p className="text-sm muted">Placeholder — set <code>VITE_SUPPORT_EMAIL</code> in Netlify to show your support address here and on the sign-in page.</p>}</Card>
      </div>
      <Card title={<span className="flex items-center gap-2"><Keyboard size={15} />Keyboard shortcuts</span>}>{SHORTCUTS.map(([k, d]) => <div key={k} className="flex gap-3 py-1 text-sm"><span className="kbd shrink-0">{k}</span><span className="muted">{d}</span></div>)}</Card>
      <Card title="About this build"><div className="text-sm space-y-1"><div>Version <code>{typeof __BUILD__ === 'string' ? __BUILD__.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2/$3/$1') : 'dev'}</code></div><div className="muted">Error reporting: {monitoringLinked ? 'connected' : 'not linked yet (placeholder)'}</div><div className="flex gap-4 text-xs mt-2"><Link className="underline" to="/legal/terms">Terms</Link><Link className="underline" to="/legal/privacy">Privacy</Link><Link className="underline" to="/legal/security">Security &amp; HIPAA</Link></div></div></Card>
    </div>
  );
}
