import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BrandMark, BrandWordmark } from './Brand';
import { resolveAppName } from '../lib/brand';
import { motion } from 'framer-motion';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FileEdit, ScanText, Calculator, LifeBuoy, ShieldQuestion, Layers3, Scale, Gavel, Siren, ChevronLeft, ChevronRight, Receipt, GraduationCap, Table2, AlertOctagon, Archive, Bell, BookOpen, Brain, Building2, CalendarDays, ChevronDown, ChevronsLeft, ChevronsRight, ClipboardList, Command, FileBarChart2, FileText, FileUp, Flame, History, Home, Keyboard, Landmark, Layers, LayoutDashboard, LogOut, Mail, MessageSquareText, Moon, Plus, ScrollText, Search, Settings2, ShieldCheck, Sparkles, Star, Sun, Sunrise, Timer, Users2, Workflow, Zap, KanbanSquare, Network } from 'lucide-react';
import { homeFor, roleMatches, STAFF_ROLES } from '../lib/roles';
import { useStore } from '../store';
import { Avatar, Modal } from './ui';
import { ScopeSwitcher } from './ScopeSwitcher';
import { cn, relTime, setWorkspaceTz } from '../lib/utils';
import { ROLE_LABEL } from '../lib/types';
import { ClaimDrawer } from './ClaimDrawer';
import { parseQuery } from '../lib/nlq';

