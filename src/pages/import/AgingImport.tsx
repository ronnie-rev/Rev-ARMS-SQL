import { DateField } from '../../components/CalendarPicker';
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, Info, Sparkles, UploadCloud, Undo2, Wand2, FileDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useStore } from '../../store';
import { useOpts } from '../../hooks';
import { Card, Chip, Field, toast, useConfirm } from '../../components/ui';
import { AGING_FIELDS, fieldsFor } from '../../lib/pms';
import { autoMap, detectTemplate, parseFile, type ParsedSheet } from '../../lib/importer';
import { buildRows, collapse } from '../../lib/engine/rows';
import { convertReport } from '../../lib/engine/convert';
import { buildIndex, matchRows, type Decisions } from '../../lib/engine/match';
import { buildPlan } from '../../lib/engine/reconcile';
import { buildPayerIndex } from '../../lib/engine/payers';
import { resolveSettings, type ImportSettings } from '../../lib/engine/settings';
import { cn, downloadFile, fmtDate, money, num, toCSV, todayISO } from '../../lib/utils';
import type { ImportTemplate } from '../../lib/types';
import { PayerFixer } from '../../components/PayerFixer';

type Step = 'upload' | 'map' | 'review' | 'done';
const sha256 = async (f: File) => { try { const b = await crypto.subtle.digest('SHA-256', await f.arrayBuffer()); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); } catch { return null; } };
function asOfFromName(n: string): string | null {
  let m = n.match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = n.match(/(0?[1-9]|1[0-2])[-_.](0?[1-9]|[12]\d|3[01])[-_.](20\d{2})/); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

export default function AgingImport() {
  const st = useStore(); const { clients, templates, claims, config, settings: appSettings, batches, save, applyImport, rollbackBatch, has } = st;
  const customFields = useOpts('field'); const customKeys = customFields.map((f) => f.value); const { confirm, node } = useConfirm();
  const [step, setStep] = useState<Step>('upload'); const [clientId, setClientId] = useState(st.clientFilter || '');
  const [file, setFile] = useState<File | null>(null); const [hash, setHash] = useState<string | null>(null); const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [tplId, setTplId] = useState(''); const [mapping, setMapping] = useState<Record<string, string | null>>({}); const [conf, setConf] = useState<Record<string, number>>({}); const [detected, setDetected] = useState('');
  const [over, setOver] = useState<Partial<ImportSettings>>({}); const [mode, setMode] = useState<'snapshot' | 'merge'>('snapshot'); const [asOf, setAsOf] = useState(todayISO());
  const [decisions, setDecisions] = useState<Decisions>({}); const [acks, setAcks] = useState<Set<string>>(new Set()); const [runAfter, setRunAfter] = useState(true);
  const [tab, setTab] = useState<'changes' | 'new' | 'closing' | 'identity' | 'issues' | 'payers'>('changes');
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<{ batchId: string; recoveries: number; ruleChanges: number } | null>(null);
  const inp = useRef<HTMLInputElement>(null);

  const payersOpen = useMemo(() => [...new Set(claims.filter((c) => c.client_id === clientId && !c.closed_at).map((c) => c.payer || 'Unknown'))].sort(), [claims, clientId]);
  const tpls = templates.filter((t) => t.kind === 'aging'); const tpl = tpls.find((t) => t.id === tplId); const client = clients.find((c) => c.id === clientId);
  const settings = useMemo(() => { const b = resolveSettings(appSettings.import, (client?.settings as any)?.import); return { ...b, ...over, overwrite: { ...b.overwrite, ...(over.overwrite || {}) } } as ImportSettings; }, [appSettings.import, client, over]);
  const payerDir = useMemo(() => config.filter((o) => o.category === 'payer' && o.active), [config]);
  const payerIdx = useMemo(() => buildPayerIndex(payerDir.map((o) => ({ value: o.value, aliases: o.meta.aliases }))), [payerDir]);
  const knownPayers = useMemo(() => new Set(payerDir.flatMap((o) => [o.value.toLowerCase(), ...String(o.meta.aliases || '').split(/[,;\n]/).map((a) => a.trim().toLowerCase()).filter(Boolean)])), [payerDir]);

  const onFile = async (f: File) => {
    setBusy(true);
    try {
      const sh = await parseFile(f); setFile(f); setSheet(sh); setHash(await sha256(f)); setAsOf(asOfFromName(f.name) || todayISO());
      const remembered = (client?.settings as any)?.mappings as Record<string, Record<string, string | null>> | undefined;
      const d = detectTemplate(sh.headers, tpls); const byPms = client ? tpls.find((x) => x.pms === client.pms) : undefined;
      const t = d && d.score >= 3 ? d.tpl : byPms || d?.tpl || tpls[0]; setTplId(t.id); setDetected(d && d.score >= 3 ? t.name : '');
      const m = autoMap(sh.headers, t, customKeys); const mem = remembered?.[t.id];
      if (mem && Object.values(mem).filter((h) => h && sh.headers.includes(h)).length >= 3) { setMapping({ ...m.mapping, ...Object.fromEntries(Object.entries(mem).filter(([, h]) => !h || sh.headers.includes(h))) }); setConf(Object.fromEntries(Object.keys(mem).map((k) => [k, 1]))); toast.info('Loaded this client’s remembered column mapping'); }
      else { setMapping(m.mapping); setConf(m.confidence); }
      setStep('map');
    } catch (e: any) { toast.err(e.message || 'Could not read file'); } finally { setBusy(false); }
  };
  const retemplate = (id: string) => { setTplId(id); const t = templates.find((x) => x.id === id)!; if (!sheet) return; const m = autoMap(sheet.headers, t, customKeys); setMapping(m.mapping); setConf(m.confidence); };

  // ─ the pipeline: parse → canonical payers → collapse duplicates → match identity → reconcile into a plan
  const pipeline = useMemo(() => {
    if (!sheet || !client || step === 'upload') return null;
    const built = buildRows(sheet.rows, sheet.headers, mapping, settings, customKeys);
    const known = new Map<string, boolean>(); const rows = built.rows.map((r) => { const p = payerIdx.canon(r.payer); known.set(r.key, p.known); return p.how === 'none' ? r : { ...r, payer: p.name }; });
    const col = collapse(rows, settings); const existing = claims.filter((c) => c.client_id === client.id);
    const matches = matchRows(col.rows, buildIndex(existing, settings), settings, decisions);
    const badDate = built.rows.filter((r) => r.issues.some((i) => i.code === 'BAD_DATE')).length;
    const plan = buildPlan({ rows: col.rows, matches, existing, client, settings, mode, batchId: 'preview', now: new Date().toISOString(), asOf: asOf || null, fileHash: hash, priorBatches: batches.filter((b) => b.client_id === client.id), knownPayers,
      pre: { skipped: built.skipped, dups: col.dropped, aggregated: col.aggregated, conflicts: col.conflicts, badDateRows: badDate, totalRows: sheet.rows.length, conv: convertReport(sheet.rows.length, built.rows, col) } });
    return { built, col, matches, plan, existing };
  }, [sheet, client, mapping, settings, claims, decisions, mode, asOf, hash, batches, payerIdx, knownPayers, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const fields = fieldsFor('aging');
  const missingReq = [...(mapping.balance ? [] : ['Balance Amount']), ...(mapping.claim_no || (settings.missingKey === 'generate' && mapping.dos) ? [] : ['Claim Number (or Date of service so an ID can be generated)'])];
  const plan = pipeline?.plan; const blocks = (plan?.guardrails || []).filter((g) => g.level === 'block'); const hard = blocks.some((g) => g.hard); const unacked = blocks.filter((g) => !g.hard && !acks.has(g.id));
  const canCommit = !!plan && !hard && !unacked.length && !busy;

  const commit = async () => {
    if (!plan || !client) return; setBusy(true);
    try {
      const r = await applyImport({ plan, client, settings, mode, fileName: file?.name || 'upload', fileHash: hash, asOf: asOf || null, templateName: tpl?.name || 'custom', totalRows: sheet?.rows.length || 0, runRules: runAfter, guardrailsAck: [...acks] });
      const mem = { ...((client.settings as any)?.mappings || {}), [tplId]: mapping }; await save('clients', [{ ...client, settings: { ...(client.settings as any), mappings: mem } } as any]);
      if (runAfter) await useStore.getState().syncChecks({ clientId: client.id });
      setResult(r); setStep('done'); toast.ok('Import complete');
    } catch (e: any) { toast.err(e.message); } finally { setBusy(false); }
  };
  const reset = () => { setStep('upload'); setFile(null); setSheet(null); setResult(null); setDecisions({}); setAcks(new Set()); setOver({}); };
  const downloadTemplate = (t?: ImportTemplate) => {
    const headers = AGING_FIELDS.map((f) => (t && t.mapping[f.key]?.[0]) || f.label); const cols = [...headers, ...customKeys];
    const variant = (n: number): Record<string, string> => { const r: Record<string, string> = {}; cols.forEach((h, i) => { const f = i < AGING_FIELDS.length ? AGING_FIELDS[i] : null; let v = f ? f.example : ''; if (f?.key === 'claim_no') v = `CLM-1002${34 + n}`; else if (f?.key === 'account_id') v = `ACC-550${12 + n}`; else if (f?.key === 'balance') v = (842.1 + n * 310.55).toFixed(2); else if (f?.key === 'billed_amt') v = (1250 + n * 420).toFixed(2); else if (f?.key === 'patient_name') v = ['DOE, JANE', 'SMITH, JOHN', 'GARCIA, MARIA'][n] || v; else if (f?.key === 'payer') v = ['Aetna', 'Cigna', 'UnitedHealthcare'][n] || v; r[h] = v; }); return r; };
    downloadFile(`ClaimsIQ_${t?.pms || 'Standard'}_aging_sample.csv`, toCSV([variant(0), variant(1), variant(2)], cols));
  };

  if (!has('import')) return <Card><div className="p-8 text-center muted">Your role does not have permission to import. Ask an admin to enable “Import aging files”.</div></Card>;
  const stats = plan?.stats || {}; const lastBatch = batches.filter((b) => b.client_id === clientId && b.status === 'committed').sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  return (
    <div>
      {step === 'upload' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2" title="1 · Client & file">
            <Field label="Client" className="mb-4 max-w-md"><select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Select client…</option>{clients.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.pms})</option>)}</select></Field>
            {client && lastBatch && <div className="text-xs muted mb-3">Last import: <b className="text-inherit">{lastBatch.file_name}</b> · as of {fmtDate(lastBatch.as_of || lastBatch.created_at.slice(0, 10))} · {num(lastBatch.total_rows)} rows</div>}
            <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; f && (clientId ? onFile(f) : toast.err('Pick a client first')); }} onClick={() => (clientId ? inp.current?.click() : toast.err('Pick a client first'))} className="border-2 border-dashed hair rounded-2xl p-10 text-center cursor-pointer hover:border-brand-500 transition">
              <UploadCloud className="mx-auto mb-3 text-brand-400" size={36} /><div className="font-semibold">{busy ? 'Reading file…' : 'Drop .xlsx or .csv here, or click to browse'}</div>
              <div className="text-xs muted mt-1">PMS is auto-detected · duplicates, re-numbered claims and stale files are caught before anything is written.</div><input ref={inp} type="file" hidden accept=".xlsx,.csv,.txt,.tsv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></div>
            <div className="mt-3 flex items-center gap-3 flex-wrap"><button className="btn" onClick={() => downloadTemplate()}><FileDown size={14} />Download sample file (3 rows)</button><span className="text-xs muted">Fill in your claims with the same columns, then upload. Dates as MM/DD/YYYY. Required: Claim Number, Date of Service, Balance.</span></div>
          </Card>
          <Card title="Preloaded PMS templates"><div className="space-y-2">{tpls.map((t) => <div key={t.id} className="panel2 p-2.5 flex items-center gap-2 text-[13px] font-semibold"><Sparkles size={14} className="text-brand-400" /><span className="flex-1 truncate">{t.name}</span><button className="btn btn-ghost btn-sm" onClick={() => downloadTemplate(t)}>CSV</button></div>)}</div>
            <button className="btn mt-3 w-full justify-center" onClick={() => downloadTemplate()}>Download standard template</button></Card>
        </div>)}

      {step === 'map' && sheet && (
        <Card title={<span>2 · Map columns <span className="muted font-normal">· {file?.name} · {num(sheet.rows.length)} rows</span></span>} actions={<button className="btn btn-sm" onClick={reset}>Start over</button>}>
          <div className="flex gap-3 items-end mb-4 flex-wrap"><Field label="Template" className="w-72"><select className="input" value={tplId} onChange={(e) => retemplate(e.target.value)}>{tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>{detected && <Chip color="#22c55e"><Sparkles size={11} />Auto-detected: {detected}</Chip>}</div>
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-2">
            {[...fields, ...customFields.map((f) => ({ key: f.value, label: f.value + ' (custom)', required: false }))].map((f: any) => (
              <div key={f.key} className="flex items-center gap-2"><div className="w-48 text-[13px] font-semibold shrink-0">{f.label}</div><ArrowRight size={12} className="muted shrink-0" />
                <select className="input" value={mapping[f.key] || ''} onChange={(e) => { setMapping({ ...mapping, [f.key]: e.target.value || null }); setConf({ ...conf, [f.key]: e.target.value ? 1 : 0 }); }}><option value="">— not in file —</option>{sheet.headers.map((h) => <option key={h}>{h}</option>)}</select>
                <span className="w-10 text-[10px]">{mapping[f.key] ? (conf[f.key] === 1 ? <span className="text-green-500">exact</span> : <span className="text-amber-500">{Math.round((conf[f.key] || 0) * 100)}%</span>) : ''}</span></div>))}</div>
          <div className="mt-5 overflow-auto panel2"><table className="grid"><thead><tr>{sheet.headers.slice(0, 10).map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{sheet.rows.slice(0, 4).map((r, i) => <tr key={i}>{sheet.headers.slice(0, 10).map((h) => <td key={h} className="max-w-[160px] truncate">{String(r[h] instanceof Date ? r[h].toISOString().slice(0, 10) : r[h] ?? '')}</td>)}</tr>)}</tbody></table></div>
          <div className="flex justify-between items-center mt-5"><div className="text-sm">{missingReq.length ? <span className="text-amber-500 flex items-center gap-1.5"><AlertTriangle size={14} />Map: {missingReq.join(' · ')}</span> : <span className="text-green-500 flex items-center gap-1.5"><CheckCircle2 size={14} />Required fields mapped</span>}</div>
            <div className="flex gap-2"><button className="btn" onClick={async () => { const name = prompt('Save this mapping as a template named:'); if (!name || !tpl) return; const m: Record<string, string[]> = { ...tpl.mapping }; Object.entries(mapping).forEach(([k, h]) => { if (h) m[k] = [h, ...(m[k] || []).filter((x) => x !== h)]; }); await save('import_templates', [{ id: crypto.randomUUID(), name, pms: client?.pms || 'Custom', kind: 'aging', builtin: false, mapping: m, options: {} }]); toast.ok('Template saved'); }}>Save as template</button>
              <button className="btn btn-primary" disabled={missingReq.length > 0} onClick={() => setStep('review')}>Analyse file<ArrowRight size={14} /></button></div></div>
        </Card>)}

      {step === 'review' && pipeline && plan && client && (
        <div className="space-y-4">
          {(() => { const v = convertReport(sheet!.rows.length, pipeline.built.rows, pipeline.col); if (!v.notes.length) return null; return <div className="rounded-xl p-3 text-[12.5px] space-y-1" style={{ background: v.verdict === 'review' ? 'rgba(245,158,11,.12)' : 'rgba(34,197,94,.10)', border: '1px solid ' + (v.verdict === 'review' ? 'rgba(245,158,11,.35)' : 'rgba(34,197,94,.3)') }}><b>How this file was converted: {v.fileRows} rows → {v.claims} claims{v.verdict === 'review' ? ' · please review' : ' · clean'}</b>{v.notes.map((n: string) => <div key={n}>• {n}</div>)}{v.ambiguous.slice(0, 5).map((a: any) => <div key={a.key + a.rows[0]} className="muted">⚠ {a.key} (rows {a.rows.join(', ')}): {a.why}</div>)}{Math.abs(v.totals.diff) > 0.5 && <div className="text-red-600">Balance mismatch of {v.totals.diff} between file and result — do not commit until explained.</div>}</div>; })()}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            {[['Create', plan.creates.length, '#22c55e'], ['Update', stats.updated || 0, '#06b6d4'], ['Re-keyed', stats.rekeyed || 0, '#6366f1'], ['Reopened', stats.reopened || 0, '#a855f7'], ['Missing → review queue', plan.reviews.length + plan.closes.length + (plan.misses?.length || 0), '#f59e0b'], ['Unchanged', plan.unchanged.length, '#64748b'], ['Possible match (review)', plan.asks.length, '#0ea5e9'], ['Skipped', stats.skipped || 0, '#ef4444'], ['Merged/deduped', (stats.deduped || 0) + (stats.aggregated || 0), '#14b8a6']].map(([l, v, c]) => <div key={l as string} className="panel p-3"><div className="label !mb-0" style={{ color: c as string }}>{l}</div><div className="text-2xl font-extrabold mt-0.5">{num(v as number)}</div></div>)}
          </div>
          <Card title="Safety checks" actions={<span className="text-xs muted">{blocks.length ? `${blocks.length} need your acknowledgement` : 'All clear'}</span>}>
            <div className="space-y-2">{plan.guardrails.length === 0 && <div className="text-sm text-green-500 flex items-center gap-2"><CheckCircle2 size={15} />No problems detected.</div>}
              {plan.guardrails.map((g) => (
                <div key={g.id} className={cn('p-3 rounded-xl border flex gap-3 items-start', g.level === 'block' ? 'border-red-500/40 bg-red-500/10' : g.level === 'warn' ? 'border-amber-500/40 bg-amber-500/10' : 'hair panel2')}>
                  {g.level === 'block' ? <Ban size={16} className="text-red-400 mt-0.5 shrink-0" /> : g.level === 'warn' ? <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" /> : <Info size={16} className="text-brand-300 mt-0.5 shrink-0" />}
                  <div className="flex-1"><div className="text-sm font-bold">{g.title}</div><div className="text-xs muted mt-0.5">{g.detail}</div></div>
                  {g.level === 'block' && !g.hard && <label className="text-xs flex items-center gap-1.5 shrink-0 font-semibold"><input type="checkbox" checked={acks.has(g.id)} onChange={(e) => setAcks((s) => { const n = new Set(s); e.target.checked ? n.add(g.id) : n.delete(g.id); return n; })} />I’ve checked — proceed</label>}</div>))}</div>
          </Card>
          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="How this file is interpreted" className="lg:col-span-1">
              <div className="space-y-3 text-[13px]">
                {mode === 'snapshot' && payersOpen.length > 1 && <Field label="This file covers" hint="If the export only includes some payers, claims from the others are NOT treated as missing."><select className="input" value={over.coverage?.payers?.length ? 'some' : 'all'} onChange={(e) => setOver({ ...over, coverage: e.target.value === 'all' ? { payers: [] } : { payers: payersOpen.slice(0, 1) } })}><option value="all">The whole practice</option><option value="some">Only selected payers…</option></select>{over.coverage?.payers?.length ? <div className="flex flex-wrap gap-1.5 mt-2">{payersOpen.map((p) => <button key={p} type="button" className="chip" style={over.coverage!.payers.includes(p) ? { background: 'rgb(var(--b500))', color: '#fff' } : undefined} onClick={() => setOver({ ...over, coverage: { payers: over.coverage!.payers.includes(p) ? over.coverage!.payers.filter((x) => x !== p) : [...over.coverage!.payers, p] } })}>{p}</button>)}</div> : null}</Field>}
                <Field label="Report as-of date" hint={lastBatch?.as_of ? `Previous: ${fmtDate(lastBatch.as_of)}` : undefined}><DateField className="w-full" clearable={false} value={asOf} onChange={(d) => d && setAsOf(d > todayISO() ? todayISO() : d)} /></Field>
                <Field label="File type"><select className="input" value={mode} onChange={(e) => setMode(e.target.value as any)}><option value="snapshot">Full aging snapshot — absent claims close</option><option value="merge">Partial export — add/update only</option></select></Field>
                <Field label="Rows represent"><select className="input" value={settings.granularity} onChange={(e) => setOver({ ...over, granularity: e.target.value as any })}><option value="claim">One claim per row (lines rolled up)</option><option value="line">Each charge line (CPT) is its own record</option></select></Field>
                <Field label="Re-numbered claims"><select className="input" value={settings.identity} onChange={(e) => setOver({ ...over, identity: e.target.value as any })}><option value="auto">Link automatically when charge is identical</option><option value="ask">Ask me for each one</option><option value="strict">Never link — treat as new</option></select></Field>
                <Field label="Same claim # on several rows"><select className="input" value={settings.duplicates} onChange={(e) => setOver({ ...over, duplicates: e.target.value as any })}><option value="aggregate">Add up as charge lines</option><option value="first">Keep first</option><option value="last">Keep last</option><option value="skip">Skip & report</option></select></Field>
                <div className="grid grid-cols-2 gap-2"><Field label="Close after N missing files"><input type="number" min={1} className="input" value={settings.closeAfterMisses} onChange={(e) => setOver({ ...over, closeAfterMisses: Math.max(1, Number(e.target.value)) })} /></Field>
                  <Field label="Zero balance"><select className="input" value={settings.zeroBalance} onChange={(e) => setOver({ ...over, zeroBalance: e.target.value as any })}><option value="close">Close claim</option><option value="keep">Keep open</option></select></Field></div>
                <Field label="Date format"><select className="input" value={settings.dateOrder} onChange={(e) => setOver({ ...over, dateOrder: e.target.value as any })}><option value="auto">Auto ({pipeline.built.dateOrder === 'dmy' ? 'dd/mm' : 'mm/dd'}{pipeline.built.dateOrderCertain ? ', certain' : ', assumed'})</option><option value="mdy">mm/dd/yyyy</option><option value="dmy">dd/mm/yyyy</option></select></Field>
                <div className="flex gap-2"><button className="btn btn-sm" onClick={async () => { await save('clients', [{ ...client, settings: { ...(client.settings as any), import: { ...((client.settings as any)?.import || {}), ...over } } } as any]); toast.ok(`Saved as ${client.name}’s default rules`); }}>Save as client default</button></div>
              </div>
            </Card>
            <div className="lg:col-span-2 space-y-4">
              <Card title={<div className="flex gap-1 flex-wrap">{([['changes', `Updates (${plan.changes.length})`], ['new', `New (${plan.creates.length})`], ['closing', `Missing / closing (${plan.reviews.length + plan.closes.length})`], ['identity', `Identity (${plan.asks.length})`], ['payers', `Payers (${plan.unknownPayers.length})`], ['issues', `Issues & log (${plan.log.filter((l) => l.severity !== 'info').length})`]] as const).map(([id, l]) => <button key={id} onClick={() => setTab(id)} className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold', tab === id ? 'bg-brand-600 text-white' : 'panel2 muted')}>{l}</button>)}</div>} pad={false}>
                <div className="max-h-[420px] overflow-auto px-4 pb-4">
                  {tab === 'changes' && <table className="grid"><thead><tr><th>Claim</th><th>Kind</th><th>What changes</th><th style={{ textAlign: 'right' }}>Δ balance</th></tr></thead><tbody>{plan.changes.slice(0, 200).map((c) => <tr key={c.claim.id}><td className="font-semibold whitespace-nowrap">{c.next.claim_no}</td><td><Chip color={c.kind === 'UPDATED' ? '#06b6d4' : c.kind === 'REOPENED' ? '#a855f7' : '#6366f1'}>{c.kind.toLowerCase()}</Chip></td><td className="text-xs muted max-w-[320px]">{Object.entries(c.changes).filter(([k]) => k !== 'closed_at').map(([k, [a, b]]) => `${k}: ${a ?? '∅'}→${b ?? '∅'}`).join(' · ') || '—'}</td><td style={{ textAlign: 'right' }} className={c.delta < 0 ? 'text-green-500 font-semibold' : c.delta > 0 ? 'text-red-400 font-semibold' : 'muted'}>{c.delta ? money(c.delta, true) : '—'}</td></tr>)}{!plan.changes.length && <tr><td colSpan={4} className="muted text-center py-8">No changes to existing claims.</td></tr>}</tbody></table>}
                  {tab === 'new' && <table className="grid"><thead><tr><th>Claim</th><th>Patient</th><th>Payer</th><th>DOS</th><th style={{ textAlign: 'right' }}>Balance</th><th>Notes</th></tr></thead><tbody>{plan.creates.slice(0, 200).map((c) => <tr key={c.id}><td className="font-semibold">{c.claim_no}</td><td>{c.patient_name}</td><td>{c.payer}</td><td>{fmtDate(c.dos)}</td><td style={{ textAlign: 'right' }}>{money(c.balance, true)}</td><td className="text-xs text-amber-500">{(c.flags || []).join(', ')}</td></tr>)}</tbody></table>}
                  {tab === 'closing' && <table className="grid"><thead><tr><th>Claim</th><th>Payer</th><th style={{ textAlign: 'right' }}>Balance leaving AR</th><th>Why</th></tr></thead><tbody>{plan.reviews.slice(0, 200).map((c) => <tr key={c.claim.id}><td className="font-semibold">{c.claim.claim_no}</td><td>{c.claim.payer}</td><td style={{ textAlign: 'right' }}>{money(c.claim.balance, true)}</td><td className="text-xs text-amber-500">missing — stays open, waits in Control → Missing from file for a supervisor/manager decision</td></tr>)}{plan.closes.slice(0, 200).map((c) => <tr key={c.claim.id}><td className="font-semibold">{c.claim.claim_no}</td><td>{c.claim.payer}</td><td style={{ textAlign: 'right' }}>{money(c.amount, true)}</td><td className="text-xs muted">{c.reason}</td></tr>)}{plan.misses.length > 0 && <tr><td colSpan={4} className="text-xs text-amber-500 pt-3">{plan.misses.length} more claims are missing once and kept open (rule: close after {settings.closeAfterMisses} missing files).</td></tr>}</tbody></table>}
                  {tab === 'identity' && (plan.asks.length === 0 ? <div className="muted text-sm py-8 text-center">No identity questions — every row matched by claim number or is clearly new.</div> : (
                    <div className="space-y-3 pt-1"><div className="flex justify-between items-center"><div className="text-xs muted">These rows share a patient/DOS/charge with an existing claim under a different number.</div><button className="btn btn-sm" onClick={() => { const d: Decisions = {}; plan.asks.forEach((m) => { const c = m.candidates.find((x) => x.confidence === 'high'); if (c) d[m.row.n] = { action: 'link', claimId: c.claim.id }; }); setDecisions({ ...decisions, ...d }); }}><Wand2 size={12} />Link all high-confidence</button></div>
                      {plan.asks.map((m) => (<div key={m.row.n} className="panel2 p-3 text-[13px]"><div className="font-semibold">Row {m.row.n}: {m.row.claim_no} · {m.row.patient_name} · {m.row.dos} · {money(m.row.balance || 0, true)}</div><div className="text-xs muted mb-2">{m.why}</div>
                        <select className="input" value={decisions[m.row.n]?.action === 'link' ? (decisions[m.row.n] as any).claimId : 'new'} onChange={(e) => setDecisions({ ...decisions, [m.row.n]: e.target.value === 'new' ? { action: 'new' } : { action: 'link', claimId: e.target.value } })}><option value="new">Create as a NEW claim</option>{m.candidates.map((c) => <option key={c.claim.id} value={c.claim.id}>Link to {c.claim.claim_no} ({money(c.claim.balance)}) — {c.confidence === 'high' ? 'same charge' : 'same patient/DOS'}</option>)}</select></div>))}</div>))}
                  {tab === 'payers' && (plan.unknownPayers.length === 0 ? <div className="muted text-sm py-8 text-center">Every payer name is in the directory.</div> : <PayerFixer names={plan.unknownPayers} />)}
                  {tab === 'issues' && <table className="grid"><thead><tr><th>Row</th><th>Action</th><th>Code</th><th>Message</th></tr></thead><tbody>{plan.log.filter((l) => l.severity !== 'info').slice(0, 300).map((l, i) => <tr key={i}><td>{l.row_no ?? '—'}</td><td><Chip color={l.severity === 'error' ? '#ef4444' : '#f59e0b'}>{l.action}</Chip></td><td className="text-xs">{l.code}</td><td className="text-xs muted max-w-[360px]">{l.message}</td></tr>)}</tbody></table>}
                </div>
              </Card>
            </div>
          </div>
          <div className="panel p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm"><div className="font-bold">{num(plan.creates.length)} new · {num(plan.changes.length)} updated · {num(plan.closes.length)} closing · AR {money(plan.priorBalance)} → {money(plan.totalBalance)}</div><div className="text-xs muted">Existing assignments, status, root cause, notes and history are preserved. Every row outcome is logged and the import can be undone.</div></div>
            <div className="flex items-center gap-3"><label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={runAfter} onChange={(e) => setRunAfter(e.target.checked)} />Run rules & quality checks after import</label>
              <button className="btn" onClick={() => setStep('map')}>Back</button><button className="btn btn-primary" disabled={!canCommit} onClick={commit}>{busy ? 'Importing…' : hard ? 'Cannot import' : unacked.length ? `Acknowledge ${unacked.length} warning(s)` : 'Import now'}</button></div></div>
        </div>)}

      {step === 'done' && result && plan && (
        <Card><div className="text-center py-10"><CheckCircle2 className="mx-auto text-green-500 mb-3" size={44} /><div className="text-lg font-extrabold">Import complete</div>
          <div className="text-sm muted mt-1">{plan.creates.length} new · {plan.changes.length} updated · {plan.closes.length} closed · {result.recoveries} recoveries attributed{result.ruleChanges ? ` · rules touched ${result.ruleChanges} claims` : ''}</div>
          <div className="flex gap-2 justify-center mt-5 flex-wrap"><Link to="/allocation" className="btn btn-primary">Allocate claims</Link><Link to="/exceptions" className="btn">Review exceptions</Link><Link to="/imports" className="btn">Import log</Link>
            <button className="btn btn-danger" onClick={async () => { if (!(await confirm('Undo this import? New claims are removed, updated claims restored, closed claims reopened.'))) return; try { const r = await rollbackBatch(result.batchId); toast.ok(`Undone: ${r.restored} restored, ${r.removed} removed`); reset(); } catch (e: any) { toast.err(e.message); } }}><Undo2 size={13} />Undo</button><button className="btn" onClick={reset}>Import another</button></div></div></Card>)}
      {node}
    </div>
  );
}
