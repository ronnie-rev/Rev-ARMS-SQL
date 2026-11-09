import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Pencil } from 'lucide-react';
import { useStore } from '../../store';
import { Card, Chip, Field, toast } from '../../components/ui';
import { SopLibrary } from '../../components/SopLibrary';
import { Body, LiveKpis } from './articles';
import type { Guide, Kb } from '../../lib/kb';
import type { Article } from '../../lib/rcmcontent';

interface Item { id: string; title: string; sub: string; kind: 'article' | 'guide' | 'tool' }
const SECTIONS: { id: string; label: string; items: string[] }[] = [
  { id: 'claim', label: 'Work a claim', items: ['a:sop-ar-touch', 'a:chk-new-denial', 'g:Reading an ERA (835)', 'g:Payment posting & reconciliation', 'g:AR prioritization & worklists', 'a:chk-handoff'] },
  { id: 'call', label: 'Call the payer', items: ['t:call', 'a:sop-call', 'g:Calling payers: script & HIPAA', 'a:esc-ladder', 'a:esc-timely'] },
  { id: 'appeal', label: 'Appeals & corrections', items: ['a:sop-appeal', 'g:Appeals that win', 't:letters', 'g:Corrected claims, reopenings & voids'] },
  { id: 'money', label: 'Money & compliance', items: ['a:sop-adjust', 'g:Credit balances & refunds', 'g:Patient balances & collections', 'g:Compliance basics for AR'] },
  { id: 'prevent', label: 'Prevent denials', items: ['g:Eligibility & benefits verification', 'g:Prior authorization workflow', 'g:Credentialing & enrollment', 'g:Denial prevention program', 'g:Root cause analysis (RCA) for denials', 't:prevent', 'a:cc-denial-prevent'] },
  { id: 'clients', label: 'Clients & reporting', items: ['t:sops', 'a:chk-client-onboard', 'a:cc-weekly'] },
  { id: 'targets', label: 'Targets', items: ['a:kpi-benchmarks', 'a:kpi-productivity'] },
];
const TOOLS: Record<string, { title: string; sub: string }> = { call: { title: 'Call script builder', sub: 'Tool' }, letters: { title: 'Appeal paragraph builder', sub: 'Tool' }, prevent: { title: 'Prevention checklist by stage', sub: 'Reference' }, sops: { title: 'Client rules (SOPs)', sub: 'Your clients' } };

function GuideView({ g }: { g: Guide }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  return (
    <div className="space-y-4">
      <div><h2 className="text-[18px] font-semibold">{g.t}</h2><p className="text-[13.5px] muted mt-1">{g.why}</p></div>
      <div><div className="label">Steps</div><ol className="space-y-1.5">{g.steps.map((x, i) => <li key={i} className="flex gap-2 text-[13.5px]"><b className="text-brand-400 w-5 shrink-0">{i + 1}.</b><span>{x}</span></li>)}</ol></div>
      {g.checklist && g.checklist.length > 0 && <div><div className="label">Check before you finish</div><div className="space-y-1">{g.checklist.map((x) => <label key={x} className="flex gap-2 items-start text-[13px]"><input type="checkbox" className="mt-0.5" checked={!!done[x]} onChange={(e) => setDone({ ...done, [x]: e.target.checked })} /><span style={{ textDecoration: done[x] ? 'line-through' : undefined, opacity: done[x] ? 0.6 : 1 }}>{x}</span></label>)}</div></div>}
      {g.pitfalls && g.pitfalls.length > 0 && <div className="panel2 p-3 border-l-4" style={{ borderLeftColor: '#d97706' }}><div className="label !mb-1">Common mistakes</div><ul className="list-disc pl-5 space-y-1 text-[13px]">{g.pitfalls.map((x) => <li key={x}>{x}</li>)}</ul></div>}
    </div>
  );
}

