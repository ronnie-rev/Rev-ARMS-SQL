import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ClipboardPaste, FileSearch, FileText, ScanText, ShieldCheck, Trash2, Upload, Zap } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, Empty, PageHeader, Stat, toast } from '../components/ui';
import { CreateAppealButton } from '../components/appeal/CreateAppeal';
import { OCR_LIMITS, ocrFile } from '../lib/ocr';
import { ACCEPT, extractText, kindOf, type Sheet } from '../lib/docread';
import { convertToPdf, probeServices } from '../lib/services';
import { docxToHtml } from '../lib/docx/docxhtml';
import { putInbox, takeInbox } from '../lib/docinbox';
import { DOC_LABEL, matchClaims, npiValid, readDocument, type DocRead } from '../lib/engine/docintel';
import { docHash, isX12, looksLikeEob, parseEobText, parseRemitSheet } from '../lib/engine/eobtext';
import { triage, verifyLetter, verifyRemit, type Check } from '../lib/engine/docverify';
import { suggestFromCodes } from '../lib/engine/carc';
import { letterDate } from '../lib/engine/docactions';
import { mergeConfirmed, proposeUpdates, type Proposal } from '../lib/engine/docactions';
import { adjSplit, parseEra, planEra, type Era, type EraPlan } from '../lib/engine/era835';
import { downloadFile, fmtDate, money, todayISO } from '../lib/utils';
import type { Claim } from '../lib/types';

type Status = 'reading' | 'needs_ocr' | 'ocr' | 'ready' | 'error';
interface Doc { id: string; name: string; file?: File; src?: File; sheets?: Sheet[]; text: string; fromOcr: boolean; status: Status; prog?: [number, number]; err?: string }
const TYPE_COLOR: Record<string, string> = { denial: '#ef4444', eob: '#0ea5e9', auth: '#8b5cf6', records: '#f59e0b', appeal_decision: '#6366f1', overpayment: '#dc2626', other: '#64748b' };
const AUTO_KEY = 'claimsiq:ocr-auto'; let seq = 0;
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

interface Analysis { r: DocRead; era: Era | null; eraErr: string | null; x12: boolean; hash: string }
function analyse(text: string, sheets?: Sheet[]): Analysis {
  const hash = docHash(text); const x12 = isX12(text); let era: Era | null = null; let eraErr: string | null = null;
  try { if (x12) era = parseEra(text); } catch (e: any) { eraErr = e?.message || 'Could not read the 835'; }
  const r = readDocument(x12 ? 'Electronic remittance advice 835 payment' : text);
  if (!x12 && (r.type === 'eob' || looksLikeEob(text))) { era = parseEobText(text); if (era && r.type !== 'eob') r.type = 'eob'; }
  if (!era && sheets?.length) for (const sh of sheets) { const e = parseRemitSheet(sh.rows); if (e) { era = e; r.type = 'eob'; r.confidence = Math.max(r.confidence, 85); break; } }
  if (x12) { r.type = 'eob'; r.confidence = 99; }
  return { r: x12 ? { ...r, type: 'eob' } : r, era, eraErr, x12, hash };
}

