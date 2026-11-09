import { useMemo } from 'react';
import { useStore } from '../store';
import { Card, Chip } from './ui';
import { isProducer } from '../lib/roles';
import { money } from '../lib/utils';

/** Allocation health: clients nobody covers, people carrying far more than the team average, and claims owned by people who were deactivated. */
export function CoverageGaps() {
  const { clients, profiles, claims } = useStore();
  const d = useMemo(() => {
    const staff = profiles.filter((p) => p.active && isProducer(p.role)); const open = claims.filter((c) => !c.closed_at);
    const uncovered = clients.map((c) => ({ c, n: open.filter((x) => x.client_id === c.id).length, cover: staff.filter((p) => (p.client_ids || []).includes(c.id)).length })).filter((x) => x.n > 0 && x.cover === 0);
    const load = staff.map((p) => { const mine = open.filter((c) => c.assigned_to === p.id); return { p, n: mine.length, bal: mine.reduce((a, c) => a + c.balance, 0) }; }); const avg = load.length ? load.reduce((a, l) => a + l.n, 0) / load.length : 0;
    const heavy = load.filter((l) => avg > 0 && l.n > avg * 1.6 && l.n > 20).sort((a, b) => b.n - a.n); const light = load.filter((l) => avg > 0 && l.n < avg * 0.4).sort((a, b) => a.n - b.n);
    const inactive = new Set(profiles.filter((p) => !p.active).map((p) => p.id)); const stranded = open.filter((c) => c.assigned_to && inactive.has(c.assigned_to));
    return { uncovered, heavy, light, avg: Math.round(avg), stranded: { n: stranded.length, bal: stranded.reduce((a, c) => a + c.balance, 0) } };
  }, [clients, profiles, claims]);
  const ok = !d.uncovered.length && !d.heavy.length && !d.stranded.n;
  return (
    <Card title="Allocation health">{ok ? <div className="text-sm" style={{ color: '#16a34a' }}>Every client has coverage, workloads are within range and nothing is stranded.</div> : <div className="space-y-2 text-[13px]">
      {d.uncovered.map((x) => <div key={x.c.id}><Chip color="#dc2626">No coverage</Chip> <b>{x.c.name}</b> has {x.n} open claims and nobody is assigned to it (Client coverage tab).</div>)}
      {d.stranded.n > 0 && <div><Chip color="#dc2626">Stranded</Chip> {d.stranded.n} open claims ({money(d.stranded.bal)}) belong to deactivated users — reassign them.</div>}
      {d.heavy.map((l) => <div key={l.p.id}><Chip color="#d97706">Heavy</Chip> <b>{l.p.full_name}</b> carries {l.n} claims ({money(l.bal)}) vs a team average of {d.avg}.{d.light[0] && <span className="muted"> Consider moving some to {d.light.slice(0, 2).map((x) => x.p.full_name).join(' / ')}.</span>}</div>)}
    </div>}</Card>
  );
}
