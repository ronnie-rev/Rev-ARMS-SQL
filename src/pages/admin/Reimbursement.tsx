import { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useStore } from '../../store';
import { Card, Field, toast } from '../../components/ui';
import { SampleBar, type SampleSpec } from '../../components/SampleBar';
import { clientReimb, resolveReimbCfg, validateClientReimb, type Method } from '../../lib/engine/reimb';
import { todayISO, uid } from '../../lib/utils';
import type { FeeSchedule } from '../../lib/types';

const KIND: Record<FeeSchedule['kind'], string> = { contract: 'Payer contract', custom: 'Custom fee schedule', medicare_pct: '% of Medicare' };
const METHOD: Record<Method, string> = { auto: 'Auto (schedule → payer % → GCR)', fee_schedule: 'Fee schedule only', payer_pct: 'Payer flat % only', gcr: 'Client GCR only' };

/** Central setup for the Expected-reimbursement column and the underpayment detector. */
export default function Reimbursement() {
  const { feeSchedules, feeRates, clients, config, settings, save, del, setSetting, loadRates, saveRates, recalcExpected } = useStore(); const file = useRef<HTMLInputElement>(null);
  useEffect(() => { void loadRates(); }, [loadRates]);
  const cfg = useMemo(() => resolveReimbCfg(settings.reimb_cfg), [settings.reimb_cfg]); const [draft, setDraft] = useState(cfg); const [sel, setSel] = useState(feeSchedules[0]?.id || ''); const [cid, setCid] = useState(clients[0]?.id || ''); const [busy, setBusy] = useState(false);
  const payers = useMemo(() => config.filter((o) => o.category === 'payer' && o.active).map((o) => o.value).sort(), [config]);
  const sched = feeSchedules.find((f) => f.id === sel); const rates = useMemo(() => feeRates.filter((r) => r.schedule_id === sel).sort((a, b) => a.cpt.localeCompare(b.cpt)), [feeRates, sel]);
  const client = clients.find((c) => c.id === cid); const cr = clientReimb(client); const [cdraft, setCdraft] = useState(cr); const cerr = validateClientReimb(cdraft);
  useEffect(() => setCdraft(clientReimb(clients.find((c) => c.id === cid))), [cid, clients]);
  const addSched = async () => { const f: FeeSchedule = { id: uid(), name: 'New fee schedule', client_id: null, payer: null, kind: 'contract', pct: null, effective_from: todayISO(), effective_to: null, active: true, notes: null }; await save('fee_schedules', [f]); setSel(f.id); };
  const patch = (p: Partial<FeeSchedule>) => sched && save('fee_schedules', [{ ...sched, ...p }]);
  const rateSpec: SampleSpec = { name: 'fee_rates', headers: ['cpt', 'modifier', 'amount'], rows: [{ cpt: '99213', modifier: '', amount: '92.50' }, { cpt: '99214', modifier: '', amount: '131.20' }], note: 'Allowed amount per CPT (+ optional modifier). Uploading merges by CPT+modifier.', current: () => rates.map((r) => ({ cpt: r.cpt, modifier: r.modifier, amount: String(r.amount) })) };
  const upload = (f: File) => Papa.parse<Record<string, string>>(f, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase(), complete: async (r) => { const rows = r.data.map((d) => ({ cpt: d.cpt || d.code || d.hcpcs || '', modifier: d.modifier || d.mod || '', amount: parseFloat(String(d.amount || d.allowed || d.rate || '').replace(/[$,]/g, '')) })); const n = await saveRates(sel, rows); toast.ok(`${n} of ${rows.length} rates saved`); } });
  const recalc = async () => { setBusy(true); try { const r = await recalcExpected(); toast.ok(`Expected updated on ${r.changed.toLocaleString('en-US')} claims${Object.keys(r.gaps).length ? ` · ${Object.keys(r.gaps).length} CPT codes have no rate` : ''}`); } finally { setBusy(false); } };
  const setPct = (payer: string, v: string) => { const m = { ...cdraft.payer_pct }; const n = parseFloat(v); if (!v || !Number.isFinite(n)) delete m[payer.toLowerCase()]; else m[payer.toLowerCase()] = n; setCdraft({ ...cdraft, payer_pct: m }); };
  const saveClient = async () => { if (!client || cerr.length) return; await save('clients', [{ ...client, settings: { ...(client.settings || {}), reimb: cdraft } }]); toast.ok('Saved'); await recalcExpected({ clientId: client.id }); };
  return (
    <div className="space-y-4">
      <Card title="Defaults & underpayment thresholds" actions={<><button className="btn btn-sm" disabled={busy} onClick={recalc}><RefreshCw size={13} />Recalculate all</button><button className="btn btn-primary btn-sm" onClick={async () => { await setSetting('reimb_cfg', draft as any); toast.ok('Saved'); }}>Save</button></>}>
        <div className="grid md:grid-cols-4 gap-4">
          <Field label="Fallback GCR (% of billed)" hint="Used when a client has none"><input type="number" className="input" value={draft.defaults.gcr_pct ?? ''} onChange={(e) => setDraft({ ...draft, defaults: { gcr_pct: e.target.value ? +e.target.value : null } })} /></Field>
          <Field label="Flag when short by ≥ $"><input type="number" className="input" value={draft.underpay.minDollars} onChange={(e) => setDraft({ ...draft, underpay: { ...draft.underpay, minDollars: +e.target.value } })} /></Field>
          <Field label="… and ≥ % of expected"><input type="number" className="input" value={draft.underpay.minPct} onChange={(e) => setDraft({ ...draft, underpay: { ...draft.underpay, minPct: +e.target.value } })} /></Field>
          <Field label="Look back (days)"><input type="number" className="input" value={draft.underpay.lookbackDays} onChange={(e) => setDraft({ ...draft, underpay: { ...draft.underpay, lookbackDays: +e.target.value } })} /></Field>
        </div>
      </Card>
      <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
        <Card title="Fee schedules" actions={<button className="btn btn-primary btn-sm" onClick={addSched}><Plus size={13} /></button>}>
          {feeSchedules.length === 0 && <p className="text-sm muted">None yet. Add a payer contract or custom schedule, then upload its rates.</p>}
          {feeSchedules.map((f) => <button key={f.id} onClick={() => setSel(f.id)} className="nav-item w-full text-left !py-1.5" data-active={sel === f.id}><div className="text-[13px]">{f.name}</div><div className="text-[11px] muted">{KIND[f.kind]}{f.payer ? ` · ${f.payer}` : ''}{f.client_id ? ` · ${clients.find((c) => c.id === f.client_id)?.name}` : ''}</div></button>)}
        </Card>
        {sched ? <Card title={sched.name} actions={<><SampleBar spec={rateSpec} /><input ref={file} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /><button className="btn btn-sm" onClick={() => file.current?.click()}><Upload size={13} />Upload rates</button><button className="btn btn-sm" onClick={async () => { await del('fee_schedules', [sched.id]); setSel(''); }}><Trash2 size={13} /></button></>}>
          <div className="grid md:grid-cols-3 gap-3 mb-3">
            <Field label="Name"><input className="input" defaultValue={sched.name} onBlur={(e) => patch({ name: e.target.value })} /></Field>
            <Field label="Type"><select className="input" value={sched.kind} onChange={(e) => patch({ kind: e.target.value as FeeSchedule['kind'] })}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            {sched.kind === 'medicare_pct' && <Field label="% of Medicare"><input type="number" className="input" defaultValue={sched.pct ?? ''} onBlur={(e) => patch({ pct: e.target.value ? +e.target.value : null })} /></Field>}
            <Field label="Payer (blank = any)"><select className="input" value={sched.payer || ''} onChange={(e) => patch({ payer: e.target.value || null })}><option value="">Any payer</option>{payers.map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Client (blank = all)"><select className="input" value={sched.client_id || ''} onChange={(e) => patch({ client_id: e.target.value || null })}><option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Effective from / to"><div className="flex gap-1"><input type="date" className="input" value={sched.effective_from || ''} onChange={(e) => patch({ effective_from: e.target.value || null })} /><input type="date" className="input" value={sched.effective_to || ''} onChange={(e) => patch({ effective_to: e.target.value || null })} /></div></Field>
          </div>
          <div className="text-xs muted mb-1">{rates.length.toLocaleString('en-US')} rates{rates.length > 50 ? ' (first 50 shown)' : ''}</div>
          <div className="max-h-64 overflow-auto"><table className="tbl w-full text-sm"><thead><tr><th>CPT</th><th>Mod</th><th className="text-right">Allowed</th></tr></thead><tbody>{rates.slice(0, 50).map((r) => <tr key={r.id}><td>{r.cpt}</td><td>{r.modifier}</td><td className="text-right">${r.amount.toFixed(2)}</td></tr>)}</tbody></table></div>
        </Card> : <Card><p className="text-sm muted">Select or add a fee schedule.</p></Card>}
      </div>
      <Card title="Per-client expected reimbursement" actions={<button className="btn btn-primary btn-sm" disabled={cerr.length > 0} onClick={saveClient}>Save & recalculate</button>}>
        <div className="grid md:grid-cols-3 gap-4 mb-3">
          <Field label="Client"><select className="input" value={cid} onChange={(e) => setCid(e.target.value)}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Method"><select className="input" value={cdraft.method} onChange={(e) => setCdraft({ ...cdraft, method: e.target.value as Method })}>{Object.entries(METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Standard GCR (% of billed)" hint="Gross collection rate for this client"><input type="number" className="input" value={cdraft.gcr_pct ?? ''} onChange={(e) => setCdraft({ ...cdraft, gcr_pct: e.target.value ? +e.target.value : null })} /></Field>
        </div>
        <div className="label">Flat % of billed by payer (optional)</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">{payers.map((p) => <label key={p} className="flex items-center gap-2 text-[13px]"><span className="flex-1 truncate">{p}</span><input type="number" className="input !w-20 !py-1" placeholder="—" value={cdraft.payer_pct[p.toLowerCase()] ?? ''} onChange={(e) => setPct(p, e.target.value)} />%</label>)}</div>
        {cerr.map((e) => <div key={e} className="text-xs text-red-500 mt-2">{e}</div>)}
      </Card>
    </div>
  );
}
