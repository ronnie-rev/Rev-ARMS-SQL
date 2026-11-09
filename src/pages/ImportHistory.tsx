import { HubBar } from '..//components/HubBar';
import { useEffect, useMemo, useState } from 'react';
import { Download, Undo2 } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, Empty, PageHeader, toast, useConfirm } from '../components/ui';
import { downloadFile, fmtDate, fmtDateTime, money, num, toCSV } from '../lib/utils';
import type { ImportLogRow } from '../lib/types';

const ACT_COLOR: Record<string, string> = { CREATED: '#22c55e', UPDATED: '#06b6d4', REOPENED: '#a855f7', REKEYED: '#6366f1', CLOSED: '#f59e0b', MISSING: '#f59e0b', SKIPPED: '#ef4444', DEDUPED: '#64748b', AGGREGATED: '#14b8a6', FLAGGED: '#f97316' };

export default function ImportHistory() {
  const { batches, clients, profiles, find, rollbackBatch, has, inScope, recoveries } = useStore(); const { confirm, node } = useConfirm();
  const [open, setOpen] = useState<string | null>(null); const [log, setLog] = useState<ImportLogRow[]>([]); const [loading, setLoading] = useState(false); const [act, setAct] = useState(''); const [q, setQ] = useState('');
  const list = useMemo(() => batches.filter((b) => inScope(b.client_id || '')).sort((a, b) => b.created_at.localeCompare(a.created_at)), [batches, inScope]);
  const latest = useMemo(() => { const m = new Map<string, string>(); list.filter((b) => b.status === 'committed' || !b.status).forEach((b) => { if (!m.has(b.client_id || '')) m.set(b.client_id || '', b.id); }); return m; }, [list]);
  useEffect(() => { if (!open) return; setLoading(true); find('import_log', { batch_id: open }, { order: 'row_no' }).then((r) => setLog(r as any)).finally(() => setLoading(false)); }, [open, find]);
  const rows = log.filter((l) => (!act || l.action === act) && (!q || `${l.claim_key} ${l.message} ${l.code}`.toLowerCase().includes(q.toLowerCase())));
  const counts = useMemo(() => { const m = new Map<string, number>(); log.forEach((l) => m.set(l.action, (m.get(l.action) || 0) + 1)); return [...m]; }, [log]);
  const batch = list.find((b) => b.id === open);
  return (
    <div>
      <HubBar group="history" />
      <PageHeader title="Import history" sub="Every file and row outcome, with undo for the latest import" />
      {list.length === 0 ? <Card><Empty title="No imports yet" /></Card> : (
        <Card pad={false}><div className="overflow-auto px-4 pb-4"><table className="grid"><thead><tr><th>File</th><th>Client</th><th>As of</th><th>Status</th><th style={{ textAlign: 'right' }}>Rows</th><th style={{ textAlign: 'right' }}>New</th><th style={{ textAlign: 'right' }}>Upd</th><th style={{ textAlign: 'right' }}>Closed</th><th style={{ textAlign: 'right' }}>Skipped</th><th style={{ textAlign: 'right' }}>AR</th><th>By</th><th /></tr></thead><tbody>
          {list.map((b) => (
            <tr key={b.id} className={open === b.id ? 'sel' : ''}><td className="font-semibold max-w-[220px] truncate">{b.file_name}<div className="text-[10px] muted font-normal">{b.template_name} · {b.mode}</div></td><td>{clients.find((c) => c.id === b.client_id)?.name}</td><td className="whitespace-nowrap">{fmtDate(b.as_of || b.created_at.slice(0, 10))}<div className="text-[10px] muted">{fmtDateTime(b.created_at)}</div></td>
              <td><Chip color={b.status === 'rolled_back' ? '#64748b' : b.status === 'failed' ? '#ef4444' : '#22c55e'}>{b.status || 'committed'}</Chip></td>
              <td style={{ textAlign: 'right' }}>{num(b.total_rows)}</td><td style={{ textAlign: 'right' }} className="text-green-500">{b.new_rows}</td><td style={{ textAlign: 'right' }}>{b.updated_rows}</td><td style={{ textAlign: 'right' }} className="text-amber-500">{b.dropped_rows}</td><td style={{ textAlign: 'right' }} className="text-red-400">{b.skipped_rows}</td><td style={{ textAlign: 'right' }}>{money(b.total_balance)}</td>
              <td className="text-xs muted">{profiles.find((p) => p.id === b.created_by)?.full_name}</td>
              <td className="whitespace-nowrap text-right"><button className="btn btn-sm" onClick={() => setOpen(open === b.id ? null : b.id)}>{open === b.id ? 'Hide log' : 'Row log'}</button>{' '}
                {latest.get(b.client_id || '') === b.id && has('rollback_import') && <button className="btn btn-sm btn-danger" onClick={async () => { if (!(await confirm(`Undo “${b.file_name}”? New claims are removed (unless already worked), updated claims restored, closed claims reopened, and ${recoveries.filter((r) => r.batch_id === b.id).length} recoveries removed.`))) return; try { const r = await rollbackBatch(b.id); toast.ok(`Undone — ${r.restored} restored, ${r.removed} removed, ${r.kept} kept (worked)`); } catch (e: any) { toast.err(e.message); } }}><Undo2 size={12} />Undo</button>}</td></tr>))}</tbody></table></div></Card>)}
      {open && batch && (
        <Card className="mt-4" title={`Row-level log — ${batch.file_name}`} actions={<button className="btn btn-sm" onClick={() => downloadFile(`import-log-${batch.id.slice(0, 8)}.csv`, toCSV(log.map((l) => ({ row: l.row_no, action: l.action, code: l.code, severity: l.severity, claim_key: l.claim_key, message: l.message }))))}><Download size={13} />CSV</button>}>
          {batch.guardrails && (batch.guardrails as any[]).length > 0 && <div className="flex gap-1.5 flex-wrap mb-3">{(batch.guardrails as any[]).map((g) => <Chip key={g.id} color={g.level === 'block' ? '#ef4444' : g.level === 'warn' ? '#f59e0b' : '#64748b'}>{g.title}{g.acked ? ' ✓ acknowledged' : ''}</Chip>)}</div>}
          <div className="flex gap-2 flex-wrap mb-3 items-center"><button className={'chip ' + (!act ? 'bg-brand-600 text-white' : 'panel2')} onClick={() => setAct('')}>All {log.length}</button>{counts.map(([a, n]) => <button key={a} className="chip" style={act === a ? { background: ACT_COLOR[a], color: '#fff' } : { background: (ACT_COLOR[a] || '#64748b') + '22', color: ACT_COLOR[a] }} onClick={() => setAct(act === a ? '' : a)}>{a} {n}</button>)}<input className="input !w-56 ml-auto" placeholder="Search claim / message…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="max-h-[480px] overflow-auto"><table className="grid"><thead><tr><th>Row</th><th>Action</th><th>Code</th><th>Claim key</th><th>Message</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="muted text-center py-6">Loading…</td></tr> : rows.slice(0, 500).map((l) => <tr key={l.id} className={l.claim_id ? 'cursor-pointer' : ''} onClick={() => l.claim_id && useStore.getState().openClaim(l.claim_id)}><td>{l.row_no ?? '—'}</td><td><Chip color={ACT_COLOR[l.action] || '#64748b'}>{l.action}</Chip></td><td className="text-xs">{l.code}</td><td className="text-xs">{l.claim_key}</td><td className="text-xs muted max-w-[420px]">{l.message}</td></tr>)}</tbody></table></div>
        </Card>)}
      {node}
    </div>
  );
}
