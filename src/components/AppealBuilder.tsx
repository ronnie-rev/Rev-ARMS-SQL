import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, FileDown, Printer, Save, Send } from 'lucide-react';
import { useStore } from '../store';
import { useLimits } from '../hooks';
import { Chip, Field, Modal, Tabs, toast } from './ui';
import { DateField } from './CalendarPicker';
import { PACKET_DEFAULTS, fillText, KIND_LABEL, LEVEL_LABEL, nextLevel, STATUS_LABEL } from '../lib/engine/appeal';
import { deadlinesFor } from '../lib/engine/limits';
import { splitDenials } from '../lib/kb';
import { money, todayISO, downloadFile, fmtDate } from '../lib/utils';
import { letterToPdf } from '../lib/pdf/letterPdf';
import { b64ToBytes, fillPdf, type Overlay } from '../lib/pdf/formFill';
import { LetterTab } from './appeal/LetterTab';
import { AppealStrategy, VERDICT_COLOR } from './appeal/AppealStrategy';
import { appealStrategy } from '../lib/engine/appealintel';
import { resolveFaxCfg } from '../lib/engine/fax';
import { letterheadHtml } from '../lib/engine/appealforge';
import { FaxDialog } from './appeal/FaxDialog';
import { useLetter } from './appeal/useLetter';
import { putInbox } from '../lib/docinbox';
import { useNavigate } from 'react-router-dom';
import type { Appeal, AppealKind } from '../lib/types';

