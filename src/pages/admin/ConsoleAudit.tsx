import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleSlash, Download, Play, ShieldAlert, XCircle } from 'lucide-react';
import { useStore } from '../../store';
import { Card, Chip, toast } from '../../components/ui';
import { CASES, runCases, setupAudit, teardownAudit, type AuditResult } from './auditCases';
import { downloadFile } from '../../lib/utils';

/** Creates labelled dummy data, drives every admin capability through the real app, checks the outputs, and cleans up. */
export function ConsoleAudit() {
  const st = useStore(); const [res, setRes] = useState<Record<string, AuditResult>>({}); const [busy, setBusy] = useState(false); const [keep, setKeep] = useState(false); const [only, setOnly] = useState(''); const [note, setNote] = useState('');
  const abort = useRef(false); const groups = useMemo(() => [...new Set(CASES.map((c) => c.group))], []);
  const list = Object.values(res); const pass = list.filter((r) => r.status === 'pass').length, fail = list.filter((r) => r.status === 'fail').length, skip = list.filter((r) => r.status === 'skip').length;
  const run = async (group?: string) => {
    if (busy) return; if (st.mode === 'supabase' && !window.confirm('This writes clearly-labelled “ZZ Audit” rows to your live database and deletes them afterwards. Continue?')) return;
    setBusy(true); abort.current = false; setOnly(group || ''); setNote('Creating dummy practice, providers and claims…'); if (!group) setRes({});
    const cases = CASES.filter((c) => !group || c.group === group); let ctx: Awaited<ReturnType<typeof setupAudit>> | null = null;
    try { ctx = await setupAudit(); setNote(`Running ${cases.length} checks…`); await runCases(cases, ctx, (r) => setRes((x) => ({ ...x, [r.id]: r }))); }
    catch (e: any) { toast.err('Audit setup failed: ' + (e?.message || e)); }
    finally { if (ctx && !keep) { setNote('Cleaning up dummy data…'); try { await teardownAudit(ctx); } catch (e: any) { toast.err('Cleanup problem: ' + (e?.message || e)); } } setNote(keep ? 'Dummy data kept — find it under the client “ZZ Audit Practice”.' : ''); setBusy(false); }
  };
  const report = () => downloadFile(`console-audit-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ mode: st.mode, at: new Date().toISOString(), pass, fail, skip, results: list }, null, 2), 'application/json');
  return (
    <div className="space-y-4">
      <Card title="Console audit" actions={<><label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />Keep dummy data afterwards</label>{list.length > 0 && <button className="btn btn-sm" onClick={report}><Download size={13} />Report</button>}<button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run()}><Play size={13} />{busy && !only ? 'Running…' : `Run all ${CASES.length} checks`}</button></>}>
        <p className="text-[12.5px] muted">Adds a dummy practice (“ZZ Audit Practice”) with providers and 13 claims, then pushes real data through every admin capability — buckets, payers, taxonomy, queues, lifecycle, import & undo, users & client access, automation, reports, pivot, 835 posting, exports — and checks the <b>outputs</b> (stored fields, totals, guards), not just that a save succeeded.</p>
        {st.mode === 'supabase' && <div className="mt-3 pill-warn rounded-2xl px-4 py-2.5 text-[12.5px] flex gap-2"><ShieldAlert size={15} className="shrink-0 mt-0.5" />Live database: runs against your Supabase project (use it right after a deploy, outside working hours). Profile-creating checks are skipped; everything it adds is deleted afterwards.</div>}
        {(list.length > 0 || note) && <div className="mt-4 flex flex-wrap items-center gap-3"><Chip color="#17803d">{pass} passed</Chip><Chip color={fail ? '#c13030' : '#64748b'}>{fail} failed</Chip><Chip color="#64748b">{skip} skipped</Chip><span className="text-xs muted">{note}</span></div>}
      </Card>
      {groups.map((g) => { const cases = CASES.filter((c) => c.group === g); const rs = cases.map((c) => res[g + '|' + c.name]).filter(Boolean); const bad = rs.filter((r) => r.status === 'fail').length; return (
        <Card key={g} title={<span className="flex items-center gap-2">{g}{rs.length === cases.length && (bad ? <XCircle size={15} className="text-red-500" /> : <CheckCircle2 size={15} className="text-green-600" />)}</span>} actions={<button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(g)}><Play size={12} />Run group</button>} pad={false}>
          <div className="divide-y hair">{cases.map((c) => { const r = res[g + '|' + c.name]; return (
            <div key={c.name} className="px-5 py-2.5 flex items-start gap-3 text-[13px]">
              <span className="mt-0.5 shrink-0">{!r ? <span className="w-4 h-4 rounded-full border hair inline-block" /> : r.status === 'pass' ? <CheckCircle2 size={16} className="text-green-600" /> : r.status === 'skip' ? <CircleSlash size={16} className="muted" /> : <XCircle size={16} className="text-red-500" />}</span>
              <div className="min-w-0 flex-1"><div className="font-medium">{c.name}</div>{r && <div className={`text-[12px] break-words ${r.status === 'fail' ? 'text-red-500' : 'muted'}`}>{r.detail}</div>}</div>{r && <span className="text-[11px] muted tabular-nums">{Math.round(r.ms)} ms</span>}</div>); })}</div>
        </Card>); })}
    </div>
  );
}
