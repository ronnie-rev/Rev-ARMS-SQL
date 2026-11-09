import type { ReactNode } from 'react';
import { Skeleton, SkeletonCards, SkeletonRows } from './components/ui';
import { useEffect } from 'react';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from './store';
import { homeFor } from './lib/roles';
import { Layout } from './components/Layout';
import { applyAccent } from './lib/theme';
import { Toaster } from './components/ui';
import { HoverHelp } from './components/HoverHelp';
import { A11yFix } from './components/A11yFix';
import Login from './pages/Login';
import Legal from './pages/Legal';
import { ErrorBoundary } from './components/ErrorBoundary';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Studio = lazy(() => import('./pages/Studio'));
const Ocr = lazy(() => import('./pages/Ocr'));
const Aging = lazy(() => import('./pages/Aging'));
const Worklist = lazy(() => import('./pages/Worklist'));
const Clients = lazy(() => import('./pages/Clients'));
const ClientDetail = lazy(() => import('./pages/ClientDetail'));
const Allocation = lazy(() => import('./pages/Allocation'));
const ImportPage = lazy(() => import('./pages/Import'));
const Productivity = lazy(() => import('./pages/Productivity'));
const Qa = lazy(() => import('./pages/Qa'));
const Missing = lazy(() => import('./pages/Missing'));
const Radar = lazy(() => import('./pages/Radar'));
const Intelligence = lazy(() => import('./pages/Intelligence'));
const Tools = lazy(() => import('./pages/Tools'));
const Account = lazy(() => import('./pages/Account'));
const Help = lazy(() => import('./pages/Help'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Appeals = lazy(() => import('./pages/Appeals'));
const Underpay = lazy(() => import('./pages/Underpay'));
const Scorecards = lazy(() => import('./pages/Scorecards'));
const ClientHealthPage = lazy(() => import('./pages/ClientHealth'));
const Edi = lazy(() => import('./pages/Edi'));
const Huddle = lazy(() => import('./pages/Huddle'));
const Faxes = lazy(() => import('./pages/Faxes'));
const BulkHistory = lazy(() => import('./pages/BulkHistory'));
const Unresolved = lazy(() => import('./pages/Unresolved'));
const Closed = lazy(() => import('./pages/Closed'));
const Admin = lazy(() => import('./pages/Admin'));
const ImportHistory = lazy(() => import('./pages/ImportHistory'));
const Exceptions = lazy(() => import('./pages/Exceptions'));
const Rules = lazy(() => import('./pages/Rules'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Library = lazy(() => import('./pages/Library'));
const Reports = lazy(() => import('./pages/Reports'));
const Insights = lazy(() => import('./pages/Insights'));
const PayersList = lazy(() => import('./pages/Payers').then((m) => ({ default: m.PayersList })));
const PayerDetail = lazy(() => import('./pages/Payers').then((m) => ({ default: m.PayerDetail })));
const MyDay = lazy(() => import('./pages/MyDay'));
const Requests = lazy(() => import('./pages/Requests'));
const Outreach = lazy(() => import('./pages/Outreach'));
const Pivot = lazy(() => import('./pages/Pivot'));
const Knowledge = lazy(() => import('./pages/Knowledge'));
const EraImport = lazy(() => import('./pages/EraImport'));
const PortalOverview = lazy(() => import('./pages/ClientPortal').then((m) => ({ default: m.PortalOverview })));
const PortalClaims = lazy(() => import('./pages/ClientPortal').then((m) => ({ default: m.PortalClaims })));
const PortalReport = lazy(() => import('./pages/ClientPortal').then((m) => ({ default: m.PortalReport })));

function Guard({ cap, children }: { cap: string | string[]; children: ReactNode }) {
  const caps = Array.isArray(cap) ? cap : [cap]; const ok = useStore((st) => caps.every((c) => st.has(c))); const cap0 = caps.find((c) => !useStore.getState().has(c)) || caps[0]; const roleName = useStore((st) => st.me()?.role);
  if (ok) return <>{children}</>;
  return <div className="panel p-10 max-w-xl mx-auto mt-16 text-center"><h2 className="display text-2xl">You don’t have access to this page</h2><p className="muted text-sm mt-2">Your role ({roleName}) doesn’t include the “{cap0.replace(/_/g, ' ')}” permission. Ask an admin to change it in Admin → Permissions.</p><a className="btn btn-primary mt-5" href="/">Go to home</a></div>;
}

export default function App() {
  const { ready, meId, boot, dark, error, needsProfile } = useStore();
  const role = useStore((s) => s.me()?.role); const loc = useLocation();
  useEffect(() => { boot(); }, [boot]);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  const accent = useStore((s) => s.settings.branding?.accent);
  useEffect(() => { applyAccent(accent); }, [accent]);

  if (!ready) return (
    <div className="h-full flex" role="status" aria-label="Loading ClaimsIQ">
      <div className="w-[252px] shrink-0 p-4 space-y-3 border-r hair hidden md:block"><Skeleton className="h-8 w-32" />{Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-7" />)}</div>
      <div className="flex-1 p-8 space-y-6"><Skeleton className="h-8 w-64" /><SkeletonCards /><div className="panel"><SkeletonRows rows={7} cols={6} /></div></div>
    </div>
  );
  if (error) return <div className="h-full flex items-center justify-center p-8"><div className="panel p-6 max-w-lg"><h2 className="font-bold mb-2">Couldn’t reach the database</h2><p className="text-sm muted">{error}</p><p className="text-sm muted mt-3">Check that you ran <code>supabase/migrations/0001_init.sql</code> and that the env vars are set.</p></div></div>;
  if (loc.pathname.startsWith('/legal/')) return <Routes><Route path="/legal/:doc" element={<Legal />} /></Routes>;
  if (!meId || needsProfile) return <><Login /><Toaster /></>;
  if (role === 'client') return (
    <>
      <Layout><ErrorBoundary resetKey={loc.pathname}><Suspense fallback={<div className="space-y-4" role="status" aria-label="Loading page"><Skeleton className="h-8 w-56" /><SkeletonCards /><div className="panel"><SkeletonRows rows={8} cols={6} /></div></div>}><Routes>
        <Route path="/portal" element={<PortalOverview />} /><Route path="/portal/claims" element={<PortalClaims />} /><Route path="/portal/report" element={<PortalReport />} /><Route path="/requests" element={<Requests />} />
        <Route path="/account" element={<Account />} /><Route path="/help" element={<Help />} /><Route path="/legal/:doc" element={<Legal />} />
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes></Suspense></ErrorBoundary></Layout><Toaster /><HoverHelp /><A11yFix />
    </>
  );
  return (
    <>
      <Layout>
        <ErrorBoundary resetKey={loc.pathname}><Suspense fallback={<div className="space-y-4" role="status" aria-label="Loading page"><Skeleton className="h-8 w-56" /><SkeletonCards /><div className="panel"><SkeletonRows rows={8} cols={6} /></div></div>}><Routes>
          <Route path="/" element={homeFor(role) === '/me' || homeFor(role) === '/qa' ? <Navigate to={homeFor(role)} replace /> : <Dashboard />} />
          <Route path="/me" element={<MyDay />} />
          <Route path="/work" element={<Navigate to="/worklist?mode=focus" replace />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/payers" element={<PayersList />} />
          <Route path="/payers/:name" element={<PayerDetail />} /><Route path="/outreach" element={<Outreach />} /><Route path="/pivot" element={<Pivot />} /><Route path="/knowledge" element={<Knowledge />} /><Route path="/era" element={<Guard cap={['access_control', 'import']}><EraImport /></Guard>} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/portal" element={<PortalOverview />} /><Route path="/portal/claims" element={<PortalClaims />} /><Route path="/portal/report" element={<PortalReport />} />
          <Route path="/aging" element={<Aging />} />
          <Route path="/worklist" element={<Worklist />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/allocation" element={<Guard cap={['access_control', 'assign']}><Allocation /></Guard>} />
          <Route path="/import" element={<Guard cap={['access_control', 'import']}><ImportPage /></Guard>} />
          <Route path="/productivity" element={<Productivity />} />
          <Route path="/qa" element={<Qa />} />
          <Route path="/radar" element={<Radar />} />
          <Route path="/intelligence" element={<Intelligence />} /><Route path="/tools" element={<Tools />} /><Route path="/ocr" element={<Ocr />} /><Route path="/studio" element={<Studio />} />
          <Route path="/appeals" element={<Appeals />} />
          <Route path="/unresolved" element={<Unresolved />} />
          <Route path="/health" element={<Guard cap={['view_money']}><ClientHealthPage /></Guard>} />
          <Route path="/edi" element={<Guard cap={['work_claims']}><Edi /></Guard>} />
          <Route path="/huddle" element={<Guard cap={['view_money']}><Huddle /></Guard>} />
          <Route path="/faxes" element={<Guard cap={['work_claims']}><Faxes /></Guard>} />
          <Route path="/bulk" element={<Guard cap={['access_control', 'bulk_edit']}><BulkHistory /></Guard>} />
          <Route path="/scorecards" element={<Scorecards />} />
          <Route path="/underpay" element={<Underpay />} />
          <Route path="/missing" element={<Guard cap={['access_control', 'resolve_missing']}><Missing /></Guard>} />
          <Route path="/closed" element={<Closed />} />
          <Route path="/audit" element={<Navigate to="/qa" replace />} />
          <Route path="/imports" element={<Guard cap={['access_control', 'import']}><ImportHistory /></Guard>} />
          <Route path="/exceptions" element={<Guard cap={['access_control', 'run_rules']}><Exceptions /></Guard>} />
          <Route path="/rules" element={<Guard cap={['access_control', 'run_rules']}><Rules /></Guard>} />
          <Route path="/audit-log" element={<Guard cap={['access_control', 'view_audit_log']}><AuditLog /></Guard>} />
          <Route path="/library" element={<Library />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/admin/*" element={<Guard cap="access_admin"><Admin /></Guard>} />
          <Route path="/account" element={<Account />} /><Route path="/help" element={<Help />} /><Route path="/legal/:doc" element={<Legal />} />
          <Route path="*" element={<NotFound />} />
        </Routes></Suspense></ErrorBoundary>
      </Layout>
      <Toaster /><HoverHelp /><A11yFix />
    </>
  );
}
