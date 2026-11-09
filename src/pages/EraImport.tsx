import { HubBar } from '..//components/HubBar';
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileText, Download, Receipt, Upload } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, Empty, PageHeader, Stat, toast } from '../components/ui';
import { adjSplit, makeEra835, parseEra, planEra, type Era, type EraPlan } from '../lib/engine/era835';
import { downloadFile, fmtDate, money, relTime, sum, todayISO } from '../lib/utils';

const GROUP_COLOR: Record<string, string> = { CO: '#e5484d', PR: '#3b82ec', OA: '#8b5cf6', PI: '#f59e0b', CR: '#64748b' };
const MATCH: Record<string, { label: string; color: string }> = { matched: { label: 'Matched', color: '#17803d' }, unmatched: { label: 'No claim found', color: '#c13030' }, ambiguous: { label: 'Ambiguous', color: '#b26a00' }, duplicate: { label: 'Already posted', color: '#64748b' } };

/** 835 / ERA import: parse the remit, match every claim through the identity rules, verify balances, then post payments + denial codes as verified evidence. */
export default function EraImport() {
  const st = useStore(); const can = st.has('import'); const clients = st.clients.filter((c) => c.active);
  const [cid, setCid] = useState(st.clientScope.length === 1 ? st.clientScope[0] : clients[0]?.id || ''); const [file, setFile] = useState(''); const [era, setEra] = useState<Era | null>(null); const [err, setErr] = useState(''); const [open, setOpen] = useState<Set<number>>(new Set()); const [busy, setBusy] = useState(false); const [done, setDone] = useState<{ posted: number; recoveries: number; denied: number } | null>(null);
  const input = useRef<HTMLInputElement>(null); const today = todayISO();
  const posted = useMemo(() => new Set(st.activity.filter((a) => a.kind === 'era').map((a) => String(a.meta?.key))), [st.activity]);
  const plan: EraPlan | null = useMemo(() => (era ? planEra(era, st.claims, { clientId: cid, today, workLog: st.workLog, windowDays: st.settings.import?.attributionWindowDays ?? 30, posted }) : null), [era, cid, st.claims, st.workLog, posted, today, st.settings.import]);
  const load = (name: string, text: string) => { setDone(null); setErr(''); setOpen(new Set()); try { setEra(parseEra(text)); setFile(name); } catch (e: any) { setEra(null); setErr(e.message || String(e)); } };
  const onFile = async (f?: File | null) => { if (!f) return; load(f.name, await f.text()); };
  const sample = () => {
    const open = st.claims.filter((c) => c.client_id === cid && !c.closed_at && c.balance > 100).slice(0, 5); if (open.length < 3) return toast.err('Pick a client with open claims first');
    const [a, b, c, d] = open; const pay = (x: typeof a, pct: number) => Math.round(x.balance * pct * 100) / 100;
    const txt = makeEra835({ payer: (a.payer || 'PAYER').toUpperCase(), payee: clients.find((x) => x.id === cid)?.name.toUpperCase() || 'PRACTICE', trace: 'EFT' + Math.floor(1e6 + Math.random() * 9e6), date: today, claims: [
      { pcn: a.claim_no, charge: a.balance, paid: pay(a, 0.8), contractual: pay(a, 0.1), patient: pay(a, 0.1), patientName: a.patient_name || undefined, dos: a.dos || undefined },
      { pcn: b.claim_no, charge: b.balance, paid: pay(b, 0.65), contractual: pay(b, 0.35), patientName: b.patient_name || undefined, dos: b.dos || undefined },
      { pcn: c.claim_no, charge: c.balance, paid: 0, deny: { group: 'CO', code: '50', rarc: 'N115' }, patientName: c.patient_name || undefined, dos: c.dos || undefined },
      { pcn: 'NOT-IN-ARMS-' + (d?.claim_no || '1'), charge: 321.5, paid: 250, contractual: 71.5 }] });
    load('sample-835.txt', txt);
  };
  const post = async () => { if (!era || !plan) return; setBusy(true); try { const r = await st.applyEra({ era, plan, fileName: file }); setDone(r); toast.ok(`Posted ${r.posted} claims · ${r.recoveries} payments`); } catch (e: any) { toast.err('Post failed: ' + (e?.message || e)); } setBusy(false); };
  const recent = useMemo(() => { const m = new Map<string, { trace: string; at: string; n: number; paid: number }>(); st.activity.filter((a) => a.kind === 'era').forEach((a) => { const t = String(a.meta?.trace || '—'); const e = m.get(t) || { trace: t, at: a.created_at, n: 0, paid: 0 }; e.n++; e.paid += Number(a.meta?.paid || 0); if (a.created_at > e.at) e.at = a.created_at; m.set(t, e); }); return [...m.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6); }, [st.activity]);
  const t = plan?.totals;
  return (
    <div>
      <HubBar group="edi" />
      <PageHeader title={<span className="flex items-center gap-2"><Receipt className="text-brand-500" size={26} />ERA / 835 import</span>} sub="Verified payments and denial codes straight from the remit. Claims are matched through the same identity rules as aging files; nothing is posted until you approve." />
      <div className="grid xl:grid-cols-3 gap-4 mb-4">
        <Card title="1 · Practice & file" className="xl:col-span-2">
          <div className="flex flex-wrap gap-3 items-end"><label className="block"><span className="label">Practice</span><select className="input !w-64" value={cid} onChange={(e) => { setCid(e.target.value); setDone(null); }}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <button className="btn btn-primary" onClick={() => input.current?.click()}><Upload size={14} />Choose 835 file</button><button className="btn" onClick={sample}><FileText size={14} />Generate a sample remit</button><button className="btn" onClick={() => downloadFile('ClaimsIQ_sample_835.txt', makeEra835({ payer: 'EXAMPLE HEALTH PLAN', payee: 'EXAMPLE PRACTICE', trace: 'EFT1234567', date: today, claims: [{ pcn: 'CLM-100234', charge: 1250, paid: 1000, contractual: 150, patient: 100, patientName: 'DOE, JANE', dos: '2026-06-14' }, { pcn: 'CLM-100235', charge: 842.1, paid: 0, deny: { group: 'CO', code: '50', rarc: 'N115' }, patientName: 'SMITH, JOHN', dos: '2026-06-20' }] }), 'text/plain')}><Download size={14} />Download sample 835 file</button><input ref={input} type="file" hidden accept=".835,.txt,.edi,.x12,.dat,.era,text/plain" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} /></div>
          <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files?.[0]); }} className="mt-4 rounded-2xl border-2 border-dashed hair p-6 text-center text-[13px] muted">Drop the .835 / .txt remit file here · parsed in your browser, not uploaded anywhere</div>
          {err && <div className="mt-3 pill-bad rounded-2xl px-4 py-2.5 text-[13px] flex gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" />{err}</div>}
        </Card>
        <Card title="Recent remits" pad={false}>{recent.length === 0 ? <Empty title="Nothing posted yet" /> : <div className="divide-y hair">{recent.map((r) => <div key={r.trace} className="px-5 py-2.5 text-[12.5px] flex items-center gap-2"><b className="font-mono">{r.trace}</b><span className="muted">{r.n} claims · {relTime(r.at)}</span><b className="ml-auto tabular-nums">{money(r.paid)}</b></div>)}</div>}</Card>
      </div>
      {era && plan && t && <>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <Stat label="Payer" value={<span className="text-[20px]">{era.payer || '—'}</span>} sub={`${era.method || ''} · ${era.date ? fmtDate(era.date) : ''}`} />
          <Stat label="Check / EFT" value={<span className="text-[20px] font-mono">{era.trace || '—'}</span>} sub={file} />
          <Stat tone="lav" color="#7c5ce0" label="Payment" value={money(era.amount)} sub={`${t.claims} claims on the remit`} />
          <Stat label="Matched" value={`${t.matched}/${t.claims}`} color="#17803d" sub={`${money(t.matchedPaid)} will be posted`} />
          <Stat tone={t.unmatched + t.ambiguous ? 'ink' : 'plain'} label="Needs attention" value={t.unmatched + t.ambiguous + t.duplicate} sub={`${t.unmatched} unmatched · ${t.ambiguous} ambiguous · ${t.duplicate} already posted`} />
        </div>
        {era.warnings.length > 0 && <div className="mb-4 space-y-2">{era.warnings.map((w) => <div key={w} className="pill-warn rounded-2xl px-4 py-2.5 text-[13px] flex gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" />{w}</div>)}</div>}
        {plan.duplicateFile && <div className="mb-4 pill-bad rounded-2xl px-4 py-2.5 text-[13px]">Every claim on this remit (trace {era.trace}) has already been posted. Nothing to do.</div>}
        <Card title="2 · Review" pad={false} actions={<>{done ? <Chip color="#17803d"><CheckCircle2 size={12} className="inline mr-1" />Posted {done.posted} claims · {done.recoveries} payments · {done.denied} denials</Chip> : <button className="btn btn-primary" disabled={!can || busy || t.matched === 0 || plan.duplicateFile} onClick={post}>{busy ? 'Posting…' : `Post ${t.matched} claims (${money(t.matchedPaid)})`}</button>}</>}>
          <div className="overflow-auto"><table className="tbl w-full"><thead><tr><th /><th>Remit claim</th><th>Match</th><th>Patient</th><th className="text-right">Charge</th><th className="text-right">Paid</th><th>Adjustments</th><th>→ Lifecycle</th><th className="text-right">ARMS balance</th><th className="text-right">Expected after</th></tr></thead><tbody>
            {plan.rows.map((r, i) => { const m = MATCH[r.match]; const sp = adjSplit(r.era); const exp = open.has(i); return (<>
              <tr key={i} className={r.match === 'matched' ? '' : 'opacity-80'}>
                <td><button onClick={() => { const s = new Set(open); exp ? s.delete(i) : s.add(i); setOpen(s); }}>{exp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>
                <td><div className="font-semibold">{r.era.pcn}</div><div className="text-[11px] muted">ICN {r.era.icn || '—'} · {r.era.statusLabel}</div></td>
                <td><Chip color={m.color}>{m.label}</Chip>{r.match === 'matched' && <div className="text-[10.5px] muted">via {r.via}</div>}</td>
                <td className="text-[12px]">{r.era.patient || '—'}</td><td className="text-right tabular-nums">{money(r.era.charge)}</td><td className="text-right tabular-nums font-semibold">{money(r.era.paid)}</td>
                <td><div className="flex flex-wrap gap-1">{r.era.adj.map((a, k) => <Chip key={k} color={GROUP_COLOR[a.group] || '#64748b'}>{a.group}-{a.code} {money(a.amount)}</Chip>)}{r.era.remarks.map((x) => <span key={x} className="tag">{x}</span>)}</div></td>
                <td>{r.match === 'matched' ? <Chip color={r.lifecycle === 'DEN' ? '#e5484d' : '#17803d'}>{r.lifecycle}</Chip> : '—'}</td>
                <td className="text-right tabular-nums">{r.claim ? money(r.claim.balance) : '—'}</td><td className="text-right tabular-nums">{r.expectedBalance != null ? money(r.expectedBalance) : '—'}</td></tr>
              {exp && <tr key={i + 'x'}><td /><td colSpan={9} className="!py-3 bg-[var(--panel2)]"><div className="text-[12px] mb-1.5">{r.note} · contractual {money(sp.contractual)} · patient {money(sp.patient)} · other {money(sp.other)}</div>
                <table className="tbl w-full"><thead><tr><th>CPT</th><th>Mods</th><th>Units</th><th className="text-right">Charge</th><th className="text-right">Allowed</th><th className="text-right">Paid</th><th>Adjustments</th></tr></thead><tbody>{r.era.lines.map((l, k) => <tr key={k}><td className="font-semibold">{l.cpt}</td><td>{l.mods.join(', ')}</td><td>{l.units}</td><td className="text-right">{money(l.charge)}</td><td className="text-right">{l.allowed != null ? money(l.allowed) : '—'}</td><td className="text-right">{money(l.paid)}</td><td>{l.adj.map((a) => `${a.group}-${a.code} ${money(a.amount)}`).join(' · ')}</td></tr>)}</tbody></table></td></tr>}</>); })}</tbody></table></div>
          <div className="p-4 text-[12px] muted">Posting records the payment as a verified recovery (basis “ERA”), copies CARC/RARC codes onto the claim, and moves its lifecycle (PAY / PRT / PTB / DEN). It does <b>not</b> change the aging balance — that keeps coming from your PMS file, and the next import won’t count this payment twice. Total on this page: {money(sum(plan.rows.map((r) => r.era.paid)))}.</div>
        </Card></>}
    </div>
  );
}
