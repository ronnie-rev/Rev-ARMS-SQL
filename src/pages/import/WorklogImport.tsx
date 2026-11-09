import { useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, FileDown, UploadCloud } from 'lucide-react';
import { useStore } from '../../store';
import { Card, Chip, Field, toast } from '../../components/ui';
import { WORKLOG_FIELDS } from '../../lib/pms';
import { autoMap, canonicalize, parseFile, type CanonRow, type ParsedSheet } from '../../lib/importer';
import { downloadFile, fmtDate, nowISO, num, toCSV, uid } from '../../lib/utils';
import type { Claim, WorkLog } from '../../lib/types';

const CHUNK = 500;

/** Backfill history from the legacy Excel production tracker ("Log" sheet): each row becomes a touch. */
export default function WorklogImport() {
  const { clients, templates, claims, profiles, config, save } = useStore();
  const [sheet, setSheet] = useState<ParsedSheet | null>(null); const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [clientId, setClientId] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState<{ logs: number; fresh: number; changed: number } | null>(null);
  const inp = useRef<HTMLInputElement>(null);
  const tpl = templates.find((t) => t.kind === 'worklog');
  const onFile = async (f: File) => { setBusy(true); try { const sh = await parseFile(f); setSheet(sh); setMapping(autoMap(sh.headers, tpl || { mapping: {}, kind: 'worklog' }).mapping); } catch (e: any) { toast.err(e.message); } finally { setBusy(false); } };
  const canon = useMemo(() => (sheet ? canonicalize(sheet.rows, mapping, 'worklog', []) : []), [sheet, mapping]);
  const ok = canon.filter((r) => r.claim_no && r.work_date); const missing = WORKLOG_FIELDS.filter((f) => f.required && !mapping[f.key] && !(f.key === 'client' && clientId)).map((f) => f.label);

  const commit = async () => {
    setBusy(true);
    try {
      const clientByName = new Map(clients.map((c) => [c.name.toLowerCase(), c])); const userByName = new Map(profiles.map((p) => [p.full_name.toLowerCase(), p])); const userByEmp = new Map(profiles.filter((p) => p.emp_code).map((p) => [String(p.emp_code).toLowerCase(), p]));
      const newClients: any[] = []; const claimByKey = new Map(claims.map((c) => [c.client_id + '|' + (c.claim_key || c.claim_no).toLowerCase(), c])); const newClaims = new Map<string, Claim>(); const logs: WorkLog[] = []; const now = nowISO();
      for (const r of ok as CanonRow[]) {
        const cname = r.client || clients.find((c) => c.id === clientId)?.name; if (!cname) continue;
        let cl = clientByName.get(cname.toLowerCase()) || clients.find((c) => c.id === clientId);
        if (!cl) { cl = { id: uid(), name: cname, code: cname.slice(0, 3).toUpperCase(), pms: 'Standard', color: '#64748b', supervisor_id: null, aging_basis: 'dos', tf_days: null, rca_allowed: null, active: true, settings: {} } as any; newClients.push(cl); clientByName.set(cname.toLowerCase(), cl!); }
        const key = cl!.id + '|' + String(r.claim_no).replace(/[^A-Za-z0-9]/g, '').toLowerCase(); let c = claimByKey.get(key) || newClaims.get(key);
        if (!c) { c = { id: uid(), client_id: cl!.id, claim_no: r.claim_no, claim_key: String(r.claim_no).toUpperCase().replace(/[^A-Z0-9]/g, ''), aliases: [], flags: [], missing_count: 0, account_id: r.account_id, patient_name: r.patient_name, dos: r.dos, last_billed: null, payer: r.payer, provider: r.provider, provider_type: r.provider_type, cpt: r.cpt, billed_amt: r.billed_amt, balance: r.balance, pms_status: null, denial_codes: null, status: 'In Progress', rca: null, rca_detail: null, end_action: null, end_sub: null, mode: null, assigned_to: null, priority: 'Normal', next_fu: null, touch_count: 0, last_touched_at: null, custom: {}, first_batch: null, last_batch: null, closed_at: null, closed_reason: null, created_at: now, updated_at: now } as Claim; newClaims.set(key, c); }
        const u = userByEmp.get(String(r.emp_code || '').toLowerCase()) || userByName.get(String(r.user_name || '').toLowerCase()); const prior = logs.filter((l) => l.claim_id === c!.id).length + c.touch_count;
        logs.push({ id: uid(), claim_id: c.id, client_id: cl!.id, user_id: u?.id ?? null, user_name: r.user_name || u?.full_name || null, emp_code: r.emp_code, supervisor_name: r.supervisor, work_date: r.work_date, comment: r.comment, rca: r.rca, rca_detail: r.rca_detail, end_action: r.end_action, end_sub: r.end_sub, mode: r.mode, balance: r.balance, age_days: null, bucket: null, next_fu: r.next_fu, multi_touch: prior > 0 || !!r.multi_touch, audit_status: r.audit_remarks ? 'fail' : 'pending', audit_remarks: r.audit_remarks, audit_by: null, audited_at: null, legacy: true, created_at: r.work_date + 'T12:00:00Z' } as WorkLog);
        const ea = config.find((x) => x.category === 'end_action' && x.value === r.end_action);
        Object.assign(c, { rca: r.rca ?? c.rca, rca_detail: r.rca_detail ?? c.rca_detail, end_action: r.end_action ?? c.end_action, end_sub: r.end_sub ?? c.end_sub, mode: r.mode ?? c.mode, next_fu: r.next_fu ?? c.next_fu, status: (ea?.meta.status as string) || c.status, touch_count: c.touch_count + 1, last_touched_at: r.work_date + 'T12:00:00Z', assigned_to: c.assigned_to ?? u?.id ?? null });
        claimByKey.set(key, c);
      }
      if (newClients.length) await save('clients', newClients);
      const ids = new Set(logs.map((l) => l.claim_id)); const touched = [...claimByKey.values(), ...newClaims.values()].filter((c, i, a) => ids.has(c.id) && a.indexOf(c) === i);
      for (let i = 0; i < touched.length; i += CHUNK) await save('claims', touched.slice(i, i + CHUNK) as any);
      for (let i = 0; i < logs.length; i += CHUNK) await save('work_log', logs.slice(i, i + CHUNK) as any);
      useStore.getState().audit_('import', `Imported ${logs.length} legacy tracker touches`, {}, 'work_log');
      setDone({ logs: logs.length, fresh: newClaims.size, changed: touched.length - newClaims.size }); toast.ok(`Imported ${logs.length} touches`);
    } catch (e: any) { toast.err(e.message); } finally { setBusy(false); }
  };

  if (done) return <Card><div className="text-center py-10"><CheckCircle2 className="mx-auto text-green-500 mb-3" size={44} /><div className="text-lg font-extrabold">Tracker history imported</div><div className="text-sm muted mt-1">{num(done.logs)} touches · {num(done.fresh)} new claims · {num(done.changed)} existing claims updated</div><button className="btn mt-5" onClick={() => { setDone(null); setSheet(null); }}>Import another</button></div></Card>;
  return (
    <Card title="Legacy production tracker → work log">
      {!sheet ? (
        <div>
          <p className="text-sm muted mb-4">Backfills history: each row of the old “Log” sheet becomes a touch (RCA, end action, audit remarks). Unknown clients are created; claims match by claim # per client.</p>
          <Field label="Default client (if the sheet has no Client column)" className="mb-4 max-w-sm"><select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <div onClick={() => inp.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]); }} className="border-2 border-dashed hair rounded-2xl p-10 text-center cursor-pointer hover:border-brand-500">
            <UploadCloud className="mx-auto mb-3 text-brand-400" size={34} /><div className="font-semibold">{busy ? 'Reading…' : 'Drop the tracker .xlsx / .csv here'}</div><input ref={inp} type="file" hidden accept=".xlsx,.csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></div>
          <div className="mt-3 flex items-center gap-3 flex-wrap"><button className="btn" onClick={() => { const cols = WORKLOG_FIELDS.map((f) => f.label); const row = (n: number) => Object.fromEntries(WORKLOG_FIELDS.map((f) => { let v = f.example || ''; if (f.key === 'claim_no') v = `CLM-1002${34 + n}`; return [f.label, v]; })); downloadFile('ClaimsIQ_work_log_sample.csv', toCSV([row(0), row(1), row(2)], cols)); }}><FileDown size={14} />Download sample file (3 rows)</button><span className="text-xs muted">Columns match the old “Log” sheet. Dates as MM/DD/YYYY. Required: Client, Work Date, Claim #.</span></div>
        </div>
      ) : (
        <div>
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-2 mb-4">{WORKLOG_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-2"><div className="w-44 text-[13px] font-semibold shrink-0">{f.label}{f.required && <span className="text-red-500"> *</span>}</div><ArrowRight size={12} className="muted" />
              <select className="input" value={mapping[f.key] || ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}><option value="">— not in file —</option>{sheet.headers.map((h) => <option key={h}>{h}</option>)}</select></div>))}</div>
          <div className="flex gap-2 flex-wrap mb-3"><Chip color="#22c55e">{num(ok.length)} touches ready</Chip><Chip color="#6366f1">{new Set(ok.map((r) => r.user_name)).size} users</Chip>{canon.length - ok.length > 0 && <Chip color="#ef4444">{canon.length - ok.length} rows skipped</Chip>}</div>
          <div className="overflow-auto panel2 max-h-60 mb-4"><table className="grid"><thead><tr><th>Date</th><th>User</th><th>Claim</th><th>Root cause</th><th>End action</th></tr></thead><tbody>{ok.slice(0, 10).map((r) => <tr key={r._row}><td>{fmtDate(r.work_date)}</td><td>{r.user_name}</td><td>{r.claim_no}</td><td>{r.rca} › {r.rca_detail}</td><td>{r.end_action}</td></tr>)}</tbody></table></div>
          <div className="flex justify-between"><button className="btn" onClick={() => setSheet(null)}>Start over</button><div className="flex items-center gap-3">{missing.length > 0 && <span className="text-xs text-amber-500">Map: {missing.join(', ')}</span>}<button className="btn btn-primary" disabled={busy || missing.length > 0 || !ok.length} onClick={commit}>{busy ? 'Importing…' : 'Import touches'}</button></div></div>
        </div>)}
    </Card>
  );
}
