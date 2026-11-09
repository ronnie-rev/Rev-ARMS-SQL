import { DateField } from './CalendarPicker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCheck, Lightbulb, Phone, Sparkles } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { useStore } from '../store';
import { useClaims, useIntel, useOpts } from '../hooks';
import { Field, toast } from './ui';
import { NoteBuilder } from './NoteBuilder';
import { upsertBlock, type NoteLabel } from '../lib/engine/notedoc';
import { likelyRootCauses, recommend } from '../lib/analytics';
import { relTime, todayISO } from '../lib/utils';

const blank = { rca: '', rca_detail: '', end_action: '', end_sub: '', mode: '', comment: '', next_fu: '', call_ref: '', contact_name: '' };

/** One touch = one row of the old production tracker, with live validation, learned recommendations, snippets, call log, timer. */
export interface Prefill { rca?: string; rca_detail?: string; end_action?: string; comment?: string; /** merge into one labelled block of the note instead of replacing the note */ block?: { label: NoteLabel; body: string; mode?: 'replace' | 'append' }; seq?: number }
export function TouchForm({ claimId, onSaved, autoFocus, prefill, onDraft }: { claimId: string; onSaved?: () => void; autoFocus?: boolean; prefill?: Prefill; onDraft?: (d: { rca: string; rca_detail: string; end_action: string }) => void }) {
  const claim = useStore((s) => s.claims.find((c) => c.id === claimId))!;
  const client = useStore((s) => s.clients.find((c) => c.id === claim?.client_id));
  const { recordTouch, applyToSimilar } = useStore();
  const all = useClaims();
  const intel = useIntel();
  const rcaAll = useOpts('rca'); const eaList = useOpts('end_action'); const modes = useOpts('mode');
  const rcaList = client?.rca_allowed?.length ? rcaAll.filter((r) => client.rca_allowed!.includes(r.value)) : rcaAll;
  const [f, setF] = useState({ ...blank, mode: modes[0]?.value || '' });
  const [also, setAlso] = useState(false); const [busy, setBusy] = useState(false);
  const t0 = useRef(Date.now()); const ref = useRef<HTMLTextAreaElement>(null);
  const details = useOpts('rca_detail', f.rca || '__none__'); const subs = useOpts('end_sub', f.end_action || '__none__');
  const ea = eaList.find((e) => e.value === f.end_action); const terminal = !!ea?.meta.terminal;
  const isCall = /^(call|ivr)/i.test(f.mode); const refKind = isCall ? (/ivr/i.test(f.mode) ? 'IVR reference #' : 'Call reference #') : /web|portal/i.test(f.mode) ? 'Portal ref / screenshot ID' : /fax|email/i.test(f.mode) ? 'Sent to (fax # / email)' : /clearing/i.test(f.mode) ? 'Report / batch ID' : ''; const hasRef = !!refKind;
  useEffect(() => { t0.current = Date.now(); setF({ ...blank, mode: modes[0]?.value || '' }); setAlso(false); }, [claimId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [claimId, autoFocus]);
  useEffect(() => { if (!prefill?.seq) return; setF((p) => { const n = { ...p }; if (prefill.rca) { n.rca = prefill.rca; n.rca_detail = prefill.rca_detail || ''; } if (prefill.end_action) { n.end_action = prefill.end_action; n.end_sub = ''; const d = eaList.find((x) => x.value === prefill.end_action)?.meta.fu_days; n.next_fu = d ? format(addDays(new Date(), Number(d)), 'yyyy-MM-dd') : ''; } if (prefill.comment) n.comment = upsertBlock(n.comment, 'Notes', prefill.comment, 'append'); if (prefill.block) n.comment = upsertBlock(n.comment, prefill.block.label, prefill.block.body, prefill.block.mode || 'replace'); return n; }); }, [prefill?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onDraft?.({ rca: f.rca, rca_detail: f.rca_detail, end_action: f.end_action }); }, [f.rca, f.rca_detail, f.end_action]); // eslint-disable-line react-hooks/exhaustive-deps

  const recs = useMemo(() => (claim && f.rca_detail ? recommend({ ...claim, rca_detail: f.rca_detail, rca: f.rca }, intel) : []), [claim, f.rca_detail, f.rca, intel]);
  const likely = useMemo(() => (claim && !f.rca_detail ? likelyRootCauses(claim.payer, intel) : []), [claim, f.rca_detail, intel]);
  const similar = useMemo(() => {
    if (!claim || !f.end_action) return [];
    return all.filter((x) => x.open && x.c.id !== claim.id && x.c.client_id === claim.client_id && x.c.payer === claim.payer && (claim.denial_codes ? x.c.denial_codes === claim.denial_codes : x.c.pms_status === claim.pms_status)
      && x.c.last_touched_at?.slice(0, 10) !== todayISO() && (!x.c.assigned_to || x.c.assigned_to === claim.assigned_to || x.c.assigned_to === useStore.getState().meId)).slice(0, 40);
  }, [all, claim, f.end_action]);
  if (!claim) return null;

  const set = (k: string, v: string) => setF((p) => {
    const n = { ...p, [k]: v } as typeof p;
    if (k === 'rca') n.rca_detail = '';
    if (k === 'end_action') { n.end_sub = ''; const d = eaList.find((x) => x.value === v)?.meta.fu_days; n.next_fu = d ? format(addDays(new Date(), Number(d)), 'yyyy-MM-dd') : ''; }
    return n;
  });
  const errors: string[] = [];
  if (!f.rca) errors.push('Root cause category'); else if (!f.rca_detail) errors.push('Root cause detail');
  if (!f.end_action) errors.push('End action'); else if (subs.length && !f.end_sub) errors.push('Sub-category');
  if (!f.mode) errors.push('Mode'); if (!f.comment.trim()) errors.push('Comment');
  if (f.end_action && !terminal && !f.next_fu) errors.push('Next F/U date');
  const pastFu = !!f.next_fu && f.next_fu < todayISO();

  const submit = async () => {
    if (errors.length || pastFu || busy) return; setBusy(true);
    try {
      const payload = { ...f, comment: f.comment.trim(), next_fu: terminal ? null : f.next_fu || null, call_ref: hasRef ? f.call_ref || null : null, contact_name: isCall ? f.contact_name || null : null, time_spent_sec: Math.round((Date.now() - t0.current) / 1000) };
      await recordTouch(claimId, payload);
      if (also && similar.length) await applyToSimilar(similar.map((x) => x.c.id), payload);
      toast.ok(also && similar.length ? `Touch saved on ${similar.length + 1} claims` : 'Touch saved'); onSaved?.();
    } catch (e: any) { toast.err(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3.5" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); } }}>
      {claim.touch_count > 0 && <div className="panel2 p-2.5 text-xs muted">Last: <b className="text-inherit">{claim.end_action}</b> · {claim.last_touched_at ? relTime(claim.last_touched_at) : ''}</div>}
      {likely.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]"><Lightbulb size={13} className="text-amber-400" /><span className="muted">Common for {claim.payer}:</span>
          {likely.map((d) => <button key={d} className="chip bg-amber-500/15 text-amber-400 hover:bg-amber-500/25" onClick={() => { const parent = useStore.getState().config.find((o) => o.category === 'rca_detail' && o.value === d)?.parent; if (parent) setF((p) => ({ ...p, rca: parent, rca_detail: d })); }}>{d}</button>)}</div>)}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Root cause category"><select className="input" value={f.rca} onChange={(e) => set('rca', e.target.value)}><option value="">Select…</option>{rcaList.map((o) => <option key={o.id}>{o.value}</option>)}</select></Field>
        <Field label="Root cause detail"><select className="input" value={f.rca_detail} disabled={!f.rca} onChange={(e) => set('rca_detail', e.target.value)}><option value="">Select…</option>{details.map((o) => <option key={o.id}>{o.value}</option>)}</select></Field>
      </div>
      {recs.length > 0 && (
        <div className="rounded-xl p-2.5 border border-brand-500/40 bg-brand-500/10">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand-300 mb-1.5"><Sparkles size={12} />Next best action — what resolved similar claims</div>
          <div className="flex gap-1.5 flex-wrap">{recs.map((r) => (
            <button key={r.action} onClick={() => set('end_action', r.action)} className={'text-left px-2.5 py-1.5 rounded-lg border text-[12px] transition ' + (f.end_action === r.action ? 'border-brand-400 bg-brand-500/25' : 'hair hover:border-brand-400')}>
              <b>{r.action}</b><div className="text-[10px] muted">{Math.round(r.rate * 100)}% resolved · {r.n} cases · by {r.scope}</div></button>))}</div>
        </div>)}
      <div className="grid grid-cols-2 gap-3">
        <Field label="End action"><select className="input" value={f.end_action} onChange={(e) => set('end_action', e.target.value)}><option value="">Select…</option>{eaList.map((o) => <option key={o.id}>{o.value}</option>)}</select></Field>
        <Field label="Sub-category"><select className="input" value={f.end_sub} disabled={!subs.length} onChange={(e) => set('end_sub', e.target.value)}><option value="">{subs.length ? 'Select…' : f.end_action ? 'Not needed' : '—'}</option>{subs.map((o) => <option key={o.id}>{o.value}</option>)}</select></Field>
        <Field label="Mode of resolution"><select className="input" value={f.mode} onChange={(e) => set('mode', e.target.value)}>{modes.map((o) => <option key={o.id}>{o.value}</option>)}</select></Field>
        <Field label="Next F/U date" hint={ea ? (terminal ? 'Closing action — no follow-up' : `Suggested: ${ea.meta.fu_days}d`) : undefined}><DateField className="w-full" value={f.next_fu || null} disabled={terminal} min={todayISO()} onChange={(d) => set('next_fu', d || '')} /></Field>
      </div>
      {hasRef && <div className={`grid ${/^call/i.test(f.mode) ? 'grid-cols-2' : 'grid-cols-1'} gap-3 animate-in`}><Field label={refKind}><div className="relative"><Phone size={13} className="absolute left-2.5 top-2.5 muted" /><input className="input !pl-8" value={f.call_ref} onChange={(e) => set('call_ref', e.target.value)} placeholder="REF123456" /></div></Field>{/^call/i.test(f.mode) && <Field label="Rep name"><input className="input" value={f.contact_name} onChange={(e) => set('contact_name', e.target.value)} /></Field>}</div>}
      <Field label="Claim comment">
        <NoteBuilder claim={claim} value={f.comment} onChange={(v) => set('comment', v)} onBlock={(label, body, mode) => setF((p) => ({ ...p, comment: upsertBlock(p.comment, label, body, mode) }))} mode={f.mode} nextFu={f.next_fu} terminal={terminal} nextStep={f.end_action} onMode={(m) => set('mode', m)} />
        <textarea ref={ref} className="input mt-2" rows={4} value={f.comment} onChange={(e) => set('comment', e.target.value)} placeholder="What did you do / learn? Include payer rep, reference #… (or use the note builder)" /></Field>
      {similar.length > 0 && !terminal && (
        <label className="panel2 p-2.5 flex items-start gap-2 text-xs cursor-pointer"><input type="checkbox" className="mt-0.5" checked={also} onChange={(e) => setAlso(e.target.checked)} />
          <span><b>Apply the same touch to {similar.length} similar open claim{similar.length > 1 ? 's' : ''}</b> <span className="muted">— same payer ({claim.payer}) and {claim.denial_codes ? `denial code ${claim.denial_codes}` : `PMS status “${claim.pms_status}”`}, not yet touched today. Each gets its own tracker row.</span></span></label>)}
      {(errors.length > 0 || pastFu) && (f.rca || f.end_action || f.comment) && <div className="flex gap-2 text-xs text-amber-500 items-start"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><div>{pastFu ? 'Follow-up date is in the past. ' : ''}{errors.length ? 'Needed: ' + errors.join(' · ') : ''}</div></div>}
      <div className="flex items-center justify-between pt-1">
        <div className="text-xs muted flex items-center gap-1.5">{claim.touch_count > 0 ? 'Logs as multi-touch.' : 'First touch.'}{terminal && ' Closes out of worklists.'}</div>
        <button className="btn btn-primary" disabled={errors.length > 0 || pastFu || busy} onClick={submit}><CheckCheck size={14} />{busy ? 'Saving…' : 'Save touch'}</button>
      </div>
    </div>
  );
}
