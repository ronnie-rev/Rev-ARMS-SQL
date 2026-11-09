import { useEffect, useMemo, useRef, useState } from 'react';
import { isProducer } from '../lib/roles';
import { useSearchParams } from 'react-router-dom';
import { Dices, Play, Plus, Trash2, Check, X, MinusCircle, Save, ShieldAlert, Clock } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import { Avatar, Bar, Card, Chip, Empty, Field, Modal, PageHeader, Stat, Tabs, toast } from '../components/ui';
import { DateRangeFilter, rangeFor } from '../components/DateRange';
import { fmtDate, money, uid } from '../lib/utils';
import { autoChecks, complete, criterionFailRates, errorPareto, qaKpis, scoreReview, validateForm, type Answer } from '../lib/engine/qascore';
import { analystPerformance } from '../lib/engine/performance';
import type { QaConfig, QaError, QaErrorCat, QaForm, QaReview, QaScoring } from '../lib/types';
import QaTrends from './QaTrends';
import { ERROR_TYPE_LABEL } from '../lib/engine/qatrack';

type Tab = 'overview' | 'trends' | 'queue' | 'reviews' | 'disputes' | 'calibration' | 'mine' | 'settings';
const DONE = ['completed', 'acknowledged', 'disputed', 'resolved'];
const RES_COLOR = { pass: '#22c55e', fail: '#f59e0b', critical: '#ef4444' } as const;
const STATUS_LABEL: Record<string, string> = { queued: 'Queued', in_review: 'In review', completed: 'Awaiting analyst', acknowledged: 'Acknowledged', disputed: 'Disputed', resolved: 'Resolved' };
const SRC_LABEL: Record<string, string> = { critical: 'Forced', risk: 'Risk', new_hire: 'New hire', random: 'Random' };
const workdays = (from: string, to: string) => { let n = 0; for (let d = new Date(from + 'T12:00:00'); d <= new Date(to + 'T12:00:00'); d.setDate(d.getDate() + 1)) if (d.getDay() % 6) n++; return Math.max(1, n); };
const weekKey = (iso: string) => { const d = new Date(iso.slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

export function ScoreChip({ r }: { r: Pick<QaReview, 'score' | 'result'> }) {
  if (r.score == null || !r.result) return <span className="muted text-xs">—</span>;
  return <Chip color={RES_COLOR[r.result]}>{Math.round(r.score)}% · {r.result}</Chip>;
}

export default function Qa() {
  const { has, me, qaReviews, profiles } = useStore();
  const [sp, setSp] = useSearchParams();
  const isQa = has('audit_touches'); const canManage = has('manage_qa'); const isAnalyst = isProducer(me()?.role);
  const tabs = [
    ...(isQa ? [{ id: 'overview' as Tab, label: 'Overview' }, { id: 'trends' as Tab, label: 'Quality trends' }, { id: 'queue' as Tab, label: 'Review queue', count: qaReviews.filter((r) => r.status === 'queued' || r.status === 'in_review').length }, { id: 'reviews' as Tab, label: 'Reviews' }, { id: 'disputes' as Tab, label: 'Disputes & coaching', count: qaReviews.filter((r) => r.status === 'disputed').length }, { id: 'calibration' as Tab, label: 'Calibration' }] : []),
    ...(isAnalyst || !isQa ? [{ id: 'mine' as Tab, label: 'My quality', count: qaReviews.filter((r) => r.analyst_id === me()?.id && r.status === 'completed').length }] : []),
    ...(canManage ? [{ id: 'settings' as Tab, label: 'Settings' }] : []),
  ];
  const want = sp.get('tab') as Tab | null; const tab: Tab = tabs.find((t) => t.id === want)?.id ?? tabs[0]?.id ?? 'mine';
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div>
      <PageHeader title="QA Center" sub="Sample → review → score → coach → resolve" />
      <div className="mb-5"><Tabs value={tab} onChange={(t) => setSp({ tab: t })} tabs={tabs} /></div>
      {tab === 'overview' && <Overview />}
      {tab === 'trends' && <QaTrends />}
      {tab === 'queue' && <Queue onOpen={setOpenId} />}
      {tab === 'reviews' && <Reviews onOpen={setOpenId} />}
      {tab === 'disputes' && <Disputes />}
      {tab === 'calibration' && <Calibration />}
      {tab === 'mine' && <Mine profilesCount={profiles.length} />}
      {tab === 'settings' && canManage && <Settings />}
      {openId && <ReviewModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function usePeriod() { const [r, setR] = useState(() => rangeFor('30')); return { ...r, set: setR }; }

/* ───────────────────────── Overview ───────────────────────── */
function Overview() {
  const { qaReviews, qaConfig: cfg, workLog, profiles, inScope } = useStore();
  const per = usePeriod();
  const touches = workLog.filter((w) => !w.legacy && inScope(w.client_id) && w.work_date >= per.from && w.work_date <= per.to);
  const revs = qaReviews.filter((r) => r.reviewed_at ? r.reviewed_at.slice(0, 10) >= per.from && r.reviewed_at.slice(0, 10) <= per.to : false);
  const k = useMemo(() => qaKpis(revs, touches.length, cfg), [revs, touches.length, cfg]);
  const perf = useMemo(() => analystPerformance({ profiles, touches, reviews: revs, cfg, workdays: workdays(per.from, per.to) }), [profiles, touches, revs, cfg, per.from, per.to]);
  const trend = useMemo(() => { const m = new Map<string, number[]>(); revs.filter((r) => r.score != null).forEach((r) => { const w = weekKey(r.reviewed_at!); m.set(w, [...(m.get(w) || []), r.score!]); }); return [...m].sort().map(([w, a]) => ({ week: fmtDate(w), score: Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10, target: cfg.kpi.qa_score })); }, [revs, cfg]);
  const pareto = errorPareto(revs, cfg.error_cats).slice(0, 8); const maxP = Math.max(1, ...pareto.map((p) => p.n));
  const form = cfg.forms[0]; const heat = form ? criterionFailRates(revs, form) : [];
  const f = (v: number | null, u: string) => (v == null ? '—' : u === 'd' ? v.toFixed(1) + 'd' : u === 'x' ? v.toFixed(0) : v.toFixed(1) + '%');
  return (
    <div className="space-y-5">
      <DateRangeFilter from={per.from} to={per.to} onChange={per.set} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {k.rows.map((r) => <Stat key={r.key} label={r.label} value={f(r.value, r.unit)} color={r.good == null ? '#64748b' : r.good ? '#22c55e' : '#ef4444'} sub={`Target ${r.higherIsBetter ? '≥' : '≤'} ${r.key === 'errors' ? cfg.kpi.max_error_rate_pct * 10 : r.target}${r.unit === '%' ? '%' : r.unit === 'd' ? 'd' : ''}`} delta={r.good == null ? undefined : { text: r.good ? 'On target' : 'Off target', good: r.good }} />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <Card title="Weekly QA score" className="lg:col-span-2">
          {trend.length < 1 ? <Empty title="No completed reviews in this period" sub="Generate a sample in Review queue." /> : (
            <div style={{ height: 230 }}><ResponsiveContainer><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.2)" /><XAxis dataKey="week" fontSize={11} /><YAxis domain={[60, 100]} fontSize={11} /><Tooltip /><Line type="monotone" dataKey="score" stroke="rgb(var(--b500))" strokeWidth={2.5} dot /><Line type="monotone" dataKey="target" stroke="#94a3b8" strokeDasharray="5 4" dot={false} /></LineChart></ResponsiveContainer></div>)}
        </Card>
        <Card title="Top error categories">
          {pareto.length === 0 ? <Empty title="No errors logged" /> : <div className="space-y-2.5">{pareto.map((p) => <div key={p.id}><div className="flex justify-between text-[12.5px]"><span>{p.label}</span><b>{p.n}</b></div><Bar value={p.n} max={maxP} color={cfg.error_cats.find((c) => c.id === p.id)?.severity === 'critical' ? '#ef4444' : '#f59e0b'} /></div>)}</div>}
        </Card>
      </div>
      <Card title="Criterion heat-map — where analysts lose points" pad={false}>
        <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{heat.map((h) => <div key={h.id} className="rounded-xl p-3" style={{ background: `rgba(239,68,68,${Math.min(0.35, h.rate * 1.2)})`, border: '1px solid rgba(128,128,128,.2)' }}><div className="text-[12.5px] font-semibold">{h.label}</div><div className="text-[22px] stat-v">{h.n ? (h.rate * 100).toFixed(0) + '%' : '—'}</div><div className="text-[11px] muted">{h.fails} fails / {h.n} reviewed</div></div>)}</div>
      </Card>
      <Card title="Analyst performance (volume × quality × rework)" pad={false}>
        <table className="tbl grid"><thead><tr><th>Analyst</th><th>Touches</th><th>Per day</th><th>Target attainment</th><th>QA score</th><th>Reviews</th><th>Errors /100</th><th>Rework</th><th>Composite</th></tr></thead>
          <tbody>{perf.map((p) => <tr key={p.p.id}><td><span className="inline-flex items-center gap-2"><Avatar name={p.p.full_name} />{p.p.full_name}</span></td><td>{p.touches}</td><td>{p.perDay.toFixed(1)}</td><td><div className="flex items-center gap-2 w-32"><Bar value={Math.min(1, p.attain)} max={1} color={p.attain >= 1 ? '#22c55e' : '#f59e0b'} /><span className="text-xs">{Math.round(p.attain * 100)}%</span></div></td>
            <td>{p.qaScore == null ? '—' : <Chip color={p.qaScore >= cfg.kpi.qa_score ? '#22c55e' : p.qaScore >= (cfg.forms[0]?.pass_threshold ?? 85) ? '#f59e0b' : '#ef4444'}>{p.qaScore.toFixed(1)}%</Chip>}</td><td>{p.qaCount}</td><td>{p.errorsPer100 == null ? '—' : p.errorsPer100.toFixed(0)}</td><td>{Math.round(p.reworkPct * 100)}%</td><td><b>{p.composite == null ? '—' : p.composite.toFixed(0)}</b></td></tr>)}
            {perf.length === 0 && <tr><td colSpan={9}><Empty title="No analysts" /></td></tr>}</tbody></table>
      </Card>
    </div>
  );
}

/* ───────────────────────── Queue ───────────────────────── */
function Queue({ onOpen }: { onOpen: (id: string) => void }) {
  const { qaReviews, profiles, claims, generateQaSample, qaConfig: cfg, me, has } = useStore();
  const [user, setUser] = useState(''); const [src, setSrc] = useState(''); const [gen, setGen] = useState(false); const per = usePeriod();
  const cm = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]); const pm = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const list = qaReviews.filter((r) => (r.status === 'queued' || r.status === 'in_review') && (!user || r.analyst_id === user) && (!src || r.sample_source === src)).sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0));
  const [plan, setPlan] = useState<{ created: number; calibration: number; perAnalyst: { name: string; picked: number; eligible: number }[] } | null>(null);
  const run = async () => { const r = await generateQaSample({ from: per.from, to: per.to }); setPlan(r); setGen(false); toast.ok(`Queued ${r.created} reviews`); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select className="input !w-auto" value={user} onChange={(e) => setUser(e.target.value)}><option value="">All analysts</option>{profiles.filter((p) => isProducer(p.role)).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
        <select className="input !w-auto" value={src} onChange={(e) => setSrc(e.target.value)}><option value="">All sources</option>{Object.entries(SRC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="muted text-xs">{list.length} waiting</span>
        {has('audit_touches') && <button className="btn btn-primary ml-auto" onClick={() => setGen(true)}><Dices size={14} />Generate sample</button>}
      </div>
      {plan && <div className="panel p-4 text-[13px]"><b>{plan.created}</b> reviews queued ({plan.calibration} calibration). {plan.perAnalyst.map((a) => `${a.name}: ${a.picked}/${a.eligible}`).join(' · ')}</div>}
      {list.length === 0 ? <Card><Empty title="Queue is empty" sub="Generate a sample from logged touches — rate, new-hire boost, risk weighting and forced actions come from QA settings." /></Card> : (
        <div className="grid gap-2">{list.map((r) => { const c = cm.get(r.claim_id || ''); const a = pm.get(r.analyst_id || ''); return (
          <div key={r.id} className="panel px-4 py-3 flex items-center gap-3 flex-wrap">
            <Avatar name={a?.full_name} /><b className="text-sm">{a?.full_name ?? '—'}</b><span className="text-sm text-brand-400 font-semibold">{c?.claim_no ?? '—'}</span><span className="text-xs muted">{c?.payer} · {money(c?.balance ?? 0)}</span>
            <Chip color={r.sample_source === 'critical' ? '#ef4444' : r.sample_source === 'risk' ? '#f59e0b' : r.sample_source === 'new_hire' ? '#8b5cf6' : '#64748b'}>{SRC_LABEL[r.sample_source] ?? r.sample_source}</Chip>{r.is_calibration && <Chip color="#0ea5e9">Calibration</Chip>}
            {r.risk != null && <span className="text-xs muted">risk {r.risk}</span>}
            <button className="btn btn-primary ml-auto" onClick={() => onOpen(r.id)}><Play size={13} />{r.status === 'in_review' && r.reviewer_id === me()?.id ? 'Resume' : 'Review'}</button>
          </div>); })}</div>)}
      <Modal open={gen} onClose={() => setGen(false)} title="Generate QA sample" footer={<><button className="btn" onClick={() => setGen(false)}>Cancel</button><button className="btn btn-primary" onClick={run}>Generate</button></>}>
        <p className="text-[13px] muted mb-3">Draws touches logged in the period that have not been sampled: <b>{cfg.sample_rate_pct}%</b> baseline (min {cfg.min_per_analyst_week}/analyst/week), new hires ({cfg.new_hire_days}d) at <b>{cfg.new_hire_rate_pct}%</b>, forced: {cfg.force_actions.join(', ') || 'none'} ≥ {money(cfg.force_min_balance)}, {cfg.calibration_pct}% calibration copies. Change in Settings.</p>
        <DateRangeFilter from={per.from} to={per.to} onChange={per.set} />
      </Modal>
    </div>
  );
}

/* ───────────────────────── Reviews log ───────────────────────── */
function Reviews({ onOpen }: { onOpen: (id: string) => void }) {
  const { qaReviews, profiles, claims } = useStore(); const per = usePeriod();
  const [user, setUser] = useState(''); const [res, setRes] = useState(''); const [st, setSt] = useState('');
  const cm = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]); const pm = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const list = qaReviews.filter((r) => r.reviewed_at && r.reviewed_at.slice(0, 10) >= per.from && r.reviewed_at.slice(0, 10) <= per.to && (!user || r.analyst_id === user) && (!res || r.result === res) && (!st || r.status === st)).sort((a, b) => b.reviewed_at!.localeCompare(a.reviewed_at!)).slice(0, 300);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center"><DateRangeFilter from={per.from} to={per.to} onChange={per.set} />
        <select className="input !w-auto" value={user} onChange={(e) => setUser(e.target.value)}><option value="">All analysts</option>{profiles.filter((p) => isProducer(p.role)).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
        <select className="input !w-auto" value={res} onChange={(e) => setRes(e.target.value)}><option value="">Any result</option><option value="pass">Pass</option><option value="fail">Fail</option><option value="critical">Critical</option></select>
        <select className="input !w-auto" value={st} onChange={(e) => setSt(e.target.value)}><option value="">Any status</option>{Object.entries(STATUS_LABEL).filter(([k]) => DONE.includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <Card pad={false}><table className="tbl grid"><thead><tr><th>Reviewed</th><th>Analyst</th><th>Claim</th><th>Score</th><th>Errors</th><th>Status</th><th>Reviewer</th><th /></tr></thead>
        <tbody>{list.map((r) => <tr key={r.id}><td>{fmtDate(r.reviewed_at)}</td><td>{pm.get(r.analyst_id || '')?.full_name}</td><td>{cm.get(r.claim_id || '')?.claim_no}</td><td><ScoreChip r={r} /></td><td>{r.errors.map((e) => e.category).join(', ') || '—'}</td><td><Chip color="#64748b">{STATUS_LABEL[r.status]}</Chip></td><td>{pm.get(r.reviewer_id || '')?.full_name}</td><td><button className="btn btn-ghost" onClick={() => onOpen(r.id)}>View</button></td></tr>)}
          {list.length === 0 && <tr><td colSpan={8}><Empty title="No reviews match" /></td></tr>}</tbody></table></Card>
    </div>
  );
}

/* ───────────────────────── Disputes & coaching ───────────────────────── */
function Disputes() {
  const { qaReviews, profiles, claims, qaConfig: cfg, resolveQaDispute, has } = useStore(); const pm = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]); const cm = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]);
  const [note, setNote] = useState<Record<string, string>>({});
  const open = qaReviews.filter((r) => r.status === 'disputed'); const coach = qaReviews.filter((r) => r.coaching && DONE.includes(r.status)).sort((a, b) => (b.reviewed_at || '').localeCompare(a.reviewed_at || '')).slice(0, 40);
  const resolve = async (r: QaReview, outcome: 'upheld' | 'overturned') => {
    const n = (note[r.id] || '').trim(); if (!n) return toast.err('Add a resolution note');
    let answers: QaReview['answers'] | undefined; if (outcome === 'overturned') { answers = { ...r.answers }; r.errors.forEach((e) => { answers![e.criterion] = 'pass'; }); }
    await resolveQaDispute(r.id, { outcome, answers, note: n }); toast.ok('Dispute ' + outcome);
  };
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card title={`Open disputes (${open.length})`}>
        {open.length === 0 ? <Empty title="No open disputes" sub={`Analysts have ${cfg.dispute_window_days} days to acknowledge or dispute a review.`} /> : <div className="space-y-3">{open.map((r) => <div key={r.id} className="rounded-xl border border-black/10 dark:border-white/10 p-3 text-[13px]">
          <div className="flex items-center gap-2 flex-wrap"><b>{pm.get(r.analyst_id || '')?.full_name}</b><span className="text-brand-400">{cm.get(r.claim_id || '')?.claim_no}</span><ScoreChip r={r} /></div>
          <div className="mt-1 muted">Errors: {r.errors.map((e) => `${e.category}${e.note ? ` (${e.note})` : ''}`).join('; ') || '—'}</div><div className="mt-1 italic">“{r.dispute_note}”</div>
          {has('manage_qa') ? <><textarea className="input mt-2" rows={2} placeholder="Resolution note (required)" value={note[r.id] || ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} /><div className="flex gap-2 mt-2"><button className="btn" onClick={() => resolve(r, 'upheld')}>Uphold review</button><button className="btn btn-primary" onClick={() => resolve(r, 'overturned')}>Overturn (clear errors)</button></div></> : <div className="text-xs muted mt-2">Only QA leads can resolve disputes.</div>}
        </div>)}</div>}
      </Card>
      <Card title="Coaching feed">{coach.length === 0 ? <Empty title="No coaching notes yet" /> : <div className="space-y-2.5">{coach.map((r) => <div key={r.id} className="text-[13px] border-b border-black/5 dark:border-white/10 pb-2"><div className="flex gap-2 items-center"><Avatar name={pm.get(r.analyst_id || '')?.full_name} size={20} /><b>{pm.get(r.analyst_id || '')?.full_name}</b><span className="muted text-xs">{fmtDate(r.reviewed_at)}</span><ScoreChip r={r} /></div><div className="mt-1">{r.coaching}</div></div>)}</div>}</Card>
    </div>
  );
}

/* ───────────────────────── Calibration ───────────────────────── */
function Calibration() {
  const { qaReviews, profiles } = useStore(); const pm = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const groups = useMemo(() => { const m = new Map<string, QaReview[]>(); qaReviews.filter((r) => r.is_calibration && r.calibration_group).forEach((r) => m.set(r.calibration_group!, [...(m.get(r.calibration_group!) || []), r])); return [...m.values()].filter((g) => g.length >= 2 && g.every((r) => r.score != null)); }, [qaReviews]);
  const rows = groups.map((g) => { const [a, b] = g; const keys = Object.keys(a.answers); const agree = keys.filter((k) => a.answers[k] === b.answers[k]).length; return { a, b, agree: keys.length ? agree / keys.length : 1, gap: Math.abs((a.score ?? 0) - (b.score ?? 0)) }; });
  const avg = rows.length ? rows.reduce((x, r) => x + r.agree, 0) / rows.length : null;
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3"><Stat label="Calibrated pairs" value={rows.length} /><Stat label="Reviewer agreement" value={avg == null ? '—' : Math.round(avg * 100) + '%'} color={avg != null && avg >= 0.85 ? '#22c55e' : '#f59e0b'} sub="Target ≥ 85%" /><Stat label="Avg score gap" value={rows.length ? (rows.reduce((x, r) => x + r.gap, 0) / rows.length).toFixed(1) : '—'} /></div>
      <Card title="How calibration works"><p className="text-[13px] muted">A small % of the sample is queued twice. Two different reviewers score the same touch blind; disagreement shows where the scorecard is ambiguous or a reviewer is drifting. Discuss any pair with agreement below 85%.</p></Card>
      <Card pad={false}><table className="tbl grid"><thead><tr><th>Analyst</th><th>Reviewer A</th><th>Score A</th><th>Reviewer B</th><th>Score B</th><th>Agreement</th></tr></thead><tbody>{rows.map((r) => <tr key={r.a.id}><td>{pm.get(r.a.analyst_id || '')?.full_name}</td><td>{pm.get(r.a.reviewer_id || '')?.full_name}</td><td>{Math.round(r.a.score ?? 0)}%</td><td>{pm.get(r.b.reviewer_id || '')?.full_name}</td><td>{Math.round(r.b.score ?? 0)}%</td><td><Chip color={r.agree >= 0.85 ? '#22c55e' : '#f59e0b'}>{Math.round(r.agree * 100)}%</Chip></td></tr>)}{rows.length === 0 && <tr><td colSpan={6}><Empty title="No completed calibration pairs" /></td></tr>}</tbody></table></Card>
    </div>
  );
}

