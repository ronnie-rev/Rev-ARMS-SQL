import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Card, Chip } from './ui';
import { useClaims } from '../hooks';
import { clientHealth } from '../lib/engine/finhealth';
import { SOP_LEVEL, type ClientSop } from '../lib/engine/sops';
import { isProducer } from '../lib/roles';
import { money, todayISO } from '../lib/utils';
import type { Client } from '../lib/types';

const GRADE: Record<string, string> = { A: '#16a34a', B: '#65a30d', C: '#d97706', D: '#ea580c', F: '#dc2626' };
/** Client page header panel: health score, standing instructions, and who covers this client. */
export function ClientPanel({ client }: { client: Client }) {
  const { recoveries, appeals, settings, profiles, has } = useStore(); const ecs = useClaims(); const today = todayISO();
  const h = useMemo(() => (has('view_money') ? clientHealth(ecs, recoveries, appeals, client.id, today) : null), [ecs, recoveries, appeals, client.id, today, has]);
  const sops = ((settings.client_sops?.sops || []) as ClientSop[]).filter((s) => s.active && (!s.client_id || s.client_id === client.id)).sort((a, b) => SOP_LEVEL[b.level].rank - SOP_LEVEL[a.level].rank);
  const team = profiles.filter((p) => p.active && isProducer(p.role) && (p.client_scope !== 'assigned' || (p.client_ids || []).includes(client.id)));
  const covering = team.filter((p) => (p.client_ids || []).includes(client.id));
  return (
    <div className="grid lg:grid-cols-3 gap-4 mb-4">
      {h && <Card title="Financial health" actions={<Link className="btn btn-sm" to="/health">Details</Link>}><div className="flex items-center gap-4"><span className="w-14 h-14 rounded-full text-white text-2xl font-bold flex items-center justify-center" style={{ background: GRADE[h.grade] }}>{h.grade}</span><div className="text-[13px]"><div className="text-xl font-semibold tabular-nums">{h.score}/100</div><div className="muted">{money(h.openBalance)} open · {h.pct90}% over 90d</div></div></div>
        {h.drivers[0] && <div className="text-[12px] mt-2"><Chip color="#d97706">{h.drivers[0].label}</Chip> {h.drivers[0].value}</div>}</Card>}
      <Card title={`Standing instructions (${sops.length})`} className={h ? '' : 'lg:col-span-2'}>{sops.length === 0 ? <div className="muted text-sm">None yet.</div> : <ul className="space-y-1.5 text-[12.5px] max-h-40 overflow-auto">{sops.slice(0, 8).map((s) => <li key={s.id}><span className="font-semibold" style={{ color: SOP_LEVEL[s.level].color }}>{SOP_LEVEL[s.level].label}:</span> {s.instruction}</li>)}</ul>}</Card>
      <Card title="Who works this client"><div className="text-[13px]">{(covering.length ? covering : team).slice(0, 8).map((p) => p.full_name).join(', ') || <span className="text-red-500">Nobody assigned — set coverage in Allocation.</span>}{!covering.length && team.length > 0 && <div className="muted text-[11.5px] mt-1">No explicit coverage set; everyone can see this client.</div>}</div></Card>
    </div>
  );
}
