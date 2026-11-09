import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { Card } from './ui';
import { useClaims } from '../hooks';
import { clientHealth } from '../lib/engine/finhealth';
import { promises } from '../lib/engine/calls';
import { chaseList } from '../lib/engine/appealstats';
import { money, todayISO } from '../lib/utils';

const GRADE: Record<string, string> = { A: '#16a34a', B: '#65a30d', C: '#d97706', D: '#ea580c', F: '#dc2626' };
/** Home-page strip: the four things that most often get missed — weakest clients, broken promises, filing deadlines this week, appeals nobody answered. */
export function FocusStrip() {
  const { clients, recoveries, appeals, has } = useStore(); const ecs = useClaims(); const today = todayISO(); const money_ = has('view_money');
  const weak = useMemo(() => (money_ ? clients.map((c) => ({ c, h: clientHealth(ecs, recoveries, appeals, c.id, today) })).filter((x) => x.h.openClaims > 0).sort((a, b) => a.h.score - b.h.score).slice(0, 3) : []), [clients, ecs, recoveries, appeals, today, money_]);
  const broken = useMemo(() => promises(ecs.filter((x) => x.open).map((x) => x.c), today).filter((p) => p.status !== 'upcoming'), [ecs, today]);
  const tf = useMemo(() => ecs.filter((x) => x.open && x.tfLeft != null && x.tfLeft >= 0 && x.tfLeft <= 7), [ecs]);
  const chase = useMemo(() => chaseList(appeals, today, 30), [appeals, today]);
  const Box = ({ t, n, sub, to, color }: { t: string; n: number | string; sub: string; to: string; color: string }) => <Link to={to} className="panel p-3 hover:shadow-glow block"><div className="text-[11px] muted">{t}</div><div className="text-2xl font-extrabold tabular-nums" style={{ color: Number(n) > 0 ? color : undefined }}>{n}</div><div className="text-[11.5px] muted">{sub}</div></Link>;
  return (
    <div className="mb-4 space-y-3 no-print">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Box t="Filing deadline ≤ 7 days" n={tf.length} sub={money(tf.reduce((a, x) => a + x.c.balance, 0))} to="/radar" color="#dc2626" />
        <Box t="Payer promises due / broken" n={broken.length} sub={money(broken.reduce((a, p) => a + p.claim.balance, 0))} to="/tools" color="#d97706" />
        <Box t="Appeals with no answer" n={chase.length} sub={`${chase.filter((c) => c.level === 'escalate').length} to escalate`} to="/appeals" color="#d97706" />
        <Box t="Follow-ups due" n={ecs.filter((x) => x.open && x.fuDue).length} sub="in the worklist" to="/worklist?view=fu" color="#6366f1" />
      </div>
      {weak.length > 0 && <Card title="Clients that need attention" actions={<Link className="btn btn-sm" to="/health">All clients</Link>}><div className="grid sm:grid-cols-3 gap-3">{weak.map(({ c, h }) => <Link key={c.id} to="/health" className="panel2 p-3 flex items-center gap-3"><span className="w-10 h-10 rounded-full text-white font-bold flex items-center justify-center" style={{ background: GRADE[h.grade] }}>{h.grade}</span><span className="min-w-0"><b className="block truncate text-sm">{c.name}</b><span className="text-[11.5px] muted">{money(h.openBalance)} · {h.pct90}% over 90d</span></span></Link>)}</div></Card>}
    </div>
  );
}