type Tab = 'letter' | 'strategy' | 'form' | 'track';
/** Appeal workbench: smart letter library + your templates, rich editor, quality check, PDF / Word / print export, payer form auto-fill, packet checklist and tracking. */
/** Waits for the claim to exist (deep links open before data finishes loading) so the workbench's hooks never run without it. */
export function AppealBuilder(props: { claimId: string; appealId?: string; kind?: AppealKind; style?: 'courtesy'; onClose: () => void }) {
  const has = useStore((s) => s.claims.some((c) => c.id === props.claimId)); return has ? <AppealWorkbench {...props} /> : null;
}
function AppealWorkbench({ claimId, appealId, kind: kind0, style, onClose }: { claimId: string; appealId?: string; kind?: AppealKind; style?: 'courtesy'; onClose: () => void }) {
  const st = useStore(); const claim = st.claims.find((c) => c.id === claimId); const { cfg, idx } = useLimits();
  const existing = st.appeals.find((a) => a.id === appealId); const history = st.appeals.filter((a) => a.claim_id === claimId);
  const can = useStore((x) => x.has('work_claims')); const [fax, setFax] = useState(false); const [tab, setTab] = useState<Tab>('letter'); const [saving, setSaving] = useState(false); const [qc, setQc] = useState<null | { run: () => void; label: string }>(null);
  const [kind, setKind] = useState<AppealKind>(existing?.kind || kind0 || 'appeal'); const [level, setLevel] = useState(existing?.level || nextLevel(history)); const [reason, setReason] = useState(existing?.reason || '');
  const [form, setForm] = useState({ status: existing?.status || ('draft' as Appeal['status']), due_on: existing?.due_on || null as string | null, filed_on: existing?.filed_on || null as string | null, method: existing?.method || '', tracking_no: existing?.tracking_no || '', amount_disputed: existing?.amount_disputed ?? claim?.balance ?? 0, amount_recovered: existing?.amount_recovered ?? null as number | null, outcome_note: existing?.outcome_note || '' });
  const [packet, setPacket] = useState<{ name: string; note?: string; done?: boolean }[]>(existing?.attachments?.length ? existing.attachments : PACKET_DEFAULTS[existing?.kind || kind0 || 'appeal'].map((name) => ({ name, done: false }))); const [newItem, setNewItem] = useState('');
  const [formId, setFormId] = useState(existing?.form_id || ''); const [vals, setVals] = useState<Record<string, string>>(existing?.form_values || {});
  const dl = useMemo(() => (claim ? deadlinesFor(claim, idx.resolve(claim.payer, claim.client_id, claim.custom?.plan_type), todayISO(), cfg).find((d) => d.kind === 'afl') : undefined), [claim, idx, cfg]);
  useEffect(() => { if (!existing && !form.due_on && dl) setForm((f) => ({ ...f, due_on: dl.due })); }, [dl]); // eslint-disable-line react-hooks/exhaustive-deps
  const L = useLetter({ claim: claim!, kind, level, reason, dueOn: form.due_on, tracking: form.tracking_no, packet, existing, deadlineLeft: dl?.left ?? null, initialSource: style });
  const codes = useMemo(() => splitDenials(claim?.denial_codes), [claim?.denial_codes]); const vars = L.vars; const shown = L.shown;
  const payerMeta = (st.config.find((x) => x.category === 'payer' && x.value.toLowerCase() === (claim?.payer || '').toLowerCase())?.meta || {}) as Record<string, string>;
  const strat = useMemo(() => (claim ? appealStrategy({ claim, claims: st.claims, appeals: st.appeals, activity: st.activity, payerMeta, level, amount: form.amount_disputed || claim.balance, today: todayISO(), templateId: L.match?.id || existing?.template || null, deadlineLeft: dl?.left ?? null }) : null), [claim, st.claims, st.appeals, st.activity, payerMeta, level, form.amount_disputed, L.match?.id, existing?.template, dl?.left]); // eslint-disable-line react-hooks/exhaustive-deps
  const forms = st.payerForms.filter((f) => f.active && (!f.payer || f.payer.toLowerCase() === (claim?.payer || '').toLowerCase()) && (!f.client_id || f.client_id === claim?.client_id));
  const pf = forms.find((f) => f.id === formId) || st.payerForms.find((f) => f.id === formId);
  const [bytes, setBytes] = useState<Uint8Array | null>(null); const [url, setUrl] = useState<string | null>(null); const last = useRef<string | null>(null);
  useEffect(() => { setBytes(null); if (!pf) return; let live = true; void st.loadFormFile(pf.id).then((b) => live && b && setBytes(b64ToBytes(b))); return () => { live = false; }; }, [pf?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fieldMap = (pf?.field_map?.fields || {}) as Record<string, string>; const overlays = (pf?.field_map?.overlays || []) as Overlay[];
  const resolved = useMemo(() => { const o: Record<string, string> = {}; for (const [f, t] of Object.entries(fieldMap)) o[f] = f in vals ? vals[f] : fillText(String(t), vars); return o; }, [fieldMap, vals, vars]);
  useEffect(() => { if (!bytes || tab !== 'form') return; let live = true; const t = setTimeout(async () => { try { const out = await fillPdf(bytes, { fields: resolved, overlays: overlays.map((o) => ({ ...o, value: o.id in vals ? vals[o.id] : fillText(o.text, vars) })) }); if (!live) return; if (last.current) URL.revokeObjectURL(last.current); const u = URL.createObjectURL(new Blob([out as BlobPart], { type: 'application/pdf' })); last.current = u; setUrl(u); } catch (e) { toast.err('Could not render the form: ' + (e as Error).message); } }, 250); return () => { live = false; clearTimeout(t); }; }, [bytes, resolved, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (last.current) URL.revokeObjectURL(last.current); }, []);
  if (!claim) return null;
  const save = async (status?: Appeal['status'], over: Partial<typeof form> = {}) => {
    setSaving(true);
    try {
      const ser = L.serialize(); const fm = { ...form, ...over }; const body = { kind, level, reason: reason || null, template: L.source === 'library' ? ser.matchId || null : L.tpl?.id || null, form_id: formId || null, attachments: packet, form_values: vals, letter: ser, due_on: fm.due_on, filed_on: fm.filed_on, method: fm.method || null, tracking_no: fm.tracking_no || null, amount_disputed: fm.amount_disputed, amount_recovered: fm.amount_recovered, outcome_note: fm.outcome_note || null };
      const s = status ?? form.status;
      if (existing) await st.updateAppeal(existing.id, { ...body, status: s }); else { const a = await st.createAppeal({ claim_id: claim.id, kind, level, template: body.template, form_id: body.form_id, due_on: body.due_on, reason: body.reason, amount_disputed: body.amount_disputed, letter: body.letter }); await st.updateAppeal(a.id, { ...body, status: s }); }
      { const f = L.facts; const cur = claim.custom || {}; const next = { ...cur, ...(f.memberId && f.memberId !== cur.member_id ? { member_id: f.memberId } : {}), ...(f.dx && f.dx !== cur.dx ? { dx: f.dx } : {}), ...(f.auth && f.auth !== cur.auth_no ? { auth_no: f.auth } : {}) }; if (JSON.stringify(next) !== JSON.stringify(cur)) { try { await st.patchClaims([claim.id], { custom: next }, undefined); } catch { /* facts stay on the letter */ } } } // link member ID / diagnosis / auth # back to the claim so the next letter pre-fills
      setForm((f) => ({ ...f, ...over, status: s })); if (status === 'sent' && strat) { try { await st.patchClaims([claim.id], { next_fu: strat.chase.date }, `Appeal sent — chase on ${strat.chase.date}`, 'followup'); } catch { /* follow-up is a convenience */ } } toast.ok(status === 'sent' ? `Marked as sent · follow-up set for ${fmtDate(strat?.chase.date)}` : 'Saved'); if (status) onClose();
    } finally { setSaving(false); }
  };
  const nav = useNavigate(); const toStudio = () => { putInbox({ kind: 'word', name: `${kind}-${claim.claim_no}-L${level}.docx`, html: (L.lh.logo || L.lh.name ? letterheadHtml(L.lh, L.client?.name) : '') + L.shown }); onClose(); nav('/studio'); };
  const base = `${kind}-${claim.claim_no}-L${level}`; const lh = L.lh;
  const gate = (label: string, run: () => void) => { if (L.issues.some((i) => i.level === 'warn')) setQc({ run, label }); else run(); };
  const pdf = () => gate('PDF', async () => downloadFile(`${base}.pdf`, await letterToPdf(shown, { title: L.match?.label, letterhead: lh, fallbackName: L.client?.name }), 'application/pdf'));
  const docx = () => gate('Word', async () => { const { letterToDocx } = await import('../lib/pdf/letterDocx'); downloadFile(`${base}.docx`, await letterToDocx(shown, { letterhead: lh, fallbackName: L.client?.name, title: base }), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); });
  const print = () => gate('print', () => { const w = window.open('', '_blank'); if (!w) return toast.err('Pop-up blocked'); w.document.write(`<!doctype html><title>${base}</title><style>body{font:12pt "Times New Roman",serif;margin:1in;line-height:1.4}p{margin:0 0 .75em}</style>${letterheadHtml(lh, L.client?.name)}${shown}`); w.document.close(); w.focus(); w.print(); });
  const needDate = (s: Appeal['status']) => (s === 'sent' || s === 'pending') && !form.filed_on;
  const faxForm = pf && bytes ? async () => fillPdf(bytes, { fields: resolved, overlays: overlays.map((o) => ({ ...o, value: o.id in vals ? vals[o.id] : fillText(o.text, vars) })) }) : null;
  return (
    <Modal wide open onClose={onClose} title={<span>{KIND_LABEL[kind]} · {claim.claim_no} <span className="muted font-normal text-sm">{LEVEL_LABEL(level)}</span></span>} footer={<>
      <button className="btn" disabled={saving || !can} title={can ? undefined : 'Your role is read-only'} onClick={() => save()}><Save size={13} />Save draft</button><button className="btn" onClick={pdf}><Download size={13} />PDF</button><button className="btn" onClick={docx}><FileDown size={13} />Word</button><button className="btn" title="Open the letter in the Word editor (tables, pictures, find & replace, merge with other documents)" onClick={toStudio}>Edit in Studio</button><button className="btn" onClick={print}><Printer size={13} />Print</button><button className="btn" disabled={!can} onClick={() => { if (!resolveFaxCfg(st.settings.fax_cfg).enabled) return toast.info('Fax sending is a placeholder for now — turn it on in Admin → Fax setup when your provider is ready'); gate('fax', () => setFax(true)); }}><Send size={13} />Fax</button>
      <span className="mr-auto text-[11px] muted self-center">Packet {packet.filter((p) => p.done).length}/{packet.length} ready{L.open.length > 0 && ` · ${L.open.length} to complete`}</span>
      <button className="btn btn-primary" disabled={saving || !can} onClick={() => { if (needDate('sent')) setForm((f) => ({ ...f, filed_on: todayISO() })); void save('sent'); }}><Send size={13} />Mark sent</button></>}>
      <div className="flex items-center gap-2 flex-wrap text-[12.5px] mb-3">
        {strat && <button className="focus-ring" title="Open the strategy tab" onClick={() => setTab('strategy')}><Chip color={VERDICT_COLOR[strat.verdict]}>{strat.headline}{strat.odds ? ` · ${Math.round(strat.odds.rate * 100)}%` : ''}</Chip></button>}
        {codes.map((c) => <Chip key={c} color="#f59e0b">{c}</Chip>)}<span className="muted">{claim.payer} · balance {money(claim.balance, true)}</span>
        {dl ? <Chip color={dl.left < 0 ? '#ef4444' : dl.left <= 14 ? '#f97316' : '#22c55e'}>{dl.left < 0 ? `appeal window passed ${-dl.left}d ago` : `${dl.left}d left in appeal window`}{dl.startSrc === 'estimated' ? ' (est.)' : ''}</Chip> : <Chip color="#64748b">no appeal limit set for this payer</Chip>}
        {history.filter((a) => a.id !== existing?.id).length > 0 && <span className="muted">Earlier: {history.filter((a) => a.id !== existing?.id).map((a) => `L${a.level} ${STATUS_LABEL[a.status].toLowerCase()}`).join(', ')}</span>}
      </div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'letter', label: 'Letter' }, { id: 'strategy', label: 'Strategy' }, { id: 'form', label: 'Payer form', count: forms.length || undefined }, { id: 'track', label: 'Tracking' }]} />
      <div className="pt-3">
        {tab === 'strategy' && strat && <AppealStrategy s={strat} m={L} claim={claim} codes={codes} amount={form.amount_disputed || claim.balance} deadlineLeft={dl?.left ?? null} packet={packet} setPacket={setPacket} level={level} />}
        {tab === 'letter' && <div className="space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Type"><select className="input" value={kind} onChange={(e) => { const k = e.target.value as AppealKind; setKind(k); if (!existing) setLevel(k === 'appeal' || k === 'external_review' ? nextLevel(history) : 1); L.reset(); }}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Level"><select className="input" value={level} onChange={(e) => { setLevel(+e.target.value); L.reset(); }}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{LEVEL_LABEL(n)}</option>)}</select></Field>
            <Field label="Reason / basis (fills the denial-reason text)"><input className="input" value={reason} onChange={(e) => { setReason(e.target.value); L.reset(); }} placeholder="e.g. considered cosmetic" /></Field>
          </div>
          <LetterTab m={L} level={level} kind={kind} />
        </div>}
        {tab === 'form' && <div className="space-y-3">
          {forms.length === 0 && !pf ? <p className="text-sm muted">No official form is set up for {claim.payer || 'this payer'}. Managers can upload one in Admin → Appeal forms; fields are mapped automatically.</p> : <>
            <Field label="Payer form"><select className="input !w-auto" value={pf?.id || ''} onChange={(e) => { setFormId(e.target.value); setVals({}); setUrl(null); }}><option value="">— choose —</option>{forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
            {pf && <div className="grid lg:grid-cols-[320px_1fr] gap-3">
              <div className="space-y-2 max-h-[460px] overflow-auto pr-1">{Object.keys(fieldMap).length === 0 && overlays.length === 0 && <p className="text-xs muted">This form has no mapped fields yet (Admin → Appeal forms).</p>}
                {Object.keys(fieldMap).map((f) => <Field key={f} label={f}><input className="input" value={resolved[f] ?? ''} onChange={(e) => setVals({ ...vals, [f]: e.target.value })} /></Field>)}
                {overlays.map((o) => <Field key={o.id} label={`Page ${o.page + 1}: ${o.text}`}><input className="input" value={o.id in vals ? vals[o.id] : fillText(o.text, vars)} onChange={(e) => setVals({ ...vals, [o.id]: e.target.value })} /></Field>)}</div>
              <div>{url ? <iframe title="Filled form" src={url} className="w-full h-[460px] rounded-lg border hair bg-white" /> : <div className="panel2 h-[460px] grid place-items-center text-sm muted">Rendering…</div>}
                {url && <a className="btn btn-sm mt-2 inline-flex" href={url} download={`${pf.name}-${claim.claim_no}.pdf`}><Download size={13} />Download filled form</a>}</div></div>}</>}
        </div>}
        {tab === 'track' && <div className="space-y-4"><div className="grid md:grid-cols-3 gap-3">
          <Field label="Status"><select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Appeal['status'] })}>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Appeal deadline (AFL)"><DateField value={form.due_on} onChange={(d) => setForm({ ...form, due_on: d })} /></Field>
          <Field label="Filed on"><DateField value={form.filed_on} onChange={(d) => setForm({ ...form, filed_on: d })} /></Field>
          <Field label="Method"><select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option value="">—</option>{['Payer portal', 'Fax', 'Certified mail', 'Clearinghouse', 'Phone / verbal'].map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Tracking / confirmation #"><input className="input" value={form.tracking_no} onChange={(e) => setForm({ ...form, tracking_no: e.target.value })} /></Field>
          <Field label="Amount disputed ($)"><input type="number" className="input" value={form.amount_disputed} onChange={(e) => setForm({ ...form, amount_disputed: +e.target.value })} /></Field>
          {['won', 'partial', 'lost'].includes(form.status) && <><Field label="Amount recovered ($)"><input type="number" className="input" value={form.amount_recovered ?? ''} onChange={(e) => setForm({ ...form, amount_recovered: e.target.value ? +e.target.value : null })} /></Field><Field label="Outcome note" className="md:col-span-2"><input className="input" value={form.outcome_note} onChange={(e) => setForm({ ...form, outcome_note: e.target.value })} /></Field></>}
        </div>
          <div><div className="label">Packet checklist — what goes with this submission</div><ul className="space-y-1">{packet.map((it, i) => <li key={i} className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!!it.done} onChange={() => setPacket(packet.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} /><span className={it.done ? 'line-through muted flex-1' : 'flex-1'}>{it.name}</span><button className="btn btn-ghost btn-sm" aria-label="Remove item" onClick={() => setPacket(packet.filter((_, j) => j !== i))}>✕</button></li>)}</ul><div className="flex gap-2 mt-2 max-w-md"><input className="input" placeholder="Add an item…" value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newItem.trim()) { setPacket([...packet, { name: newItem.trim(), done: false }]); setNewItem(''); } }} /><button className="btn btn-sm" disabled={!newItem.trim()} onClick={() => { setPacket([...packet, { name: newItem.trim(), done: false }]); setNewItem(''); }}>Add</button></div></div></div>}
      </div>
      <Modal open={!!qc} onClose={() => setQc(null)} title="Before you export" footer={<><button className="btn" onClick={() => setQc(null)}>Go back and fix</button><button className="btn btn-primary" onClick={() => { const r = qc!.run; setQc(null); r(); }}>Export anyway</button></>}>
        <p className="text-xs muted mb-3">A quick quality check — nothing here blocks the export.</p><ul className="space-y-1.5">{L.issues.map((i, k) => <li key={k} className="flex gap-2 text-[13px]"><AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: i.level === 'warn' ? '#f59e0b' : '#94a3b8' }} />{i.text}</li>)}</ul>
      </Modal>
      {fax && <FaxDialog claim={claim} appealId={existing?.id || null} letterHtml={shown} formPdf={faxForm} lh={lh} fallbackName={L.client?.name} onClose={() => setFax(false)} onSent={(r) => { setFax(false); void save('sent', { filed_on: todayISO(), method: 'Fax', tracking_no: r.id }); }} />}
    </Modal>
  );
}
