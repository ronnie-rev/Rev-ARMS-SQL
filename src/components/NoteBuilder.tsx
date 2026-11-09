import { useEffect, useMemo, useRef, useState } from 'react';
import { diffWords } from 'diff';
import { ListTree, Mic, MicOff, Sparkles, Undo2, Wand2, X } from 'lucide-react';
import { useStore } from '../store';
import { useOpts } from './../hooks';
import { compose, DEFAULT_GLOSSARY, DEFAULT_OUTCOMES, quality, tidy, type Contact, type NoteFacts, type OutcomeTpl } from '../lib/engine/notes';
import { getBlock, organize, parseNote, removeBlock, type NoteLabel } from '../lib/engine/notedoc';
import type { Claim } from '../lib/types';
import { cn, todayISO } from '../lib/utils';

const CONTACTS: Contact[] = ['Call', 'Portal', 'Fax', 'Email', 'Chat', 'Review'];
const NEEDS: Record<string, (keyof NoteFacts)[]> = { records: ['docs'], denied: ['reason'], appeal: ['reason', 'docs'], resubmit: ['reason'], paid: ['allowed', 'paid', 'check'], in_process: ['received'], patient: ['reason'] };

/** Structured note composer: pick contact + outcome, fill a few facts, get a clean audit-ready comment. Free-text stays fully editable. */
export function NoteBuilder({ claim, value, onChange, onBlock, mode, nextFu, terminal, nextStep, onMode }: { claim: Claim; value: string; onChange: (v: string) => void; /** add/replace ONE labelled block of the note without touching the rest */ onBlock: (label: NoteLabel, body: string, mode?: 'replace' | 'append') => void; mode: string; nextFu: string; terminal: boolean; nextStep?: string; onMode?: (m: string) => void }) {
  const outcomesCfg = useOpts('outcome'); const snippets = useOpts('snippet'); const glossaryCfg = useStore((s) => s.settings.model?.glossary) as Record<string, string> | undefined;
  const outcomes: OutcomeTpl[] = useMemo(() => (outcomesCfg.length ? outcomesCfg.map((o) => ({ id: String(o.meta.id || o.id), name: o.value, body: String(o.meta.body || '') })) : DEFAULT_OUTCOMES), [outcomesCfg]);
  const [open, setOpen] = useState(false); const [f, setF] = useState<NoteFacts>({ contact: (CONTACTS.includes(mode as Contact) ? mode : 'Call') as Contact, outcomeId: outcomes[0]?.id });
  const [shown, setShown] = useState<{ before: string; after: string } | null>(null); const [listening, setListening] = useState(false); const last = useRef(''); const hist = useRef<string[]>([]); const [, force] = useState(0); const remember = () => { hist.current = [value, ...hist.current].slice(0, 8); force((n) => n + 1); }; const rec = useRef<any>(null);
  const SR = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  useEffect(() => { if (CONTACTS.includes(mode as Contact)) setF((p) => ({ ...p, contact: mode as Contact })); }, [mode]);
  useEffect(() => () => rec.current?.stop?.(), []);
  const ctx = useMemo(() => ({ payer: claim.payer, claim: claim.claim_no, balance: claim.balance, rcaDetail: claim.rca_detail || undefined, codes: claim.denial_codes, today: todayISO() }), [claim]);
  const build = (facts: NoteFacts) => compose({ ...facts, next: facts.next ?? nextStep, nextDate: facts.nextDate ?? nextFu }, ctx, outcomes);
  const composeContact = (nf: NoteFacts, force_ = false) => { const cur = getBlock(value, 'Contact'); if (!force_ && cur && cur !== last.current) return false; const t = build(nf); if (cur === t) return true; if (!cur || force_) remember(); last.current = t; onBlock('Contact', t, 'replace'); return true; };
  const set = (p: Partial<NoteFacts>) => { const nf = { ...f, ...p }; setF(nf); composeContact(nf); };
  const q = useMemo(() => quality(value, { mode, nextFu, terminal }), [value, mode, nextFu, terminal]);
  const needs = NEEDS[f.outcomeId || ''] || []; const glossary = glossaryCfg && Object.keys(glossaryCfg).length ? glossaryCfg : DEFAULT_GLOSSARY;
  const dictate = () => {
    if (!SR) return; if (listening) { rec.current?.stop(); setListening(false); return; }
    const r = new SR(); r.lang = 'en-US'; r.interimResults = false; r.continuous = true; rec.current = r;
    r.onresult = (e: any) => { const t = [...e.results].slice(e.resultIndex).map((x: any) => x[0].transcript).join(' '); remember(); onBlock('Notes', t.trim(), 'append'); };
    r.onend = () => setListening(false); r.start(); setListening(true);
  };
  const color = q.score >= 75 ? '#22c55e' : q.score >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center flex-wrap">
        <button type="button" className={cn('btn btn-sm', open && '!border-brand-500')} onClick={() => setOpen(!open)}><Wand2 size={13} />Note builder</button>
        <select className="input !w-auto !py-1 text-xs" value="" onChange={(e) => { const s = snippets.find((x) => x.id === e.target.value); if (!s) return; const body = String(s.meta.body || '').replace(/{payer}/g, claim.payer || 'payer').replace(/{claim}/g, claim.claim_no).replace(/{balance}/g, '$' + claim.balance.toFixed(2)).replace(/{date}/g, nextFu || todayISO()); remember(); onBlock('Notes', body, 'append'); }}><option value="">Snippet…</option>{snippets.map((s) => <option key={s.id} value={s.id}>{s.value}</option>)}</select>
        <button type="button" className="btn btn-sm" disabled={!value.trim()} title="Put blocks in order, fix punctuation and bullets" onClick={() => { remember(); onChange(organize(value)); }}><ListTree size={13} />Organize</button>
        <button type="button" className="btn btn-sm" disabled={!hist.current.length} title="Undo the last insert" onClick={() => { const [prev, ...rest] = hist.current; hist.current = rest; onChange(prev); force((n) => n + 1); }}><Undo2 size={13} />Undo</button>
        <button type="button" className="btn btn-sm" disabled={!value.trim()} onClick={() => { const t = tidy(value, glossary); if (t !== value) setShown({ before: value, after: t }); else setShown(null); }}><Sparkles size={13} />Tidy</button>
        {SR && <button type="button" className={cn('btn btn-sm', listening && '!border-red-500 text-red-400')} onClick={dictate}>{listening ? <MicOff size={13} /> : <Mic size={13} />}{listening ? 'Stop' : 'Dictate'}</button>}
        <div className="ml-auto flex items-center gap-2 text-[11px]"><span className="muted">Note quality</span><div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}><div className="h-full transition-all" style={{ width: q.score + '%', background: color }} /></div><b style={{ color }}>{q.score}</b></div></div>
      {(() => { const pn = parseNote(value); return pn.blocks.length > 0 ? <div className="flex gap-1.5 flex-wrap items-center text-[11px]"><span className="muted">Note contains:</span>{pn.blocks.map((b) => <span key={b.label} className="chip panel2 inline-flex items-center gap-1" title={b.body}>{b.label}{b.label === 'Steps taken' ? ` (${b.body.split('\n').filter(Boolean).length})` : ''}<button type="button" aria-label={`Remove ${b.label}`} onClick={() => { remember(); onChange(removeBlock(value, b.label)); }}><X size={10} /></button></span>)}{pn.free && <span className="chip panel2" title={pn.free}>Your text</span>}</div> : null; })()}
      {open && (
        <div className="panel2 p-3 space-y-2.5 animate-in">
          <div className="flex gap-1.5 flex-wrap">{CONTACTS.map((c) => <button type="button" key={c} onClick={() => { set({ contact: c }); onMode?.(c === 'Call' || c === 'Review' ? c : mode); }} className={cn('chip', f.contact === c ? 'bg-brand-600 text-white' : 'panel2 muted')}>{c}</button>)}</div>
          <div className="grid grid-cols-2 gap-2"><select className="input" value={f.outcomeId} onChange={(e) => set({ outcomeId: e.target.value })}>{outcomes.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select><input className="input" placeholder="Representative name" value={f.rep || ''} onChange={(e) => set({ rep: e.target.value })} />
            <input className="input" placeholder="Reference / call #" value={f.ref || ''} onChange={(e) => set({ ref: e.target.value })} /><input className="input" placeholder="Next step (default: end action)" value={f.next ?? ''} onChange={(e) => set({ next: e.target.value })} />
            {needs.includes('reason') && <input className="input" placeholder="Reason / basis" value={f.reason || ''} onChange={(e) => set({ reason: e.target.value })} />}{needs.includes('docs') && <input className="input" placeholder="Documents (e.g. op notes, EOB)" value={f.docs || ''} onChange={(e) => set({ docs: e.target.value })} />}
            {needs.includes('received') && <input className="input" placeholder="Claim received date" value={f.received || ''} onChange={(e) => set({ received: e.target.value })} />}{needs.includes('check') && <><input className="input" placeholder="Check / EFT #" value={f.check || ''} onChange={(e) => set({ check: e.target.value })} /><input className="input" placeholder="Allowed $" value={f.allowed || ''} onChange={(e) => set({ allowed: e.target.value })} /><input className="input" placeholder="Paid $" value={f.paid || ''} onChange={(e) => set({ paid: e.target.value })} /></>}</div>
          <div className="flex justify-between items-center"><span className="text-[11px] muted">Adds the “Contact” line only — your steps, documents and notes are kept.</span><button type="button" className="btn btn-primary btn-sm" onClick={() => { composeContact(f, true); if (f.next?.trim()) onBlock('Next step', f.next.trim() + (nextFu ? `; follow up ${nextFu}` : ''), 'replace'); }}>Add to note</button></div>
        </div>)}
      {shown && <div className="panel2 p-2.5 text-[13px]"><div className="text-[10px] uppercase muted mb-1">Suggested tidy-up</div><div className="leading-relaxed">{diffWords(shown.before, shown.after).map((p, i) => <span key={i} className={p.added ? 'bg-green-500/25 rounded px-0.5' : p.removed ? 'bg-red-500/25 line-through rounded px-0.5' : ''}>{p.value}</span>)}</div><div className="flex gap-2 mt-2"><button type="button" className="btn btn-primary btn-sm" onClick={() => { onChange(shown.after); setShown(null); }}>Accept</button><button type="button" className="btn btn-sm" onClick={() => setShown(null)}>Dismiss</button></div></div>}
      {q.missing.length > 0 && value.trim().length > 0 && <div className="text-[11px] text-amber-500">Make it stronger: {q.missing.slice(0, 3).join(' · ')}</div>}
    </div>
  );
}