/** Document OCR workbench: read payer letters, EOBs and 835 remits locally (PDF text, browser OCR, or an X12 file), classify them, extract the facts, match the claim, and propose exact updates — status, codes, deadlines, follow-ups, notes, appeal outcomes and payment posting — that are applied only when you confirm. Nothing is uploaded or stored; documents are wiped after 10 idle minutes. */
export default function Ocr() {
  const st = useStore(); const { claims, inScope, openClaim, addNote, patchClaims, updateAppeal, audit_, has, appeals, config, workLog, activity, clients } = st; const canWork = has('work_claims'); const canPost = has('import'); const today = todayISO();
  const [docs, setDocs] = useState<Doc[]>([]); const [paste, setPaste] = useState(''); const [drag, setDrag] = useState(false); const [showText, setShowText] = useState<string | null>(null); const idle = useRef<ReturnType<typeof setTimeout>>();
  const [chosen, setChosen] = useState<Record<string, Set<string>>>({}); const [applied, setApplied] = useState<Record<string, string>>({}); const [clientFor, setClientFor] = useState<Record<string, string>>({});
  const nav = useNavigate(); const [auto, setAuto] = useState(lsGet(AUTO_KEY) === '1');
  useEffect(() => { const i = takeInbox(); if (i?.kind === 'text') setDocs([{ id: 'd' + ++seq, name: i.name, text: i.text, fromOcr: true, status: 'ready' }]); }, []); const autoDone = useRef(new Set<string>());
  const scoped = useMemo(() => claims.filter((c) => inScope(c.client_id)), [claims, inScope]); const statuses = useMemo(() => config.filter((o) => o.category === 'status' && o.active).map((o) => o.value), [config]);
  const posted = useMemo(() => new Set(activity.filter((a) => a.kind === 'era').map((a) => String(a.meta?.key))), [activity]);
  const wipe = () => { setDocs([]); setChosen({}); setApplied({}); setClientFor({}); autoDone.current.clear(); };
  useEffect(() => { clearTimeout(idle.current); if (docs.length) idle.current = setTimeout(() => { wipe(); toast.info('Documents cleared after 10 idle minutes'); }, OCR_LIMITS.idleMs); return () => clearTimeout(idle.current); }, [docs]);
  useEffect(() => () => { clearTimeout(idle.current); }, []);
  const patch = (id: string, p: Partial<Doc>) => setDocs((d) => d.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const addFile = async (file: File) => {
    const id = 'd' + ++seq; setDocs((d) => [...d, { id, name: file.name, file, src: file, text: '', fromOcr: false, status: 'reading' }]);
    try {
      let x = await extractText(file); let src: File = file; let converted = false;
      if (x.kind === 'legacy' && (await probeServices()).gotenberg.up) { const pdf = await convertToPdf(file, file.name); src = new File([pdf as unknown as BlobPart], file.name.replace(/\.\w+$/, '') + '.pdf', { type: 'application/pdf' }); x = await extractText(src); converted = true; patch(id, { src, name: file.name + ' → PDF (converted locally)' }); }
      if (x.needsOcr) { patch(id, { status: 'needs_ocr', file: src }); return; }
      if (!x.text.trim()) { patch(id, { status: 'error', err: x.warning || 'No readable text was found in this file.' }); return; }
      patch(id, { text: x.text, sheets: x.sheets, status: 'ready', file: undefined, err: x.warning }); void converted;
    } catch (e: any) { patch(id, { status: 'error', err: e?.message || 'Could not read the file' }); }
  };
  const addFiles = (fl: FileList | File[]) => { const list = [...fl].slice(0, 10); list.forEach((f) => void addFile(f)); };
  const runOcr = async (d: Doc) => {
    if (!d.file) return; patch(d.id, { status: 'ocr', prog: [0, 1] });
    try { const r = await ocrFile(d.file, (done, total) => patch(d.id, { prog: [done, total] })); patch(d.id, { text: r.text, fromOcr: true, status: 'ready', file: undefined, prog: undefined });
      void audit_('ocr', `OCR extraction run (${r.pages} page${r.pages > 1 ? 's' : ''}, ${r.chars} characters) — processed in the browser, nothing uploaded`, { pages: r.pages, chars: r.chars, source: 'ocr-page' }); // never the file name or text: both can contain PHI
      if (r.chars < 40) toast.err('Very little text was recognised — try a clearer scan'); } catch (e: any) { patch(d.id, { status: 'error', err: e?.message || 'OCR failed' }); }
  };
  const runAll = async () => { for (const d of docs.filter((x) => x.status === 'needs_ocr')) await runOcr(d); };
  const addPaste = () => { if (paste.trim().length < 20) return; setDocs((d) => [...d, { id: 'd' + ++seq, name: isX12(paste) ? 'Pasted 835' : 'Pasted text', text: paste, fromOcr: false, status: 'ready' }]); setPaste(''); };

  const A = useMemo(() => new Map(docs.filter((d) => d.status === 'ready').map((d) => { const a = analyse(d.text, d.sheets); return [d.id, { ...a, m: matchClaims(a.r.facts, scoped) }] as const; })), [docs, scoped]);
  const eraClient = (d: Doc, era: Era): string => { if (clientFor[d.id]) return clientFor[d.id]; const keys = new Set(era.claims.map((c) => c.pcn.toUpperCase()).filter(Boolean)); const hit = scoped.find((c) => keys.has(c.claim_no.toUpperCase())); return hit?.client_id || st.clientScope[0] || clients.find((c) => c.active)?.id || ''; };
  const plans = useMemo(() => { const m = new Map<string, EraPlan>(); for (const d of docs) { const a = A.get(d.id); if (!a?.era) continue; try { m.set(d.id, planEra(a.era, claims, { clientId: eraClient(d, a.era), today, workLog, windowDays: st.settings.import?.attributionWindowDays ?? 30, posted })); } catch { /* shown as unreadable */ } } return m; }, [docs, A, claims, clientFor, workLog, posted, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const proposalsFor = (d: Doc, claim: Claim) => { const a = A.get(d.id)!; return proposeUpdates(a.r, d.text, claim, { appeals, statuses, today, fromOcr: d.fromOcr, hash: a.hash }); };
  const applyProposals = async (d: Doc, claim: Claim, ps: Proposal[], quiet = false) => {
    const a = A.get(d.id)!; const m = mergeConfirmed(ps, claim, a.hash);
    await patchClaims([claim.id], m.patch, m.summary, 'field'); for (const n of m.notes) await addNote(claim.id, n, false, false); for (const x of m.appeals) await updateAppeal(x.id, x.patch);
    void audit_('ocr_apply', `Payer document applied to claim ${claim.claim_no}: ${ps.map((p) => p.label).join(', ')}`, { claim: claim.claim_no, type: a.r.type, fields: ps.map((p) => p.label) }); // no text, no file name
    setApplied((x) => ({ ...x, [d.id]: claim.id })); if (!quiet) toast.ok(`Updated ${claim.claim_no}`);
  };
  const post = async (d: Doc) => { const a = A.get(d.id); const plan = plans.get(d.id); if (!a?.era || !plan) return; try { const r = await st.applyEra({ era: a.era, plan, fileName: d.name }); setApplied((x) => ({ ...x, [d.id]: 'era' })); toast.ok(`Posted ${r.posted} claims · ${r.recoveries} payments`); } catch (e: any) { toast.err('Post failed: ' + (e?.message || e)); } };

  // optional: apply the low-risk updates (codes, dates, follow-ups, notes — never status, appeal outcomes or payments) on an exact claim-number match
  useEffect(() => {
    if (!auto || !canWork) return;
    for (const d of docs) { const a = A.get(d.id); if (!a || a.era || autoDone.current.has(d.id) || applied[d.id]) continue; const top = a.m[0]; if (!top || top.score < 100) continue; autoDone.current.add(d.id);
      const dup = ((top.claim.custom?.ocr_hashes as string[]) || []).includes(a.hash); if (dup) continue; const safe = proposalsFor(d, top.claim).filter((p) => p.safe); if (safe.length) void applyProposals(d, top.claim, safe, true).then(() => toast.ok(`Auto-updated ${top.claim.claim_no} (${safe.length} safe change${safe.length > 1 ? 's' : ''})`)); }
  }, [auto, docs, A]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = docs.filter((d) => d.status === 'ready'); const scans = docs.filter((d) => d.status === 'needs_ocr').length; const matched = ready.filter((d) => A.get(d.id)!.m.length || (plans.get(d.id)?.totals.matched || 0) > 0).length;
  const byType = new Map<string, number>(); for (const d of ready) { const t = A.get(d.id)!.r.type; byType.set(t, (byType.get(t) || 0) + 1); }
  const deadlines = ready.map((d) => A.get(d.id)!.r.appealDeadline).filter(Boolean) as { days: number; context: string }[];
  const dollars = ready.reduce((s, d) => { const a = A.get(d.id)!; return s + (a.era ? a.era.amount : a.r.facts.amounts.find((x) => /denied|balance|patient|billed|charge/i.test(x.label))?.value || 0); }, 0);
  const prio = (d: Doc) => { const a = A.get(d.id); const top = a?.m[0]; const dollars = a?.era ? a.era.amount : top?.claim.balance || a?.r.facts.amounts.find((x) => /denied|balance|billed|charge/i.test(x.label))?.value || 0; return triage(a?.r || null, { dollars, matched: !!top || (plans.get(d.id)?.totals.matched || 0) > 0, status: d.status }); };
  const order = useMemo(() => [...docs].map((d, i) => ({ d, i, t: prio(d) })).sort((x, y) => y.t.score - x.t.score || x.i - y.i).map((x) => x.d), [docs, A, plans]); // eslint-disable-line react-hooks/exhaustive-deps
  const carcs = st.carcMap(); const Checks = ({ list }: { list: Check[] }) => list.length ? <div className="space-y-0.5 text-[12px]">{list.map((c, i) => <div key={i} className="flex gap-1.5" style={{ color: c.level === 'ok' ? '#16a34a' : c.level === 'warn' ? '#d97706' : '#dc2626' }}><span>{c.level === 'ok' ? '✔' : '●'}</span><span>{c.text}</span></div>)}</div> : null;
  const confirmAll = async () => { let n = 0; for (const d of ready) { const a = A.get(d.id)!; if (applied[d.id]) continue; if (a.era) { if (canPost && (plans.get(d.id)?.totals.matched || 0) > 0) { await post(d); n++; } continue; } const top = a.m[0]; if (!top || !canWork) continue; if (((top.claim.custom?.ocr_hashes as string[]) || []).includes(a.hash)) continue; const all = proposalsFor(d, top.claim); const sel = chosen[d.id] ? all.filter((p) => chosen[d.id].has(p.id)) : all.filter((p) => p.on); if (sel.length) { await applyProposals(d, top.claim, sel, true); n++; } } toast.ok(n ? `Confirmed and applied ${n} document${n > 1 ? 's' : ''}` : 'Nothing to apply'); };

  return (
    <div className="space-y-4">
      <PageHeader title="Document OCR" sub="Read payer letters, EOBs and 835 remits — locally — and update claims once you confirm" actions={<><Link to="/studio" className="btn btn-sm">PDF &amp; Word Studio</Link><Link to="/era" className="btn btn-sm">ERA / 835 import</Link></>} />
      <div className="flex flex-wrap gap-2 text-[12px]"><Chip color="#16a34a"><ShieldCheck size={11} className="inline mr-1" />Runs in this tab — nothing uploaded</Chip><Chip color="#0ea5e9">Self-hosted engine, no public OCR API</Chip><Chip color="#6366f1">Auto-wipes after 10 idle minutes</Chip><Chip color="#64748b">PDF · images · Word · Excel · CSV · RTF · HTML · EML · 835 · up to {OCR_LIMITS.maxPages} pages · {OCR_LIMITS.maxBytes / 1024 / 1024} MB</Chip></div>

      <Card>
        <div className={'rounded-xl border-2 border-dashed p-8 text-center transition ' + (drag ? 'border-brand-500 bg-brand-500/10' : 'hair')} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
          <Upload size={26} className="mx-auto muted mb-2" /><div className="font-semibold">Drop up to 10 documents here</div><div className="text-xs muted mt-1">PDF, scan or photo, Word (.docx), Excel (.xlsx) or CSV, RTF, HTML, e-mail (.eml), text or an 835 file. Text-based files are read instantly; scans and photos use local OCR.</div>
          <label className="btn btn-primary mt-3 cursor-pointer"><FileSearch size={14} />Choose files<input type="file" multiple accept={ACCEPT} hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} /></label>
        </div>
        <details className="mt-3"><summary className="text-[13px] cursor-pointer flex items-center gap-1.5"><ClipboardPaste size={13} />…or paste letter / EOB / 835 text</summary><div className="mt-2 flex gap-2 items-start"><textarea className="input flex-1" rows={4} placeholder="Paste the text of a denial letter, EOB or an 835 file" value={paste} onChange={(e) => setPaste(e.target.value)} /><button className="btn" disabled={paste.trim().length < 20} onClick={addPaste}>Analyze</button></div></details>
        {canWork && <label className="mt-3 flex items-start gap-2 text-[12.5px]"><input type="checkbox" className="mt-0.5" checked={auto} onChange={(e) => { setAuto(e.target.checked); try { localStorage.setItem(AUTO_KEY, e.target.checked ? '1' : '0'); } catch { /* optional */ } }} /><span><b className="flex items-center gap-1 inline-flex"><Zap size={12} />Auto-apply safe updates</b> — when the claim number matches exactly, add the note, denial codes, dates and follow-up straight away. Status changes, appeal outcomes and payment posting always wait for your confirmation.</span></label>}
      </Card>

      {docs.length === 0 ? <Card><Empty icon={<ScanText size={28} />} title="No documents yet" sub="Drop a denial letter or EOB to see the codes, deadline, payment and matching claim in seconds." /></Card> : <>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3"><Stat label="Documents" value={docs.length} color="#6366f1" /><Stat label="Matched to a claim" value={`${matched}/${ready.length}`} color="#16a34a" /><Stat label="Need OCR" value={scans} color={scans ? '#f59e0b' : '#64748b'} /><Stat label="Earliest deadline" value={deadlines.length ? `${Math.min(...deadlines.map((d) => d.days))} days` : '—'} color="#ef4444" /><Stat label="Dollars referenced" value={dollars ? money(dollars) : '—'} color="#0ea5e9" /></div>
        <div className="flex gap-2 flex-wrap items-center">
          {scans > 0 && canWork && <button className="btn btn-primary btn-sm" onClick={runAll}><ScanText size={13} />Run OCR on {scans} scan{scans > 1 ? 's' : ''}</button>}
          {ready.length > 0 && (canWork || canPost) && <button className="btn btn-primary btn-sm" onClick={confirmAll}><CheckCircle2 size={13} />Confirm &amp; apply everything selected</button>}
          {[...byType.entries()].map(([t, n]) => <Chip key={t} color={TYPE_COLOR[t]}>{n} {DOC_LABEL[t as keyof typeof DOC_LABEL]}</Chip>)}
          <button className="btn btn-ghost btn-sm ml-auto" onClick={wipe}><Trash2 size={13} />Clear everything</button>
        </div>
        <div className="space-y-3">{order.map((d) => {
          const a = A.get(d.id); const r = a?.r; const plan = plans.get(d.id); const done = applied[d.id]; const top = a?.m[0]; const props = a && top ? proposalsFor(d, top.claim) : []; const sel = chosen[d.id] || new Set(props.filter((p) => p.on).map((p) => p.id)); const dup = !!(a && top && ((top.claim.custom?.ocr_hashes as string[]) || []).includes(a.hash));
          return (
            <Card key={d.id} title={<span className="flex items-center gap-2 flex-wrap"><FileText size={14} />{d.name}{r && <Chip color={TYPE_COLOR[r.type]}>{a?.x12 ? '835 remittance' : DOC_LABEL[r.type]}{r.confidence ? ` · ${r.confidence}%` : ''}</Chip>}{d.fromOcr && <Chip color="#f59e0b">OCR — verify</Chip>}{(() => { const t = prio(d); return t.score >= 70 ? <Chip color="#dc2626">Priority{t.reasons.length ? ' · ' + t.reasons.join(' · ') : ''}</Chip> : null; })()}{done && <Chip color="#16a34a"><CheckCircle2 size={11} className="inline mr-1" />Applied</Chip>}</span>} actions={<>{d.src && /^(pdf|docx)$/.test(kindOf(d.src.name, d.src.type)) && <button className="btn btn-ghost btn-sm" onClick={async () => { const f = d.src!; if (kindOf(f.name, f.type) === 'pdf') putInbox({ kind: 'pdf', name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); else putInbox({ kind: 'word', name: f.name, html: (await docxToHtml(await f.arrayBuffer())).html }); nav('/studio'); }}>Open in Studio</button>}<button className="btn btn-ghost btn-sm" onClick={() => setShowText(showText === d.id ? null : d.id)}>{showText === d.id ? 'Hide' : 'Edit'} text</button><button className="btn btn-ghost btn-sm" onClick={() => setDocs((l) => l.filter((y) => y.id !== d.id))}><Trash2 size={13} /></button></>}>
              {d.status === 'reading' && <div className="text-sm muted">Reading…</div>}
              {d.status === 'error' && <div className="text-sm" style={{ color: '#dc2626' }}>{d.err}</div>}
              {d.status === 'ocr' && <div className="text-sm">Reading page {(d.prog?.[0] ?? 0) + 1} of {d.prog?.[1] ?? '…'} with local OCR…</div>}
              {d.status === 'needs_ocr' && <div className="rounded-lg p-3 text-[13px]" style={{ background: 'rgba(245,158,11,.12)' }}>This is a scan or photo — no text to read yet. {canWork ? <button className="btn btn-sm btn-primary ml-2" onClick={() => runOcr(d)}><ScanText size={13} />Read with local OCR</button> : 'Your role cannot run OCR.'}</div>}
              {showText === d.id && d.status === 'ready' && <textarea className="input mb-3 font-mono text-xs" rows={8} value={d.text} onChange={(e) => patch(d.id, { text: e.target.value })} />}
              {a?.eraErr && <div className="text-sm mb-2" style={{ color: '#dc2626' }}>{a.eraErr}</div>}

              {r && a && <div className="grid lg:grid-cols-2 gap-4 text-[13px]">
                <div className="space-y-2">
                  {r.facts.payerHint && <div>Payer: <b className="capitalize">{r.facts.payerHint}</b>{r.faxes[0] && <> · Fax <b>{r.faxes[0]}</b></>}{r.phones[0] && <> · Phone <b>{r.phones[0]}</b></>}</div>}
                  {r.facts.carc.length + r.facts.rarc.length > 0 && <div className="flex gap-1.5 flex-wrap items-center">Codes: {r.facts.carc.map((c) => <Chip key={c} color="#ef4444">{c}</Chip>)}{r.facts.rarc.map((c) => <Chip key={c} color="#6366f1">{c}</Chip>)}</div>}
                  {r.facts.carc.length > 0 && (() => { const sg = suggestFromCodes(r.facts.carc.join(', '), carcs); return sg ? <div className="panel2 p-2 rounded-lg space-y-0.5"><div className="label">What the codes mean</div>{sg.codes.slice(0, 4).map((c) => <div key={c.code}><b>{c.code}</b> <span className="muted">{c.meaning}</span></div>)}<div className="text-[12px]"><b>Likely root cause:</b> {sg.rca}{sg.rca_detail ? ` — ${sg.rca_detail}` : ''}</div><div className="text-[12px]"><b>Suggested action:</b> {sg.action}</div></div> : null; })()}
                  {r.appealDeadline && <div className="rounded p-2" style={{ background: 'rgba(245,158,11,.12)' }}>⏱ <b>{r.appealDeadline.days} days</b> — {r.appealDeadline.context}{(() => { const ld = letterDate(r); if (!ld) return null; const due = new Date(Date.parse(ld + 'T12:00:00Z') + r.appealDeadline.days * 864e5).toISOString().slice(0, 10); return <> <span className="muted">→ due {fmtDate(due)}</span> <button className="btn btn-sm ml-1" onClick={async () => { const { buildIcs } = await import('../lib/ical'); const top = A.get(d.id)?.m[0]; downloadFile('payer-deadline.ics', buildIcs([{ title: `Payer deadline${top ? ' — ' + top.claim.claim_no : ''}`, date: due, description: r.appealDeadline!.context.slice(0, 120) }]), 'text/calendar'); }}>Add to calendar</button></>; })()}</div>}
                  {r.facts.dates.length > 0 && <div>Dates: {r.facts.dates.map((y) => `${y.label} ${fmtDate(y.iso)}`).join(' · ')}</div>}
                  {r.facts.amounts.length > 0 && <div>Amounts: {r.facts.amounts.map((x) => `${x.label} ${money(x.value, true)}`).join(' · ')}</div>}
                  {(r.facts.claimNos.length > 0 || r.facts.refs.length > 0) && <div>Claim / reference: {[...r.facts.claimNos, ...r.facts.refs].slice(0, 5).join(', ')}</div>}
                  {r.npis.length > 0 && <div>NPI found: {r.npis.map((n) => <Chip key={n} color={npiValid(n) ? '#16a34a' : '#dc2626'}>{n}{npiValid(n) ? ' ✓' : ''}</Chip>)}</div>}
                  {r.facts.asks.length > 0 && <ul className="list-disc ml-5">{r.facts.asks.map((x) => <li key={x}>{x}</li>)}</ul>}
                  <div className="label pt-1">What to do next</div><ol className="list-decimal ml-5 space-y-0.5">{r.nextSteps.length ? r.nextSteps.map((s) => <li key={s}>{s}</li>) : <li>Review and file with the claim.</li>}</ol>
                </div>

                <div className="space-y-2">
                  {plan && a.era ? <>
                    <div className="label">Remittance — {a.era.payer || 'payer'}{a.era.trace ? ` · ${a.era.trace}` : ''}{a.era.date ? ` · ${fmtDate(a.era.date)}` : ''}</div>
                    <div className="flex items-center gap-2 flex-wrap"><span>Practice</span><select className="input !w-auto !py-0.5" value={eraClient(d, a.era)} onChange={(e) => setClientFor((x) => ({ ...x, [d.id]: e.target.value }))}>{clients.filter((c) => c.active && (!st.clientScope.length || st.clientScope.includes(c.id))).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><span className="muted">{plan.totals.matched}/{plan.totals.claims} matched · {money(plan.totals.matchedPaid)} to post</span></div>
                    {a.era.warnings.map((w) => <div key={w} className="flex gap-1.5 text-[12px]" style={{ color: '#b26a00' }}><AlertTriangle size={13} className="shrink-0 mt-0.5" />{w}</div>)}
                    <div className="max-h-64 overflow-auto"><table className="tbl w-full text-[12.5px]"><thead><tr><th>Claim</th><th>Match</th><th className="text-right">Billed</th><th className="text-right">Paid</th><th>Codes</th><th /></tr></thead><tbody>{plan.rows.map((row, i) => { const exp = row.claim?.expected_amt; const under = row.match === 'matched' && !row.era.denied && exp && row.era.paid + row.era.patientResp < exp * 0.98 ? exp - row.era.paid - row.era.patientResp : 0; const sp = adjSplit(row.era); return (
                      <tr key={i}><td className="font-mono text-xs">{row.era.pcn || '—'}</td><td><Chip color={row.match === 'matched' ? '#16a34a' : row.match === 'duplicate' ? '#64748b' : '#dc2626'}>{row.match}</Chip></td><td className="text-right">{money(row.era.charge)}</td><td className="text-right">{money(row.era.paid)}</td><td className="text-[11px]">{row.codes.join(', ') || (sp.contractual ? `CO ${money(sp.contractual)}` : '')}{row.era.denied && <Chip color="#ef4444" className="ml-1">denied</Chip>}{under > 0 && <Chip color="#d97706" className="ml-1">short {money(under)}</Chip>}</td>
                        <td className="whitespace-nowrap">{row.claim && <button className="btn btn-sm" onClick={() => openClaim(row.claim!.id)}>Open</button>} {row.claim && (under > 0 || row.era.denied) && <CreateAppealButton claimId={row.claim.id} kind={row.era.denied ? 'appeal' : 'underpayment_dispute'} label={row.era.denied ? 'Appeal' : 'Dispute'} />}</td></tr>); })}</tbody></table></div>
                    {(() => { const lines = plan.rows.filter((x) => x.claim).flatMap((x) => verifyRemit(x.era, x.claim!, a.era!.payer).filter((c) => c.level !== 'ok').map((c) => ({ ...c, text: `${x.era.pcn}: ${c.text}` }))); const short = plan.rows.reduce((sum, x) => { const exp = x.claim?.expected_amt; return exp && !x.era.denied && x.era.paid + x.era.patientResp < exp * 0.98 ? sum + (exp - x.era.paid - x.era.patientResp) : sum; }, 0); return <>{short > 0 && <div className="text-[12.5px]" style={{ color: '#d97706' }}>Underpayment exposure on this remit: <b>{money(short)}</b> against expected reimbursement</div>}{lines.length > 0 && <details open={lines.length <= 4}><summary className="text-[12px] cursor-pointer">{lines.length} thing{lines.length > 1 ? 's' : ''} to check before posting</summary><div className="mt-1"><Checks list={lines.slice(0, 12)} /></div></details>}</>; })()}
                    {canPost ? <div className="flex gap-2 items-center flex-wrap"><button className="btn btn-primary btn-sm" disabled={!!done || plan.totals.matched === 0 || plan.duplicateFile} onClick={() => post(d)}>Confirm &amp; post {plan.totals.matched} claim{plan.totals.matched === 1 ? '' : 's'}</button><span className="text-[11.5px] muted">Posts payments, denial codes and lifecycle exactly like ERA import; duplicates are skipped.</span></div> : <div className="muted text-[12px]">Posting remits needs the Import permission.</div>}
                    {plan.duplicateFile && <div className="text-[12px]" style={{ color: '#dc2626' }}>Every claim on this remit was already posted.</div>}
                  </> : <>
                    <div className="label">Matching claims</div>
                    {a.m.length === 0 ? <div className="muted">No claim matched — check the claim number in the text, or search for it.</div> : a.m.slice(0, 3).map(({ claim: c, by, score }, i) => (
                      <div key={c.id} className="panel2 p-2.5 rounded-lg space-y-1.5"><div className="flex items-center gap-2 flex-wrap"><b className="font-mono text-xs">{c.claim_no}</b><span className="muted text-[12px]">{c.payer} · {money(c.balance)} · {c.status}</span><Chip color={score >= 100 ? '#16a34a' : '#d97706'}>{by}</Chip></div>
                        <div className="flex gap-1.5 flex-wrap"><button className="btn btn-sm" onClick={() => openClaim(c.id)}>Open</button>{r.suggestedAppealKind && <CreateAppealButton claimId={c.id} kind={r.suggestedAppealKind} label={r.type === 'eob' ? 'Dispute underpayment' : r.type === 'appeal_decision' ? 'Next-level appeal' : 'Create appeal'} />}{r.courtesyOk && <CreateAppealButton claimId={c.id} kind="appeal" style="courtesy" label="Courtesy review" />}</div>
                        {i === 0 && <Checks list={verifyLetter(r, c)} />}
                        {i === 0 && canWork && <div className="border-t hair pt-2 space-y-1">
                          <div className="label">Proposed updates — tick what is correct</div>
                          {dup && <div className="text-[12px]" style={{ color: '#b26a00' }}>This document looks like one already filed on this claim.</div>}
                          {props.map((p) => <label key={p.id} className="flex items-start gap-2 text-[12.5px]"><input type="checkbox" className="mt-0.5" disabled={!!done} checked={sel.has(p.id)} onChange={(e) => setChosen((x) => { const n = new Set(sel); e.target.checked ? n.add(p.id) : n.delete(p.id); return { ...x, [d.id]: n }; })} /><span><b>{p.label}</b>{p.from != null && <> <span className="muted">{p.from} →</span></>} <b>{p.to}</b>{!p.safe && <Chip color="#d97706" className="ml-1">needs your OK</Chip>}<span className="block muted text-[11px]">{p.why}</span></span></label>)}
                          <button className="btn btn-primary btn-sm" disabled={!!done || sel.size === 0} onClick={() => applyProposals(d, c, props.filter((p) => sel.has(p.id)))}>Confirm &amp; apply {sel.size} update{sel.size === 1 ? '' : 's'}</button>
                        </div>}
                      </div>))}
                  </>}
                </div>
              </div>}
            </Card>);
        })}</div>
      </>}
      <p className="text-[11px] muted">OCR text can contain PHI. It is held in memory only, never stored, logged or sent anywhere. The audit log records page and character counts and which fields were applied to which claim number — never the text or file name. Always check recognised codes, dates and amounts against the original.</p>
    </div>
  );
}
