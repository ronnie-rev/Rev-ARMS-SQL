import { HubBar } from '..//components/HubBar';
import { useState } from 'react';
import { Layers3, Undo2 } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, PageHeader, toast, useConfirm } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { fmtDateTime } from '../lib/utils';

const COLOR = { applied: '#22c55e', undone: '#64748b', partly_undone: '#f59e0b' } as const;
/** Every bulk change, who made it, and a safe one-click undo (only fields still holding the bulk value are reverted). */
export default function BulkHistory() {
  const { bulkOps, undoBulk } = useStore(); const { confirm, node } = useConfirm(); const [busy, setBusy] = useState('');
  const list = [...bulkOps].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const undo = async (id: string, label: string) => { if (!(await confirm(`Undo “${label}”? Only values that still hold what this action set are reverted; anything changed since is left alone.`))) return; setBusy(id); try { const r = await undoBulk(id); toast.ok(`${r.reverted} claims reverted${r.conflicts ? ` · ${r.conflicts} partly changed since and left as is` : ''}`); } catch (e) { toast.err((e as Error).message); } finally { setBusy(''); } };
  return (
    <div className="space-y-4">
      <HubBar group="history" />
      <PageHeader title="Bulk history" sub="Everything changed in bulk — with undo" />
      <Card pad={false}><DataTable data={list} rowId={(o) => o.id} exportName="bulk-history" storageKey="bulk-history" empty={{ icon: <Layers3 size={28} />, title: 'No bulk actions yet', sub: 'Select claims in the worklist and choose Bulk actions…' }} columns={[
        { id: 'when', header: 'When', value: (o) => o.created_at, cell: (o) => <span className="whitespace-nowrap">{fmtDateTime(o.created_at)}</span>, width: 160 }, { id: 'who', header: 'Who', value: (o) => o.actor_name || '', width: 130 }, { id: 'action', header: 'Action', value: (o) => o.label, width: 340 },
        { id: 'sel', header: 'Selected', value: (o) => o.claim_count, align: 'right', width: 90 }, { id: 'chg', header: 'Changed', value: (o) => o.changed_count, align: 'right', width: 90 },
        { id: 'status', header: 'Status', value: (o) => o.status, cell: (o) => <><Chip color={COLOR[o.status]}>{o.status.replace('_', ' ')}</Chip>{o.undone_count != null && <span className="text-[11px] muted"> {o.undone_count} reverted</span>}</>, width: 150 },
        { id: 'undo', header: '', sortable: false, value: () => '', width: 100, cell: (o) => { const open = o.status === 'applied' && (!o.undo_until || o.undo_until > new Date().toISOString()); return open ? <button className="btn btn-sm" disabled={busy === o.id} onClick={() => undo(o.id, o.label)}><Undo2 size={13} />Undo</button> : o.status === 'applied' ? <span className="text-[11px] muted">window closed</span> : null; } },
      ]} /></Card>
      {node}
    </div>
  );
}
