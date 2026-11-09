import { MyDayExtras } from '../components/MyDayExtras';
import { SignalsStrip } from '../components/InsightChips';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clientLoads, planDay } from '../lib/engine/dayplan';
import { Bar } from '../components/ui';
import { AlarmClock, CalendarClock, Flame, MessageSquareWarning, ShieldAlert } from 'lucide-react';
import { useStore } from '../store';
import { useClaims, usePhi } from '../hooks';
import { Card, Chip, PageHeader, Stat, toast } from '../components/ui';
import { fmtDate, money, moneyShort, sum, todayISO } from '../lib/utils';
import { AuditChip } from '../components/ClaimDrawer';

export default function MyDay() {
  const me = useStore((s) => s.me()); const { workLog, save, requests } = useStore(); const phi = usePhi();
  const all = useClaims(); const mine = useMemo(() => all.filter((x) => x.open && x.c.assigned_to === me?.id), [all, me]);
  const t = todayISO(); const nav = useNavigate(); const { clients, setClientScope } = useStore();
  const today = workLog.filter((w) => w.user_id === me?.id && w.work_date === t);
  const due = mine.filter((x) => x.fuDue).sort((a, b) => (a.c.next_fu! < b.c.next_fu! ? -1 : 1));
  const tf = mine.filter((x) => x.tfLeft != null && x.tfLeft > 0 && x.tfLeft <= 30);
  const feedback = workLog.filter((w) => w.user_id === me?.id && w.audit_status === 'fail' && !w.ack_at);
  const openReq = requests.filter((r) => r.status === 'open' && (!r.claim_id || mine.some((x) => x.c.id === r.claim_id)));
  const top = [...mine].sort((a, b) => b.score - a.score).slice(0, 6);
  const qaMine = useStore((st) => st.qaReviews).filter((r) => r.analyst_id === me?.id && r.score != null); const qaOpen = qaMine.filter((r) => r.status === 'completed').length; const qaScore = qaMine.length ? qaMine.reduce((a, r) => a + (r.score || 0), 0) / qaMine.length : null;
  const target = me?.daily_target || 40;
  const plan = useMemo(() => { const done = new Map<string, number>(); today.forEach((w) => done.set(w.client_id, (done.get(w.client_id) || 0) + 1)); return planDay(clientLoads(mine), target, done); }, [mine, today, target]);
  return (
    <div>
      <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${me?.full_name.split(' ')[0]}`} sub={`${mine.length} claims on your plate · ${moneyShort(sum(mine.map((x) => x.c.balance)))}`} actions={<Link to="/work" className="btn btn-primary"><Flame size={14} />Start focus queue</Link>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Touches today" value={`${today.length} / ${target}`} color="#6366f1" sub={`${Math.round((today.length / target) * 100)}% of target`} />
        <Stat label="Follow-ups due" value={due.length} color="#f59e0b" icon={<CalendarClock size={16} />} onClick={() => location.assign('/worklist?view=fu')} />
        <Stat label="TF ≤ 30 days" value={tf.length} color="#ef4444" icon={<AlarmClock size={16} />} sub={moneyShort(sum(tf.map((x) => x.c.balance)))} />
        <Stat label="QA feedback" value={feedback.length + qaOpen} color="#a855f7" icon={<ShieldAlert size={16} />} sub={qaScore == null ? 'to acknowledge' : `to acknowledge · my QA ${qaScore.toFixed(0)}%`} onClick={() => nav('/qa?tab=mine')} />
      </div>
      <SignalsStrip mine={mine} />
      <MyDayExtras mine={mine} target={target} />
      {plan.length > 0 && (
        <Card title="Today’s plan by client" className="mb-4" actions={<span className="text-[11px] muted">Quota = your {target} touches split by urgency (follow-ups, timely filing, unworked, value)</span>}>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{plan.map((r) => { const c = clients.find((x) => x.id === r.clientId); const pct = r.quota ? r.done / r.quota : 0; return (
            <div key={r.clientId} className="panel2 p-3.5">
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c?.color }} /><b className="text-[13px] flex-1 truncate">{c?.name}</b><span className="text-[11px] muted">{Math.floor(r.minutes / 60)}h {r.minutes % 60}m</span></div>
              <div className="flex items-end justify-between mt-2.5"><div className="text-2xl font-semibold tabular-nums">{r.done}<span className="text-sm muted font-normal"> / {r.quota}</span></div><div className="flex gap-1.5">{r.due > 0 && <Chip color="#f59e0b">{r.due} due</Chip>}{r.tfRisk > 0 && <Chip color="#ef4444">{r.tfRisk} TF</Chip>}<Chip color="#64748b">{r.open} open</Chip></div></div>
              <div className="mt-2"><Bar value={r.done} max={r.quota} color={pct >= 1 ? '#22c55e' : 'rgb(91 91 214)'} h={5} /></div>
              <button className="btn btn-sm mt-3 w-full justify-center" onClick={() => { setClientScope([r.clientId]); nav('/work'); }}><Flame size={12} />Work this client</button></div>); })}</div></Card>)}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Follow-ups due" pad={false}><div className="px-3 pb-3 max-h-80 overflow-auto">{due.slice(0, 12).map((x) => (
          <button key={x.c.id} onClick={() => useStore.getState().openClaim(x.c.id)} className="w-full flex justify-between text-left px-2 py-2 rounded-lg hover:bg-[var(--panel2)] text-[13px]"><span><b>{x.c.claim_no}</b> <span className="muted">{x.c.payer} · due {fmtDate(x.c.next_fu)}</span></span><span className="tabular-nums">{money(x.c.balance)}</span></button>))}{due.length === 0 && <div className="p-6 text-center muted text-sm">Nothing due. 🎯</div>}</div></Card>
        <Card title="Highest-value next" pad={false}><div className="px-3 pb-3">{top.map((x) => (
          <button key={x.c.id} onClick={() => useStore.getState().openClaim(x.c.id)} className="w-full flex justify-between text-left px-2 py-2 rounded-lg hover:bg-[var(--panel2)] text-[13px]"><span><b>{x.c.claim_no}</b> <span className="muted">{phi(x.c.patient_name)}</span></span><span className="flex gap-1.5 items-center">{x.bucket && <Chip color={x.bucket.color}>{x.age}d</Chip>}<span className="tabular-nums">{money(x.c.balance)}</span></span></button>))}</div></Card>
        <Card title="QA feedback to review" pad={false}><div className="px-3 pb-3 max-h-72 overflow-auto">{feedback.map((w) => (
          <div key={w.id} className="panel2 p-3 mb-2 text-[13px]"><div className="flex justify-between"><button className="font-bold text-brand-400" onClick={() => useStore.getState().openClaim(w.claim_id)}>{all.find((x) => x.c.id === w.claim_id)?.c.claim_no || 'claim'}</button><AuditChip s="fail" /></div>
            <div className="text-xs mt-1">{w.end_action} · {w.rca_detail}</div><div className="text-xs text-amber-500 mt-1">“{w.audit_remarks}”</div>
            <button className="btn btn-sm mt-2" onClick={async () => { await save('work_log', [{ ...w, ack_at: new Date().toISOString() }]); toast.ok('Acknowledged'); }}>Got it</button></div>))}{feedback.length === 0 && <div className="p-6 text-center muted text-sm">No open QA feedback.</div>}</div></Card>
        <Card title={<span className="flex items-center gap-1.5"><MessageSquareWarning size={14} />Client requests on your claims</span>} pad={false}><div className="px-3 pb-3">{openReq.map((r) => <div key={r.id} className="panel2 p-3 mb-2 text-[13px]">{r.body}<div className="text-[11px] muted mt-1">{r.author_name}</div></div>)}{openReq.length === 0 && <div className="p-6 text-center muted text-sm">No open requests.</div>}<Link to="/requests" className="text-xs text-brand-400">Open inbox →</Link></div></Card>
      </div>
    </div>
  );
}