interface Nav { to: string; hide?: boolean; label: string; icon: ReactNode; cap?: string; roles?: string[]; badge?: 'requests' | 'exceptions' | 'missing'; tab?: string; hint?: string }
interface Hub { id: string; cap?: string; label: string; icon: ReactNode; blurb: string; items: Nav[] }
const STAFF: string[] = STAFF_ROLES;
const I = 16;
export const HUBS: Hub[] = [
  { id: 'home', label: 'Home', icon: <Home size={19} />, blurb: 'Your day at a glance', items: [
    { to: '/me', label: 'My Day', icon: <Sunrise size={I} />, cap: 'work_claims', hint: 'Plan, targets, follow-ups' }, { to: '/huddle', label: 'Huddle', icon: <Users2 size={I} />, cap: 'view_money', hint: 'Daily team huddle & client review' }, { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={I} />, roles: STAFF, hint: 'Command center' }] },
  { id: 'work', label: 'Work', icon: <Flame size={19} />, blurb: 'Work claims & queues', items: [
    { to: '/worklist', label: 'Worklist', icon: <ClipboardList size={I} />, roles: STAFF, hint: 'Filter, board, bulk' },
    { to: '/unresolved', label: 'Unresolved tracker', icon: <ShieldQuestion size={I} />, roles: STAFF, hint: 'Nothing slips through' }, { to: '/appeals', label: 'Appeals', icon: <Gavel size={I} />, roles: STAFF, hint: 'Letters, forms, levels' }, { to: '/radar', label: 'Deadline radar', icon: <Siren size={I} />, roles: STAFF, hint: 'TFL / AFL / CCFL countdown' }, { to: '/closed', label: 'Closed & resolved', icon: <Archive size={I} />, roles: STAFF, hint: 'History of resolved claims' }, { to: '/aging', label: 'Aging & Queues', icon: <Layers size={I} />, roles: STAFF, hint: 'Buckets, queues, appeals' }, { to: '/requests', label: 'Client comms', icon: <MessageSquareText size={I} />, cap: 'work_claims', badge: 'requests', hint: 'Questions & approvals' }, { to: '/outreach', hide: true, label: 'Client Outreach', icon: <Mail size={I} />, cap: 'work_claims', hint: 'Email clients for help' }] },
  { id: 'quality', label: 'Quality', icon: <ShieldCheck size={19} />, blurb: 'QA reviews, scores & coaching', items: [
    { to: '/qa', label: 'QA Center', icon: <ShieldCheck size={I} />, roles: STAFF, hint: 'Reviews, scores, coaching' }] },
  { id: 'clients', label: 'Clients', icon: <Building2 size={19} />, blurb: 'Practices, payers, knowledge', items: [
    { to: '/clients', label: 'Clients', icon: <Building2 size={I} />, roles: STAFF, hint: 'Health & detail' }, { to: '/scorecards', hide: true, label: 'Payer scorecards', icon: <Landmark size={I} />, roles: STAFF, hint: 'Denials, speed, wins' }, { to: '/payers', label: 'Payers', icon: <Landmark size={I} />, roles: STAFF, hint: 'Payer intelligence' }, { to: '/knowledge', label: 'Knowledge', icon: <GraduationCap size={I} />, roles: STAFF, hint: 'Denials, appeals, academy' }, { to: '/library', hide: true, label: 'Library', icon: <BookOpen size={I} />, roles: STAFF, hint: 'Policies, codes, playbooks' }] },
  { id: 'insight', label: 'Insight', icon: <Brain size={19} />, blurb: 'Analytics & reporting', items: [
    { to: '/intelligence', label: 'Intelligence', icon: <Brain size={I} />, roles: STAFF, hint: 'Next best action, cash, capacity' }, { to: '/ocr', label: 'Document OCR', icon: <ScanText size={I} />, roles: STAFF, hint: 'Read letters & EOBs locally', cap: 'work_claims' }, { to: '/studio', label: 'PDF & Word Studio', icon: <FileEdit size={I} />, roles: STAFF, hint: 'Edit, redact, sign, merge', cap: 'work_claims' }, { to: '/tools', label: 'Tools', icon: <Calculator size={I} />, roles: STAFF, hint: 'A/R calculators' }, { to: '/underpay', label: 'Underpayments', icon: <Scale size={I} />, roles: STAFF, hint: 'Paid below contract' }, { to: '/insights', hide: true, label: 'Insights', icon: <Brain size={I} />, roles: STAFF, hint: 'Patterns & forecast' }, { to: '/productivity', label: 'Productivity', icon: <Timer size={I} />, roles: STAFF, hint: 'Team & recoveries' }, { to: '/pivot', label: 'Pivot Studio', icon: <Table2 size={I} />, cap: 'manage_reports', hint: 'Drag & drop analysis' }, { to: '/reports', label: 'Reports', icon: <FileBarChart2 size={I} />, cap: 'manage_reports', hint: 'Build, export, schedule' }, { to: '/health', hide: true, label: 'Client health', icon: <Layers size={I} />, cap: 'view_money', hint: 'A/R health score per client' }, { to: '/edi', hide: true, label: 'X12 viewer', icon: <FileText size={I} />, cap: 'work_claims', hint: 'Read 835 / 837 / 277 files' }, { to: '/faxes', hide: true, label: 'Faxes', icon: <Mail size={I} />, cap: 'work_claims', hint: 'Sent faxes & delivery' }] },
  { id: 'control', cap: 'access_control', label: 'Control', icon: <Workflow size={19} />, blurb: 'Data, rules & quality', items: [
    { to: '/allocation', label: 'Allocation', icon: <Users2 size={I} />, cap: 'assign', hint: 'Assign & balance' }, { to: '/import', label: 'Import Aging', icon: <FileUp size={I} />, cap: 'import', hint: 'Weekly reconciliation' }, { to: '/era', label: 'Remits & EDI', icon: <Receipt size={I} />, cap: 'import', hint: 'Post remits & denials' }, { to: '/imports', label: 'History', icon: <History size={I} />, cap: 'import', hint: 'Row log & undo' },
    { to: '/bulk', hide: true, label: 'Bulk history', icon: <Layers3 size={I} />, cap: 'bulk_edit', hint: 'Bulk changes & undo' }, { to: '/missing', label: 'Missing from file', icon: <AlertOctagon size={I} />, cap: 'resolve_missing', badge: 'missing', hint: 'Dropped off the aging file — decide' }, { to: '/exceptions', label: 'Exceptions', icon: <AlertOctagon size={I} />, cap: 'run_rules', badge: 'exceptions', hint: 'Checks & duplicates' }, { to: '/rules', label: 'Rules & Checks', icon: <Workflow size={I} />, cap: 'run_rules', hint: 'Automation' }, { to: '/audit-log', label: 'Audit Log', icon: <ScrollText size={I} />, cap: 'view_audit_log', hint: 'Who did what' }] },
  { id: 'admin', cap: 'access_admin', label: 'Admin', icon: <Settings2 size={19} />, blurb: 'Configure everything', items: [
    { to: '/admin', label: 'Admin console', icon: <Settings2 size={I} />, cap: 'access_admin', hint: 'All settings, grouped' }, { to: '/admin', tab: 'access', label: 'Client access', icon: <Users2 size={I} />, cap: 'manage_clients', hint: 'Client logins & permissions' }, { to: '/admin', tab: 'doctor', label: 'Setup doctor', icon: <ShieldCheck size={I} />, cap: 'edit_config', hint: 'Health & self-test' }] },
  { id: 'portal', label: 'Portal', icon: <LayoutDashboard size={19} />, blurb: 'Your practice', items: [
    { to: '/portal', label: 'Overview', icon: <LayoutDashboard size={I} />, roles: ['client'] }, { to: '/portal/claims', label: 'Claims', icon: <ClipboardList size={I} />, roles: ['client'] },
    { to: '/requests', label: 'Messages', icon: <MessageSquareText size={I} />, roles: ['client'], badge: 'requests' }, { to: '/portal/report', label: 'Report', icon: <FileText size={I} />, roles: ['client'] }] },
];
const ALL = HUBS.flatMap((h) => h.items.map((i) => ({ ...i, hub: h.id })));
const itemKey = (n: Nav) => n.to + (n.tab ? '?tab=' + n.tab : '');
const lsGet = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