/* ───────────────────────── Analyst view ───────────────────────── */
function Mine({ profilesCount: _p }: { profilesCount: number }) {
  const { qaReviews, me, claims, qaConfig: cfg, respondQaReview } = useStore(); const meId = me()?.id; const cm = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]);
  const mine = qaReviews.filter((r) => r.analyst_id === meId && DONE.includes(r.status)).sort((a, b) => (b.reviewed_at || '').localeCompare(a.reviewed_at || ''));
  const k = qaKpis(mine, 0, cfg); const [dispute, setDispute] = useState<string | null>(null); const [text, setText] = useState('');
  const days = (r: QaReview) => Math.max(0, cfg.dispute_window_days - Math.floor((Date.now() - new Date(r.reviewed_at || r.updated_at).getTime()) / 864e5));
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-4 gap-3"><Stat label="My QA score" value={k.avg == null ? '—' : k.avg.toFixed(1) + '%'} color={k.avg != null && k.avg >= cfg.kpi.qa_score ? '#22c55e' : '#f59e0b'} sub={`Target ${cfg.kpi.qa_score}%`} /><Stat label="Reviews" value={k.completed} /><Stat label="Pass rate" value={k.passRate == null ? '—' : Math.round(k.passRate * 100) + '%'} /><Stat label="Needs my response" value={mine.filter((r) => r.status === 'completed').length} color="#f59e0b" /></div>
      {mine.length === 0 ? <Card><Empty title="No reviews yet" sub="When QA samples your work you will see the scorecard, errors and coaching here." /></Card> : mine.map((r) => (
        <div key={r.id} className="panel p-4 text-[13px]"><div className="flex items-center gap-2 flex-wrap"><b className="text-brand-400">{cm.get(r.claim_id || '')?.claim_no}</b><span className="muted">{fmtDate(r.reviewed_at)}</span><ScoreChip r={r} /><Chip color="#64748b">{STATUS_LABEL[r.status]}</Chip></div>
          {r.errors.length > 0 && <ul className="mt-2 list-disc pl-5">{r.errors.map((e, i) => <li key={i}><b>{cfg.error_cats.find((c) => c.id === e.category)?.label ?? e.category}</b>{e.note ? ` — ${e.note}` : ''}</li>)}</ul>}
          {r.comments && <p className="mt-2 muted">{r.comments}</p>}{r.coaching && <p className="mt-2 rounded-lg p-2.5 tint-blue"><b>Coaching:</b> {r.coaching}</p>}
          {r.status === 'completed' && (dispute === r.id ? <div className="mt-3 flex gap-2"><input className="input" placeholder="Why do you disagree?" value={text} onChange={(e) => setText(e.target.value)} /><button className="btn btn-primary" onClick={async () => { if (!text.trim()) return toast.err('Explain your dispute'); await respondQaReview(r.id, 'dispute', text); setDispute(null); setText(''); }}>Submit dispute</button><button className="btn" onClick={() => setDispute(null)}>Cancel</button></div>
            : <div className="mt-3 flex gap-2 items-center"><button className="btn btn-primary" onClick={() => respondQaReview(r.id, 'ack')}><Check size={13} />Acknowledge</button>{days(r) > 0 ? <button className="btn" onClick={() => setDispute(r.id)}>Dispute</button> : <span className="muted text-xs">Dispute window closed</span>}{days(r) > 0 && <span className="muted text-xs">{days(r)}d left to dispute</span>}</div>)}
        </div>))}
    </div>
  );
}

