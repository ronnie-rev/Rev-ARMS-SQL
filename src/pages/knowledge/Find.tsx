import { useMemo } from 'react';
import { ArrowRight, BookOpen, Copy, FileSearch, Phone, Search, TriangleAlert, Wrench } from 'lucide-react';
import { useStore } from '../../store';
import { Chip, toast } from '../../components/ui';
import { codeStats } from '../../lib/engine/learning';
import { buildIndex, KIND_LABEL, lookupCode, makeSearcher, type CodeHit } from '../../lib/kbsearch';
import type { Kb } from '../../lib/kb';
import type { Article } from '../../lib/rcmcontent';
import { money } from '../../lib/utils';

export const COMMON_CODES = ['CO-16', 'CO-18', 'CO-29', 'CO-50', 'CO-97', 'CO-109', 'CO-197', 'CO-252', 'CO-4', 'CO-11', 'CO-22', 'CO-27', 'CO-31', 'PR-1', 'PR-2', 'PR-3'];
const KIND_COLOR = { denial: '#ef4444', howto: '#6366f1', code: '#0ea5e9', term: '#64748b' } as const;

function YourResults({ code }: { code: string }) {
  const { claims, appeals, workLog } = useStore(); const s = useMemo(() => codeStats(code, claims, appeals, workLog), [code, claims, appeals, workLog]);
  if (!s) return <div className="text-[12.5px] muted">No claim in your workspace has carried this code yet.</div>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
      <div><div className="label">Claims</div><b>{s.claims}</b><div className="text-[11px] muted">{s.open} open · {money(s.balance)}</div></div>
      <div><div className="label">Resolved</div><b>{s.resolvedPct}%</b><div className="text-[11px] muted">{s.medianDaysToClose != null ? `median ${s.medianDaysToClose} days` : '—'}</div></div>
      <div><div className="label">Appeal win rate</div><b>{s.appeals.winRate != null ? s.appeals.winRate + '%' : '—'}</b><div className="text-[11px] muted">{s.appeals.decided} decided{s.appeals.avgRecovered ? ` · avg ${money(s.appeals.avgRecovered)}` : ''}</div></div>
      <div><div className="label">What closed them</div>{s.topActions.length ? s.topActions.map((a) => <div key={a.action}>{a.action} — <b>{a.rate}%</b></div>) : <span className="muted">Not enough history</span>}</div>
    </div>
  );
}

function CodeCard({ hit, go, query }: { hit: CodeHit; go: (p: Record<string, string>) => void; query: string }) {
  const c = hit.carc; const r = hit.rarc;
  const copy = () => { void navigator.clipboard.writeText(c ? `${hit.groupLabel ? query.toUpperCase() : 'CARC ' + c.code} — ${c.desc}\nUsually: ${c.cause}\nAction: ${c.action}` : `${r!.code} — ${r!.desc}\nAction: ${r!.action}`); toast.ok('Copied'); };
  return (
    <div className="panel p-5 space-y-3 animate-in">
      <div className="flex items-center gap-2 flex-wrap">{c ? <><Chip color="#ef4444">CARC {c.code}</Chip>{hit.groupLabel && <Chip color="#64748b">{hit.groupLabel}</Chip>}{c.group && <Chip color="#6366f1">{c.group}</Chip>}</> : <Chip color="#0ea5e9">RARC {r!.code}</Chip>}<button className="btn btn-ghost btn-sm ml-auto" onClick={copy}><Copy size={12} />Copy</button></div>
      <h2 className="text-[17px] font-semibold leading-snug">{c ? c.desc : r!.desc}</h2>
      {c && <div className="grid md:grid-cols-2 gap-3"><div className="panel2 p-3"><div className="label !mb-1">Usually means</div><div className="text-[14px] font-medium">{c.cause}</div></div><div className="panel2 p-3 border-l-4" style={{ borderLeftColor: 'rgb(var(--b500))' }}><div className="label !mb-1">First move</div><div className="text-[14px] font-medium">{c.action}</div></div></div>}
      {r && <div className="panel2 p-3 border-l-4" style={{ borderLeftColor: 'rgb(var(--b500))' }}><div className="label !mb-1">What to do</div><div className="text-[14px] font-medium">{r.action || 'Read the payer’s remark and follow the instruction it gives.'}</div></div>}
      {hit.scenario && <button className="btn btn-primary btn-sm" onClick={() => go({ tab: 'denials', code: hit.scenario!.code })}><BookOpen size={13} />Open the step-by-step denial guide <ArrowRight size={13} /></button>}
      {c && <div><div className="label">Your results with this code</div><YourResults code={c.code} /></div>}
    </div>
  );
}