import { useClaimSearch } from '../lib/search';
import { Command as Cmdk } from 'cmdk';
import { SaveIndicator, FeedbackButton } from './SaveFeedback';
export function Layout({ children }: { children: ReactNode }) {
  const st = useStore(); const { me, logout, dark, toggleDark, mode, settings, resetDemo, has, requests, meId } = st;
  useEffect(() => { setWorkspaceTz(settings.sla?.tz || ''); }, [settings.sla?.tz]);
  const user = me(); const brand = resolveAppName(settings.branding?.appName); const sec = settings.security || {};
  const loc = useLocation(); const nav = useNavigate();
  const [pal, setPal] = useState(false); const [help, setHelp] = useState(false);
  const visible = (n: Nav) => (n.roles ? !!user && n.roles.includes(user.role) : n.cap ? has(n.cap) : false);
  const hubs = HUBS.filter((h) => !h.cap || has(h.cap)).map((h) => ({ ...h, items: h.items.filter(visible) })).filter((h) => h.items.length);
  const curItem = ALL.filter((i) => (i.to === '/' ? loc.pathname === '/' : loc.pathname === i.to || loc.pathname.startsWith(i.to + '/'))).sort((a, b) => b.to.length - a.to.length).find((i) => !i.tab || loc.search.includes('tab=' + i.tab)) || ALL.find((i) => i.to === loc.pathname);
  const routeHub = curItem?.hub || hubs[0]?.id;
  const [collapsed, setCollapsed] = useState<boolean>(() => lsGet('arms:navCollapsed', false)); const [closed, setClosed] = useState<Record<string, boolean>>(() => lsGet('arms:navClosed', { admin: true, control: true }));
  const [pins, setPins] = useState<string[]>(() => lsGet('arms:pins:nav', [])); const [recent, setRecent] = useState<string[]>(() => lsGet('arms:recent:nav', []));
  useEffect(() => { if (curItem) { const k = itemKey(curItem); setRecent((r) => { const n = [k, ...r.filter((x) => x !== k)].slice(0, 5); lsSet('arms:recent:nav', n); return n; }); } }, [loc.pathname, loc.search]); // eslint-disable-line react-hooks/exhaustive-deps
  const togglePinNav = (k: string) => setPins((p) => { const n = p.includes(k) ? p.filter((x) => x !== k) : [...p, k]; lsSet('arms:pins:nav', n); return n; });
  const flat = hubs.flatMap((h) => h.items); const byKey = (k: string) => flat.find((i) => itemKey(i) === k);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName || '';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPal((p) => !p); }
      else if (e.key === '?' && !/input|textarea|select/i.test(tag)) setHelp((x) => !x);
      else if (e.altKey && /^[1-7]$/.test(e.key)) { const t = hubs[Number(e.key) - 1]; if (t) { e.preventDefault(); const it = t.items[0]; nav(it.tab ? `${it.to}?tab=${it.tab}` : it.to); } }
      else if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setCollapsed((c) => { lsSet('arms:navCollapsed', !c); return !c; }); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [hubs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = `${curItem?.label || (loc.pathname === '/account' ? 'My account' : loc.pathname === '/help' ? 'Help' : 'Home')} · ${brand}`; }, [curItem?.label, loc.pathname, brand]);
  const idle = Number(sec.idleMinutes || 0); const timer = useRef<any>(null);
  useEffect(() => { if (!idle) return; const reset = () => { clearTimeout(timer.current); timer.current = setTimeout(() => logout(), idle * 60000); }; reset(); const ev = ['mousemove', 'keydown', 'click', 'scroll']; ev.forEach((e) => window.addEventListener(e, reset, { passive: true })); return () => { clearTimeout(timer.current); ev.forEach((e) => window.removeEventListener(e, reset)); }; }, [idle, logout]);
  const openReq = requests.filter((r) => r.status === 'open').length; const missingN = useStore((st) => { let n = 0; for (const c of st.claims) if (!c.closed_at && c.flags?.includes('missing_review')) n++; return n; });
  const badge = (n: Nav) => (n.badge === 'requests' && openReq > 0 ? openReq : n.badge === 'missing' ? missingN : 0);
  const go = (it: Nav) => nav(it.tab ? `${it.to}?tab=${it.tab}` : it.to);
  const isActive = (it: Nav) => (it.to === '/admin' && !it.tab ? loc.pathname === '/admin' && /tab=/.test(loc.search) && !/tab=(access|doctor)\b/.test(loc.search) : it.tab ? loc.pathname === it.to && (loc.search.includes('tab=' + it.tab) || (!loc.search && it.tab === 'doctor')) : it.to === '/' ? loc.pathname === '/' : loc.pathname === it.to || loc.pathname.startsWith(it.to + '/'));
  const keepQ = (() => { const q = new URLSearchParams(loc.search); const o = new URLSearchParams(); ['as', 'p'].forEach((k) => q.get(k) && o.set(k, q.get(k)!)); return o.toString() ? '?' + o.toString() : ''; })();
  const crumbHub = hubs.find((h) => h.id === routeHub); const homeTo = homeFor(user?.role);
  const itemLink = (it: Nav) => { const k = itemKey(it); const act = isActive(it); const n = badge(it); return (
    <NavLink key={k} to={it.tab ? `${it.to}?tab=${it.tab}` : it.to.startsWith('/portal') || it.roles?.includes('client') ? it.to + keepQ : it.to} end={it.to === '/' || it.to === '/portal'} title={collapsed ? it.label : it.hint} className="nav-item" data-active={act}>
      <span className="shrink-0 grid place-items-center w-[18px]">{it.icon}</span>
      {!collapsed && <><span className="flex-1 truncate">{it.label}</span>{n > 0 && <span className="nav-badge">{n}</span>}</>}
      {collapsed && n > 0 && <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-500" />}
    </NavLink>); };
  return (
    <div className="h-full flex">
      <aside className={cn('shrink-0 flex flex-col z-30 no-print transition-[width] duration-200', collapsed ? 'w-[76px]' : 'w-[252px]')} style={{ background: 'var(--rail)', borderRight: '1px solid var(--line)' }}>
        <div className={cn('flex items-center gap-2.5 px-4 h-16 shrink-0', collapsed && 'justify-center px-0')}>
          <button onClick={() => nav(homeTo)} aria-label="Home" className="flex items-center gap-2.5 min-w-0"><BrandMark size={34} />{!collapsed && <BrandWordmark size={24} name={brand} />}</button>
          {!collapsed && <button className="ml-auto btn btn-ghost btn-sm !px-1.5" title="Collapse menu (Ctrl+\\)" onClick={() => setCollapsed((c) => { lsSet('arms:navCollapsed', !c); return !c; })}><ChevronsLeft size={15} /></button>}
        </div>
        {collapsed && <button className="mx-auto mb-2 btn btn-ghost btn-sm !px-1.5" title="Expand menu" onClick={() => setCollapsed((c) => { lsSet('arms:navCollapsed', !c); return !c; })}><ChevronsRight size={15} /></button>}
        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-4">
          {pins.length > 0 && !collapsed && <div><div className="nav-sec">Pinned</div><div className="space-y-0.5">{pins.map((k) => byKey(k)).filter(Boolean).map((it) => itemLink(it!))}</div></div>}
          {hubs.map((h) => { const shut = !collapsed && closed[h.id] && !h.items.some(isActive); return (
            <div key={h.id}>
              {!collapsed ? <button className="nav-sec w-full flex items-center justify-between" onClick={() => setClosed((c) => { const n = { ...c, [h.id]: !c[h.id] }; lsSet('arms:navClosed', n); return n; })}>{h.label}<ChevronDown size={12} className={cn('transition', shut && '-rotate-90')} /></button> : <div className="h-px bg-[var(--line)] mx-3 my-2" />}
              {!shut && <div className="space-y-0.5">{h.items.filter((it) => !it.hide).map((it) => itemLink(it))}</div>}
            </div>); })}
        </nav>
        {!collapsed && <div className="px-4 pb-1 text-[10px] muted" title="If this doesn't match the latest commit, redeploy / hard-refresh">build {__BUILD__}</div>}
        {!collapsed && <div className="px-4 pb-2 text-[10px] muted">A <b>Revantage HBS</b> product</div>}
        {mode === 'local' && !collapsed && <div className="px-3 pb-2"><button onClick={() => confirm('Reset all demo data?') && resetDemo()} className="w-full text-[11px] py-1.5 rounded-xl bg-amber-500/12 text-amber-700 dark:text-amber-400 font-semibold border border-amber-500/25">Demo mode · reset data</button></div>}
        <div className={cn('m-3 mt-0 rounded-2xl border hair flex items-center gap-2.5 p-2', collapsed && 'justify-center border-0 p-0')} style={{ background: collapsed ? 'transparent' : 'var(--panel2)' }}>
          <Link to="/account" className="flex items-center gap-2.5 min-w-0 flex-1" title="My account"><Avatar name={user?.full_name} size={34} />
          {!collapsed && <div className="min-w-0 flex-1"><div className="text-[13px] font-semibold truncate">{user?.full_name}</div><div className="text-[11px] muted truncate">{user && ROLE_LABEL[user.role]}</div></div>}</Link>
          {!collapsed && <><Link to="/help" className="btn btn-ghost btn-sm !px-1.5" title="Help & support"><LifeBuoy size={14} /></Link><button className="btn btn-ghost btn-sm !px-1.5" title="Sign out" onClick={logout}><LogOut size={14} /></button></>}
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 shrink-0 border-b hair flex items-center gap-3 px-5 glass no-print z-20">
          <div className="flex items-center gap-1 shrink-0"><button className="btn btn-ghost btn-sm !px-1.5" aria-label="Back" title="Back" onClick={() => nav(-1)}><ChevronLeft size={16} /></button><button className="btn btn-ghost btn-sm !px-1.5" aria-label="Forward" title="Forward" onClick={() => nav(1)}><ChevronRight size={16} /></button></div>
          <Link to={homeTo} className="btn btn-ghost btn-sm !px-1.5" aria-label="Home" title="Home"><Home size={16} /></Link>
          <button onClick={() => setPal(true)} className="flex-1 min-w-[160px] max-w-md mx-auto flex items-center gap-2 px-3 h-9 rounded-xl text-[13px] muted whitespace-nowrap overflow-hidden hover:border-[color:var(--line2)] border hair transition" style={{ background: 'var(--panel)', boxShadow: 'var(--sh1)' }}><Search size={14} />Search claims, jump to pages, ask anything…<span className="kbd ml-auto"><Command size={9} className="inline" /> K</span></button>
          <div className="flex items-center gap-2 ml-auto">
            {user?.role !== 'client' && <Link to="/knowledge" className="btn btn-ghost btn-sm" title="Knowledge hub — denial guides, appeals, training"><GraduationCap size={16} /><span className="hidden 2xl:inline">Knowledge</span></Link>}
            <RecentMenu keys={recent} byKey={byKey} go={go} />
            {user?.role !== 'client' && <ScopeSwitcher />}
            {user?.role !== 'client' && <QuickCreate />}
            <SaveIndicator /><FeedbackButton />
            <Bell_ />
            <button className="btn btn-ghost btn-sm" onClick={() => setHelp(true)} title="Shortcuts (?)"><Keyboard size={16} /></button>
            <button className="btn btn-ghost btn-sm" onClick={toggleDark}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button></div>
        </header>
        <main className="flex-1 overflow-auto px-6 py-6 lg:px-8"><motion.div key={loc.pathname} className="max-w-[1600px] mx-auto" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}>{children}</motion.div></main>
      </div>
      {sec.watermark && user && <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden select-none" style={{ opacity: 0.06 }}><div style={{ transform: 'rotate(-24deg)', width: '200%', height: '200%', marginLeft: '-50%', marginTop: '-50%', display: 'flex', flexWrap: 'wrap', gap: 60, alignContent: 'flex-start', fontSize: 15, fontWeight: 700 }}>{Array.from({ length: 220 }, (_, i) => <span key={i} style={{ whiteSpace: 'nowrap' }}>{user.email} · {new Date().toISOString().slice(0, 10)}</span>)}</div></div>}
      <Palette open={pal} onClose={() => setPal(false)} />
      <Modal open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts"><div className="text-sm space-y-2.5">{[['Ctrl/⌘ + K', 'Command bar: find claims, jump, switch client, natural-language search'], ['Alt + 1 … 7', 'Jump to a hub'], ['Ctrl/⌘ + \\', 'Collapse / expand the menu'], ['Alt + → / ←', 'Skip / previous claim in Work Mode'], ['Ctrl/⌘ + Enter', 'Save the touch'], ['Esc', 'Close drawer / dialog'], ['?', 'This help']].map(([k, d]) => <div key={k} className="flex justify-between gap-4"><span className="kbd">{k}</span><span className="muted text-right">{d}</span></div>)}</div></Modal>
      <ClaimDrawer />
      <span className="hidden">{meId}{<CalendarDays size={1} />}{<Mail size={1} />}{<KanbanSquare size={1} />}</span>
    </div>
  );
}

