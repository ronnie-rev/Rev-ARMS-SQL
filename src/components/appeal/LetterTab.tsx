import { lazy, Suspense, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, FileText, Info } from 'lucide-react';
import { Chip, Field } from '../ui';
import { Link } from 'react-router-dom';
import { LEVEL_LABEL } from '../../lib/engine/appeal';
import { letterheadLines } from '../../lib/engine/appealforge';
import { LetterCompare } from './LetterCompare';
import { COURTESY_SITUATIONS, PLAN_LABEL, type PlanKind } from '../../lib/engine/courtesy';
import type { LetterModel } from './useLetter';

/** The letterhead exactly as it prints: logo, practice name, address, contact strip and rule. Comes from Admin → Clients → Letterhead. */
function LetterheadPreview({ m }: { m: LetterModel }) {
  const l = letterheadLines(m.lh, m.client?.name); const empty = !m.lh.name && !m.lh.logo && !m.lh.address;
  return (
    <div className="rounded-t-xl border border-b-0 hair bg-white text-slate-800 px-6 pt-5 pb-3" style={{ fontFamily: '"Times New Roman", serif' }}>
      {m.lh.logo && !m.lh.logoTextOnly ? <div className="flex items-center gap-3.5"><img src={m.lh.logo} alt="Practice logo" style={{ maxHeight: 56, maxWidth: 200 }} /><div className="leading-snug">{l.address && <div className="text-[11.5px] text-slate-700">{l.address}</div>}{l.contact && <div className="text-[11px] text-slate-600">{l.contact}</div>}{l.ids && <div className="text-[10.5px] text-slate-500">{l.ids}</div>}</div></div>
        : <div><div className="text-[19px] font-bold">{l.name}</div>{l.address && <div className="text-[11.5px] text-slate-700">{l.address}</div>}{l.contact && <div className="text-[11px] text-slate-600">{l.contact}</div>}{l.ids && <div className="text-[10.5px] text-slate-500">{l.ids}</div>}</div>}
      <div className="mt-2.5 border-b-2 border-slate-900" />
      {empty && <div className="mt-2 text-[11.5px] text-amber-700 bg-amber-50 rounded px-2 py-1">No letterhead is set for {m.client?.name || 'this client'} — add the logo, address, phone, fax and NPI in <Link className="underline font-medium" to="/admin?tab=clients">Admin → Clients → Letterhead</Link>. It prints on every letter.</div>}
    </div>
  );
}

const LetterEditor = lazy(() => import('../LetterEditor'));
const TIER_COLOR = { tailored: '#22c55e', group: '#3b82f6', shape: '#f59e0b', composed: '#a855f7', none: '#94a3b8' } as const;
const ROLES = ['Main Surgeon', 'Co-Surgeon', 'PA'];