const START: { icon: typeof Search; title: string; sub: string; go: Record<string, string> }[] = [
  { icon: TriangleAlert, title: 'A claim was denied', sub: 'Step-by-step guides by denial reason', go: { tab: 'denials' } },
  { icon: Phone, title: 'I need to call the payer', sub: 'Script and questions for the call', go: { tab: 'howto', item: 't:call' } },
  { icon: FileSearch, title: 'Filing & appeal deadlines', sub: 'Your limits and the standard appeal ladders', go: { tab: 'reference', sec: 'deadlines' } },
  { icon: Wrench, title: 'Procedures & checklists', sub: 'Working a claim, escalation, appeals, client rules', go: { tab: 'howto' } },
];

export function Find({ kb, articles, q, setQ, go }: { kb: Kb; articles: Article[]; q: string; setQ: (v: string) => void; go: (p: Record<string, string>) => void }) {
  const search = useMemo(() => makeSearcher(buildIndex(kb, articles)), [kb, articles]); const hit = useMemo(() => lookupCode(kb, q), [kb, q]); const results = useMemo(() => (hit ? [] : search(q, 14)), [hit, search, q]);
  const common = COMMON_CODES.filter((c) => kb.SCEN.some((s) => s.code === c)).slice(0, 12);
  return (
    <div className="space-y-4 max-w-4xl">
      <div className="relative"><Search size={17} className="absolute left-4 top-3.5 muted" /><input autoFocus className="input !pl-11 !py-3 !text-[15px]" placeholder="A code (CO-50, N115), a denial (“timely filing”), or a task (“how do I read an ERA”)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the knowledge base" /></div>
      {hit && <CodeCard hit={hit} go={go} query={q} />}
      {!hit && results.length > 0 && <div className="panel divide-y hair">{results.map((r) => <button key={r.id} className="w-full text-left px-4 py-3 hover:bg-white/5 flex items-start gap-3" onClick={() => go(r.go)}><Chip color={KIND_COLOR[r.kind]}>{KIND_LABEL[r.kind]}</Chip><span className="flex-1 min-w-0"><span className="block text-[13.5px] font-medium">{r.title}</span><span className="block text-[12px] muted truncate">{r.sub}{r.text ? ' · ' + r.text.slice(0, 110) : ''}</span></span><ArrowRight size={14} className="muted mt-1" /></button>)}</div>}
      {!hit && q.trim().length >= 2 && results.length === 0 && <div className="panel p-6 text-sm muted">Nothing matched “{q}”. Try the code number on its own (for example <b>50</b>), or fewer words.</div>}
      {q.trim().length < 2 && <>
        <div className="grid sm:grid-cols-2 gap-3">{START.map((s) => <button key={s.title} className="panel p-4 text-left hover:border-brand-500 transition flex gap-3" onClick={() => go(s.go)}><s.icon size={20} className="text-brand-500 shrink-0 mt-0.5" /><span><span className="block font-semibold text-[14px]">{s.title}</span><span className="block text-[12.5px] muted">{s.sub}</span></span></button>)}</div>
        <div><div className="label mb-1.5">Most-used denial guides</div><div className="flex flex-wrap gap-1.5">{common.map((c) => { const s = kb.SCEN.find((x) => x.code === c)!; return <button key={c} className="btn btn-sm" title={s.t} onClick={() => go({ tab: 'denials', code: c })}><b>{c}</b> <span className="muted hidden md:inline">{s.t.slice(0, 28)}</span></button>; })}</div></div>
      </>}
    </div>
  );
}