function QuickCreate() {
  const nav = useNavigate(); const has = useStore((s) => s.has); const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; window.addEventListener('mousedown', h); return () => window.removeEventListener('mousedown', h); }, [open]);
  const items = [{ l: 'Import an aging file', to: '/import', cap: 'import', i: <FileUp size={14} /> }, { l: 'Build a report', to: '/reports', cap: 'manage_reports', i: <FileBarChart2 size={14} /> }, { l: 'New automation rule', to: '/rules', cap: 'manage_rules', i: <Workflow size={14} /> }, { l: 'Allocate claims', to: '/allocation', cap: 'assign', i: <Users2 size={14} /> }, { l: 'Start Work Mode', to: '/work', cap: 'work_claims', i: <Flame size={14} /> }].filter((x) => has(x.cap));
  return (
    <div className="relative" ref={ref}><button className="btn btn-primary btn-sm !min-h-[32px]" onClick={() => setOpen(!open)}><Plus size={14} />New</button>
      {open && <div className="absolute right-0 top-10 w-60 panel z-50 p-1.5 animate-pop" style={{ boxShadow: 'var(--sh3)' }}>{items.map((x) => <button key={x.to} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] hover:bg-[var(--panel2)]" onClick={() => { setOpen(false); nav(x.to); }}><span className="muted">{x.i}</span>{x.l}</button>)}</div>}
    </div>
  );
}

function Bell_() {
  const { notifications, meId, me, markRead } = useStore(); const nav = useNavigate(); const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); const role = me()?.role;
  const mine = useMemo(() => notifications.filter((n) => (!n.user_id || n.user_id === meId) && (!n.role || roleMatches(n.role, role))).sort((a, b) => b.created_at.localeCompare(a.created_at)), [notifications, meId, role]);
  const unread = mine.filter((n) => !n.read_by.includes(meId || ''));
  useEffect(() => { const h = (e: MouseEvent) => { if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; window.addEventListener('mousedown', h); return () => window.removeEventListener('mousedown', h); }, [open]);
  if (role === 'client') return null;
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-ghost relative" onClick={() => setOpen(!open)}><Bell size={16} />{unread.length > 0 && <span className="absolute -top-0.5 -right-0.5 text-[9px] bg-red-500 text-white rounded-full min-w-[15px] h-[15px] flex items-center justify-center font-bold">{unread.length > 9 ? '9+' : unread.length}</span>}</button>
      {open && <div className="absolute right-0 top-11 w-80 panel shadow-2xl z-40 animate-in"><div className="flex justify-between items-center px-3 py-2 border-b hair"><b className="text-sm">Notifications</b><button className="text-[11px] text-brand-400" onClick={() => markRead(unread.map((n) => n.id))}>Mark all read</button></div>
        <div className="max-h-80 overflow-auto">{mine.slice(0, 20).map((n) => <button key={n.id} onClick={() => { markRead([n.id]); setOpen(false); n.link && nav(n.link); }} className={cn('w-full text-left px-3 py-2 border-b hair hover:bg-[var(--panel2)]', !n.read_by.includes(meId || '') && 'bg-brand-500/10')}><div className="text-[13px] font-semibold flex gap-1.5 items-center">{n.severity !== 'info' && <span className={cn('w-1.5 h-1.5 rounded-full', n.severity === 'high' ? 'bg-red-500' : 'bg-amber-500')} />}{n.title}</div>{n.body && <div className="text-[11px] muted truncate">{n.body}</div>}<div className="text-[10px] muted">{relTime(n.created_at)}</div></button>)}{mine.length === 0 && <div className="p-6 text-center muted text-sm">You’re all caught up.</div>}</div></div>}
    </div>
  );
}