/** The letter tab: pick the source, see which library template matched and why, complete the fill-ins, edit, and review quality issues before export. */
export function LetterTab({ m, level, kind }: { m: LetterModel; level: number; kind: string }) {
  const [more, setMore] = useState(false); const [cmp, setCmp] = useState(false); const fillList = [...new Set(m.open)];
  const applyFill = (marker: string, value: string) => { if (m.html != null) { m.setHtml(m.html.split(marker).join(value)); m.bump(); } else m.setFills({ ...m.fills, [marker]: value }); };
  return (
    <div className="grid lg:grid-cols-[330px_1fr] gap-4 items-start">
      <div className="space-y-3 text-sm">
        <div className="seg w-full"><button className={'flex-1 ' + (m.source === 'library' ? 'on' : '')} onClick={() => { m.setSource('library'); m.reset(); }}>Smart library</button><button className={'flex-1 ' + (m.source === 'mine' ? 'on' : '')} onClick={() => { m.setSource('mine'); m.reset(); }}>My templates</button><button className={'flex-1 ' + (m.source === 'courtesy' ? 'on' : '')} title="Professional good-faith request for the payer to use its discretion" onClick={() => { m.setSource('courtesy'); m.reset(); }}>Courtesy</button></div>
        {m.source === 'courtesy' && <div className="space-y-2 rounded-lg p-2.5" style={{ background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.25)' }}>
          <div className="text-[12px]"><b>Courtesy / good-faith review</b> — a non-adversarial request that keeps every formal appeal right. Best when the appeal window has closed, the denial is administrative, or you want a fast reprocess.</div>
          <Field label="Situation" hint="Chooses the argument, the asks and the evidence list"><select className="input" value={m.situation} onChange={(e) => { m.setSituation(e.target.value); m.reset(); }}><option value="">Auto from denial reason</option>{COURTESY_SITUATIONS.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></Field>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={m.paidBefore} onChange={(e) => { m.setPaidBefore(e.target.checked); m.reset(); }} />Payer has paid comparable claims before (adds a precedent line to complete)</label>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={m.harm} onChange={(e) => { m.setHarm(e.target.checked); m.reset(); }} />Patient is being billed / contacted about this claim</label>
        </div>}
        <div className="space-y-1.5"><label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={m.reg} onChange={(e) => { m.setReg(e.target.checked); m.reset(); }} /><span><b>Add regulatory citations</b> for the plan type — federal rules only; state law is referenced generically</span></label>
          {m.reg && <select className="input" value={m.plan} onChange={(e) => { m.setPlan(e.target.value as PlanKind); m.reset(); }}>{(Object.keys(PLAN_LABEL) as PlanKind[]).map((k) => <option key={k} value={k}>{PLAN_LABEL[k]}</option>)}</select>}</div>
        {m.source === 'courtesy' ? (m.lib && <Field label="Denial category"><select className="input" value={m.category} onChange={(e) => { m.setCategory(e.target.value); m.setDetail(''); m.reset(); }}><option value="">—</option>{m.lib.denialCategories.map((c) => <option key={c}>{c}</option>)}</select></Field>) : m.source === 'library' ? <>
          {!m.lib && <div className="panel2 p-3 muted text-xs">Loading the appeal library…</div>}
          {m.lib && <>
            <Field label="CPT code(s) or procedure" hint="e.g. 19380, or type “breast reduction”"><input className="input" list="forge-cpts" value={m.cpt} onChange={(e) => m.setCpt(e.target.value)} /><datalist id="forge-cpts">{Object.entries(m.lib.cptMeta).slice(0, 400).map(([c, x]) => <option key={c} value={c}>{x.description || x.groupLabel}</option>)}</datalist></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="Provider role"><select className="input" value={m.role} onChange={(e) => { m.setRole(e.target.value); m.reset(); }}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
              <Field label="Denial category"><select className="input" value={m.category} onChange={(e) => { m.setCategory(e.target.value); m.setDetail(''); m.reset(); }}><option value="">—</option>{m.lib.denialCategories.map((c) => <option key={c}>{c}</option>)}</select></Field></div>
            <Field label="Denial reason" hint="✓✓ tailored to this CPT · ✓ clinical-group template"><select className="input" value={m.detail} onChange={(e) => { m.setDetail(e.target.value); const d = m.denials.find((x) => x.detail === e.target.value); if (d) m.setCategory(d.category); m.reset(); }}><option value="">— choose —</option>{m.denials.filter((d) => !m.category || d.category === m.category).map((d) => <option key={d.detail} value={d.detail}>{d.level === 2 ? '✓✓ ' : d.level === 1 ? '✓ ' : ''}{d.detail}</option>)}</select></Field>
            {m.match && <div className="rounded-lg p-2.5 text-[12.5px]" style={{ background: TIER_COLOR[m.match.tier] + '18', border: `1px solid ${TIER_COLOR[m.match.tier]}55` }}><div className="flex items-center gap-1.5 font-semibold"><CheckCircle2 size={13} style={{ color: TIER_COLOR[m.match.tier] }} />{m.match.label}</div>{m.match.summary && <div className="muted mt-1">{m.match.summary}</div>}</div>}
          </>}
        </> : <Field label="Letter template" hint={m.picks[0] && m.tpl?.id === m.picks[0].letter.id ? `Auto-picked: ${m.picks[0].why}` : undefined}><select className="input" value={m.tpl?.id || ''} onChange={(e) => { m.setTplId(e.target.value); m.reset(); }}>{m.picks.length > 0 && <optgroup label="Best match">{m.picks.slice(0, 3).map((p) => <option key={p.letter.id} value={p.letter.id}>{p.letter.value}</option>)}</optgroup>}<optgroup label="All templates">{m.letters.map((l) => <option key={l.id} value={l.id}>{l.value}</option>)}</optgroup></select></Field>}
        <button className="flex items-center gap-1 text-xs font-semibold muted" onClick={() => setMore(!more)}><ChevronDown size={13} className={more ? 'rotate-180' : ''} />Sender, claim facts &amp; extras</button>
        {more && <div className="space-y-2.5 pl-1">
          <div className="grid grid-cols-2 gap-2"><Field label="Sender name"><input className="input" value={m.sender.name} onChange={(e) => m.setSender({ ...m.sender, name: e.target.value })} /></Field><Field label="Title"><input className="input" value={m.sender.title} onChange={(e) => m.setSender({ ...m.sender, title: e.target.value })} /></Field><Field label="Email"><input className="input" value={m.sender.email} onChange={(e) => m.setSender({ ...m.sender, email: e.target.value })} /></Field><Field label="Phone"><input className="input" value={m.sender.phone} onChange={(e) => m.setSender({ ...m.sender, phone: e.target.value })} /></Field></div>
          <div className="grid grid-cols-2 gap-2"><Field label="Member ID (optional)"><input className="input" value={m.facts.memberId} onChange={(e) => m.setFacts({ ...m.facts, memberId: e.target.value })} /></Field><Field label="Authorization #"><input className="input" value={m.facts.auth} onChange={(e) => m.setFacts({ ...m.facts, auth: e.target.value })} /></Field><Field label="Diagnosis codes" className="col-span-2"><input className="input" value={m.facts.dx} onChange={(e) => m.setFacts({ ...m.facts, dx: e.target.value })} placeholder="e.g. C50.911, Z42.1" /></Field><Field label="Assistant (PA)"><input className="input" value={m.facts.assistant} onChange={(e) => m.setFacts({ ...m.facts, assistant: e.target.value })} /></Field><Field label="Co-surgeon"><input className="input" value={m.facts.coSurgeon} onChange={(e) => m.setFacts({ ...m.facts, coSurgeon: e.target.value })} /></Field></div>
          <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={m.followUps} onChange={(e) => { m.setFollowUps(e.target.checked); m.reset(); }} />Include follow-up history from this claim’s touches ({m.history.length})</label>
          <p className="text-[11px] muted">Letterhead ({m.lh.name || m.client?.name || 'practice'}{m.lh.fax ? ` · fax ${m.lh.fax}` : ''}) comes from the client record — <Link className="underline" to="/admin?tab=clients">Admin → Clients</Link>. Patient name is optional; blank values become fill-ins.</p></div>}
        {fillList.length > 0 && <div><div className="label flex items-center gap-1"><Info size={12} />To complete ({fillList.length})</div><div className="space-y-1.5 max-h-52 overflow-auto pr-1">{fillList.map((f) => <label key={f} className="block"><span className="text-[10.5px] muted block truncate" title={f}>{f.replace(/^\[(FILL IN|DESCRIBE|IF APPLICABLE)?:?\s*/i, '').replace(/\]$/, '')}</span><input className="input !py-1" defaultValue="" placeholder="type to replace…" onBlur={(e) => e.target.value.trim() && applyFill(f, e.target.value.trim())} /></label>)}</div></div>}
        {m.issues.length > 0 && <div className="space-y-1">{m.issues.map((i, k) => <div key={k} className="flex gap-1.5 text-[12px]" style={{ color: i.level === 'warn' ? '#f59e0b' : 'var(--muted)' }}>{i.level === 'warn' ? <AlertTriangle size={13} className="shrink-0 mt-0.5" /> : <Info size={13} className="shrink-0 mt-0.5" />}<span>{i.text}</span></div>)}</div>}
        <div className="text-[11px] muted">{LEVEL_LABEL(level)} · {kind.replace('_', ' ')}</div>
      </div>
      <div className="min-w-0">
        <LetterheadPreview m={m} /><Suspense fallback={<div className="panel2 p-6 text-sm muted">Loading editor…</div>}><LetterEditor html={m.shown} resetKey={`${m.rev}|${m.source}|${m.match?.id}|${m.tpl?.id}|${level}|${kind}|${m.followUps}|${Object.keys(m.fills).length}`} onChange={(h) => m.setHtml(h)} /></Suspense>
        <div className="flex items-center gap-2 text-[11px] muted mt-2"><FileText size={12} />Edit freely — your edits are kept. {m.html != null && <button className="btn btn-sm" onClick={m.reset}>Reset from {m.source === 'library' ? 'library' : 'template'}</button>}{m.html != null && <button className="btn btn-sm" onClick={() => setCmp(true)}>See changes</button>}</div>
      </div>
      {cmp && <LetterCompare original={m.auto} current={m.shown} saved={m.savedHtml} onClose={() => setCmp(false)} />}
    </div>
  );
}
export { Chip };
