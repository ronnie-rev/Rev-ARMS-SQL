import { useEffect, useMemo, useState } from 'react';
import { Download, ScrollText } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, Empty, PageHeader } from '../components/ui';
import { downloadFile, fmtDateTime, toCSV } from '../lib/utils';
import type { AuditEntry } from '../lib/types';

const COL: Record<string, string> = { config: '#6366f1', delete: '#ef4444', import: '#22c55e', import_rollback: '#f59e0b', import_failed: '#ef4444', rules: '#a855f7', checks: '#06b6d4', view: '#64748b', settings: '#f59e0b', merge: '#14b8a6', export: '#f97316', login: '#64748b' };

export default function AuditLog() {
  const { find, has } = useStore(); const [rows, setRows] = useState<AuditEntry[]>([]); const [kind, setKind] = useState(''); const [q, setQ] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { find('audit_log', {}, { order: 'created_at', desc: true, limit: 2000 }).then((r) => setRows(r as any)).finally(() => setLoading(false)); }, [find]);
  const kinds = useMemo(() => [...new Set(rows.map((r) => r.kind))].sort(), [rows]);
  const list = rows.filter((r) => (!kind || r.kind === kind) && (!q || `${r.actor_name} ${r.summary} ${r.entity}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2"><ScrollText className="text-brand-400" />Audit log</span>} sub="Who changed what, who imported which file, who opened which claim (when PHI-access logging is on in Admin → Security)." actions={has('export') && <button className="btn" onClick={() => { downloadFile('arms-audit-log.csv', toCSV(list.map((r) => ({ time: r.created_at, actor: r.actor_name, role: r.actor_role, kind: r.kind, entity: r.entity, summary: r.summary })))); useStore.getState().audit_('export', 'Exported audit log CSV'); }}><Download size={14} />CSV</button>} />
      <div className="panel p-3 mb-3 flex gap-2 flex-wrap"><select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All events</option>{kinds.map((k) => <option key={k}>{k}</option>)}</select><input className="input !w-72" placeholder="Search actor / summary…" value={q} onChange={(e) => setQ(e.target.value)} /><span className="text-xs muted self-center ml-auto">{list.length} events</span></div>
      <Card pad={false}><div className="px-4 pb-4 max-h-[calc(100vh-280px)] overflow-auto"><table className="grid"><thead><tr><th>Time</th><th>Who</th><th>Event</th><th>What</th></tr></thead><tbody>
        {list.slice(0, 600).map((r) => <tr key={r.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(r.created_at)}</td><td className="text-xs"><b>{r.actor_name}</b> <span className="muted">{r.actor_role}</span></td><td><Chip color={COL[r.kind] || '#64748b'}>{r.kind}</Chip></td><td className="text-xs max-w-[560px]">{r.summary}</td></tr>)}</tbody></table>
        {!loading && list.length === 0 && <Empty title="No audit events yet" sub="Configuration changes, imports, rule runs and exports appear here." />}</div></Card>
    </div>
  );
}
