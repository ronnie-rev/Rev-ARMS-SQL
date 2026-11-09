import { useEffect, useMemo, useState } from 'react';
import { Printer, Send } from 'lucide-react';
import { useStore } from '../../store';
import { Chip, Field, Modal, toast } from '../ui';
import { MAX_FAX_BYTES, formatFax, normalizeFax, resolveFaxCfg } from '../../lib/engine/fax';
import { coverSheetPdf, mergePdfs, toB64 } from '../../lib/pdf/packet';
import { letterToPdf } from '../../lib/pdf/letterPdf';
import type { Claim } from '../../lib/types';

/** Build and send one fax: cover sheet + appeal letter + filled payer form (optional) + supporting PDFs. Credentials never touch the browser. */
export function FaxDialog({ claim, appealId, letterHtml, formPdf, fallbackName, lh, onClose, onSent }: { claim: Claim; appealId: string | null; letterHtml: string; formPdf: (() => Promise<Uint8Array | null>) | null; fallbackName?: string; lh: { name?: string; phone?: string; fax?: string; address?: string; npi?: string; taxId?: string; logo?: string; logoTextOnly?: boolean }; onClose: () => void; onSent: (r: { to: string; id: string }) => void }) {
  const st = useStore(); const cfg = resolveFaxCfg(st.settings.fax_cfg); const me = st.me();
  const payer = st.config.find((x) => x.category === 'payer' && x.value.toLowerCase() === (claim.payer || '').toLowerCase()); const pm = (payer?.meta || {}) as Record<string, string>;
  const [to, setTo] = useState(pm.appeal_fax || ''); const [name, setName] = useState(claim.payer || ''); const [note, setNote] = useState(cfg.coverNote);
  const [subject, setSubject] = useState(`Appeal — claim ${claim.claim_no}`); const [incForm, setIncForm] = useState(!!formPdf); const [extra, setExtra] = useState<{ name: string; bytes: Uint8Array }[]>([]);
  const [busy, setBusy] = useState(false); const [sum, setSum] = useState<{ pages: number; bytes: number } | null>(null); const [err, setErr] = useState('');
  const e164 = normalizeFax(to);
  const build = async () => {
    const lp: any = await letterToPdf(letterHtml, { title: subject, letterhead: lh, fallbackName }); const parts: Uint8Array[] = [lp instanceof Uint8Array ? lp : new Uint8Array(await lp.arrayBuffer())]; if (incForm && formPdf) { const f = await formPdf(); if (f) parts.push(f); } for (const x of extra) parts.push(x.bytes);
    const body = await mergePdfs(parts); const cover = await coverSheetPdf({ cfg, to: { name, fax: e164 || to }, from: { practice: lh.name, person: me?.full_name, phone: lh.phone, fax: lh.fax || cfg.fromNumber }, pages: body.pages + 1, re: `Claim ${claim.claim_no}${claim.dos ? ` · DOS ${claim.dos}` : ''}`, note, logo: lh.logo });
    return mergePdfs([cover, body.bytes]);
  };
  useEffect(() => { let live = true; setSum(null); void build().then((m) => live && setSum({ pages: m.pages, bytes: m.bytes.length })).catch(() => live && setSum(null)); return () => { live = false; }; }, [incForm, extra.length, note, name, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const probs = useMemo(() => { const p: string[] = []; if (!cfg.enabled && cfg.provider !== 'mock' && st.mode !== 'local') p.push('Fax is switched off — a manager can enable it in Admin → Fax setup.'); if (!e164) p.push('Enter a valid US fax number (or +country code).'); if (sum && sum.pages > cfg.maxPages) p.push(`${sum.pages} pages exceeds your ${cfg.maxPages}-page limit.`); if (sum && sum.bytes > MAX_FAX_BYTES) p.push('Document is over 4 MB — drop a supporting file or print/scan instead.'); return p; }, [cfg, e164, sum, st.mode]);
  const addFiles = async (fl: FileList | null) => { if (!fl) return; const out = [...extra]; for (const f of Array.from(fl)) { if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { toast.err(`${f.name}: only PDFs can be attached`); continue; } out.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); } setExtra(out); };
  const send = async () => { setBusy(true); setErr(''); try { const m = await build(); const row = await st.sendFaxDoc({ to: e164!, subject, pdfBase64: toB64(m.bytes), pages: m.pages, claimId: claim.id, appealId, clientId: claim.client_id }); toast.ok(row.status === 'test' ? 'Demo fax recorded (nothing was transmitted)' : 'Fax queued'); onSent({ to: e164!, id: row.provider_id || row.id }); } catch (e: any) { setErr(e.message || 'Fax failed'); } finally { setBusy(false); } };
  return (
    <Modal open onClose={onClose} title="Send by fax" footer={<><span className="mr-auto text-[11px] muted self-center">{sum ? `${sum.pages} pages · ${(sum.bytes / 1024).toFixed(0)} KB` : 'Building…'}</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || probs.length > 0 || !sum} onClick={send}><Send size={13} />{busy ? 'Sending…' : 'Send fax'}</button></>}>
      <div className="space-y-3">
        {cfg.provider === 'mock' && <div className="text-[12px] p-2 rounded bg-amber-50 text-amber-800">Test mode — nothing is transmitted. Pick a real provider in Admin → Fax setup.</div>}
        <div className="grid sm:grid-cols-2 gap-3"><Field label="To (payer)"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Fax number" hint={e164 ? `Will dial ${formatFax(e164)}` : pm.appeal_fax ? undefined : 'No appeal fax saved for this payer — add it in Admin → Payers'}><input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="(555) 123-4567" /></Field></div>
        <Field label="Subject (internal log)"><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Cover-sheet message"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="text-[13px] space-y-1"><div className="label">Included</div><label className="flex gap-2 items-center"><input type="checkbox" checked readOnly />Cover sheet + appeal letter</label>{formPdf && <label className="flex gap-2 items-center"><input type="checkbox" checked={incForm} onChange={(e) => setIncForm(e.target.checked)} />Filled payer form</label>}
          {extra.map((x, i) => <div key={i} className="flex gap-2 items-center"><Chip>PDF</Chip><span className="flex-1 truncate">{x.name}</span><button className="btn btn-ghost btn-sm" onClick={() => setExtra(extra.filter((_, j) => j !== i))}>✕</button></div>)}
          <label className="btn btn-sm inline-flex cursor-pointer"><Printer size={13} />Attach supporting PDFs<input type="file" accept="application/pdf" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} /></label></div>
        <div className="text-[11.5px] muted">PHI check: the cover sheet carries the claim number only. Review the letter for patient names before sending — workspace is PHI-free by default.</div>
        {probs.map((p) => <div key={p} className="text-[12px] text-red-600">• {p}</div>)}{err && <div className="text-[12px] text-red-600">Send failed: {err}</div>}
      </div>
    </Modal>
  );
}
