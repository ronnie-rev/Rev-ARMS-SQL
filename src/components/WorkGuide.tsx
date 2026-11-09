import { useMemo, useState } from 'react';
import { BookOpenCheck, Check, ExternalLink, Lightbulb, ListChecks, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { useOpts } from '../hooks';
import { DenialGuide } from './DenialGuide';
import { Chip } from './ui';
import { carcMeaning, scenarioIndex, scenariosFor, splitDenials, useKb } from '../lib/kb';
import { splitCodes, suggestFromCodes } from '../lib/engine/carc';
import { BASE_CHECKLIST, matchChecklists, progress, scenarioChecklist } from '../lib/engine/checklist';
import { CallFlowModal } from './CallFlow';
import type { Claim } from '../lib/types';

type Sub = 'checklist' | 'guide' | 'codes';
/** One compact "how do I work this?" card: checklist for the denial → knowledge-hub guide → code meanings. Checklists are editable in Admin → Playbooks. */
export function WorkGuide({ claim, rcaDetail, onUseRca, onInsertSteps }: { claim: Claim; rcaDetail: string; onUseRca: (rca: string, detail: string) => void; onInsertSteps: (steps: string[]) => void }) {
  const kb = useKb(); const nav = useNavigate(); const { openClaim, patchClaims, carcMap } = useStore(); const playbooks = useOpts('playbook');
  const codes = useMemo(() => splitDenials(claim.denial_codes), [claim.denial_codes]); const cmap = useMemo(() => carcMap(), [carcMap]);
  const sug = useMemo(() => suggestFromCodes(claim.denial_codes, cmap), [claim.denial_codes, cmap]);
  const idx = useMemo(() => (kb ? scenarioIndex(kb) : null), [kb]); const sc = kb && idx ? scenariosFor(kb, idx, claim.denial_codes) : [];
  const lists = useMemo(() => { const own = matchChecklists(playbooks as any, { codes, rcaDetail }); const kbl = own.some((l) => l.by === 'code') ? [] : sc.slice(0, 3).map(scenarioChecklist); return [...own, ...kbl, ...(codes.length ? [BASE_CHECKLIST] : [])].sort((a, b) => ({ code: 0, rca: 1, kb: 2, base: 3 }[a.by] - { code: 0, rca: 1, kb: 2, base: 3 }[b.by])); }, [playbooks, codes, rcaDetail, sc]);
  const [flow, setFlow] = useState<string | null>(null);
  const [sub, setSub] = useState<Sub | null>(null); const [k, setK] = useState(0);
  if (!codes.length && !lists.length) return null;
  const saved = (claim.custom?.checklist || {}) as Record<string, number[]>;
  const toggle = (id: string, i: number) => { const cur = new Set(saved[id] || []); cur.has(i) ? cur.delete(i) : cur.add(i); void patchClaims([claim.id], { custom: { ...(claim.custom || {}), checklist: { ...saved, [id]: [...cur].sort((a, b) => a - b) } } }); };
  const left = lists.reduce((a, l) => a + progress(l, saved[l.id]).requiredLeft, 0);
  const active: Sub = sub ?? (lists.length ? 'checklist' : sc.length ? 'guide' : 'codes'); const s = sc[Math.min(k, sc.length - 1)];
  const tabs: [Sub, string, boolean][] = [['checklist', `Checklist${lists.length ? ` (${lists.reduce((a, l) => a + progress(l, saved[l.id]).done, 0)}/${lists.reduce((a, l) => a + l.steps.length, 0)})` : ''}`, lists.length > 0], ['guide', 'Denial guide', sc.length > 0], ['codes', 'Codes', codes.length > 0]];
  return (
    <div className="panel2 overflow-hidden">
      <div className="px-3 pt-2.5 flex items-center gap-2 flex-wrap"><BookOpenCheck size={14} className="text-brand-500" /><b className="text-[13px]">Denial workup</b>{codes.slice(0, 4).map((c) => <span key={c} className="inline-flex items-center gap-0.5"><Chip color="#f59e0b">{c}</Chip>{kb && <button className="btn btn-ghost btn-sm !px-1" title={`Call flow & decision flow for ${c}`} aria-label={`Call flow for ${c}`} onClick={() => setFlow(c)}><Workflow size={14} /></button>}</span>)}{left > 0 && <Chip color="#ef4444">{left} required left</Chip>}
        <div className="ml-auto flex gap-1">{tabs.filter((t) => t[2]).map(([id, label]) => <button key={id} className={'btn btn-sm ' + (active === id ? 'btn-primary' : '')} onClick={() => setSub(id)}>{label}</button>)}</div></div>
      {flow && kb && <CallFlowModal claim={claim} code={flow} kb={kb} onClose={() => setFlow(null)} />}
      <div className="p-3">
        {active === 'checklist' && (lists.length ? lists.map((l, li) => { const p = progress(l, saved[l.id]); return (
          <details key={l.id} open={li === 0 || undefined} className="mb-2 last:mb-0"><summary className="flex items-center justify-between text-[12px] cursor-pointer list-none"><span className="font-semibold flex items-center gap-1"><ListChecks size={12} className="text-green-500" />{l.title}{l.by === 'kb' && <span className="muted font-normal"> · from Knowledge hub</span>}</span><span className="muted">{p.done}/{p.total}</span></summary>
            <ul className="mt-1.5 space-y-1">{l.steps.map((st, i) => { const d = (saved[l.id] || []).includes(i); return <li key={i} className="flex gap-2 text-[13px] items-start"><input type="checkbox" className="mt-1" checked={d} onChange={() => toggle(l.id, i)} /><span className={d ? 'line-through muted' : ''}>{st.text}{st.required && <span className="text-red-500" title="Required"> *</span>}</span></li>; })}</ul>
            <button className="btn btn-sm mt-2" disabled={!p.done} onClick={() => onInsertSteps(l.steps.filter((_, i) => (saved[l.id] || []).includes(i)).map((x) => x.text))}><Check size={12} />Insert completed steps into note</button></details>); }) : <p className="text-[13px] muted">No checklist for this denial yet — add one in Admin → Playbooks (tie it to codes like CO-29).</p>)}
        {active === 'guide' && (s && kb ? <div>{sc.length > 1 && <div className="flex gap-1.5 flex-wrap mb-2">{sc.map((x, i) => <button key={x.code} onClick={() => setK(i)}><Chip color={i === k ? '#3b82ec' : '#64748b'}>{x.code}</Chip></button>)}</div>}<DenialGuide s={s} kb={kb} compact />
          <button className="btn btn-sm mt-2" onClick={() => { openClaim(null); nav(`/knowledge?tab=denials&code=${encodeURIComponent(s.code)}`); }}><ExternalLink size={12} />Open in Knowledge hub</button></div> : <p className="text-[13px] muted">No step-by-step scenario for {codes.join(', ')} yet — decode it in the Knowledge hub.</p>)}
        {active === 'codes' && <div className="space-y-1 text-[13px]">{codes.map((c) => { const m = kb ? carcMeaning(kb, c) : null; return <div key={c}><b>{c}</b> <span className="muted">{m ? `${m.desc}${m.action ? ' — ' + m.action : ''}` : 'not in dictionary'}</span></div>; })}
          {sug && <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 flex items-center gap-2 flex-wrap text-xs"><Lightbulb size={12} className="text-amber-500" />Likely <b>{sug.rca}</b>{sug.rca_detail && <> › {sug.rca_detail}</>} · {Math.round(sug.confidence * 100)}%<button className="btn btn-sm ml-auto" onClick={() => onUseRca(sug.rca, sug.rca_detail || '')}>Use this root cause</button></div>}
          {splitCodes(claim.denial_codes).length === 0 && null}</div>}
      </div>
    </div>
  );
}
