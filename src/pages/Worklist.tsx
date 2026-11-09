import { downloadXlsx } from '../lib/xlsx';
import { DateField } from '../components/CalendarPicker';
import { NBA_COLOR, NBA_LABEL } from '../lib/engine/intelligence';
import WorkMode from './WorkMode';
import { LargeBanner } from '../components/WorkspaceSummary';
import { BAND_COLOR } from '../lib/engine/priority';
import { BulkModal } from '../components/BulkModal';
import { useDraftAppeals } from '../components/appeal/CreateAppeal';
import { SRC_LABEL, type ExpectedSrc } from '../lib/engine/reimb';
import { isProducer } from '../lib/roles';
import { usDate } from '../lib/utils';
import { FAMILIES } from '../lib/engine/families';
import { LIFECYCLE_DEFAULTS } from '../lib/engine/lifecycle';
import { VISIT_TYPES } from '../lib/engine/visit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { sopsFor, type ClientSop } from '../lib/engine/sops';
import { useInsightIndex } from '../lib/useInsights';
import { INSIGHT_LABEL, TONE_COLOR, type InsightId } from '../lib/engine/insights';
import { useSearchParams } from 'react-router-dom';
import { Layers3, ArrowDown, ArrowUp, Bookmark, Download, Kanban, Rows3, Search, UserPlus, X, Zap, Snowflake, Repeat, Skull, Flag, Link2, Phone, BookOpenCheck } from 'lucide-react';
import { useStore } from '../store';
import { useBuckets, useClaims, useCollect, useIntel, useOpts, usePhi, usePriority, useIntelligence, type EClaim } from '../hooks';
import { Avatar, Chip, Empty, PageHeader, toast } from '../components/ui';
import { cn, addBusinessDays, todayISO, downloadFile, fmtDate, money, num, sum, toCSV } from '../lib/utils';

type Sort = { key: string; dir: 1 | -1 };
const VIEWS = [['all', 'All open'], ['mine', 'My work'], ['unassigned', 'Unassigned'], ['fu', 'Follow-up due'], ['stale', 'Stale'], ['tf', 'TF risk'], ['untouched', 'Never worked'], ['closed', 'Closed out']] as const;
const PAGE = 100;

const SORTERS: Record<string, (x: EClaim) => string | number> = {
  claim: (x) => x.c.claim_no, patient: (x) => x.c.patient_name || '', payer: (x) => x.c.payer || '', dos: (x) => x.c.dos || '', age: (x) => x.age ?? -1, balance: (x) => x.c.balance, reimb: (x) => x.c.expected_amt ?? -1,
  status: (x) => x.c.status, owner: (x) => x.owner?.full_name || '', fu: (x) => x.c.next_fu || '9999', score: (x) => x.score, tf: (x) => x.tfLeft ?? 99999,
};