function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState(''); const claims = useStore((s) => s.claims); const clients = useStore((s) => s.clients); const me = useStore((s) => s.me()); const has = useStore((s) => s.has); const config = useStore((s) => s.config); const nav = useNavigate();
  useEffect(() => { if (open) setQ(''); }, [open]);
  const pages = HUBS.filter((h) => !h.cap || has(h.cap)).flatMap((h) => h.items).filter((n) => (n.roles ? !!me && n.roles.includes(me.role) : n.cap ? has(n.cap) : false));
  const setScope = useStore((s) => s.setClientScope);
  const { search } = useClaimSearch(); const hits = useMemo(() => search(q, 8), [q, search]);
  const pg = pages.filter((p) => p.label.toLowerCase().includes(q.toLowerCase()));
  const nlq = useMemo(() => {
    if (q.trim().length < 3 || me?.role === 'client') return null;
    const vocab = { payers: [...new Set(claims.map((c) => c.payer || ''))].filter(Boolean), clients: clients.map((c) => ({ id: c.id, name: c.name })), statuses: config.filter((o) => o.category === 'status').map((o) => o.value), rcas: config.filter((o) => o.category === 'rca').map((o) => o.value), buckets: config.filter((o) => o.category === 'bucket').map((o) => o.value), actions: [] };
    const r = parseQuery(q, vocab); return r.chips.length ? r : null;
  }, [q, claims, clients, config, me]);
  const item = 'w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 text-[13px] cursor-pointer aria-selected:bg-[var(--panel2)]';
  const actions = [
    ...(has('work_claims') && me?.role !== 'client' ? [{ label: 'Plan my day — open the worklist ready to queue', run: () => nav('/worklist?view=mine') }, { label: 'My follow-ups due today', run: () => nav('/worklist?view=fu') }] : []),
    ...(has('view_money') ? [{ label: 'Open the daily huddle', run: () => nav('/huddle') }, { label: 'Client health scores', run: () => nav('/health') }] : []),
    { label: 'Open the EDI / remittance viewer', run: () => nav('/edi') }, { label: 'Send feedback to the team', run: () => document.querySelector<HTMLButtonElement>('button[aria-label="Send feedback"]')?.click() },
  ].filter((a) => !q.trim() || a.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Zap size={15} className="text-brand-400" />Quick find</span>}>
      <Cmdk shouldFilter={false} loop label="Quick find">
        <Cmdk.Input autoFocus className="input mb-3" placeholder="Try: aetna over 180 days unassigned · timely filing · a claim number…" value={q} onValueChange={setQ} />
        <Cmdk.List className="max-h-[56vh] overflow-auto">
          {nlq && <Cmdk.Group heading="Understood as a worklist filter"><Cmdk.Item value="nl-filter" className="w-full text-left p-3 rounded-xl border border-brand-500/50 bg-brand-500/10 mb-3 cursor-pointer" onSelect={() => { const sp = new URLSearchParams(nlq.params); if (nlq.rest) sp.set('q', nlq.rest); onClose(); nav('/worklist?' + sp.toString()); }}><div className="text-[11px] font-bold text-brand-300 flex items-center gap-1.5 mb-1.5"><Sparkles size={12} />Press Enter to open</div><div className="flex gap-1.5 flex-wrap">{nlq.chips.map((c) => <span key={c} className="chip bg-brand-500/25 text-brand-200">{c}</span>)}{nlq.rest && <span className="chip panel2">“{nlq.rest}”</span>}</div></Cmdk.Item></Cmdk.Group>}
          {hits.length > 0 && <Cmdk.Group heading="Claims">{hits.map((c) => <Cmdk.Item key={c.id} value={'claim-' + c.id} className={item + ' justify-between'} onSelect={() => { onClose(); useStore.getState().openClaim(c.id); }}><span><b>{c.claim_no}</b> <span className="muted">{c.patient_name}</span></span><span className="muted">{clients.find((x) => x.id === c.client_id)?.name}</span></Cmdk.Item>)}</Cmdk.Group>}
          {me?.role !== 'client' && q.trim().length >= 2 && clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 4).map((c) => <Cmdk.Item key={c.id} value={'client-' + c.id} className={item} onSelect={() => { setScope([c.id]); onClose(); nav('/worklist'); }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />Switch to <b>{c.name}</b></Cmdk.Item>)}
          {actions.length > 0 && <Cmdk.Group heading="Actions">{actions.map((a) => <Cmdk.Item key={a.label} value={'act-' + a.label} className={item} onSelect={() => { onClose(); a.run(); }}><Zap size={13} className="muted" />{a.label}</Cmdk.Item>)}</Cmdk.Group>}
          <Cmdk.Group heading="Go to">{pg.map((p) => <Cmdk.Item key={p.to + p.label + (p.tab || '')} value={'go-' + p.to + p.label + (p.tab || '')} className={item} onSelect={() => { onClose(); nav(p.tab ? `${p.to}?tab=${p.tab}` : p.to); }}><span className="muted">{p.icon}</span>{p.label}</Cmdk.Item>)}</Cmdk.Group>
          <Cmdk.Empty className="text-sm muted p-4 text-center">Nothing matches “{q}”.</Cmdk.Empty>
        </Cmdk.List>
      </Cmdk>
    </Modal>
  );
}

function RecentMenu({ keys, byKey, go }: { keys: string[]; byKey: (k: string) => Nav | undefined; go: (n: Nav) => void }) {
  const [open, setOpen] = useState(false); const items = keys.map(byKey).filter(Boolean) as Nav[];
  if (!items.length) return null;
  return (
    <div className="relative"><button className="btn btn-ghost btn-sm" aria-label="Recent pages" title="Recent pages" onClick={() => setOpen(!open)}><History size={16} /></button>
      {open && <><div className="fixed inset-0 z-40" onMouseDown={() => setOpen(false)} /><div className="absolute right-0 top-10 w-56 panel z-50 p-1.5 animate-pop" style={{ boxShadow: 'var(--sh3)' }}><div className="label px-2 pt-1">Recent</div>{items.map((it) => <button key={it.to + (it.tab || '')} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] hover:bg-[var(--panel2)] text-left" onClick={() => { setOpen(false); go(it); }}><span className="muted">{it.icon}</span>{it.label}</button>)}</div></>}</div>
  );
}
