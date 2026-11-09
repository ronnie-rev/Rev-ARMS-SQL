import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, FileText, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { useClaims } from '../hooks';
import { Card, toast } from './ui';
import { buildNarrative } from '../lib/engine/reportnarrative';
import { putInbox } from '../lib/docinbox';
import { todayISO } from '../lib/utils';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** "In plain English": a written A/R summary for the current client scope, ready to paste into an e-mail or open in the Word editor. */
export function ExecSummary() {
  const { recoveries, appeals, inScope, clients, clientScope } = useStore(); const all = useClaims(); const nav = useNavigate();
  const ecs = useMemo(() => all.filter((x) => inScope(x.c.client_id)), [all, inScope]);
  const scope = clientScope.length === 1 ? clients.find((c) => c.id === clientScope[0])?.name : clientScope.length > 1 ? `the ${clientScope.length} selected clients` : undefined;
  const n = useMemo(() => buildNarrative({ ecs, recoveries: recoveries.filter((r) => inScope(r.client_id)), appeals: appeals.filter((a) => inScope(a.client_id)), today: todayISO(), scope }), [ecs, recoveries, appeals, inScope, scope]);
  return (
    <Card title={<span className="flex items-center gap-2"><Sparkles size={15} />Summary in plain English</span>} actions={<><button className="btn btn-sm" onClick={() => { void navigator.clipboard.writeText(n.text); toast.ok('Summary copied'); }}><Copy size={13} />Copy</button><button className="btn btn-sm" onClick={() => { putInbox({ kind: 'word', name: 'ar-summary.docx', html: `<h2>${esc(n.title)}</h2>${n.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}${n.actions.length ? `<h3>Recommended actions</h3><ul>${n.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}` }); nav('/studio'); }}><FileText size={13} />Edit in Studio</button></>}>
      <div className="space-y-2 text-[13.5px] leading-relaxed">{n.paragraphs.map((p, i) => <p key={i}>{p}</p>)}{n.actions.length > 0 && <div><div className="label mb-1">Recommended actions</div><ul className="list-disc ml-5 space-y-0.5">{n.actions.map((a) => <li key={a}>{a}</li>)}</ul></div>}</div>
    </Card>
  );
}
