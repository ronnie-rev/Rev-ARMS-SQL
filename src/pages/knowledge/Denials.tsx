import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { Search } from 'lucide-react';
import { DenialGuide } from '../../components/DenialGuide';
import { Card, Chip, Empty } from '../../components/ui';
import { useStore } from '../../store';
import { codeStats } from '../../lib/engine/learning';
import type { Kb, Scenario } from '../../lib/kb';
import { money } from '../../lib/utils';
import { COMMON_CODES } from './Find';

const SYMPTOMS: [string, string][] = [['Records / more information', 'records information'], ['Not covered', 'not covered'], ['Authorization missing', 'authorization'], ['Timely filing', 'timely filing'], ['Duplicate', 'duplicate'], ['Bundled / modifier', 'bundled modifier'], ['Eligibility / other insurance', 'eligibility coverage'], ['Medical necessity', 'medical necessity'], ['Credentialing', 'credentialing']];

function History({ code }: { code: string }) {
  const { claims, appeals, workLog } = useStore(); const s = useMemo(() => codeStats(code, claims, appeals, workLog), [code, claims, appeals, workLog]);
  if (!s) return null;
  return <div className="panel2 p-3 text-[12.5px] flex flex-wrap gap-x-6 gap-y-1"><span className="label !mb-0">In your workspace</span><span><b>{s.claims}</b> claims · {s.open} open · {money(s.balance)}</span>{s.appeals.winRate != null && <span>appeal win rate <b>{s.appeals.winRate}%</b></span>}{s.topActions[0] && <span>best closer: <b>{s.topActions[0].action}</b> ({s.topActions[0].rate}%)</span>}</div>;
}

function Bulk({ kb }: { kb: Kb }) {
  const scopes = useMemo(() => [...new Set(kb.BULK.map((b) => b.scope))], [kb]); const [scope, setScope] = useState('');
  return (
    <div className="space-y-3">
      <p className="text-[13px] muted max-w-3xl">When the same denial shows up on dozens of claims at once it is almost never a series of coincidences — it is one payer, system or coding change. Fix it once, with the payer, instead of claim by claim.</p>
      <div className="flex flex-wrap gap-1.5"><button className={'btn btn-sm ' + (!scope ? 'btn-primary' : '')} onClick={() => setScope('')}>All</button>{scopes.map((s) => <button key={s} className={'btn btn-sm ' + (scope === s ? 'btn-primary' : '')} onClick={() => setScope(s)}>{s}</button>)}</div>
      <div className="grid lg:grid-cols-2 gap-4">{kb.BULK.filter((b) => !scope || b.scope === scope).map((b) => <Card key={b.t} title={b.t} actions={<Chip color="#7c5ce0">{b.scope}</Chip>}><p className="text-[12.5px]"><b>How you spot it:</b> <span className="muted">{b.sig}</span></p><ol className="list-decimal pl-5 mt-2 space-y-1 text-[13px]">{b.fix.map((f) => <li key={f}>{f}</li>)}</ol>{b.ex && <p className="text-[11.5px] muted mt-2 italic">{b.ex}</p>}</Card>)}</div>
    </div>
  );
}

export function Denials({ kb, code, setCode }: { kb: Kb; code: string; setCode: (c: string) => void }) {
  const [mode, setMode] = useState<'one' | 'many'>('one'); const [q, setQ] = useState(''); const [cat, setCat] = useState('');
  const cats = useMemo(() => [...new Set(kb.SCEN.map((s) => s.cat))], [kb]); const fuse = useMemo(() => new Fuse(kb.SCEN, { keys: [{ name: 'code', weight: 3 }, { name: 't', weight: 3 }, 'what', 'causes'], threshold: 0.3 }), [kb]);
  const filtered = (q.trim() ? fuse.search(q).map((r) => r.item) : kb.SCEN).filter((s) => !cat || s.cat === cat);
  const common = q.trim() ? [] : COMMON_CODES.map((c) => filtered.find((s) => s.code === c)).filter((s): s is Scenario => !!s); const rest = filtered.filter((s) => !common.includes(s));
  const sel = kb.SCEN.find((s) => s.code === code) || (q.trim() ? filtered[0] : common[0] || filtered[0]);
  const row = (s: Scenario) => <button key={s.code} onClick={() => setCode(s.code)} className={`w-full text-left rounded-lg px-2.5 py-1.5 text-[13px] transition ${sel?.code === s.code ? 'bg-[rgb(var(--b500)/.14)]' : 'hover:bg-white/5'}`}><b className="mr-1.5">{s.code}</b><span className="muted">{s.t}</span></button>;
  return (
    <div className="space-y-4">
      <div className="seg"><button className={mode === 'one' ? 'on' : ''} onClick={() => setMode('one')}>One claim</button><button className={mode === 'many' ? 'on' : ''} onClick={() => setMode('many')}>Many claims, same issue</button></div>
      {mode === 'many' ? <Bulk kb={kb} /> : <>
        <div><div className="label mb-1.5">What did the payer say?</div><div className="flex flex-wrap gap-1.5">{SYMPTOMS.map(([l, k]) => <button key={l} className={'btn btn-sm ' + (q === k ? 'btn-primary' : '')} onClick={() => { setQ(q === k ? '' : k); setCat(''); }}>{l}</button>)}</div></div>
        <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
          <div className="panel p-3 lg:sticky lg:top-2">
            <div className="relative mb-2"><Search size={14} className="absolute left-3 top-3 muted" /><input className="input !pl-9" placeholder="Code, denial or cause…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select className="input mb-2" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All types ({kb.SCEN.length})</option>{cats.map((c) => <option key={c} value={c}>{c} ({kb.SCEN.filter((s) => s.cat === c).length})</option>)}</select>
            <div className="max-h-[62vh] overflow-auto -mx-1 px-1 space-y-0.5">{common.length > 0 && <><div className="label px-2 pt-1">Most common</div>{common.map(row)}<div className="label px-2 pt-2">All others</div></>}{rest.map(row)}{filtered.length === 0 && <div className="text-sm muted p-3">No guide matches.</div>}</div>
          </div>
          <div className="space-y-3">{sel ? <><div className="panel p-5"><DenialGuide s={sel} kb={kb} /></div><History code={sel.code} /></> : <div className="panel"><Empty title="Pick a denial" /></div>}</div>
        </div>
      </>}
    </div>
  );
}