/* ───────────────────────── Review modal (scorecard) ───────────────────────── */
function ReviewModal({ id, onClose }: { id: string; onClose: () => void }) {
  const st = useStore(); const { qaReviews, qaConfig: cfg, claims, workLog, profiles, startQaReview, submitQaReview, openClaim, me } = st;
  const r = qaReviews.find((x) => x.id === id); const w = workLog.find((x) => x.id === r?.work_log_id); const c = claims.find((x) => x.id === r?.claim_id);
  const form: QaForm | undefined = cfg.forms.find((f) => f.id === r?.form_id) || cfg.forms[0];
  const editable = !!r && (r.status === 'queued' || r.status === 'in_review');
  const [answers, setAnswers] = useState<Record<string, Answer | undefined>>({}); const [errs, setErrs] = useState<Record<string, { category: string; note: string }>>({}); const [comments, setComments] = useState(''); const [coaching, setCoaching] = useState(''); const [focus, setFocus] = useState(0);
  const t0 = useRef(Date.now()); const started = useRef(false);
  const auto = useMemo(() => (w ? autoChecks(w, c, st.carcMap(), new Set(st.config.filter((o) => o.category === 'end_action' && o.meta.terminal).map((o) => o.value))) : { risk: 0, findings: [] }), [w, c]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!r || started.current) return; started.current = true; if (r.status === 'queued') startQaReview(r.id).then((x) => { if (!x.ok) { toast.err(x.message || 'Cannot start'); onClose(); } }); setAnswers(r.answers || {}); setErrs(Object.fromEntries((r.errors || []).map((e) => [e.criterion, { category: e.category, note: e.note }]))); setComments(r.comments || ''); setCoaching(r.coaching || ''); }, [r, startQaReview, onClose]);
  const set = (cid: string, a: Answer) => { setAnswers((p) => ({ ...p, [cid]: a })); if (a === 'fail' && !errs[cid]) { const hint = auto.findings.find((f) => f.criterion === cid); setErrs((p) => ({ ...p, [cid]: { category: hint?.category || cfg.error_cats[0]?.id || 'other', note: '' } })); } if (a !== 'fail') setErrs((p) => { const n = { ...p }; delete n[cid]; return n; }); };
  useEffect(() => {
    if (!editable || !form) return;
    const h = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return; const cr = form.criteria[focus]; if (!cr) return;
      if (e.key === 'p' || e.key === '1') { set(cr.id, 'pass'); setFocus((f) => Math.min(form.criteria.length - 1, f + 1)); } else if (e.key === 'f' || e.key === '2') set(cr.id, 'fail'); else if (e.key === 'n' || e.key === '3') { set(cr.id, 'na'); setFocus((f) => Math.min(form.criteria.length - 1, f + 1)); } else if (e.key === 'ArrowDown') setFocus((f) => Math.min(form.criteria.length - 1, f + 1)); else if (e.key === 'ArrowUp') setFocus((f) => Math.max(0, f - 1)); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r || !form) return null;
  const liveErrs: QaError[] = form.criteria.filter((x) => answers[x.id] === 'fail' && errs[x.id]?.category).map((x) => ({ criterion: x.id, category: errs[x.id].category, severity: cfg.error_cats.find((k) => k.id === errs[x.id].category)?.severity ?? 'minor', note: '' }));
  const sc = scoreReview(form, answers, { errors: liveErrs, cfg }); const ok = complete(form, answers); const pm = new Map(profiles.map((p) => [p.id, p]));
  const submit = async () => {
    if (!ok) return toast.err('Answer every criterion'); const missing = Object.keys(errs).find((k) => answers[k] === 'fail' && !errs[k].note.trim()); if (missing) return toast.err('Add a short note on each failed criterion');
    const errors: QaError[] = form.criteria.filter((x) => answers[x.id] === 'fail').map((x) => { const e = errs[x.id]; const cat = cfg.error_cats.find((k) => k.id === e.category); return { criterion: x.id, category: e.category, severity: x.critical ? 'critical' : cat?.severity ?? 'minor', note: e.note.trim() }; });
    const out = await submitQaReview(r.id, { answers: answers as QaReview['answers'], errors, comments, coaching, seconds: Math.round((Date.now() - t0.current) / 1000) }); if (out) { toast.ok(`Scored ${Math.round(out.score ?? 0)}% — ${out.result}`); onClose(); }
  };
  return (
    <Modal open onClose={onClose} wide title={<span>QA review · {c?.claim_no} <span className="muted text-sm">by {pm.get(r.analyst_id || '')?.full_name}</span></span>}
      footer={editable ? <><span className="mr-auto text-xs muted flex items-center gap-1"><Clock size={12} />Keys: P pass · F fail · N n/a · ↑↓ move</span><button className="btn" onClick={onClose}>Save for later</button><button className="btn btn-primary" disabled={!ok} onClick={submit}><Save size={14} />Submit review</button></> : <button className="btn" onClick={onClose}>Close</button>}>
      <div className="grid lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 space-y-3 text-[13px]">
          <div className="panel p-3"><div className="label">Claim</div><button className="font-bold text-brand-400 hover:underline" onClick={() => openClaim(r.claim_id || '')}>{c?.claim_no}</button> · {c?.payer}<br />Balance {money(w?.balance ?? c?.balance ?? 0)} · DOS {fmtDate(c?.dos)}</div>
          <div className="panel p-3"><div className="label">What the analyst logged ({fmtDate(w?.work_date)}, {w?.mode})</div><b>{w?.rca}</b> › {w?.rca_detail}<br /><b>{w?.end_action}</b>{w?.end_sub && ` › ${w.end_sub}`}<div className="italic muted mt-1">“{w?.comment}”</div></div>
          <div className="panel p-3"><div className="label flex items-center gap-1"><ShieldAlert size={12} />Auto-checks (risk {auto.risk})</div>{auto.findings.length === 0 ? <span className="muted">No automatic flags.</span> : <ul className="list-disc pl-5 text-amber-500">{auto.findings.map((f) => <li key={f.reason}>{f.reason}</li>)}</ul>}</div>
          <div className="live-score panel p-3"><div className="label">Live score</div><div className="stat-v text-[34px]" style={{ color: Object.keys(answers).length ? RES_COLOR[sc.result] : undefined }}>{Object.keys(answers).length ? Math.round(sc.score) + '%' : '—'}</div><div className="text-xs muted">{sc.result === 'critical' ? 'Critical error — automatic fail' : sc.result === 'pass' ? `Pass (≥ ${form.pass_threshold}%)` : `Below ${form.pass_threshold}% threshold`}</div></div>
        </div>
        <div className="lg:col-span-3 space-y-2">
          {form.criteria.map((cr, i) => { const a = answers[cr.id]; return (
            <div key={cr.id} onClick={() => setFocus(i)} className={`rounded-xl border p-3 ${focus === i && editable ? 'border-brand-400' : 'border-black/10 dark:border-white/10'}`}>
              <div className="flex items-center gap-2"><b className="text-[13px]">{cr.label}</b>{cr.critical && <Chip color="#ef4444">critical</Chip>}<span className="text-[11px] muted">{cr.weight} pts</span>
                <div className="ml-auto flex gap-1">{([['pass', <Check size={13} />, '#22c55e'], ['fail', <X size={13} />, '#ef4444'], ['na', <MinusCircle size={13} />, '#64748b']] as const).map(([k, ic, col]) => <button key={k} disabled={!editable} onClick={(e) => { e.stopPropagation(); set(cr.id, k); }} className="btn !px-2.5 !py-1" style={a === k ? { background: col, color: '#fff', borderColor: col } : undefined}>{ic}{k === 'na' ? 'N/A' : k[0].toUpperCase() + k.slice(1)}</button>)}</div></div>
              {cr.help && <div className="text-[11.5px] muted mt-0.5">{cr.help}</div>}
              {a === 'fail' && errs[cr.id] && <div className="mt-2 grid sm:grid-cols-3 gap-2"><select disabled={!editable} className="input" value={errs[cr.id].category} onChange={(e) => setErrs({ ...errs, [cr.id]: { ...errs[cr.id], category: e.target.value } })}>{cfg.error_cats.map((k) => <option key={k.id} value={k.id}>{k.label} ({k.severity})</option>)}</select><input disabled={!editable} className="input sm:col-span-2" placeholder="What went wrong? (required)" value={errs[cr.id].note} onChange={(e) => setErrs({ ...errs, [cr.id]: { ...errs[cr.id], note: e.target.value } })} /></div>}
            </div>); })}
          <Field label="Review comments"><textarea disabled={!editable} className="input" rows={2} value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
          <Field label="Coaching for the analyst" hint="Shown to the analyst with the score"><textarea disabled={!editable} className="input" rows={2} value={coaching} onChange={(e) => setCoaching(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Settings (manage_qa) ───────────────────────── */
function Num({ label, value, onChange, hint, step = 1 }: { label: string; value: number; onChange: (n: number) => void; hint?: string; step?: number }) {
  return <Field label={label} hint={hint}><input className="input" type="number" step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} /></Field>;
}
function Settings() {
  const { qaConfig, saveQaConfig, config } = useStore(); const [d, setD] = useState<QaConfig>(() => structuredClone(qaConfig)); const [sec, setSec] = useState<'sampling' | 'kpi' | 'forms' | 'scoring' | 'errors' | 'perf'>('sampling');
  const actions = config.filter((o) => o.category === 'end_action').map((o) => o.value);
  const up = (p: Partial<QaConfig>) => setD((x) => ({ ...x, ...p }));
  const wsum = d.perf_weights.volume + d.perf_weights.quality + d.perf_weights.rework;
  const save = async () => {
    const e = d.forms.flatMap((f) => validateForm(f).map((m) => `${f.name}: ${m}`)); if (wsum !== 100) e.push(`Performance weights must total 100 (now ${wsum})`);
    if (d.sample_rate_pct < 0 || d.sample_rate_pct > 100) e.push('Sample rate must be 0–100'); if (d.error_cats.some((c) => !c.label.trim())) e.push('Every error category needs a label'); if (new Set(d.error_cats.map((c) => c.id)).size !== d.error_cats.length) e.push('Duplicate error category ids');
    if (e.length) return toast.err(e[0]); const forms = d.forms.map((f) => { const old = qaConfig.forms.find((o) => o.id === f.id); return old && JSON.stringify(old.criteria) !== JSON.stringify(f.criteria) ? { ...f, version: old.version + 1 } : f; }); const next = { ...d, forms }; await saveQaConfig(next); setD(next); toast.ok('QA settings saved');
  };
  const form = d.forms[0]; const setForm = (f: QaForm) => up({ forms: [f, ...d.forms.slice(1)] }); const wt = form.criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap"><Tabs value={sec} onChange={setSec} tabs={[{ id: 'sampling', label: 'Sampling' }, { id: 'kpi', label: 'KPI targets' }, { id: 'forms', label: 'Scorecard' }, { id: 'scoring', label: 'Scoring model' }, { id: 'errors', label: 'Error types & weights' }, { id: 'perf', label: 'Performance mix' }]} /><button className="btn btn-primary ml-auto" onClick={save}><Save size={14} />Save settings</button></div>
      {sec === 'sampling' && <Card title="QA team model"><div className="grid sm:grid-cols-3 gap-4"><Field label="Who performs QA" hint="Switch when an outsourced QA department starts"><select className="input" value={d.reviewer_source || 'internal'} onChange={(e) => up({ reviewer_source: e.target.value as QaConfig['reviewer_source'] })}><option value="internal">Internal team</option><option value="external">External QA department</option><option value="both">Both</option></select></Field><Field label="External QA partner (name)"><input className="input" value={d.external_partner || ''} onChange={(e) => up({ external_partner: e.target.value })} placeholder="e.g. Acme QA Services" /></Field><div className="text-[12px] muted sm:pt-6">Create their logins in Admin → Staff & roles with the role <b>QA Analyst (External)</b>: they can review and score, nothing else. All QA tables, scorecards and reports stay the same.</div></div></Card>}
      {sec === 'sampling' && <Card title="Sampling rules"><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Num label="Baseline sample rate %" value={d.sample_rate_pct} onChange={(n) => up({ sample_rate_pct: n })} hint="Share of each analyst's touches" /><Num label="Minimum reviews / analyst / week" value={d.min_per_analyst_week} onChange={(n) => up({ min_per_analyst_week: n })} />
        <Num label="New-hire window (days)" value={d.new_hire_days} onChange={(n) => up({ new_hire_days: n })} hint="From profile hire date" /><Num label="New-hire sample rate %" value={d.new_hire_rate_pct} onChange={(n) => up({ new_hire_rate_pct: n })} />
        <Num label="Force-review balance ≥ $" value={d.force_min_balance} onChange={(n) => up({ force_min_balance: n })} /><Num label="Calibration copies %" value={d.calibration_pct} onChange={(n) => up({ calibration_pct: n })} hint="Double-reviewed by two QAs" /><Num label="Dispute window (days)" value={d.dispute_window_days} onChange={(n) => up({ dispute_window_days: n })} />
        <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={d.risk_weighted} onChange={(e) => up({ risk_weighted: e.target.checked })} />Risk-weighted (riskiest touches first)</label>
        <div className="sm:col-span-2 lg:col-span-4"><div className="label mb-1">Always review these end actions (when balance ≥ threshold)</div><div className="flex flex-wrap gap-1.5">{actions.map((a) => <button key={a} className="chip" style={d.force_actions.includes(a) ? { background: 'rgb(var(--b500))', color: '#fff' } : undefined} onClick={() => up({ force_actions: d.force_actions.includes(a) ? d.force_actions.filter((x) => x !== a) : [...d.force_actions, a] })}>{a}</button>)}</div></div></div></Card>}
      {sec === 'kpi' && <Card title="Team KPI targets"><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Num label="Target QA score %" value={d.kpi.qa_score} onChange={(n) => up({ kpi: { ...d.kpi, qa_score: n } })} /><Num label="Max errors per 10 reviews" value={d.kpi.max_error_rate_pct} onChange={(n) => up({ kpi: { ...d.kpi, max_error_rate_pct: n } })} /><Num label="Review turnaround (days)" value={d.kpi.review_tat_days} onChange={(n) => up({ kpi: { ...d.kpi, review_tat_days: n } })} /><Num label="Max dispute rate %" value={d.kpi.max_dispute_pct} onChange={(n) => up({ kpi: { ...d.kpi, max_dispute_pct: n } })} />
        <Num label="Min review coverage %" value={d.kpi.min_coverage_pct} onChange={(n) => up({ kpi: { ...d.kpi, min_coverage_pct: n } })} /><Num label="Default touches / analyst / day" value={d.kpi.touches_per_day} onChange={(n) => up({ kpi: { ...d.kpi, touches_per_day: n } })} hint="Profile daily target overrides" /><Num label="Max rework %" value={d.kpi.max_rework_pct} onChange={(n) => up({ kpi: { ...d.kpi, max_rework_pct: n } })} /></div></Card>}
      {sec === 'forms' && <Card title={`Scorecard · v${form.version}`} actions={<span className={wt === 100 ? 'text-emerald-500 text-sm' : 'text-red-500 text-sm'}>Weights {wt}/100</span>}>
        <div className="grid sm:grid-cols-3 gap-3 mb-3"><Field label="Form name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Num label="Pass threshold %" value={form.pass_threshold} onChange={(n) => setForm({ ...form, pass_threshold: n })} /></div>
        <div className="space-y-2">{form.criteria.map((c, i) => <div key={c.id} className="grid grid-cols-12 gap-2 items-center"><input className="input col-span-4" value={c.label} placeholder="Criterion" onChange={(e) => setForm({ ...form, criteria: form.criteria.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /><input className="input col-span-4" value={c.help || ''} placeholder="Reviewer guidance" onChange={(e) => setForm({ ...form, criteria: form.criteria.map((x, j) => (j === i ? { ...x, help: e.target.value } : x)) })} /><input className="input col-span-1" type="number" value={c.weight} onChange={(e) => setForm({ ...form, criteria: form.criteria.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)) })} /><label className="col-span-2 text-xs flex items-center gap-1"><input type="checkbox" checked={!!c.critical} onChange={(e) => setForm({ ...form, criteria: form.criteria.map((x, j) => (j === i ? { ...x, critical: e.target.checked } : x)) })} />Critical</label><button className="btn btn-ghost col-span-1" title="Remove" onClick={() => setForm({ ...form, criteria: form.criteria.filter((_, j) => j !== i) })}><Trash2 size={14} /></button></div>)}</div>
        <button className="btn mt-3" onClick={() => setForm({ ...form, criteria: [...form.criteria, { id: 'c_' + uid().slice(0, 6), label: 'New criterion', weight: 0 }] })}><Plus size={14} />Add criterion</button>
        <p className="text-[12px] muted mt-3">Saving bumps the form version when criteria change; past reviews keep the version they were scored on. A failed critical criterion forces a fail.</p></Card>}
      {sec === 'scoring' && <Card title="How the quality score is calculated"><div className="grid sm:grid-cols-3 gap-4">
        <Field label="Scoring model" hint="Criteria = weighted scorecard · Deduction = 100 minus weighted errors · Hybrid = the lower of both"><select className="input" value={d.scoring?.model || 'criteria'} onChange={(e) => up({ scoring: { ...d.scoring!, model: e.target.value as QaScoring['model'] } })}><option value="criteria">Scorecard criteria (weighted)</option><option value="deduction">Error deduction from 100</option><option value="hybrid">Hybrid (lower of the two)</option></select></Field>
        <Num label="Minimum score (floor) %" value={d.scoring?.floor ?? 0} onChange={(n) => up({ scoring: { ...d.scoring!, floor: n } })} hint="Deduction scores never go below this" /></div>
        <div className="label mt-4">Points deducted per error by severity</div><div className="grid sm:grid-cols-3 gap-4">{(['critical', 'major', 'minor'] as const).map((k) => <Num key={k} label={k[0].toUpperCase() + k.slice(1)} value={d.scoring?.severityPoints[k] ?? 0} onChange={(n) => up({ scoring: { ...d.scoring!, severityPoints: { ...d.scoring!.severityPoints, [k]: n } } })} />)}</div>
        <p className="text-[12px] muted mt-3">An error’s cost = severity points × the category weight set under “Error types & weights”. Categories marked auto-fail force a critical result whatever the score.</p></Card>}
      {sec === 'errors' && <Card title="Error types & weights" actions={<span className="text-xs muted">Cost = severity points × weight</span>}><div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-[11px] muted px-1"><span className="col-span-4">Category</span><span className="col-span-2">Severity</span><span className="col-span-2">Type</span><span className="col-span-1">Weight ×</span><span className="col-span-2">Auto-fail</span></div>
        {d.error_cats.map((c, i) => { const set = (p: Partial<QaErrorCat>) => up({ error_cats: d.error_cats.map((x, j) => (j === i ? { ...x, ...p } : x)) }); return <div key={c.id} className="grid grid-cols-12 gap-2 items-center"><input className="input col-span-4" value={c.label} onChange={(e) => set({ label: e.target.value })} />
          <select className="input col-span-2" value={c.severity} onChange={(e) => set({ severity: e.target.value as QaErrorCat['severity'] })}><option value="critical">Critical</option><option value="major">Major</option><option value="minor">Minor</option></select>
          <select className="input col-span-2" value={c.type || ''} onChange={(e) => set({ type: (e.target.value || undefined) as QaErrorCat['type'] })}><option value="">—</option>{Object.entries(ERROR_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input type="number" step="0.5" min="0" className="input col-span-1" value={c.weight ?? 1} onChange={(e) => set({ weight: +e.target.value })} />
          <label className="col-span-2 flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!c.autofail} onChange={(e) => set({ autofail: e.target.checked })} />fails review</label>
          <button className="btn btn-ghost btn-sm col-span-1" aria-label="Remove" onClick={() => up({ error_cats: d.error_cats.filter((_, j) => j !== i) })}><Trash2 size={13} /></button></div>; })}</div>
        <button className="btn mt-3" onClick={() => up({ error_cats: [...d.error_cats, { id: 'cat_' + uid().slice(0, 6), label: 'New category', severity: 'minor', type: 'process', weight: 1 }] })}><Plus size={14} />Add category</button></Card>}
      {sec === 'perf' && <Card title="Composite performance score" actions={<span className={wsum === 100 ? 'text-emerald-500 text-sm' : 'text-red-500 text-sm'}>Total {wsum}/100</span>}><div className="grid sm:grid-cols-3 gap-4"><Num label="Volume (target attainment) %" value={d.perf_weights.volume} onChange={(n) => up({ perf_weights: { ...d.perf_weights, volume: n } })} /><Num label="Quality (QA score) %" value={d.perf_weights.quality} onChange={(n) => up({ perf_weights: { ...d.perf_weights, quality: n } })} /><Num label="Rework (fewer repeat touches) %" value={d.perf_weights.rework} onChange={(n) => up({ perf_weights: { ...d.perf_weights, rework: n } })} /></div><p className="text-[12px] muted mt-3">Used by QA Overview and Productivity. Analysts with no reviews yet are scored on the remaining components.</p></Card>}
    </div>
  );
}
