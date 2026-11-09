import { useEffect, useMemo, useRef, useState } from 'react';
import { FileSearch, ScanText, ShieldCheck } from 'lucide-react';
import { Card, Chip, toast } from './ui';
import { useStore } from '../store';
import { readLetter } from '../lib/engine/letterreader';
import { OCR_LIMITS, looksLikeText, ocrFile } from '../lib/ocr';
import { fmtDate, money } from '../lib/utils';

/** Denial-letter reader. Text PDFs are read directly; scans can be read with OCR that runs entirely in this browser tab (no upload, no logging, nothing stored).
 *  Extracted text is kept in memory only and is wiped after 10 idle minutes, on leaving the page, or with the Clear button. */
export function LetterReader() {
  const { claims, openClaim, addNote, audit_, has } = useStore(); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [scan, setScan] = useState<File | null>(null); const [prog, setProg] = useState<[number, number] | null>(null); const [fromOcr, setFromOcr] = useState(false);
  const f = useMemo(() => (text.trim().length > 20 ? readLetter(text) : null), [text]);
  const hits = useMemo(() => { if (!f) return []; const keys = new Set(f.claimNos.map((x) => x.toUpperCase())); return claims.filter((c) => keys.has(c.claim_no.toUpperCase()) || (c.aliases || []).some((a) => keys.has(String(a).toUpperCase()))).slice(0, 5); }, [f, claims]);
  const idle = useRef<ReturnType<typeof setTimeout>>(); const wipe = () => { setText(''); setScan(null); setProg(null); setFromOcr(false); };
  useEffect(() => { clearTimeout(idle.current); if (text || scan) idle.current = setTimeout(() => { wipe(); toast.info('Letter cleared after 10 idle minutes'); }, OCR_LIMITS.idleMs); return () => clearTimeout(idle.current); }, [text, scan]);
  useEffect(() => () => { clearTimeout(idle.current); }, []);

  const loadFile = async (file: File) => {
    setBusy(true); setScan(null); setFromOcr(false);
    try {
      if (/^image\//.test(file.type)) { setScan(file); setText(''); return; }
      const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString(); const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; let out = '';
      for (let i = 1; i <= Math.min(doc.numPages, 15); i++) { const pg = await doc.getPage(i); const tc = await pg.getTextContent(); out += tc.items.map((x: any) => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n'; }
      await (doc as any).destroy?.(); if (looksLikeText(out)) { setText(out); } else { setText(''); setScan(file); }
    } catch (e: any) { toast.err('Could not read that file: ' + (e.message || e)); } finally { setBusy(false); }
  };
  const runOcr = async () => {
    if (!scan) return; setBusy(true); setProg([0, 1]);
    try { const r = await ocrFile(scan, (d, t) => setProg([d, t])); setText(r.text); setFromOcr(true); setScan(null);
      void audit_('ocr', `OCR extraction run (${r.pages} page${r.pages > 1 ? 's' : ''}, ${r.chars} characters) — processed in the browser, nothing uploaded`, { pages: r.pages, chars: r.chars, source: 'letter-reader' }); // no file name, no text: both can contain PHI
      if (r.chars < 40) toast.err('Very little text was recognised — try a clearer scan'); } catch (e: any) { toast.err(e.message || 'OCR failed'); } finally { setBusy(false); setProg(null); }
  };
  const save = async (claimId: string, claimNo: string) => {
    if (!f) return; const lines = [`Facts from a ${fromOcr ? 'scanned ' : ''}payer letter (verify against the original):`, f.carc.length || f.rarc.length ? `Codes: ${[...f.carc, ...f.rarc].join(', ')}` : '', ...f.deadlineDays.map((d) => `Deadline: ${d.days} days — ${d.context}`), f.dates.length ? `Dates: ${f.dates.map((d) => `${d.label} ${d.iso}`).join('; ')}` : '', f.amounts.length ? `Amounts: ${f.amounts.map((a) => `${a.label} ${a.value}`).join('; ')}` : '', f.refs.length ? `Reference #: ${f.refs.join(', ')}` : ''].filter(Boolean);
    await addNote(claimId, lines.join('\n'), false, false); void audit_('ocr_apply', `Letter facts saved as a note on claim ${claimNo}${fromOcr ? ' (from OCR)' : ''}`, { claim: claimNo, fields: ['codes', 'deadlines', 'dates', 'amounts', 'refs'].filter((k) => (k === 'codes' ? f.carc.length + f.rarc.length : k === 'deadlines' ? f.deadlineDays.length : k === 'dates' ? f.dates.length : k === 'amounts' ? f.amounts.length : f.refs.length) > 0), ocr: fromOcr }, 'claims', claimId); toast.ok('Saved to the claim as a note');
  };
  return (
    <Card title="Denial letter reader" actions={<><label className="btn btn-sm cursor-pointer"><FileSearch size={13} />{busy ? 'Working…' : 'Upload PDF / image'}<input type="file" accept="application/pdf,image/png,image/jpeg" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) void loadFile(x); e.target.value = ''; }} /></label>{(text || scan) && <button className="btn btn-sm" onClick={wipe}>Clear</button>}</>}>
      <div className="flex items-start gap-1.5 text-[11.5px] muted mb-2"><ShieldCheck size={13} className="shrink-0 mt-0.5" />Reads in your browser only. The file and its text are never uploaded or stored, and are cleared after 10 idle minutes.</div>
      {scan && <div className="rounded-lg p-3 mb-2 text-[13px]" style={{ background: 'rgba(245,158,11,.12)' }}>This looks like a scan or photo, so there is no text to read yet.{has('work_claims') ? <> <button className="btn btn-sm btn-primary ml-2" disabled={busy} onClick={runOcr}><ScanText size={13} />{busy && prog ? `Reading page ${prog[0] + 1} of ${prog[1]}…` : 'Read with local OCR'}</button></> : <span className="muted"> Your role cannot run OCR.</span>}</div>}
      <textarea className="input" rows={4} placeholder="…or paste the letter text here" value={text} onChange={(e) => { setText(e.target.value); setFromOcr(false); }} />
      {f && <div className="mt-3 space-y-2 text-[13px]">
        {fromOcr && <div className="text-[11.5px] muted">Recognised by OCR — check codes, dates and amounts against the original before relying on them.</div>}
        {f.payerHint && <div>Payer: <b className="capitalize">{f.payerHint}</b></div>}
        {f.carc.length + f.rarc.length > 0 && <div className="flex gap-1.5 flex-wrap items-center">Codes: {f.carc.map((c) => <Chip key={c} color="#ef4444">{c}</Chip>)}{f.rarc.map((c) => <Chip key={c} color="#6366f1">{c}</Chip>)}</div>}
        {f.deadlineDays.length > 0 && <div className="rounded p-2" style={{ background: 'rgba(245,158,11,.12)' }}>{f.deadlineDays.map((d, i) => <div key={i}>⏱ <b>{d.days} days</b> — {d.context}</div>)}</div>}
        {f.dates.length > 0 && <div>Dates: {f.dates.map((d) => `${d.label} ${fmtDate(d.iso)}`).join(' · ')}</div>}
        {f.amounts.length > 0 && <div>Amounts: {f.amounts.map((a) => `${a.label} ${money(a.value, true)}`).join(' · ')}</div>}
        {f.claimNos.length > 0 && <div>Claim / ICN: {f.claimNos.join(', ')}</div>}
        {f.asks.length > 0 && <ul className="list-disc ml-5">{f.asks.map((a) => <li key={a}>{a}</li>)}</ul>}
        {hits.length > 0 ? <div className="space-y-1">{hits.map((c) => <div key={c.id} className="flex gap-2 items-center flex-wrap"><button className="btn btn-sm" onClick={() => openClaim(c.id)}>Open {c.claim_no}</button>{has('work_claims') && <button className="btn btn-sm" onClick={() => save(c.id, c.claim_no)}>Save facts as note</button>}</div>)}</div> : f.claimNos.length > 0 && <div className="muted text-xs">No claim you have access to matches those numbers.</div>}
      </div>}
    </Card>
  );
}
