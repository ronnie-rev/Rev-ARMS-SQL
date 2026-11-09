import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Card, Chip, Empty } from './ui';
import { SOP_LEVEL, sopScope, type ClientSop } from '../lib/engine/sops';

/** Read-only view of every client SOP for the staff who work those clients (managers edit them in Admin → Client SOPs). Respects each person's client access. */
export function SopLibrary() {
  const { settings, clients, has } = useStore(); const sops = ((settings.client_sops?.sops || []) as ClientSop[]).filter((s) => s.active);
  const [q, setQ] = useState(''); const [client, setClient] = useState('');
  const shown = useMemo(() => sops.filter((s) => (!client || s.client_id === client || (!s.client_id && client === '_all')) && (!q || `${s.title} ${s.instruction} ${sopScope(s)}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => SOP_LEVEL[b.level].rank - SOP_LEVEL[a.level].rank), [sops, q, client]);
  const visibleClient = (s: ClientSop) => !s.client_id || clients.some((c) => c.id === s.client_id);
  return (
    <Card title="Client SOPs & instructions" actions={has('manage_payer_rules') ? <a className="btn btn-sm" href="/admin?tab=clientsops">Edit</a> : undefined}>
      <div className="flex gap-2 mb-3"><input className="input max-w-xs" placeholder="Search instructions, payer, CPT…" value={q} onChange={(e) => setQ(e.target.value)} /><select className="input !w-auto" value={client} onChange={(e) => setClient(e.target.value)}><option value="">All clients</option><option value="_all">Every client</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      {shown.filter(visibleClient).length === 0 ? <Empty title="No SOPs found" sub="Instructions from the client will appear here once a manager adds them." /> :
        <ul className="divide-y hair">{shown.filter(visibleClient).map((s) => <li key={s.id} className="py-2.5 text-[13px]"><div className="flex items-center gap-2 flex-wrap"><Chip color={SOP_LEVEL[s.level].color}>{SOP_LEVEL[s.level].label}</Chip><b>{s.title}</b><span className="muted text-[11.5px]">{clients.find((c) => c.id === s.client_id)?.name || 'Every client'} · {sopScope(s)}</span></div><div className="mt-1">{s.instruction}</div></li>)}</ul>}
    </Card>
  );
}