function CallScript({ kb }: { kb: Kb }) {
  const [code, setCode] = useState(''); const s = kb.SCEN.find((x) => x.code === code); const cat = s ? kb.CAT_DEFAULT[s.cat] : null;
  const steps = [{ h: '1 · Open the call', l: kb.CALL_BASE.slice(0, 5) }, { h: `2 · Ask about the claim${s ? ` (${s.code})` : ''}`, l: s ? [...s.ask, ...(cat?.ask || [])] : ['Confirm the claim status, ICN, received and processed dates, and the billed lines.', 'Read the adjustment group, CARC and every RARC exactly as the payer shows them.', 'Ask what specifically is needed to get this paid — and by when.'] }, { h: '3 · Close the call', l: ['Repeat back what will happen and by what date.', 'Get the call reference number, the rep’s name and the turnaround time.', 'Ask for the escalation contact if it is not done by then.', 'Write the note while you are still on the line — who, when, reference #, outcome, next date.'] }];
  const text = steps.map((x) => `${x.h}\n${x.l.map((i) => '• ' + i).join('\n')}`).join('\n\n');
  return (
    <div className="space-y-3">
      <div><h2 className="text-[18px] font-semibold">Call script builder</h2><p className="text-[13px] muted">Pick the denial you are calling about and get the exact questions to ask. Keep HIPAA in mind: verify the caller and give only the minimum necessary.</p></div>
      <Field label="Calling about"><select className="input max-w-md" value={code} onChange={(e) => setCode(e.target.value)}><option value="">A general claim status call</option>{kb.SCEN.map((x) => <option key={x.code} value={x.code}>{x.code} — {x.t}</option>)}</select></Field>
      {steps.map((x) => <Card key={x.h} title={x.h}><ul className="list-disc pl-5 space-y-1 text-[13.5px]">{x.l.map((i) => <li key={i}>{i}</li>)}</ul></Card>)}
      <button className="btn btn-sm" onClick={() => { void navigator.clipboard.writeText(text); toast.ok('Script copied'); }}><Copy size={12} />Copy the whole script</button>
    </div>
  );
}

function Letters({ kb }: { kb: Kb }) {
  const types = Object.keys(kb.APPEALS); const [t, setT] = useState(types[0]); const [f, setF] = useState<Record<string, string>>({});
  const vars = useMemo(() => [...new Set([...kb.APPEALS[t].matchAll(/\{(\w+)\}/g)].map((m) => m[1]))], [kb, t]); const out = kb.APPEALS[t].replace(/\{(\w+)\}/g, (_, k) => f[k] || `[${k}]`);
  return (
    <div className="space-y-3"><div><h2 className="text-[18px] font-semibold">Appeal paragraph builder</h2><p className="text-[13px] muted">A short, reusable argument for the most common appeal types. For a full letter with your letterhead, claim facts and enclosures use <b>Appeals → Create appeal</b>.</p></div>
      <div className="grid lg:grid-cols-2 gap-4"><Card title="Fill in"><Field label="Appeal type"><select className="input" value={t} onChange={(e) => setT(e.target.value)}>{types.map((x) => <option key={x}>{x}</option>)}</select></Field><div className="grid grid-cols-2 gap-3 mt-3">{vars.map((v) => <Field key={v} label={v}><input className="input" value={f[v] || ''} onChange={(e) => setF({ ...f, [v]: e.target.value })} /></Field>)}</div></Card>
        <Card title="Paragraph" actions={<button className="btn btn-sm" onClick={() => { void navigator.clipboard.writeText(out); toast.ok('Copied'); }}><Copy size={12} />Copy</button>}><p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{out}</p></Card></div></div>
  );
}

