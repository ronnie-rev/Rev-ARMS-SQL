import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Upload, Wand2 } from 'lucide-react';
import { useStore } from '../../store';
import { Card, Chip, Field, toast } from '../../components/ui';
import { PdfPageCanvas } from '../../components/PdfPageCanvas';
import { mapFields, VAR_KEYS } from '../../lib/engine/appeal';
import { b64ToBytes, bytesToB64, inspectPdf, type FormField, type Overlay } from '../../lib/pdf/formFill';
import { uid } from '../../lib/utils';
import type { PayerForm } from '../../lib/types';

const SCALE = 1.2;
/** Official payer appeal / reconsideration forms: upload a PDF, auto-map its fields to claim variables, or place text on flat forms. */
export default function AppealForms() {
  const { payerForms, config, save, del, loadFormFile, saveFormFile } = useStore(); const file = useRef<HTMLInputElement>(null);
  const [sel, setSel] = useState(payerForms[0]?.id || ''); const form = payerForms.find((f) => f.id === sel);
  const [bytes, setBytes] = useState<Uint8Array | null>(null); const [fields, setFields] = useState<FormField[]>([]); const [page, setPage] = useState(0); const [busy, setBusy] = useState(false);
  const payers = useMemo(() => config.filter((o) => o.category === 'payer' && o.active).map((o) => o.value).sort(), [config]);
  const fmap = (form?.field_map?.fields || {}) as Record<string, string>; const overlays = (form?.field_map?.overlays || []) as Overlay[];
  useEffect(() => { setBytes(null); setFields([]); setPage(0); if (!form) return; let live = true; void loadFormFile(form.id).then(async (b) => { if (!live || !b) return; const u = b64ToBytes(b); setBytes(u); try { setFields((await inspectPdf(u)).fields); } catch { /* unreadable */ } }); return () => { live = false; }; }, [form?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = (p: Partial<PayerForm>) => form && save('payer_forms', [{ ...form, ...p, updated_at: new Date().toISOString() }]);
  const setMap = (next: { fields?: Record<string, string>; overlays?: Overlay[] }) => patch({ field_map: { fields: fmap, overlays, ...next } });
  const upload = async (f: File) => {
    setBusy(true);
    try {
      const u = new Uint8Array(await f.arrayBuffer()); const info = await inspectPdf(u); const now = new Date().toISOString();
      const row: PayerForm = { id: uid(), name: f.name.replace(/\.pdf$/i, ''), payer: null, client_id: null, kind: 'appeal', mode: info.fields.length ? 'acroform' : 'overlay', field_map: {}, pages: info.pages, bytes: u.length, active: true, created_by: null, created_at: now, updated_at: now };
      const sug = mapFields(info.fields.map((x) => x.name)); row.field_map = { fields: Object.fromEntries(sug.filter((s) => s.key).map((s) => [s.field, `{${s.key}}`])), overlays: [] };
      await saveFormFile(row, bytesToB64(u)); setSel(row.id); toast.ok(info.fields.length ? `${info.fields.length} fields found · ${sug.filter((s) => s.key).length} mapped automatically` : 'Flat PDF — place text boxes on the page');
    } catch (e) { toast.err('Could not read that PDF: ' + (e as Error).message); } finally { setBusy(false); }
  };
  const automap = () => { const sug = mapFields(fields.map((x) => x.name)); const next = { ...fmap }; for (const s of sug) if (s.key && !next[s.field]) next[s.field] = `{${s.key}}`; void setMap({ fields: next }); toast.ok('Unmapped fields filled where a match was found'); };
  const [size, setSize] = useState({ w: 612, h: 792 });
  const addOverlay = (e: React.MouseEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); const o: Overlay = { id: uid(), page, x: Math.round((e.clientX - r.left) / SCALE), y: Math.round((e.clientY - r.top) / SCALE), size: 10, text: '{claim}' }; void setMap({ overlays: [...overlays, o] }); };
  const drag = (o: Overlay, e: React.PointerEvent) => { e.stopPropagation(); const sx = e.clientX, sy = e.clientY; const move = (m: PointerEvent) => { void 0; const nx = Math.max(0, o.x + (m.clientX - sx) / SCALE), ny = Math.max(0, o.y + (m.clientY - sy) / SCALE); (e.target as HTMLElement).style.transform = `translate(${(nx - o.x) * SCALE}px,${(ny - o.y) * SCALE}px)`; (e.target as HTMLElement).dataset.nx = String(nx); (e.target as HTMLElement).dataset.ny = String(ny); }; const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); const t = e.target as HTMLElement; if (t.dataset.nx) void setMap({ overlays: overlays.map((x) => (x.id === o.id ? { ...x, x: Math.round(+t.dataset.nx!), y: Math.round(+t.dataset.ny!) } : x)) }); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); };
  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start">
      <Card title="Payer forms" actions={<><input ref={file} type="file" accept="application/pdf" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => file.current?.click()}><Upload size={13} />Upload PDF</button></>}>
        {payerForms.length === 0 && <p className="text-sm muted">Upload a payer’s official appeal or reconsideration form. Fillable (AcroForm) PDFs are mapped automatically; flat forms get text boxes you place.</p>}
        {payerForms.map((f) => <button key={f.id} onClick={() => setSel(f.id)} className="nav-item w-full text-left !py-1.5" data-active={sel === f.id}><div className="text-[13px]">{f.name}</div><div className="text-[11px] muted">{f.payer || 'Any payer'} · {f.mode === 'acroform' ? 'fillable' : 'flat'} · {f.pages}p</div></button>)}
      </Card>
      {form ? <div className="space-y-4">
        <Card title={form.name} actions={<button className="btn btn-sm" onClick={async () => { await del('payer_forms', [form.id]); setSel(''); }}><Trash2 size={13} /></button>}>
          <div className="grid md:grid-cols-4 gap-3">
            <Field label="Name"><input className="input" defaultValue={form.name} onBlur={(e) => patch({ name: e.target.value })} /></Field>
            <Field label="Payer"><select className="input" value={form.payer || ''} onChange={(e) => patch({ payer: e.target.value || null })}><option value="">Any payer</option>{payers.map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Kind"><select className="input" value={form.kind} onChange={(e) => patch({ kind: e.target.value })}>{['appeal', 'reconsideration', 'corrected_claim', 'underpayment_dispute', 'external_review'].map((k) => <option key={k}>{k}</option>)}</select></Field>
            <Field label="Active"><label className="flex gap-2 pt-2"><input type="checkbox" checked={form.active} onChange={(e) => patch({ active: e.target.checked })} />Offered in the appeal builder</label></Field>
          </div>
        </Card>
        {fields.length > 0 && <Card title={`Form fields (${fields.length})`} actions={<button className="btn btn-sm" onClick={automap}><Wand2 size={13} />Auto-map</button>}>
          <table className="tbl w-full text-sm"><thead><tr><th>PDF field</th><th>Fills with</th></tr></thead><tbody>{fields.map((f) => <tr key={f.name}><td className="font-mono text-xs">{f.name} <span className="muted">({f.type})</span></td><td>
            <div className="flex gap-1"><select className="input !py-1 !w-40" value={VAR_KEYS.includes((fmap[f.name] || '').replace(/[{}]/g, '')) && /^\{\w+\}$/.test(fmap[f.name] || '') ? fmap[f.name] : fmap[f.name] ? '__custom' : ''} onChange={(e) => { const n = { ...fmap }; if (!e.target.value) delete n[f.name]; else n[f.name] = e.target.value === '__custom' ? 'text' : e.target.value; void setMap({ fields: n }); }}><option value="">— leave blank —</option>{VAR_KEYS.map((k) => <option key={k} value={`{${k}}`}>{k}</option>)}<option value="__custom">Custom text…</option></select>
              {fmap[f.name] != null && !/^\{\w+\}$/.test(fmap[f.name]) && <input className="input !py-1" defaultValue={fmap[f.name]} placeholder="text with {variables}" onBlur={(e) => setMap({ fields: { ...fmap, [f.name]: e.target.value } })} />}</div></td></tr>)}</tbody></table></Card>}
        {bytes && <Card title="Page layout (click to add a text box)" actions={<div className="flex gap-1 items-center">{Array.from({ length: form.pages || 1 }, (_, i) => <button key={i} className={'btn btn-sm ' + (i === page ? 'btn-primary' : '')} onClick={() => setPage(i)}>{i + 1}</button>)}</div>}>
          <div className="overflow-auto max-h-[640px]"><PdfPageCanvas bytes={bytes} page={page} scale={SCALE} onSize={(w, h) => setSize({ w, h })}>
            <div className="absolute inset-0 cursor-crosshair" onClick={addOverlay} style={{ width: size.w * SCALE, height: size.h * SCALE }}>
              {overlays.filter((o) => o.page === page).map((o) => <div key={o.id} onPointerDown={(e) => drag(o, e)} onClick={(e) => e.stopPropagation()} className="absolute px-1 rounded bg-brand-500/20 border border-brand-500 text-brand-700 cursor-move whitespace-nowrap" style={{ left: o.x * SCALE, top: o.y * SCALE, fontSize: o.size * SCALE }}>{o.text}</div>)}</div></PdfPageCanvas></div>
          {overlays.length > 0 && <div className="mt-3 space-y-1">{overlays.map((o) => <div key={o.id} className="flex gap-2 items-center"><Chip color="#6366f1">p{o.page + 1}</Chip><input className="input !py-1" defaultValue={o.text} onBlur={(e) => setMap({ overlays: overlays.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} /><input type="number" className="input !py-1 !w-16" defaultValue={o.size} onBlur={(e) => setMap({ overlays: overlays.map((x) => (x.id === o.id ? { ...x, size: +e.target.value || 10 } : x)) })} /><button className="btn btn-sm" onClick={() => setMap({ overlays: overlays.filter((x) => x.id !== o.id) })}><Trash2 size={12} /></button></div>)}</div>}
          <p className="text-[11px] muted mt-2"><Plus size={10} className="inline" /> Text may use variables like {'{patient}'} {'{claim}'} {'{dos}'} {'{balance}'} {'{date}'}. Drag a box to move it.</p>
        </Card>}
      </div> : <Card><p className="text-sm muted">Select or upload a form.</p></Card>}
    </div>
  );
}
