import { useMemo } from 'react';
import { useStore } from '../../store';
import { Card, Chip } from '../../components/ui';
import { accessAudit } from '../../lib/engine/accessaudit';
import { resolveSettings } from '../../lib/engine/settings';

const C = { high: '#dc2626', warn: '#d97706', info: '#64748b' } as const;
/** Who can see and do what: findings that need a decision, the effective role matrix, and who is limited to which clients. */
export default function AccessAudit() {
  const st = useStore(); const phiFree = resolveSettings(st.settings.import).phiFree !== false;
  const a = useMemo(() => accessAudit({ profiles: st.profiles, clients: st.clients, claims: st.claims, perms: st.perms(), phiFree }), [st.profiles, st.clients, st.claims, st.settings.permissions, phiFree]); // eslint-disable-line react-hooks/exhaustive-deps
  const staff = st.profiles.filter((p) => p.role !== 'client' && p.active);
  return (
    <div className="space-y-4">
      <Card title={`Findings (${a.findings.filter((x) => x.level !== 'info').length} need attention · ${a.findings.filter((x) => x.level === 'info').length} notes)`} pad={false}>
        {a.findings.length === 0 ? <div className="p-6 text-sm muted">Nothing to flag — roles, people and client assignments look consistent.</div> : <ul className="divide-y hair">{a.findings.map((f, i) => <li key={i} className="px-5 py-2.5 text-[13px] flex gap-3"><span className="w-28 shrink-0"><Chip color={C[f.level]}>{f.level === 'high' ? 'Fix now' : f.level === 'warn' ? 'Review' : 'Note'}</Chip> <span className="muted text-[11px]">{f.area}</span></span><span><b className="font-medium">{f.msg}</b><div className="muted text-[12px]">{f.fix}</div></span></li>)}</ul>}
      </Card>
      <Card title="Effective role access" pad={false}><div className="overflow-x-auto"><table className="tbl w-full text-sm"><thead><tr><th>Role</th><th className="text-right">People</th><th className="text-right">Permissions</th><th>Patient names</th><th>Money</th><th>Export</th><th>Admin</th><th>Changed from default</th></tr></thead><tbody>
        {a.roles.map((r) => <tr key={r.role}><td>{r.label}</td><td className="text-right">{r.users}</td><td className="text-right">{r.caps}</td>{[r.phi, r.money, r.exportData, r.admin].map((v, i) => <td key={i}>{v ? '●' : <span className="muted">–</span>}</td>)}<td className="text-[11.5px]">{r.changed.length ? r.changed.join(' ') : <span className="muted">default</span>}</td></tr>)}</tbody></table></div></Card>
      <Card title="Staff × client access" pad={false}><div className="overflow-x-auto"><table className="tbl w-full text-sm"><thead><tr><th>Person</th><th>Role</th><th>Access</th><th>Clients</th></tr></thead><tbody>
        {staff.map((p) => <tr key={p.id}><td>{p.full_name}</td><td className="text-[12px]">{p.role}</td><td>{p.client_scope === 'assigned' ? <Chip color="#d97706">Assigned only</Chip> : <Chip color="#64748b">All clients</Chip>}</td><td className="text-[12px]">{p.client_scope === 'assigned' ? (p.client_ids || []).map((id) => st.clients.find((c) => c.id === id)?.name).filter(Boolean).join(', ') || '—' : 'everyone'}</td></tr>)}</tbody></table></div></Card>
    </div>
  );
}