function Prevent({ kb }: { kb: Kb }) {
  const groups = useMemo(() => { const m = new Map<string, string[][]>(); for (const [g, t, c] of kb.PREVENT) m.set(g, [...(m.get(g) || []), [t, c]]); return [...m.entries()]; }, [kb]);
  return <div className="space-y-3"><div><h2 className="text-[18px] font-semibold">Prevention checklist by stage</h2><p className="text-[13px] muted">Most denials are cheapest to stop where they start. Each control below lists the denial codes it prevents.</p></div>{groups.map(([g, list]) => <Card key={g} title={g} pad={false}><table className="tbl w-full text-[13px]"><tbody>{list.map(([t, c]) => <tr key={t}><td className="font-medium w-1/2">{t}</td><td className="muted">prevents {c}</td></tr>)}</tbody></table></Card>)}</div>;
}

export function HowTo({ kb, articles, item, setItem }: { kb: Kb; articles: Article[]; item: string; setItem: (id: string) => void }) {
  const has = useStore((s) => s.has); const byId = useMemo(() => { const m = new Map<string, Item>(); for (const a of articles) m.set('a:' + a.id, { id: 'a:' + a.id, title: a.title, sub: a.section, kind: 'article' }); for (const g of kb.GUIDES) m.set('g:' + g.t, { id: 'g:' + g.t, title: g.t, sub: 'Guide', kind: 'guide' }); for (const [k, v] of Object.entries(TOOLS)) m.set('t:' + k, { id: 't:' + k, title: v.title, sub: v.sub, kind: 'tool' }); return m; }, [articles, kb]);
  const placed = new Set(SECTIONS.flatMap((s) => s.items)); const more = [...byId.keys()].filter((k) => !placed.has(k) && !k.startsWith('t:')); const sections = [...SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => byId.has(i)) })), ...(more.length ? [{ id: 'more', label: 'More', items: more }] : [])].filter((s) => s.items.length);
  const sel = byId.get(item) || byId.get(sections[0].items[0])!; const art = sel.id.startsWith('a:') ? articles.find((a) => 'a:' + a.id === sel.id) : undefined; const guide = sel.id.startsWith('g:') ? kb.GUIDES.find((g) => 'g:' + g.t === sel.id) : undefined;
  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4 items-start">
      <nav className="panel p-2 lg:sticky lg:top-2 max-h-[80vh] overflow-auto" aria-label="How-to guides">{sections.map((s) => <div key={s.id} className="mb-1.5"><div className="label px-2 pt-2">{s.label}</div>{s.items.map((i) => { const it = byId.get(i)!; return <button key={i} onClick={() => setItem(i)} className={`w-full text-left rounded-lg px-2.5 py-1.5 text-[13px] transition ${sel.id === i ? 'bg-[rgb(var(--b500)/.14)] font-medium' : 'hover:bg-white/5'}`}>{it.title}{it.kind === 'tool' && <span className="ml-1.5 text-[10px] uppercase text-brand-400">tool</span>}</button>; })}</div>)}</nav>
      <div className="panel p-5 min-w-0">
        {sel.id === 't:call' && <CallScript kb={kb} />}{sel.id === 't:letters' && <Letters kb={kb} />}{sel.id === 't:prevent' && <Prevent kb={kb} />}{sel.id === 't:sops' && <div className="space-y-3"><div><h2 className="text-[18px] font-semibold">Client rules (SOPs)</h2><p className="text-[13px] muted">What each client has told us to do — and not do. These also appear on the claim itself.</p></div><SopLibrary /></div>}
        {guide && <GuideView g={guide} />}
        {art && <div className="space-y-3"><div className="flex items-start gap-2 flex-wrap"><div className="flex-1"><h2 className="text-[18px] font-semibold">{art.title}</h2><p className="text-[13px] muted mt-1">{art.summary}</p></div><Chip color="#64748b">{art.section}</Chip>{has('edit_content') && <Link to="/admin?tab=articles" className="btn btn-ghost btn-sm" title="Edit or add your own version"><Pencil size={12} />Edit</Link>}</div>{sel.id === 'a:kpi-benchmarks' && <LiveKpis />}<Body text={art.body} /></div>}
      </div>
    </div>
  );
}
