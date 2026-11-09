import { HubBar } from '..//components/HubBar';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useStore } from '../store';
import { useBuckets } from '../hooks';
import { Chip, PageHeader } from '../components/ui';
import { ageDays, bucketFor, bucketsFrom, money, moneyShort, num, pct, sum } from '../lib/utils';
import { clientHealth } from '../lib/engine/analytics_extra';
import { enrich } from '../lib/engine/report';

export default function Clients() {
  const { clients, claims, profiles, config, batches } = useStore();
  const buckets = useBuckets();
  const term = useMemo(() => new Set(config.filter((o) => o.category === 'status' && o.meta.terminal).map((o) => o.value)), [config]);
  const stats = useMemo(() => clients.map((c) => {
    const open = claims.filter((x) => x.client_id === c.id && !x.closed_at && !term.has(x.status));
    const bal = sum(open.map((x) => x.balance));
    const dist = buckets.map((b) => ({ b, v: sum(open.filter((x) => bucketFor(ageDays(x, c), buckets)?.label === b.label).map((x) => x.balance)) }));
    const aged = sum(open.filter((x) => (ageDays(x, c) ?? 0) > 120).map((x) => x.balance));
    const h = clientHealth(enrich(claims.filter((x) => x.client_id === c.id), c, { clients, claims, batches, recoveries: [], buckets: bucketsFrom(config), carc: new Map(), today: new Date().toISOString().slice(0, 10) }), batches.filter((b) => b.client_id === c.id));
    return { c, open, bal, dist, aged, worked: open.filter((x) => x.touch_count > 0).length, h };
  }), [clients, claims, buckets, term, batches, config]);

  return (
    <div>
      <HubBar group="clients" />
      <PageHeader title="Clients" sub="Per-practice health at a glance. Open a client for its detailed dashboard." />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {stats.filter((s) => s.c.active).map(({ c, open, bal, dist, aged, worked, h }) => (
          <Link key={c.id} to={`/clients/${c.id}`} className="panel p-5 hover:shadow-glow transition group animate-in block relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: c.color }} />
            <div className="flex justify-between items-start"><div><div className="font-extrabold text-[15px]">{c.name}</div><div className="flex gap-1.5 mt-1"><Chip color={c.color}>{c.pms}</Chip><span className="text-[11px] muted">Supervisor: {profiles.find((p) => p.id === c.supervisor_id)?.full_name || '—'}</span></div></div>
              <div className="flex items-center gap-2"><span title={h.parts.map((p) => `${p.label}: ${p.value} (${p.pts}/${p.max})`).join('\n')} className="text-[11px] font-extrabold rounded-lg px-2 py-1" style={{ background: (h.score >= 70 ? '#22c55e' : h.score >= 55 ? '#f59e0b' : '#ef4444') + '22', color: h.score >= 70 ? '#22c55e' : h.score >= 55 ? '#f59e0b' : '#ef4444' }}>Health {h.score} · {h.grade}</span><ArrowUpRight size={18} className="muted group-hover:text-brand-400 transition" /></div></div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div><div className="label">Open AR</div><div className="text-lg font-extrabold">{moneyShort(bal)}</div></div>
              <div><div className="label">Claims</div><div className="text-lg font-extrabold">{num(open.length)}</div></div>
              <div><div className="label">&gt;120d</div><div className="text-lg font-extrabold text-red-400">{pct(bal ? aged / bal : 0)}</div></div>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden mt-4 panel2" title="Balance by aging bucket">
              {dist.map(({ b, v }) => <div key={b.label} style={{ width: `${bal ? (v / bal) * 100 : 0}%`, background: b.color }} title={`${b.label}: ${money(v)}`} />)}
            </div>
            <div className="flex justify-between text-[11px] muted mt-2"><span>{open.length ? Math.round((worked / open.length) * 100) : 0}% worked</span><span>{dist.filter((d) => d.v).length} buckets</span></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
