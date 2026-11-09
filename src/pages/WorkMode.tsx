import { useEffect, useMemo, useState } from 'react';
import { isIC } from '../lib/roles';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Flame, SkipForward, Target } from 'lucide-react';
import { useStore } from '../store';
import { useClaims, usePhi, usePriority } from '../hooks';
import { clientLoads } from '../lib/engine/dayplan';
import { Chip, Empty, PageHeader } from '../components/ui';
import { ClaimWorkPanel } from '../components/ClaimWorkPanel';
import { cn, fmtDate, money, todayISO } from '../lib/utils';

/** Focus queue: highest-value work first, one claim at a time, auto-advance on save. */
export default function WorkMode({ embedded }: { embedded?: boolean } = {}) {
  const me = useStore((s) => s.me()); const workLog = useStore((s) => s.workLog); const phi = usePhi();
  const all = useClaims(); const pri = usePriority(all);
  const [done, setDone] = useState<Set<string>>(new Set()); const [skipped, setSkipped] = useState<string[]>([]); const [cur, setCur] = useState<string | null>(null);
  const [scope, setScope] = useState<'mine' | 'all'>('mine'); const [batch, setBatch] = useState(true); const clients = useStore((s) => s.clients);
  const order = useMemo(() => new Map(clientLoads(all.filter((x) => x.open && (scope === 'all' || x.c.assigned_to === me?.id))).sort((a, b) => b.weight - a.weight).map((l, i) => [l.clientId, i])), [all, scope, me]);
  const queue = useMemo(() => all.filter((x) => x.open && !done.has(x.c.id) && (scope === 'all' ? true : x.c.assigned_to === me?.id))
    .sort((a, b) => (batch ? (order.get(a.c.client_id) ?? 99) - (order.get(b.c.client_id) ?? 99) : 0) || (pri.get(b.c.id)?.score ?? b.score) - (pri.get(a.c.id)?.score ?? a.score)), [all, done, scope, me, batch, order, pri]);
  const ordered = useMemo(() => [...queue.filter((x) => !skipped.includes(x.c.id)), ...queue.filter((x) => skipped.includes(x.c.id))], [queue, skipped]);
  const current = ordered.find((x) => x.c.id === cur) || ordered[0];
  useEffect(() => { if (current && current.c.id !== cur) setCur(current.c.id); }, [current, cur]);
  const today = workLog.filter((w) => w.user_id === me?.id && w.work_date === todayISO()).length;
  const target = me?.daily_target || 40; const pctDone = Math.min(1, today / target);
  const idx = current ? ordered.indexOf(current) : -1;
  const go = (d: number) => { const n = ordered[Math.max(0, Math.min(ordered.length - 1, idx + d))]; if (n) setCur(n.c.id); };
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); if (current) setSkipped((s) => [...s, current.c.id]); setCur(null); } if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); });
  const next = () => { if (!current) return; setDone((d) => new Set(d).add(current.c.id)); setCur(null); };

  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2"><Flame className="text-amber-400" />{embedded ? 'Focus queue' : 'Work Mode'}</span>} sub="Ordered by smart priority (deadline criticality, value, age, follow-ups, allocation rules). Saving a touch advances automatically." actions={<>
        <label className="text-xs flex items-center gap-1.5 muted"><input type="checkbox" checked={batch} onChange={(e) => { setBatch(e.target.checked); setCur(null); }} />Group by client</label><select className="input !w-auto" value={scope} onChange={(e) => { setScope(e.target.value as any); setCur(null); }}><option value="mine">My claims</option>{!isIC(me?.role) && <option value="all">Everything open</option>}</select>
        <div className="panel2 px-3 py-1.5 flex items-center gap-2 text-sm"><Target size={14} className="text-brand-400" /><b>{today}</b><span className="muted">/ {target} today</span><div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}><div className="h-full bg-gradient-to-r from-brand-400 to-green-500" style={{ width: pctDone * 100 + '%' }} /></div></div></>} />
      {!current ? <div className="panel"><Empty title={scope === 'mine' ? 'Your queue is clear 🎉' : 'Nothing open'} sub="Ask a supervisor for more claims, or switch scope." action={<Link to="/worklist?view=unassigned" className="btn btn-primary">Browse unassigned</Link>} /></div> : (
        <div className="grid xl:grid-cols-[300px_1fr] gap-4">
          <div className="panel p-2 max-h-[calc(100vh-190px)] overflow-auto">
            <div className="label px-2 pt-1">Up next · {ordered.length}</div>
            {ordered.slice(0, 60).map((x, i) => (<div key={x.c.id}>{batch && (i === 0 || ordered[i - 1].c.client_id !== x.c.client_id) && <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider muted"><span className="w-1.5 h-1.5 rounded-full" style={{ background: x.client?.color }} />{x.client?.name}<span className="ml-auto opacity-70">{ordered.filter((y) => y.c.client_id === x.c.client_id).length}</span></div>}
              <button key={x.c.id} onClick={() => setCur(x.c.id)} className={cn('w-full text-left px-2.5 py-2 rounded-lg mb-0.5', x.c.id === current.c.id ? 'bg-brand-600/25 ring-1 ring-brand-500' : 'hover:bg-[var(--panel2)]')}>
                <div className="flex justify-between text-[13px]"><b>{x.c.claim_no}</b><span className="tabular-nums">{money(x.c.balance)}</span></div>
                <div className="flex gap-1.5 items-center mt-0.5 flex-wrap"><span className="text-[11px] muted truncate">{x.c.payer}</span>{x.fuDue && <Chip color="#f59e0b">F/U</Chip>}{x.tfLeft != null && x.tfLeft <= 30 && <Chip color="#ef4444">TF</Chip>}{x.bucket && <Chip color={x.bucket.color}>{x.age}d</Chip>}</div></button></div>))}
          </div>
          <div className="panel p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div><div className="flex items-center gap-2 flex-wrap"><button onClick={() => useStore.getState().openClaim(current.c.id)} className="text-xl font-extrabold tracking-tight hover:text-brand-400">{current.c.claim_no}</button><Chip color={current.client?.color}>{current.client?.name}</Chip>{current.bucket && <Chip color={current.bucket.color}>{current.age}d · {current.bucket.label}</Chip>}</div>
                <div className="text-sm muted mt-0.5">{phi(current.c.patient_name)} · {current.c.payer} · DOS {fmtDate(current.c.dos)} · CPT {current.c.cpt} · {current.c.denial_codes || current.c.pms_status}</div></div>
              <div className="text-right"><div className="text-2xl font-extrabold tabular-nums">{money(current.c.balance, true)}</div><div className="text-[11px] muted">{current.tfLeft != null ? (current.tfLeft <= 0 ? 'TF passed' : `${current.tfLeft}d to timely filing`) : ''}</div></div>
            </div>
            <ClaimWorkPanel ec={current} autoFocus onSaved={next} />
            <div className="flex justify-between mt-5 pt-4 border-t hair text-xs"><button className="btn btn-sm" onClick={() => go(-1)}><ChevronLeft size={13} />Prev <span className="kbd">Alt ←</span></button>
              <button className="btn btn-sm" onClick={() => { setSkipped((s) => [...s, current.c.id]); setCur(null); }}><SkipForward size={13} />Skip <span className="kbd">Alt →</span></button>
              <button className="btn btn-sm" onClick={() => go(1)}>Next<ChevronRight size={13} /></button></div>
          </div>
        </div>)}
    </div>
  );
}
