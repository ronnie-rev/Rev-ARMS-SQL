import { ArrowRight, Check, Copy, GitBranch, Phone, Route, ScrollText } from 'lucide-react';
import { Chip, toast } from './ui';
import { routeFor, type Kb, type Scenario } from '../lib/kb';

const Steps = ({ items, tone }: { items: string[]; tone?: 'yes' | 'no' }) => (
  <ol className="space-y-1.5">{items.map((x, i) => <li key={i} className="flex gap-2 text-[13px] leading-snug"><span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full grid place-items-center text-[10px] font-bold ${tone === 'yes' ? 'pill-ok' : tone === 'no' ? 'pill-warn' : 'bg-[var(--panel2)] muted'}`}>{i + 1}</span><span>{x}</span></li>)}</ol>
);

/** Step-by-step guide for one denial / status scenario (from the RevAtlas knowledge base). Reused in the claim drawer and the Knowledge hub. */
export function DenialGuide({ s, kb, compact }: { s: Scenario; kb: Kb; compact?: boolean }) {
  const route = routeFor(kb, s.code); const refs = kb.POLMAP[s.code]; const cat = kb.CAT_DEFAULT[s.cat];
  const asks = [...s.ask, ...(cat?.ask || [])];
  const copy = () => { navigator.clipboard?.writeText(`${s.code} — ${s.t}\n\nAsk the payer:\n${asks.map((a) => '• ' + a).join('\n')}`); toast.ok('Call questions copied'); };
  return (
    <div className="space-y-4">
      <div><div className="flex items-center gap-2 flex-wrap"><Chip color="#3b82ec">{s.code}</Chip><Chip color="#64748b">{s.cat}</Chip></div><h3 className="text-[17px] font-semibold mt-2">{s.t}</h3><p className="text-[13px] muted mt-1">{s.what}</p></div>
      <div className="panel2 p-3.5 border-l-4" style={{ borderLeftColor: 'rgb(var(--b500))' }}><div className="label !mb-1 flex items-center gap-1.5"><Check size={12} />Recommended action</div><p className="text-[13px] font-medium leading-snug">{s.action}</p></div>
      {!compact && <div><div className="label">Common causes</div><ul className="list-disc pl-5 space-y-1 text-[13px]">{s.causes.map((c) => <li key={c}>{c}</li>)}</ul></div>}
      <div><div className="label flex items-center gap-1.5"><GitBranch size={12} />Work it</div><Steps items={s.flow.start} />
        <div className="my-3 flex items-center gap-2 text-[13px] font-semibold"><ArrowRight size={14} className="text-brand-500" />{s.flow.check}</div>
        <div className="grid md:grid-cols-2 gap-3"><div className="rounded-2xl border hair p-3"><Chip color="#17803d">Yes</Chip><div className="mt-2"><Steps items={s.flow.yes} tone="yes" /></div></div><div className="rounded-2xl border hair p-3"><Chip color="#b26a00">No</Chip><div className="mt-2"><Steps items={s.flow.no} tone="no" /></div></div></div></div>
      {s.exceptions.length > 0 && <div><div className="label">Exceptions & watch-outs</div><ul className="list-disc pl-5 space-y-1 text-[13px]">{[...s.exceptions, ...(compact ? [] : cat?.exc || [])].map((c) => <li key={c}>{c}</li>)}</ul></div>}
      <div><div className="flex items-center justify-between"><div className="label flex items-center gap-1.5 !mb-0"><Phone size={12} />Ask the payer</div><button className="btn btn-ghost btn-sm" onClick={copy}><Copy size={12} />Copy</button></div><div className="flex flex-wrap gap-1.5 mt-2">{asks.map((a) => <span key={a} className="tag !text-[11.5px] !py-1">{a}</span>)}</div></div>
      {route && <div className="panel2 p-3 flex gap-2 items-start text-[13px]"><Route size={15} className="mt-0.5 text-brand-500 shrink-0" /><div><b>Route: {route.teams.join(' → ')}</b><div className="muted text-[12px]">{route.note}</div></div></div>}
      {refs && refs.length > 0 && <div className="flex gap-2 items-start text-[12px] muted"><ScrollText size={13} className="mt-0.5 shrink-0" /><span>Policy references: {refs.join(' · ')}</span></div>}
    </div>
  );
}