export default function Worklist() {
  const [sp, setSp] = useSearchParams();
  const me = useStore((s) => s.me());
  const { clients, profiles, can, has, assign, patchClaims, clientFilter, workLog } = useStore();
  const claims = useClaims(true);
  const buckets = useBuckets(); const intel = useIntel(); const phi = usePhi();
  const statuses = useOpts('status'); const priorities = useOpts('priority');
  const [sort, setSort] = useState<Sort>({ key: 'score', dir: -1 });
  const [page, setPage] = useState(0); const [pageSize, setPageSize] = useState(100); const PAGE = pageSize; const scrollRef = useRef<HTMLDivElement>(null);
  const [bulk, setBulk] = useState(false); const draftAp = useDraftAppeals(); const pri = usePriority(claims); const { nba, ctx: ictx } = useIntelligence(claims); const customLabels = (ictx.custom || []).filter((r) => r.enabled).map((r) => r.label);
  const insights = useInsightIndex(claims);
  const [sel, setSel] = useState<Set<string>>(new Set()); const [cur, setCur] = useState(0); const sops = (useStore((s) => s.settings.client_sops?.sops) || []) as ClientSop[]; const today = todayISO();
  const groupBy = sp.get('group') || '';
  const openClaim = useStore((s) => s.openClaim);
  const [saved, setSaved] = useState<{ name: string; qs: string }[]>(() => { try { return JSON.parse(localStorage.getItem('arms:views') || '[]'); } catch { return []; } });
  const g = (k: string) => sp.get(k) || '';
  const setP = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); setPage(0); };
  const view = g('view') || 'all'; const q = g('q').toLowerCase();
  const canManage = has('assign');
  const canWork = has('work_claims');
  const clientId = g('client') || clientFilter;

  const payers = useMemo(() => [...new Set(claims.map((x) => x.c.payer || 'Unknown'))].sort(), [claims]);
  const rcas = useOpts('rca'); const issueBuckets = [...new Set(useOpts('issue_bucket').map((o) => o.value))];

  const allCol = useCollect(claims.filter((x) => x.open), intel);
  const laneTest: Record<string, (x: EClaim) => boolean> = {
    quick: (x) => (allCol.get(x.c.id)?.p ?? 0) >= 0.55 && x.c.touch_count <= 1 && x.c.balance >= 300,
    lost: (x) => (allCol.get(x.c.id)?.p ?? 1) < 0.12 && (x.age ?? 0) > 270,
    loops: (x) => (x.c.flags || []).includes('chk:loop_same_action') || x.c.touch_count >= 4,
    cold: (x) => x.stale && x.c.balance >= 1500,
    flagged: (x) => (x.c.flags || []).some((f) => f.startsWith('chk:') || ['balance_up', 'credit_balance', 'possible_duplicate', 'dos_conflict'].includes(f)),
  };
  const LANES = [['quick', 'Quick wins', <Zap size={12} />, '#22c55e'], ['cold', 'Gone cold', <Snowflake size={12} />, '#06b6d4'], ['loops', 'Stuck loops', <Repeat size={12} />, '#f59e0b'], ['lost', 'Write-off candidates', <Skull size={12} />, '#ef4444'], ['flagged', 'Flagged', <Flag size={12} />, '#a855f7']] as const;
  const laneCounts = useMemo(() => Object.fromEntries(LANES.map(([id]) => [id, claims.filter((x) => x.open && (!clientId || x.c.client_id === clientId) && laneTest[id](x)).length])), [claims, allCol, clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [mode, setMode] = useState<'list' | 'board' | 'focus'>(sp.get('mode') === 'focus' ? 'focus' : 'list');
  const rows = useMemo(() => {
    const f = claims.filter((x) => {
      if (clientId && x.c.client_id !== clientId) return false;
      if (view === 'closed' ? !(x.c.closed_at || x.terminal) : !x.open) return false;
      if (view === 'mine' && x.c.assigned_to !== me?.id) return false;
      if (view === 'unassigned' && x.c.assigned_to) return false;
      if (view === 'fu' && !x.fuDue) return false;
      if (view === 'stale' && !x.stale) return false;
      if (view === 'tf' && !(x.tfLeft != null && x.tfLeft <= 30)) return false;
      if (view === 'untouched' && x.c.touch_count > 0) return false;
      if (g('bucket') && x.bucket?.label !== g('bucket')) return false;
      if (g('stage') && x.stage !== g('stage')) return false;
      if (g('family') && x.family !== g('family')) return false;
      if (g('lifecycle') && x.lifecycle !== g('lifecycle')) return false;
      if (g('visit') && x.visit !== g('visit')) return false;
      if (g('tag') && !(x.tags || []).includes(g('tag'))) return false;
      if (g('snoozed') ? !x.snoozed : x.snoozed) return false;
      if (g('patientAR') && !x.patientAR) return false;
      if (g('minAge') && (x.age ?? 0) <= Number(g('minAge'))) return false;
      if (g('maxAge') && (x.age ?? 0) >= Number(g('maxAge'))) return false;
      if (g('minBal') && x.c.balance < Number(g('minBal'))) return false;
      if (g('lane') && laneTest[g('lane')] && !laneTest[g('lane')](x)) return false;
      if (g('flag') && !(x.c.flags || []).includes(g('flag'))) return false;
      if (g('status') && x.c.status !== g('status')) return false;
      if (g('payer') && (x.c.payer || 'Unknown') !== g('payer')) return false;
      if (g('rca') && x.c.rca !== g('rca')) return false;
      if (g('priority') && x.c.priority !== g('priority')) return false;
      if (g('nba') && nba.get(x.c.id)?.label !== g('nba')) return false;
      if (g('ins') && !(insights.get(x.c.id) || []).some((n) => n.id === g('ins'))) return false;
      if (g('ibucket') && (x.c.custom?.issue_bucket || '') !== (g('ibucket') === 'none' ? '' : g('ibucket'))) return false;
      if (g('owner') === 'none' ? !!x.c.assigned_to : g('owner') && x.c.assigned_to !== g('owner')) return false;
      if (q && !(`${x.c.claim_no} ${x.c.claim_uid || ""} ${x.c.encounter_no || ""} ${x.c.patient_name} ${x.c.account_id} ${x.c.payer} ${x.c.cpt} ${x.c.denial_codes || ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
    const fn = sort.key === 'score' ? (x: EClaim) => pri.get(x.c.id)?.score ?? x.score : SORTERS[sort.key] || SORTERS.score;
    return f.sort((a, b) => { const x = fn(a), y = fn(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [claims, clientId, view, sp, sort, me, pri, nba, insights]); // eslint-disable-line react-hooks/exhaustive-deps

  const GROUPS: Record<string, (x: EClaim) => string> = { payer: (x) => x.c.payer || 'Unknown', status: (x) => x.c.status, owner: (x) => x.owner?.full_name || 'Unassigned', bucket: (x) => x.bucket?.label || 'Unaged', client: (x) => x.client?.name || '' };
  const grouped = useMemo(() => (groupBy && GROUPS[groupBy] ? [...rows].sort((a, b) => GROUPS[groupBy](a).localeCompare(GROUPS[groupBy](b))) : rows), [rows, groupBy]); // eslint-disable-line react-hooks/exhaustive-deps
  const gStats = useMemo(() => { const m = new Map<string, { n: number; bal: number }>(); if (groupBy && GROUPS[groupBy]) for (const x of rows) { const k = GROUPS[groupBy](x); const e = m.get(k) || { n: 0, bal: 0 }; e.n++; e.bal += x.c.balance; m.set(k, e); } return m; }, [rows, groupBy]); // eslint-disable-line react-hooks/exhaustive-deps
  const slice = grouped.slice(page * PAGE, (page + 1) * PAGE);
  const virtual = pageSize > 100;
  const rv = useVirtualizer({ count: virtual ? slice.length : 0, getScrollElement: () => scrollRef.current, estimateSize: () => 46, overscan: 12 });
  const vItems = virtual ? rv.getVirtualItems() : []; const padTop = virtual && vItems.length ? vItems[0].start : 0; const padBottom = virtual && vItems.length ? rv.getTotalSize() - vItems[vItems.length - 1].end : 0;
  const visible: [EClaim, number][] = virtual ? vItems.map((v) => [slice[v.index], v.index] as [EClaim, number]) : slice.map((x, i) => [x, i] as [EClaim, number]);
  const stats = useMemo(() => { const open = rows.filter((x) => x.open); const ages = open.map((x) => x.age ?? 0); return { n: rows.length, bal: sum(rows.map((x) => x.c.balance)), exp: sum(open.map((x) => allCol.get(x.c.id)?.expected ?? 0)), avg: ages.length ? Math.round(sum(ages) / ages.length) : 0, fu: open.filter((x) => x.fuDue).length, un: open.filter((x) => !x.c.assigned_to).length, tf: open.filter((x) => x.tfLeft != null && x.tfLeft >= 0 && x.tfLeft <= 30).length, broken: open.filter((x) => x.c.custom?.promise_date && String(x.c.custom.promise_date) < today).length }; }, [rows, allCol, today]);
  const addDaysISO = (n: number) => addBusinessDays(today, n);
  const followUp = async (id: string, n: number) => { if (!canWork) return toast.err('Read-only access'); await patchClaims([id], { next_fu: addDaysISO(n) }, `Follow-up → ${addDaysISO(n)} (worklist)`, 'followup'); toast.ok(`Follow-up set for ${fmtDate(addDaysISO(n))} (${n} business days)`); };
  const planMyDay = () => { if (!me) return; const target = Math.max(5, me.daily_target || 40); const doneToday = workLog.filter((w) => w.user_id === me.id && w.work_date === today).length; const room = Math.max(5, target - doneToday); const mineOrFree = rows.filter((x) => x.open && (!x.c.assigned_to || x.c.assigned_to === me.id) && !x.snoozed); const pick = mineOrFree.slice(0, room); setSel(new Set(pick.map((x) => x.c.id))); toast.ok(`Selected your top ${pick.length} (${money(sum(pick.map((x) => x.c.balance)))}) — press “Put on my day” to queue them`); };
  const putOnMyDay = async () => { if (!me) return; const mine = [...sel].filter((id) => { const x = claims.find((y) => y.c.id === id); return x && (!x.c.assigned_to || x.c.assigned_to === me.id); }); const free = mine.filter((id) => !claims.find((y) => y.c.id === id)!.c.assigned_to); if (free.length) await assign(free, me.id); await patchClaims(mine, { next_fu: today }, 'Queued for today (worklist plan)', 'followup'); toast.ok(`${mine.length} claims are on your day`); setSel(new Set()); };
  const take = async (id: string) => { if (me) { await assign([id], me.id); toast.ok('Claim is yours'); } };
  useEffect(() => { setCur(0); }, [view, page, groupBy, sort.key, sort.dir, g('q')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode !== 'list') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role=dialog]')) return;
      const x = slice[cur];
      if (e.key === 'j') { setCur((c) => Math.min(slice.length - 1, c + 1)); e.preventDefault(); } else if (e.key === 'k') { setCur((c) => Math.max(0, c - 1)); e.preventDefault(); }
      else if (e.key === 'Enter' && x) openClaim(x.c.id); else if (e.key === 'x' && x) setSel((s) => { const n = new Set(s); n.has(x.c.id) ? n.delete(x.c.id) : n.add(x.c.id); return n; });
      else if (e.key === 't' && x && !x.c.assigned_to && canWork) void take(x.c.id); else if (e.key === 'f' && x) void followUp(x.c.id, 3);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (virtual) rv.scrollToIndex(cur, { align: 'auto' }); else document.querySelector('tr[data-cur="1"]')?.scrollIntoView({ block: 'nearest' }); }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  const groupRow = (x: EClaim, ri: number) => { if (!groupBy || !GROUPS[groupBy]) return null; const k = GROUPS[groupBy](x); if (ri > 0 && GROUPS[groupBy](slice[ri - 1]) === k) return null; const st = gStats.get(k); return <tr key={'g' + k + ri} className="bg-[var(--panel2)]"><td colSpan={20} className="!py-1.5 text-[12px] font-semibold">{k || '—'} <span className="muted font-normal ml-2">{st?.n} claims · {money(st?.bal || 0)}</span></td></tr>; };
  const col = useCollect(slice, intel);
  const total = sum(rows.map((x) => x.c.balance));
  const allSel = slice.length > 0 && slice.every((x) => sel.has(x.c.id));
  const toggleAll = () => setSel((s) => { const n = new Set(s); slice.forEach((x) => (allSel ? n.delete(x.c.id) : n.add(x.c.id))); return n; });
  const th = (key: string, label: string, right = false) => (
    <th style={{ textAlign: right ? 'right' : 'left', cursor: 'pointer' }} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'score' || key === 'balance' || key === 'age' ? -1 : 1 }))}>
      {label}{sort.key === key && (sort.dir === 1 ? <ArrowUp size={11} className="inline ml-1" /> : <ArrowDown size={11} className="inline ml-1" />)}</th>
  );
  const ids = [...sel];
  const assignable = profiles.filter((p) => p.active && isProducer(p.role));
  const insightCounts = useMemo(() => { const m = new Map<InsightId, number>(); for (const x of claims) if (x.open && (!clientId || x.c.client_id === clientId)) for (const n of insights.get(x.c.id) || []) m.set(n.id, (m.get(n.id) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [claims, insights, clientId]);
  const filtersOn = ['ins', 'bucket', 'status', 'payer', 'rca', 'priority', 'owner', 'q', 'client', 'minAge', 'maxAge', 'minBal', 'lane', 'flag', 'stage', 'family', 'lifecycle', 'visit', 'tag', 'snoozed', 'nba', 'ibucket'].filter(g);

  const exportData = () => rows.map((x) => ({
      Client: x.client?.name, 'Claim #': x.c.claim_no, Patient: x.c.patient_name, Payer: x.c.payer, DOS: x.c.dos, 'Age (days)': x.age, Bucket: x.bucket?.label, Billed: x.c.billed_amt, Balance: x.c.balance, 'Expected reimbursement': x.c.expected_amt ?? '', 'Expected source': x.c.expected_src ?? '', Paid: x.c.paid_amt ?? '', Allowed: x.c.allowed_amt ?? '',
      Status: x.c.status, 'Root cause': x.c.rca, 'RC detail': x.c.rca_detail, 'End action': x.c.end_action, 'Sub-category': x.c.end_sub, Owner: x.owner?.full_name, 'Next F/U': x.c.next_fu, Touches: x.c.touch_count,
    }));
  const exportCSV = () => downloadFile('arms-worklist.csv', toCSV(exportData()));
  const exportPdf = async () => { const { tablePdf } = await import('../lib/pdf/tablePdf'); const list = rows.slice(0, 600); const blob = await tablePdf({ title: 'Worklist', subtitle: `${num(rows.length)} claims · ${money(total)}${rows.length > 600 ? ' · first 600 shown' : ''} · ${todayISO()}`, landscape: true, sections: [{ head: ['Claim #', 'Client', 'Payer', 'DOS', 'Age', 'Balance', 'Status', 'Owner', 'Next F/U', 'Signals'], rows: list.map((x) => [x.c.claim_no, x.client?.name, x.c.payer, x.c.dos ? fmtDate(x.c.dos) : '', x.age != null ? x.age + 'd' : '', money(x.c.balance, true), x.c.status, x.owner?.full_name || 'Unassigned', x.c.next_fu ? fmtDate(x.c.next_fu) : '', (insights.get(x.c.id) || []).slice(0, 2).map((n) => n.label).join(', ')]), align: ['left', 'left', 'left', 'left', 'right', 'right', 'left', 'left', 'left', 'left'] }] }); downloadFile('claimsiq-worklist.pdf', blob, 'application/pdf'); };
  const exportXlsx = () => void downloadXlsx('claimsiq-worklist', [{ name: 'Worklist', rows: exportData() as any, note: `Exported ${todayISO()} · ${rows.length} claims` }]);
  const saveView = () => { const name = prompt('Name this view'); if (!name) return; const n = [...saved.filter((s) => s.name !== name), { name, qs: sp.toString() }]; setSaved(n); try { localStorage.setItem('arms:views', JSON.stringify(n)); } catch { /* ignore */ } toast.ok('View saved'); };

  if (mode === 'focus') return (<div><div className="flex gap-1 mb-3 justify-end"><button className="btn btn-sm" onClick={() => setMode('list')}><Rows3 size={13} />List</button><button className="btn btn-sm" onClick={() => setMode('board')}><Kanban size={13} />Board</button><button className="btn btn-sm !border-brand-500"><Zap size={13} />Focus</button></div><WorkMode embedded /></div>);
  return (
    <div className="flex flex-col h-full -m-1">
      <PageHeader title="Worklist" sub={`${num(rows.length)} claims · ${money(total)}`} actions={<>
        <select className="input !w-auto" value={groupBy} onChange={(e) => setP('group', e.target.value)} title="Group rows"><option value="">No grouping</option><option value="payer">Group: payer</option><option value="status">Group: status</option><option value="owner">Group: owner</option><option value="bucket">Group: aging bucket</option>{!clientId && <option value="client">Group: client</option>}</select>
        {canWork && me && <button className="btn" title="Select the best claims for your daily target" onClick={planMyDay}><Zap size={14} />Plan my day</button>}
        <button className="btn" title="Copy a link to this exact view" onClick={() => { void navigator.clipboard.writeText(location.href); toast.ok('Link to this view copied'); }}><Link2 size={14} />Link</button>
        <button className="btn" onClick={saveView}><Bookmark size={14} />Save view</button>
        {has('export') && <><button className="btn" onClick={exportCSV}><Download size={14} />CSV</button><button className="btn" onClick={exportXlsx}><Download size={14} />Excel</button><button className="btn" onClick={exportPdf}><Download size={14} />PDF</button></>}</>} />
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-3 text-[12px]">{([['Claims', num(stats.n), ''], ['Balance', money(stats.bal), ''], ['Likely to collect', money(stats.exp), '#16a34a'], ['Avg age', stats.avg + 'd', stats.avg > 90 ? '#dc2626' : ''], ['Follow-ups due', String(stats.fu), stats.fu ? '#d97706' : ''], ['Unassigned', String(stats.un), stats.un ? '#d97706' : ''], ['Filing ≤30d', String(stats.tf), stats.tf ? '#dc2626' : ''], ['Broken promises', String(stats.broken), stats.broken ? '#dc2626' : '']] as const).map(([l, v, c]) => <div key={l} className="panel2 px-3 py-2"><div className="muted text-[10.5px]">{l}</div><div className="font-semibold tabular-nums" style={{ color: c || undefined }}>{v}</div></div>)}</div>
      {(g('minAge') || g('maxAge') || g('minBal')) && <div className="flex gap-1.5 mb-2 text-xs">{g('minAge') && <Chip color="#6366f1">Age &gt; {g('minAge')}d</Chip>}{g('maxAge') && <Chip color="#6366f1">Age &lt; {g('maxAge')}d</Chip>}{g('minBal') && <Chip color="#6366f1">Balance ≥ ${g('minBal')}</Chip>}</div>}
      <div className="flex gap-2 flex-wrap mb-2 items-center"><span className="text-[11px] muted font-semibold">Smart lanes</span>{LANES.map(([id, label, icon, c]) => <button key={id} onClick={() => setP('lane', g('lane') === id ? '' : id)} className="chip border" style={g('lane') === id ? { background: c, color: '#fff', borderColor: 'transparent' } : { background: c + '1a', color: c, borderColor: c + '44' }}>{icon}{label}<b>{laneCounts[id]}</b></button>)}<div className="ml-auto flex gap-1"><button className={'btn btn-sm ' + (mode === 'list' ? '!border-brand-500' : '')} onClick={() => setMode('list')}><Rows3 size={13} />List</button><button className={'btn btn-sm ' + (mode === 'board' ? '!border-brand-500' : '')} onClick={() => setMode('board')}><Kanban size={13} />Board</button>{canWork && <button className={'btn btn-sm ' + ''} title="One claim at a time in priority order — saving a touch advances automatically" onClick={() => setMode('focus')}><Zap size={13} />Focus</button>}</div></div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {VIEWS.map(([id, label]) => <button key={id} onClick={() => setP('view', id === 'all' ? '' : id)} className={cn('px-3 py-1.5 rounded-md text-xs font-semibold border transition', view === id ? 'bg-brand-600 text-white border-transparent' : 'panel2 muted hover:text-[color:var(--text)]')}>{label}</button>)}
        {saved.map((s) => <button key={s.name} onClick={() => setSp(new URLSearchParams(s.qs))} className="px-3 py-1.5 rounded-md text-xs font-semibold border border-dashed hair muted hover:text-[color:var(--text)] flex items-center gap-1"><Bookmark size={10} />{s.name}
          <X size={10} onClick={(e) => { e.stopPropagation(); const n = saved.filter((x) => x.name !== s.name); setSaved(n); localStorage.setItem('arms:views', JSON.stringify(n)); }} /></button>)}
      </div>
      <LargeBanner />
      <div className="panel p-3 mb-3 flex flex-wrap gap-2 items-center">
        <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 muted" /><input className="input !pl-8 !w-56" placeholder="Claim, patient, CPT…" value={g('q')} onChange={(e) => setP('q', e.target.value)} /></div>
        {[['stage', 'Queue', [...new Set(claims.map((x) => x.stage || ''))].filter(Boolean).sort()], ['family', 'Work bucket', FAMILIES.map((f) => f.name)], ['lifecycle', 'Lifecycle', LIFECYCLE_DEFAULTS.map((l) => l.code)], ['visit', 'Visit type', [...VISIT_TYPES]], ['bucket', 'Bucket', buckets.map((b) => b.label)], ['status', 'Status', statuses.map((s) => s.value)], ['payer', 'Payer', payers], ['rca', 'Root cause', rcas.map((r) => r.value)], ['priority', 'Priority', priorities.map((p) => p.value)], ['ibucket', 'Issue bucket', ['none', ...issueBuckets]], ['nba', 'Next step', [...new Set([...Object.values(NBA_LABEL).filter((l) => l !== 'Custom rule'), ...customLabels])]]].map(([k, label, opts]) => (
          <select key={k as string} className="input !w-auto" value={g(k as string)} onChange={(e) => setP(k as string, e.target.value)}><option value="">{label as string}: all</option>{(opts as string[]).map((o) => <option key={o}>{o}</option>)}</select>
        ))}
        <select className="input !w-auto" value={g('ins')} onChange={(e) => setP('ins', e.target.value)} title="Filter by what the claim brain noticed"><option value="">Signal: any</option>{insightCounts.map(([id, n]) => <option key={id} value={id}>{INSIGHT_LABEL[id]} ({n})</option>)}</select>
        <select className="input !w-auto" value={g('owner')} onChange={(e) => setP('owner', e.target.value)}><option value="">Owner: all</option><option value="none">Unassigned</option>{assignable.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
        {filtersOn.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setSp(view !== 'all' ? { view } : {})}><X size={13} />Clear</button>}
      </div>
      {sel.size > 0 && (
        <div className="panel p-2.5 mb-3 flex items-center gap-2 flex-wrap border-brand-500 shadow-glow animate-in">
          <b className="text-sm px-2">{sel.size} selected · {money(sum(claims.filter((x) => sel.has(x.c.id)).map((x) => x.c.balance)))}</b>
          {canManage && <select className="input !w-auto" value="" onChange={async (e) => { if (!e.target.value) return; await assign(ids, e.target.value === 'none' ? null : e.target.value); toast.ok(`Assigned ${ids.length} claims`); setSel(new Set()); }}><option value="">Assign to…</option><option value="none">Unassign</option>{assignable.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>}
          {!canManage && canWork && me && <button className="btn btn-sm" onClick={async () => { await assign(ids, me.id); toast.ok('Claims assigned to you'); setSel(new Set()); }}><UserPlus size={13} />Take</button>}
          {canWork && me && <button className="btn btn-sm" onClick={putOnMyDay}>Put on my day</button>}
          {canWork && <button className="btn btn-sm" disabled={draftAp.busy} onClick={async () => { if (await draftAp.run(ids)) setSel(new Set()); }}>Draft appeals</button>}
          {(canWork || canManage) && <button className="btn btn-sm btn-primary" onClick={() => setBulk(true)}><Layers3 size={13} />Bulk actions…</button>}
          <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
      {draftAp.node}
      {bulk && <BulkModal ids={ids} onClose={() => setBulk(false)} onDone={() => setSel(new Set())} />}
      {mode === 'board' ? <Board rows={rows} statuses={statuses} onMove={async (id, status) => { if (!canWork) return toast.err('Read-only access'); await patchClaims([id], { status }, `Status → ${status} (board)`, 'status'); }} /> : <>
      <div ref={scrollRef} className="panel flex-1 min-h-0 overflow-auto" style={virtual ? { maxHeight: 'calc(100vh - 300px)', minHeight: 320 } : undefined}>
        <table className="grid">
          <thead><tr>
            <th style={{ width: 30 }}><input type="checkbox" checked={allSel} onChange={toggleAll} /></th>
            {th('score', 'Priority')}{th('claim', 'Claim')}{th('patient', 'Patient')}{th('payer', 'Payer')}{th('dos', 'DOS')}{th('age', 'Age', true)}{th('balance', 'Balance', true)}{th('reimb', 'Expected reimb.', true)}{th('status', 'Status')}<th>Signals</th><th>Stage</th><th>Last action</th><th style={{ textAlign: 'right' }} title="Probability to collect × balance">Exp. $</th>{th('owner', 'Owner')}{th('fu', 'F/U')}{th('tf', 'TF')}<th title="Quick actions · keys: j/k move, Enter open, x select, t take, f follow-up" style={{ width: 120 }}>Quick</th></tr></thead>
          <tbody>
            {padTop > 0 && <tr aria-hidden style={{ height: padTop }}><td colSpan={22} /></tr>}
            {visible.flatMap(([x, ri]) => [groupRow(x, ri), (
              <tr key={x.c.id} data-cur={ri === cur ? '1' : undefined} className={cn(sel.has(x.c.id) && 'sel', 'cursor-pointer', ri === cur && 'outline outline-1 outline-brand-500 -outline-offset-1')} onClick={() => openClaim(x.c.id)}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(x.c.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(x.c.id) ? n.delete(x.c.id) : n.add(x.c.id); return n; })} /></td>
                <td title={pri.get(x.c.id) ? pri.get(x.c.id)!.parts.slice(0, 5).map((p) => `${p.label}: +${p.pts}`).join('\n') : undefined}><div className="flex items-center gap-1.5"><div className="w-9 h-1.5 rounded-full panel2 overflow-hidden"><div className="h-full" style={{ width: Math.min(100, pri.get(x.c.id)?.score ?? x.score) + '%', background: BAND_COLOR[pri.get(x.c.id)?.band ?? 'normal'] }} /></div><span className="text-[11px] muted tabular-nums">{Math.round(pri.get(x.c.id)?.score ?? x.score)}</span></div>{pri.get(x.c.id)?.parts[0] && <div className="text-[10px] muted truncate max-w-[130px]">{pri.get(x.c.id)!.parts[0].label}</div>}</td>
                <td className="whitespace-nowrap"><div className="font-semibold flex items-center gap-1">{x.c.claim_no}{(() => { const h = sopsFor(sops, x.c); return h.length ? <span title={h.map((y) => y.instruction).join('\n')} style={{ color: h[0].level === 'must' ? '#dc2626' : '#d97706' }}><BookOpenCheck size={12} /></span> : null; })()}{x.c.custom?.promise_date && <span title={`Payer promised payment ${x.c.custom.promise_date}`} style={{ color: String(x.c.custom.promise_date) < today ? '#dc2626' : '#16a34a' }}><Phone size={11} /></span>}</div>{!clientId && <div className="text-[10px]" style={{ color: x.client?.color }}>{x.client?.name}</div>}{nba.get(x.c.id) && nba.get(x.c.id)!.kind !== 'monitor' && <div className="text-[10px] font-medium mt-0.5" style={{ color: nba.get(x.c.id)!.color ?? NBA_COLOR[nba.get(x.c.id)!.kind] }} title={nba.get(x.c.id)!.why.join('\n')}>→ {nba.get(x.c.id)!.label}</div>}</td>
                <td className="max-w-[160px] truncate">{phi(x.c.patient_name)}</td>
                <td className="max-w-[140px] truncate">{x.c.payer}</td>
                <td className="whitespace-nowrap">{fmtDate(x.c.dos)}</td>
                <td style={{ textAlign: 'right' }}>{x.bucket ? <Chip color={x.bucket.color}>{x.age}d</Chip> : '—'}</td>
                <td style={{ textAlign: 'right' }} className="font-semibold tabular-nums">{money(x.c.balance, true)}</td>
                <td style={{ textAlign: 'right' }} className="tabular-nums text-xs" title={x.c.expected_src ? `Source: ${SRC_LABEL[x.c.expected_src as ExpectedSrc] || x.c.expected_src}` : 'No schedule, payer % or GCR set for this claim'}>{x.c.expected_amt != null ? money(x.c.expected_amt) : '—'}</td>
                <td><Chip color={statuses.find((s) => s.value === x.c.status)?.color || '#64748b'}>{x.c.status}</Chip>{x.c.custom?.issue_bucket && <Chip color="#a855f7" className="ml-1">{String(x.c.custom.issue_bucket)}</Chip>}{x.c.priority !== 'Normal' && <Chip color={priorities.find((p) => p.value === x.c.priority)?.color || '#999'} className="ml-1">{x.c.priority}</Chip>}</td>
                <td className="max-w-[230px]"><div className="flex gap-1 flex-wrap">{(insights.get(x.c.id) || []).slice(0, 2).map((n) => <span key={n.id} title={n.detail} className="chip whitespace-nowrap" style={{ background: TONE_COLOR[n.tone] + '16', color: TONE_COLOR[n.tone], borderColor: TONE_COLOR[n.tone] + '30' }}>{n.label}</span>)}{(insights.get(x.c.id) || []).length > 2 && <span className="muted text-[10px] self-center" title={(insights.get(x.c.id) || []).slice(2).map((n) => n.label).join(', ')}>+{(insights.get(x.c.id) || []).length - 2}</span>}</div></td><td>{x.stage && <Chip color={x.stageColor || '#64748b'}>{x.stage}</Chip>}</td><td className="max-w-[170px] truncate muted">{x.c.end_action ? `${x.c.end_action}${x.c.end_sub ? ' › ' + x.c.end_sub : ''}` : '—'}</td>
                <td style={{ textAlign: 'right' }} className="tabular-nums text-xs">{col.get(x.c.id) ? <span title={`${Math.round(col.get(x.c.id)!.p * 100)}% collectable`} style={{ color: col.get(x.c.id)!.p >= 0.6 ? '#22c55e' : col.get(x.c.id)!.p >= 0.35 ? '#f59e0b' : '#ef4444' }}>{money(col.get(x.c.id)!.expected)}</span> : '—'}</td>
                <td>{x.owner ? <div className="flex items-center gap-1.5"><Avatar name={x.owner.full_name} size={20} /><span className="text-xs">{x.owner.full_name.split(' ')[0]}</span></div> : <span className="text-amber-500 text-xs font-semibold">Unassigned</span>}</td>
                <td className={cn('whitespace-nowrap text-xs', x.fuDue && 'text-amber-500 font-bold')}>{x.c.next_fu ? fmtDate(x.c.next_fu) : '—'}</td>
                <td className={cn('text-xs whitespace-nowrap', x.tfLeft != null && x.tfLeft <= 30 && 'text-red-500 font-bold')}>{x.tfLeft == null ? '—' : x.tfLeft <= 0 ? 'Passed' : x.tfLeft + 'd'}</td>
                <td onClick={(e) => e.stopPropagation()} className="whitespace-nowrap">{canWork && x.open && <span className="inline-flex gap-1">{!x.c.assigned_to && <button className="btn btn-sm !px-1.5" title="Take this claim (t)" onClick={() => take(x.c.id)}>Take</button>}<button className="btn btn-sm !px-1.5" title="Follow up in 3 business days — skips weekends and US holidays (f)" onClick={() => followUp(x.c.id, 3)}>+3d</button><button className="btn btn-sm !px-1.5" title="Follow up in 7 business days" onClick={() => followUp(x.c.id, 7)}>+7d</button></span>}</td>
              </tr>)])}
            {padBottom > 0 && <tr aria-hidden style={{ height: padBottom }}><td colSpan={22} /></tr>}
          </tbody>
        </table>
        {rows.length === 0 && <Empty title="No claims match" sub="Adjust the filters or import an aging file." />}
      </div>
      <div className="flex items-center justify-between pt-3 text-xs muted">
        <span>Showing {rows.length ? page * PAGE + 1 : 0}–{Math.min(rows.length, (page + 1) * PAGE)} of {num(rows.length)}</span>
        <div className="flex gap-2 items-center"><select className="input !w-auto !py-0.5 text-xs" title="Rows per page — above 100 the list scrolls smoothly (virtualized)" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}><option value={100}>100 / page</option><option value={500}>500 / page · virtual</option><option value={2000}>2,000 / page · virtual</option></select><button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button><button className="btn btn-sm" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</button></div>
      </div>
      </>}
      <span className="hidden">{clients.length}</span>
    </div>
  );
}


function Board({ rows, statuses, onMove }: { rows: EClaim[]; statuses: { id: string; value: string; color: string | null; meta: any }[]; onMove: (id: string, status: string) => void }) {
  const [over, setOver] = useState<string | null>(null); const openClaim = useStore((s) => s.openClaim);
  const cols = statuses.filter((s) => !s.meta.terminal);
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 flex-1 min-h-0">
      {cols.map((c) => { const items = rows.filter((x) => x.c.status === c.value); return (
        <div key={c.id} onDragOver={(e) => { e.preventDefault(); setOver(c.value); }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/claim'); if (id) onMove(id, c.value); }} className={cn('w-64 shrink-0 panel2 p-2 flex flex-col max-h-[calc(100vh-300px)]', over === c.value && '!border-brand-500')}>
          <div className="flex items-center gap-2 px-1.5 pb-2"><span className="w-2 h-2 rounded-full" style={{ background: c.color || '#64748b' }} /><b className="text-[12px] flex-1 truncate">{c.value}</b><span className="text-[11px] muted">{items.length} · {money(sum(items.map((x) => x.c.balance)))}</span></div>
          <div className="space-y-1.5 overflow-auto">{items.slice(0, 40).map((x) => (
            <div key={x.c.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/claim', x.c.id)} onClick={() => openClaim(x.c.id)} className="panel p-2 cursor-grab active:cursor-grabbing hover:border-brand-500 text-[12px]"><div className="flex justify-between"><b>{x.c.claim_no}</b><span className="tabular-nums">{money(x.c.balance)}</span></div><div className="flex gap-1 items-center mt-1 flex-wrap"><span className="muted truncate max-w-[100px]">{x.c.payer}</span>{x.bucket && <Chip color={x.bucket.color}>{x.age}d</Chip>}{x.fuDue && <Chip color="#f59e0b">F/U</Chip>}{x.owner && <span className="ml-auto"><Avatar name={x.owner.full_name} size={18} /></span>}</div></div>))}
            {items.length > 40 && <div className="text-[11px] muted text-center">+{items.length - 40} more</div>}</div></div>); })}
    </div>
  );
}
