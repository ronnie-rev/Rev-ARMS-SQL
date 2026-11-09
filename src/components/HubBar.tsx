import { NavLink, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { HUBS } from './Layout';

/** Pages that used to be separate sidebar entries but belong together. The sidebar shows one entry per group; this bar switches between the members. Old links to each page keep working. */
export const HUB_GROUPS: Record<string, { label: string; items: { to: string; label: string }[] }> = {
  payers: { label: 'Payers', items: [{ to: '/payers', label: 'Payer intelligence' }, { to: '/scorecards', label: 'Scorecards & alerts' }] },
  comms: { label: 'Client comms', items: [{ to: '/requests', label: 'Requests from clients' }, { to: '/outreach', label: 'Outreach to clients' }] },
  edi: { label: 'Remits & EDI', items: [{ to: '/era', label: 'ERA / 835 import' }, { to: '/edi', label: 'X12 viewer' }] },
  history: { label: 'History', items: [{ to: '/imports', label: 'Imports' }, { to: '/bulk', label: 'Bulk actions' }] },
  clients: { label: 'Clients', items: [{ to: '/clients', label: 'Clients' }, { to: '/health', label: 'Financial health' }] },
  insight: { label: 'Intelligence', items: [{ to: '/intelligence', label: 'Next actions, cash & capacity' }, { to: '/insights', label: 'Insights' }] },
  appeals: { label: 'Appeals', items: [{ to: '/appeals', label: 'Appeals' }, { to: '/faxes', label: 'Faxes sent' }] },
};

export function HubBar({ group }: { group: keyof typeof HUB_GROUPS }) {
  const loc = useLocation(); const me = useStore((s) => s.me()); const has = useStore((s) => s.has); const g = HUB_GROUPS[group];
  const nav = HUBS.flatMap((h) => h.items); const ok = (to: string) => { const n = nav.find((i) => i.to === to); return !n ? true : n.roles ? !!me && n.roles.includes(me.role) : n.cap ? has(n.cap) : false; };
  const items = g.items.filter((i) => ok(i.to)); if (items.length < 2 || me?.role === 'client') return null;
  return <div className="seg mb-4 no-print" role="tablist" aria-label={g.label}>{items.map((i) => <NavLink key={i.to} to={i.to} role="tab" aria-selected={loc.pathname === i.to} className={loc.pathname === i.to ? 'on' : ''}>{i.label}</NavLink>)}</div>;
}
