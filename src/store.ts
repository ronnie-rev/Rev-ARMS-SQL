import { create } from 'zustand';
import { portalPerms, practiceIds } from './lib/types';
import type { Era, EraPlan } from './lib/engine/era835';
import { autoChecks, resolveQaConfig, scoreReview } from './lib/engine/qascore';
import { planSample } from './lib/engine/qasample';
import { splitDenials } from './lib/kb';
import type { Activity, AllocationRule, AutoRule, Notification, Claim, Client, ClientRequest, Recovery, ReportSchedule, RuleRun, ConfigOption, ImportBatch, ImportTemplate, Invite, Note, Profile, Provider, Role, ClaimSnapshot, QaConfig, QaReview, PayerLimit, FeeSchedule, FeeRate, Appeal, PayerForm, BulkOp, PayerAlert, FaxLog, TableName, UserItem, UserItemKind, WorkLog } from './lib/types';
import type { DB, Row } from './lib/db/types';
import { allocateUids, backfillUids, clientTag, maxSeq } from './lib/engine/uid';
import { resolveSettings } from './lib/engine/settings';
import { applyDecision, validateDecision, type Decision, type Skipped } from './lib/engine/resolution';
import { canConfigure, isLead, isMgmt, isQaRole as isQa, normRole, rlsClass } from './lib/roles';
import { createLocalDB, localReset, seedSize, SEED_KEY } from './lib/db/local';
import { toast } from './components/ui';
import { wrapDb } from './lib/savestate';
import { createSupabaseDB, hasSupabase, supabase } from './lib/db/supabase';
import { buildSeed } from './lib/seed';
import { defaultConfig, STARTER_VERSION } from './lib/defaults';
import { SNAP_FIELDS, type Plan } from './lib/engine/reconcile';
import { buildRecoveries } from './lib/engine/attribution';
import { planRules } from './lib/engine/rules';
import { batchSummary } from './lib/engine/summary';
import type { ImportSettings } from './lib/engine/settings';
import { can as canCap, mergePerms, type Perms } from './lib/engine/permissions';
import { checkTransition, deriveLifecycle, lifecycleDefs, lifecycleOf, type TransitionInput } from './lib/engine/lifecycle';
import { CHECKS, runChecks, syncFlags, CHK, type Violation } from './lib/engine/checks';
import { carcMap, type Carc } from './lib/engine/carc';
import { defaultTemplates } from './lib/pms';
import { ageDays, bucketFor, bucketsFrom, fmtDate, nowISO, todayISO, uid } from './lib/utils';
import { resolveFaxCfg } from './lib/engine/fax';
import { buildLimitIndex, escalationPlan, radarItems, resolveLimitsCfg } from './lib/engine/limits';
import { buildPayerIndex } from './lib/engine/payers';
import { unresolvedSweep } from './lib/engine/sweep';
import { resolveIntelCfg } from './lib/engine/intelligence';
import type { ClaimSummary } from './lib/engine/summary_server';
import { describeAction, planUndo, previewBulk, resolveBulkCfg, type BulkAction } from './lib/engine/bulk';
import { behaviourAlerts, payerScorecards, resolveScoreCfg } from './lib/engine/scorecard';
import { buildRatesIndex, recalcExpected, resolveReimbCfg } from './lib/engine/reimb';
import { format } from 'date-fns';

const ME_KEY = 'arms:me';
let db: DB;
export const getDb = () => db;

interface State {
  ready: boolean; error: string | null; mode: 'local' | 'supabase'; meId: string | null; needsProfile: boolean;
  profiles: Profile[]; clients: Client[]; providers: Provider[]; config: ConfigOption[]; settings: Record<string, any>;
  claims: Claim[]; workLog: WorkLog[]; notes: Note[]; activity: Activity[]; templates: ImportTemplate[]; batches: ImportBatch[]; rules: AllocationRule[]; requests: ClientRequest[]; invites: Invite[]; autoRules: AutoRule[]; ruleRuns: RuleRun[]; recoveries: Recovery[]; schedules: ReportSchedule[]; notifications: Notification[]; userItems: UserItem[];
  openClaimId: string | null; openClaim(id: string | null): void;
  dark: boolean; clientFilter: string; // single selected client id, or '' when none/several (compat)
  clientScope: string[]; pinnedClients: string[]; setClientScope(ids: string[]): void; togglePin(id: string): void; myClientIds(): string[]; inScope(id: string): boolean;
  boot(): Promise<void>; login(id: string): void; logout(): Promise<void>; toggleDark(): void; setClientFilter(id: string): void;
  resetDemo(size?: 'demo' | 'large'): Promise<void>; reload(): Promise<void>;
  me(): Profile | null;
  can(...roles: string[]): boolean;
  perms(): Perms; has(cap: string): boolean; carcMap(): Map<string, Carc>;
  notify(n: { title: string; body?: string; link?: string; severity?: 'info' | 'warn' | 'high'; user_id?: string | null; role?: string | null }): Promise<void>;
  markRead(ids: string[]): Promise<void>;
  syncChecks(opts?: { clientId?: string }): Promise<{ flagged: number; cleared: number; violations: Violation[] }>;
  runRadar(): Promise<{ escalated: number; notified: number }>;
  /** Server totals for the whole workspace (always current); `large` is set when open claims exceed the threshold and only the selected clients' claims are loaded. */
  sweepNudge(): Promise<number>;
  /** set when the user arrives from a password-reset or invite email and must choose a password */ authFlow: null | 'reset' | 'invite';
  summary: ClaimSummary | null; large: { open: number; threshold: number; loaded: string[] } | null; refreshSummary(): Promise<void>; ensureClaims(clientIds: string[]): Promise<void>;
  /** Detect payer behaviour changes and persist new ones (deduped per payer/CPT/kind/month). */
  syncPayerAlerts(): Promise<number>;
  setAlertStatus(ids: string[], status: PayerAlert['status']): Promise<void>;
  applyBulk(ids: string[], action: BulkAction, reason?: string): Promise<{ opId: string; changed: number; blocked: number }>;
  undoBulk(opId: string): Promise<{ reverted: number; conflicts: number }>;
  /** Send a prepared fax PDF through the server function (or simulate in demo mode) and record it. */
  listFeedback(): Promise<any[]>; setFeedbackStatus(id: string, status: string): Promise<void>;
  submitFeedback(o: { kind: string; body: string; route: string }): Promise<void>;
  sendFaxDoc(o: { to: string; subject: string; pdfBase64: string; pages: number; claimId: string | null; appealId: string | null; clientId: string | null }): Promise<FaxLog>;
  createAppeal(a: { claim_id: string; kind: Appeal['kind']; level: number; template?: string | null; form_id?: string | null; due_on?: string | null; reason?: string | null; amount_disputed?: number | null; letter?: Record<string, any> }): Promise<Appeal>;
  updateAppeal(id: string, patch: Partial<Appeal>): Promise<void>;
  loadFormFile(formId: string): Promise<string | null>; saveFormFile(form: PayerForm, b64: string): Promise<void>;
  feeRates: FeeRate[]; ratesLoaded: boolean; loadRates(force?: boolean): Promise<void>; saveRates(scheduleId: string, rows: { cpt: string; modifier?: string; amount: number }[], replace?: boolean): Promise<number>;
  /** Recompute the Expected column for all open claims (or one client) from fee schedules / payer % / client GCR. */
  recalcExpected(opts?: { clientId?: string }): Promise<{ changed: number; gaps: Record<string, number> }>;
  // generic admin ops
  save(table: TableName, rows: Row[], onConflict?: string): Promise<void>;
  del(table: TableName, ids: string[]): Promise<void>;
  setSetting(key: string, value: Record<string, any>): Promise<void>;
  // domain ops
  logActivity(claimId: string | string[], kind: string, summary: string, meta?: Record<string, any>): Promise<void>;
  patchClaims(ids: string[], patch: Partial<Claim>, summary?: string, kind?: string): Promise<void>;
  assign(ids: string[], userId: string | null): Promise<void>;
  addNote(claimId: string, body: string, pinned?: boolean, clientVisible?: boolean): Promise<void>;
  applyToSimilar(claimIds: string[], t: Partial<WorkLog> & { comment: string }): Promise<void>;
  raiseRequest(r: { kind: ClientRequest['kind']; body: string; claim_id?: string | null; client_id?: string | null }): Promise<void>;
  answerRequest(id: string, response: string, status?: ClientRequest['status']): Promise<void>;
  createApproval(a: { claim_id: string; amount: number; body: string }): Promise<void>;
  decideApproval(id: string, decision: 'approved' | 'denied', note?: string): Promise<void>;
  setLifecycle(claimId: string, to: string, input: TransitionInput): Promise<{ ok: boolean; message?: string }>;
  snooze(claimIds: string[], until: string | null, reason: string): Promise<void>;
  snapshots: ClaimSnapshot[]; snapshotsLoaded: boolean; loadSnapshots(force?: boolean): Promise<void>;
  qaReviews: QaReview[]; qaConfig: QaConfig;
  payerLimits: PayerLimit[]; feeSchedules: FeeSchedule[]; appeals: Appeal[]; payerForms: PayerForm[]; bulkOps: BulkOp[]; payerAlerts: PayerAlert[]; faxLog: FaxLog[];
  saveQaConfig(cfg: QaConfig): Promise<void>;
  generateQaSample(o: { from: string; to: string; only?: string[] }): Promise<{ created: number; calibration: number; perAnalyst: { name: string; picked: number; eligible: number }[] }>;
  startQaReview(id: string): Promise<{ ok: boolean; message?: string }>;
  submitQaReview(id: string, r: { answers: QaReview['answers']; errors: QaReview['errors']; comments: string; coaching: string; seconds: number }): Promise<QaReview | null>;
  respondQaReview(id: string, action: 'ack' | 'dispute', note?: string): Promise<void>;
  resolveQaDispute(id: string, o: { outcome: 'upheld' | 'overturned'; answers?: QaReview['answers']; note: string }): Promise<void>;
  applyEra(a: { era: Era; plan: EraPlan; fileName: string }): Promise<{ posted: number; recoveries: number; denied: number }>;
  saveItem(kind: UserItemKind, body: Record<string, any>, o?: { id?: string; name?: string; shared?: boolean; client_id?: string | null }): Promise<UserItem>;
  delItem(id: string): Promise<void>;
  recordTouch(claimId: string, t: Partial<WorkLog> & { comment: string }): Promise<void>;
  audit(logId: string, status: 'pass' | 'fail' | 'na', remarks: string): Promise<void>;
  // engine
  find(table: TableName, where?: Record<string, any>, opts?: { order?: string; desc?: boolean; limit?: number }): Promise<Record<string, any>[]>;
  audit_(kind: string, summary: string, meta?: Record<string, any>, entity?: string, entityId?: string): Promise<void>;
  applyImport(a: { plan: Plan; client: Client; settings: ImportSettings; mode: 'snapshot' | 'merge'; fileName: string; fileHash: string | null; asOf: string | null; templateName: string; totalRows: number; runRules: boolean; guardrailsAck: string[] }): Promise<{ batchId: string; recoveries: number; ruleChanges: number }>;
  rollbackBatch(batchId: string): Promise<{ restored: number; removed: number; kept: number }>;
  runRules(trigger: AutoRule['trigger'] | 'any', opts?: { claimIds?: string[]; batchId?: string; dry?: boolean; ruleIds?: string[]; clientId?: string }): Promise<{ runs: { rule: AutoRule; matched: number; changed: number; sample: string[] }[]; changed: number }>;
  mergeClaims(keepId: string, dropId: string): Promise<void>;
  setResolution(claimId: string, resolution: 'paid' | 'adjusted' | 'patient'): Promise<void>;
  resolveMissing(decisions: Decision[]): Promise<{ done: number; skipped: Skipped[] }>;
  reopenClaim(claimId: string, reason: string): Promise<{ ok: boolean; message?: string }>;
  clearFlag(ids: string[], flag: string): Promise<void>;
}

/** Open-claim count above which only the selected clients' claims are loaded (override: localStorage arms:scale:threshold). */
const scaleThreshold = () => { try { const v = Number(localStorage.getItem('arms:scale:threshold')); return v > 0 ? v : 25000; } catch { return 25000; } };
const ROLE_META_KEYS: Record<string, 1> = { sr_mgmt: 1, sys_admin: 1, qa_ext: 1, manager: 1, tl_prod_qa: 1, tl_qa: 1, sme_prod_qa: 1, sme_qa: 1, user_prod_qa: 1, user_prod: 1, viewer: 1, client: 1 };
const TABLES: [TableName, keyof State][] = [
  ['profiles', 'profiles'], ['clients', 'clients'], ['providers', 'providers'], ['config_options', 'config'], ['claims', 'claims'],
  ['work_log', 'workLog'], ['claim_notes', 'notes'], ['claim_activity', 'activity'], ['import_templates', 'templates'],
  ['import_batches', 'batches'], ['allocation_rules', 'rules'], ['client_requests', 'requests'], ['invites', 'invites'],
  ['automation_rules', 'autoRules'], ['rule_runs', 'ruleRuns'], ['recoveries', 'recoveries'], ['report_schedules', 'schedules'], ['notifications', 'notifications'], ['user_items', 'userItems'], ['qa_reviews', 'qaReviews'],
  ['payer_limits', 'payerLimits'], ['fee_schedules', 'feeSchedules'], ['appeals', 'appeals'], ['payer_forms', 'payerForms'], ['bulk_ops', 'bulkOps'], ['payer_alerts', 'payerAlerts'], ['fax_log', 'faxLog'],
];
/** tables added by later migrations: a workspace that has not applied them yet must still load */
const OPTIONAL = new Set<TableName>(['qa_reviews', 'payer_limits', 'fee_schedules', 'appeals', 'payer_forms', 'bulk_ops', 'payer_alerts', 'fax_log']);
const AUDITED = new Set<TableName>(['payer_limits', 'fee_schedules', 'payer_forms', 'config_options', 'clients', 'providers', 'profiles', 'import_templates', 'invites', 'automation_rules', 'report_schedules', 'allocation_rules']);
const STATE_KEY: Record<string, keyof State> = Object.fromEntries(TABLES);

const viewSeen = new Map<string, number>();
const inScopeTouch = (st: { clientScope: string[] }, w: { client_id: string }) => !st.clientScope.length || st.clientScope.includes(w.client_id);
let seeding = false;
let unsub: (() => void) | null = null;
const dark0 = (() => { try { return localStorage.getItem('arms:dark') === '1'; } catch { return false; } })();

export const useStore = create<State>((set, get) => ({
  ready: false, error: null, mode: hasSupabase ? 'supabase' : 'local', meId: null, needsProfile: false,
  profiles: [], clients: [], providers: [], config: [], settings: {}, claims: [], workLog: [], notes: [], activity: [], templates: [], batches: [], rules: [], requests: [], invites: [], autoRules: [], ruleRuns: [], recoveries: [], schedules: [], notifications: [], userItems: [], qaReviews: [], qaConfig: resolveQaConfig(null), payerLimits: [], feeSchedules: [], appeals: [], payerForms: [], bulkOps: [], payerAlerts: [], faxLog: [], snapshots: [], snapshotsLoaded: false, feeRates: [], ratesLoaded: false, summary: null, large: null, authFlow: null,
  openClaimId: null,
  openClaim(id) {
    set({ openClaimId: id });
    if (id && get().settings.security?.logViews) { const k = id + (get().meId || ''); const t = viewSeen.get(k) || 0; if (Date.now() - t > 600000) { viewSeen.set(k, Date.now()); const c = get().claims.find((x) => x.id === id); void get().audit_('view', `Opened claim ${c?.claim_no ?? id}`, { claim: id }, 'claims', id); } }
  },
  dark: dark0, clientFilter: '', clientScope: [], pinnedClients: [],
  setClientScope(ids) { set({ clientScope: ids, clientFilter: ids.length === 1 ? ids[0] : '' }); if (get().large && ids.length) void get().ensureClaims(ids); try { localStorage.setItem('arms:scope:' + (get().meId || ''), JSON.stringify(ids)); } catch { /* ignore */ } },
  togglePin(id) { const cur = get().pinnedClients; const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]; set({ pinnedClients: next }); try { localStorage.setItem('arms:pins:' + (get().meId || ''), JSON.stringify(next)); } catch { /* ignore */ } },
  myClientIds() { const me = get().me(); return [...new Set([...(me?.client_ids || []), ...get().pinnedClients])]; },
  inScope(id) { const s = get().clientScope; return s.length === 0 || s.includes(id); },

  me: () => get().profiles.find((p) => p.id === get().meId) || null,
  // legacy coarse check (admin | supervisor | specialist | auditor | viewer): prefer has(capability)
  can: (...roles: string[]) => { const m = get().me(); return !!m && (roles.includes(m.role) || roles.includes(rlsClass(m.role)) || (roles.includes('auditor') && isQa(m.role))); },
  perms: () => mergePerms(get().settings.permissions),
  has: (cap) => canCap(mergePerms(get().settings.permissions), get().me()?.role, cap),
  carcMap: () => carcMap(get().config.filter((o) => o.category === 'carc' && o.active).map((o) => ({ code: o.value, meaning: o.meta.meaning || '', rca: o.meta.rca || '', rca_detail: o.meta.rca_detail, action: o.meta.action || '', family: o.meta.family || 'Custom' }))),
  async notify(n) { const row: Notification = { id: uid(), user_id: n.user_id ?? null, role: n.role ?? null, title: n.title, body: n.body ?? null, link: n.link ?? null, severity: n.severity ?? 'info', read_by: [], created_at: nowISO() }; try { await db.upsert('notifications', [row]); set((s) => ({ notifications: [...s.notifications, row] })); } catch { /* non-critical */ } },
  async markRead(ids) { const me = get().meId; if (!me) return; const rows = get().notifications.filter((x) => ids.includes(x.id) && !x.read_by.includes(me)).map((x) => ({ ...x, read_by: [...x.read_by, me] })); if (!rows.length) return; await db.upsert('notifications', rows); set((s) => ({ notifications: s.notifications.map((x) => rows.find((r) => r.id === x.id) || x) })); },
  async syncChecks(opts = {}) {
    const st = get(); const open = st.claims.filter((c) => !c.closed_at && (!opts.clientId || c.client_id === opts.clientId)); const viol = computeViolations(st, open);
    const by = new Map<string, Violation[]>(); viol.forEach((v) => by.set(v.claim_id, [...(by.get(v.claim_id) || []), v]));
    const changed: Claim[] = []; let flagged = 0, cleared = 0;
    for (const c of open) { const next = syncFlags(c.flags, by.get(c.id) || []); if (next.join() !== (c.flags || []).join()) { const was = (c.flags || []).filter((f) => f.startsWith(CHK)).length, now = next.filter((f) => f.startsWith(CHK)).length; if (now > was) flagged++; else cleared++; changed.push({ ...c, flags: next, updated_at: nowISO() }); } }
    for (let i = 0; i < changed.length; i += 400) await get().save('claims', changed.slice(i, i + 400) as any);
    void get().audit_('checks', `Quality checks synced: ${changed.length} claims updated (${viol.length} violations)`, { flagged, cleared }, 'claims');
    return { flagged, cleared, violations: viol };
  },

  async boot() {
    try {
      if (hasSupabase && supabase) {
        db = wrapDb(createSupabaseDB(supabase));
        try { const h = new URLSearchParams(location.hash.replace(/^#/, '')); const t = h.get('type'); if (t === 'invite') set({ authFlow: 'invite' }); else if (t === 'recovery') set({ authFlow: 'reset' }); supabase.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') set({ authFlow: 'reset' }); if (ev === 'SIGNED_OUT') set({ authFlow: null }); }); } catch { /* ignore */ }
        const { data } = await supabase.auth.getSession();
        if (!data.session) { set({ ready: true, meId: null }); return; }
        if (get().authFlow) { set({ ready: true, meId: data.session.user.id, needsProfile: true }); return; }
        set({ meId: data.session.user.id });
      } else {
        db = wrapDb(await createLocalDB((() => { const z = seedSize(); if (z === 'large') { try { localStorage.setItem('arms:needsync', '1'); } catch { /* ignore */ } } return buildSeed(z) as any; }) as any));
        try { set({ meId: localStorage.getItem(ME_KEY) }); } catch { /* ignore */ }
      }
      if (get().meId || !hasSupabase) await get().reload();
      try { if (!hasSupabase && localStorage.getItem('arms:needsync')) { localStorage.removeItem('arms:needsync'); await get().syncChecks(); } } catch { /* non-critical */ }
      set({ ready: true });
    } catch (e: any) { set({ ready: true, error: e.message || String(e) }); }
  },

  async reload() {
    if (!db) return;
    // Large workspaces (Supabase): a cheap server summary decides whether to load every claim or only the selected clients' claims.
    let large: { open: number; threshold: number; loaded: string[] } | null = null; let summary: ClaimSummary | null = null; let scopeIds: string[] = [];
    if (db.mode === 'supabase' && db.rpc) {
      try {
        summary = (await db.rpc('claim_summary', { p_clients: null, p_today: todayISO(), p_buckets: [] })) as ClaimSummary; const thr = scaleThreshold();
        if (summary.open_claims > thr) {
          let saved: string[] = []; try { saved = JSON.parse(localStorage.getItem('arms:scope:' + get().meId) || '[]'); } catch { /* ignore */ }
          if (!saved.length) { let n = 0; for (const c of summary.by_client) { if (n + c.n > thr && scopeIds.length) break; scopeIds.push(c.client_id); n += c.n; } } else scopeIds = saved;
          large = { open: summary.open_claims, threshold: thr, loaded: scopeIds };
        }
      } catch { /* function not installed yet (migration 0016) — load everything as before */ }
    }
    const results = await Promise.all([...TABLES.map(([t]) => (t === 'claims' && large ? Promise.all(scopeIds.map((id) => db.find('claims', { client_id: id }))).then((x) => x.flat()) : OPTIONAL.has(t) ? db.list(t).catch(() => []) : db.list(t))), db.list('app_settings')]);
    const patch: Record<string, any> = {};
    TABLES.forEach(([, k], i) => { patch[k as string] = results[i]; });
    patch.settings = Object.fromEntries(results[results.length - 1].map((r: any) => [r.key, r.value]));
    try { const qc = (await db.list('qa_config')) as any[]; patch.qaConfig = resolveQaConfig(qc.find((x) => x.id === 'main')?.value); } catch { patch.qaConfig = resolveQaConfig(null); }
    if (db.mode === 'local') { const need = backfillUids(patch.claims as Claim[], patch.clients as Client[]); if (need.length) { const m = new Map(need.map((c) => [c.id, c])); patch.claims = (patch.claims as Claim[]).map((c) => m.get(c.id) || c); for (let i = 0; i < need.length; i += 1000) await db.upsert('claims', need.slice(i, i + 1000) as any); } }   // demo data from before claim UIDs existed
    patch.profiles = (patch.profiles as Profile[]).map((p) => (p.role in ROLE_META_KEYS ? p : { ...p, role: normRole(p.role) }));   // roles saved by earlier versions
    const me = (patch.profiles as Profile[]).find((p) => p.id === get().meId);
    patch.needsProfile = !me; patch.large = large; patch.summary = summary;
    if (me?.role === 'client' && db.mode === 'local') {
      // Demo mode mirrors what Postgres RLS enforces in production: a client sees only their own practice.
      const cids = new Set(practiceIds(me)); const okClaims = new Set((patch.claims as Claim[]).filter((c) => cids.has(c.client_id)).map((c) => c.id));
      patch.claims = (patch.claims as Claim[]).filter((c) => okClaims.has(c.id)); patch.clients = (patch.clients as Client[]).filter((c) => cids.has(c.id));
      patch.providers = (patch.providers as Provider[]).filter((c) => cids.has(c.client_id)); patch.workLog = []; patch.activity = []; patch.templates = []; patch.rules = [];
      patch.notes = (patch.notes as Note[]).filter((n) => n.client_visible && okClaims.has(n.claim_id)); patch.batches = (patch.batches as ImportBatch[]).filter((b) => cids.has(b.client_id as string));
      patch.requests = (patch.requests as ClientRequest[]).filter((q) => cids.has(q.client_id)); patch.profiles = [me]; patch.userItems = [];
      patch.autoRules = []; patch.ruleRuns = []; patch.schedules = []; patch.recoveries = (patch.recoveries as Recovery[]).filter((r) => cids.has(r.client_id)).map((r) => ({ ...r, user_id: null, user_name: null }));
    }
    if (me && me.role !== 'client' && me.client_scope === 'assigned' && db.mode === 'local') {
      // Demo mode mirrors migration 0022: a restricted staff user only sees their assigned practices.
      const cids = new Set(me.client_ids || []); const okC = new Set((patch.claims as Claim[]).filter((c) => cids.has(c.client_id)).map((c) => c.id)); const byC = <T extends { client_id?: string | null }>(a: T[]) => a.filter((x) => !x.client_id || cids.has(x.client_id));
      patch.claims = (patch.claims as Claim[]).filter((c) => okC.has(c.id)); patch.clients = (patch.clients as Client[]).filter((c) => cids.has(c.id)); patch.providers = byC(patch.providers as Provider[]);
      patch.workLog = byC(patch.workLog as WorkLog[]); patch.notes = (patch.notes as Note[]).filter((n) => okC.has(n.claim_id)); patch.activity = (patch.activity as Activity[]).filter((a) => okC.has(a.claim_id)); patch.batches = byC(patch.batches as ImportBatch[]);
      patch.requests = byC(patch.requests as ClientRequest[]); patch.recoveries = byC(patch.recoveries as Recovery[]); patch.appeals = byC(patch.appeals as any[]); patch.faxLog = byC(patch.faxLog as any[]); patch.payerLimits = byC(patch.payerLimits as any[]); patch.feeSchedules = byC(patch.feeSchedules as any[]); patch.bulkOps = byC((patch.bulkOps as any[]) || []);
    }
    if (me?.role === 'client' && practiceIds(me).length) { const ids = practiceIds(me); patch.clientFilter = ids.length === 1 ? ids[0] : ''; patch.clientScope = ids; }
    else if (me) { try { const sc = JSON.parse(localStorage.getItem('arms:scope:' + me.id) || '[]'); patch.clientScope = Array.isArray(sc) ? sc : []; patch.clientFilter = patch.clientScope.length === 1 ? patch.clientScope[0] : ''; patch.pinnedClients = JSON.parse(localStorage.getItem('arms:pins:' + me.id) || '[]'); } catch { /* ignore */ } }
    (patch as any).dailyDue = !!me && (isLead(me.role) || isMgmt(me.role)) && (patch.settings as any).automation?.lastDaily !== todayISO();
    set(patch);
    if ((patch as any).dailyDue && (patch.autoRules as AutoRule[]).some((r) => r.enabled && r.trigger === 'daily')) { try { await get().syncChecks(); await get().runRules('daily'); await get().runRadar(); await get().recalcExpected(); await get().syncPayerAlerts(); await get().sweepNudge(); await get().setSetting('automation', { ...((patch.settings as any).automation || {}), lastDaily: todayISO() }); } catch { /* retry next load */ } }
    // first run on a fresh Supabase project: the first admin seeds the default taxonomy + PMS templates.
    // Idempotent: only adds items that do not exist yet, guarded against concurrent runs (e.g. StrictMode double-boot).
    if (db.mode === 'supabase' && canConfigure(me?.role) && !seeding) {
      seeding = true;
      try {
        const have = new Set((patch.config as ConfigOption[]).map((o) => `${o.category}|${o.parent ?? ''}|${o.value}`));
        const add = defaultConfig().filter((o) => !have.has(`${o.category}|${o.parent ?? ''}|${o.value}`));
        if (add.length && !(patch.config as ConfigOption[]).length) { await get().save('config_options', add as any); }
        const haveT = new Set((patch.templates as ImportTemplate[]).map((t) => t.name));
        const tp = defaultTemplates().filter((t) => !haveT.has(t.name));
        if (tp.length && !(patch.templates as ImportTemplate[]).length) await get().save('import_templates', tp as any);
      } catch (e) { console.warn('Starter content not loaded (use Admin → Backup → Load missing starter content):', e); }
      finally { seeding = false; }
    }
    // versioned top-up: when the starter pack grows, admins get the missing items once (never overwrites or re-adds deleted-and-edited ones twice)
    if (canConfigure(me?.role) && ((patch.settings as any).starter?.v ?? 0) < STARTER_VERSION && (patch.config as ConfigOption[]).length && !seeding) {
      seeding = true;
      try {
        const have = new Set((patch.config as ConfigOption[]).map((o) => `${o.category}|${o.parent ?? ''}|${o.value}`));
        const add = defaultConfig().filter((o) => ['playbook', 'snippet', 'letter', 'carc', 'kb_article'].includes(o.category) && !have.has(`${o.category}|${o.parent ?? ''}|${o.value}`));
        let more: ConfigOption[] = [];
        try { const [{ loadKb }, { kbCarcRows }] = await Promise.all([import('./lib/kb'), import('./lib/kb/seedcarc')]); const kb = await loadKb(); const hv = new Set([...(patch.config as ConfigOption[]), ...add].filter((o) => o.category === 'carc').map((o) => o.value)); more = kbCarcRows(kb, hv, hv.size).map((o) => ({ ...o, id: uid() })) as ConfigOption[]; } catch { /* reference dictionary optional */ }
        const all = [...add, ...more];
        for (let i = 0; i < all.length; i += 400) await get().save('config_options', all.slice(i, i + 400) as any);
        if (all.length) patch.config = [...(patch.config as ConfigOption[]), ...all];
        const starter = { v: STARTER_VERSION, at: nowISO(), added: add.length + more.length }; await get().setSetting('starter', starter); patch.settings = { ...(patch.settings as any), starter };
      } catch (e) { console.warn('Starter top-up skipped', e); } finally { seeding = false; }
    }
    try { unsub?.(); } catch { /* ignore */ }
    try { unsub = db.subscribe?.((table, evt, row) => {
      const key = STATE_KEY[table] as string; if (!key) return;
      set((s: any) => {
        const arr: any[] = s[key];
        if (evt === 'DELETE') return { [key]: arr.filter((x) => x.id !== row.id) };
        const i = arr.findIndex((x) => x.id === row.id);
        if (table === 'claims' && evt === 'UPDATE' && i >= 0 && row.updated_by && row.updated_by !== get().meId && get().openClaimId === row.id) { const who = get().profiles.find((p) => p.id === row.updated_by)?.full_name || 'A teammate'; setTimeout(() => toast.info(`${who} just updated claim ${row.claim_no} — you are seeing the latest`), 0); }
        if (i >= 0) { const c = arr.slice(); c[i] = row; return { [key]: c }; }
        return { [key]: [...arr, row] };
      });
    }) ?? null; } catch (e) { console.warn('Realtime unavailable (live updates off):', e); }
  },

  login(id) { try { localStorage.setItem(ME_KEY, id); } catch { /* ignore */ } set({ meId: id }); get().reload().then(() => set({ ready: true })); },
  async logout() {
    if (supabase) await supabase.auth.signOut();
    try { localStorage.removeItem(ME_KEY); } catch { /* ignore */ }
    set({ meId: null, clientFilter: '', clientScope: [], pinnedClients: [] });
    if (get().mode === 'local') await get().reload();   // demo mode: restore the unscoped persona list
  },
  toggleDark() { const d = !get().dark; try { localStorage.setItem('arms:dark', d ? '1' : '0'); } catch { /* ignore */ } set({ dark: d }); },
  setClientFilter(id) { get().setClientScope(id ? [id] : []); },
  async resetDemo(size) { await localReset(); try { localStorage.removeItem(ME_KEY); if (size) localStorage.setItem(SEED_KEY, size); } catch { /* ignore */ } location.reload(); },

  async save(table, rows, onConflict) {
    await db.upsert(table, rows, onConflict);
    if (AUDITED.has(table)) void get().audit_('config', `${table}: saved ${rows.length} row(s) — ${rows.slice(0, 4).map((r: any) => r.name || r.value || r.full_name || r.email || r.id).join(', ')}${rows.length > 4 ? '…' : ''}`, { table, ids: rows.slice(0, 20).map((r: any) => r.id ?? r.email) }, table);
    if (table === 'app_settings') return;
    const key = STATE_KEY[table] as string;
    set((s: any) => {
      const arr: any[] = s[key].slice();
      const idx = new Map(arr.map((x, i) => [x.id, i]));
      for (const r of rows) { const i = idx.get(r.id); if (i !== undefined) arr[i] = { ...arr[i], ...r }; else { arr.push(r); idx.set(r.id, arr.length - 1); } }
      return { [key]: arr };
    });
  },
  async del(table, ids) {
    await db.remove(table, ids);
    if (AUDITED.has(table) || table === 'claims') void get().audit_('delete', `${table}: deleted ${ids.length} row(s)`, { table, ids: ids.slice(0, 20) }, table);
    const key = STATE_KEY[table] as string; const s = new Set(ids);
    set((st: any) => ({ [key]: st[key].filter((x: any) => !s.has(x.id)) }));
    if (table === 'claims') set((st) => ({ workLog: st.workLog.filter((w) => !s.has(w.claim_id)), notes: st.notes.filter((n) => !s.has(n.claim_id)), activity: st.activity.filter((a) => !s.has(a.claim_id)) }));
  },
  async setSetting(key, value) {
    await db.upsert('app_settings', [{ key, value }], 'key');
    void get().audit_('settings', `Setting “${key}” changed`, { key, value }, 'app_settings', key);
    set((s) => ({ settings: { ...s.settings, [key]: value } }));
  },

  async logActivity(claimId, kind, summary, meta = {}) {
    const me = get().me();
    const ids = Array.isArray(claimId) ? claimId : [claimId];
    const rows = ids.map((id) => ({ id: uid(), claim_id: id, actor_id: me?.id ?? null, actor_name: me?.full_name ?? 'System', kind, summary, meta, created_at: nowISO() }));
    await db.upsert('claim_activity', rows);
    set((s) => ({ activity: [...s.activity, ...rows as Activity[]] }));
  },

  async runRadar() {
    const st = get(); const cfg = resolveLimitsCfg(st.settings.limits_cfg);
    const idx = buildLimitIndex({ rows: st.payerLimits, payerMeta: new Map(st.config.filter((o) => o.category === 'payer').map((o) => [o.value, o.meta || {}])), clients: st.clients, cfg, canon: (n) => buildPayerIndex(st.config.filter((o) => o.category === 'payer' && o.active).map((o) => ({ value: o.value, aliases: o.meta.aliases }))).canon(n).name });
    const items = radarItems(st.claims.filter((c) => !c.closed_at), idx, cfg, todayISO()); const plan = escalationPlan(items, cfg, { fmt: fmtDate }); let notified = 0; const changes: { c: Claim; patch: Partial<Claim>; activity?: string }[] = [];
    for (const e of plan) {
      const c = get().claims.find((x) => x.id === e.claimId); if (!c) continue;
      const flags = [...new Set([...(c.flags || []).filter((f) => !e.flags.remove.includes(f)), ...e.flags.add])]; const patch: Partial<Claim> = { flags, custom: { ...(c.custom || {}), radar: { stage: e.stage, kind: e.kind, due: e.due, at: nowISO() } } };
      if (e.priority && c.priority !== 'Critical') patch.priority = e.priority;
      const prev = (c.custom?.radar || {}) as any; if (prev.stage === e.stage && prev.kind === e.kind && prev.due === e.due && flags.length === (c.flags || []).length && !patch.priority) continue; // unchanged since last run: no write, no repeat alert
      changes.push({ c, patch, activity: e.activity || undefined });
      for (const n of e.notify) { if (notified >= 40) { notified++; continue; } notified++; await get().notify({ title: n.title, body: n.body, link: `/radar?claim=${c.id}`, severity: n.severity, ...(n.audience === 'owner' && c.assigned_to ? { user_id: c.assigned_to } : { role: n.audience === 'owner' ? 'supervisor' : n.audience }) }); }
    }
    if (changes.length) {
      const stamp = nowISO(); const rows = changes.map(({ c, patch }) => ({ ...c, ...patch, updated_at: stamp })); const byId = new Map(rows.map((r) => [r.id, r]));
      for (let i = 0; i < rows.length; i += 500) await db.upsert('claims', rows.slice(i, i + 500));
      set((cur) => ({ claims: cur.claims.map((c) => byId.get(c.id) || c) }));
      const groups = new Map<string, string[]>(); for (const { c, activity } of changes) if (activity) groups.set(activity, [...(groups.get(activity) || []), c.id]);
      for (const [text, ids] of groups) await get().logActivity(ids, 'radar', text);
    }
    if (notified > 40) await get().notify({ title: `Deadline radar: ${notified - 40} more alerts`, body: 'Open the Deadline radar to see every claim near a filing or appeal limit.', link: '/radar', severity: 'warn', role: 'supervisor' });
    return { escalated: plan.filter((e) => e.activity).length, notified };
  },

  async syncPayerAlerts() {
    const st = get(); const cfg = resolveScoreCfg(st.settings.score_cfg); const today = todayISO(); const pi = buildPayerIndex(st.config.filter((o) => o.category === 'payer' && o.active).map((o) => ({ value: o.value, aliases: o.meta.aliases })));
    const cards = [...payerScorecards(st.claims, st.appeals, cfg, today, { canon: (n) => pi.canon(n).name }), ...payerScorecards(st.claims, st.appeals, cfg, today, { byCpt: true, canon: (n) => pi.canon(n).name })];
    const have = new Set(st.payerAlerts.map((a) => a.dedupe_key)); const fresh = behaviourAlerts(cards, cfg, today).filter((a) => !have.has(a.key)); if (!fresh.length) return 0;
    const rows: PayerAlert[] = fresh.map((a) => ({ id: uid(), payer: a.payer, client_id: null, cpt: a.cpt, kind: a.kind, metric: a.metric, prev_value: a.prev, curr_value: a.curr, n: a.n, detail: { title: a.title, detail: a.detail, severity: a.severity }, dedupe_key: a.key, status: 'new', detected_on: today, created_at: nowISO() }));
    await db.upsert('payer_alerts', rows); set((s) => ({ payerAlerts: [...s.payerAlerts, ...rows] }));
    const hi = fresh.filter((a) => a.severity === 'high'); if (hi.length) void get().notify({ title: `${hi.length} payer behaviour change${hi.length > 1 ? 's' : ''} detected`, body: hi.slice(0, 3).map((a) => a.title).join(' · '), link: '/scorecards', severity: 'high', role: 'manager' });
    return rows.length;
  },
  async setAlertStatus(ids, status) { const s = new Set(ids); const rows = get().payerAlerts.filter((a) => s.has(a.id)).map((a) => ({ ...a, status })); await db.upsert('payer_alerts', rows); set((st) => ({ payerAlerts: st.payerAlerts.map((a) => (s.has(a.id) ? { ...a, status } : a)) })); },
  async applyBulk(ids, action, reason) {
    const st = get(); const cfg = resolveBulkCfg(st.settings.bulk_cfg); const pool = new Map(st.claims.map((c) => [c.id, c])); const claims = ids.map((i) => pool.get(i)).filter(Boolean) as Claim[];
    const prev = previewBulk(claims, action, { today: todayISO(), cfg, ownerIds: new Set(st.profiles.map((p) => p.id)), statuses: new Set(st.config.filter((o) => o.category === 'status').map((o) => o.value)), priorities: new Set(st.config.filter((o) => o.category === 'priority').map((o) => o.value)), has: (c) => st.has(c) });
    if (prev.errors.length) throw new Error(prev.errors[0]); if (prev.needsReason && !(reason || '').trim()) throw new Error('A reason is required for a change this large');
    const me = st.me(); const now = nowISO(); const changes = prev.rows.filter((r) => r.status === 'change');
    const op: BulkOp = { id: uid(), label: describeAction(action, { owner: (id) => st.profiles.find((p) => p.id === id)?.full_name || '—' }) + (reason ? ` — ${reason.trim()}` : ''), action: action as any, filter_desc: null, actor_id: me?.id ?? null, actor_name: me?.full_name ?? null, claim_count: claims.length, changed_count: changes.length, status: 'applied', undo_until: cfg.undoHours ? new Date(Date.now() + cfg.undoHours * 36e5).toISOString() : null, undone_at: null, undone_by: null, undone_count: null, created_at: now };
    await db.upsert('bulk_ops', [op]);
    const rows = changes.map((r) => ({ id: uid(), op_id: op.id, claim_id: r.claim.id, before: r.before, after: r.after }));
    for (let i = 0; i < rows.length; i += 1000) await db.upsert('bulk_op_rows', rows.slice(i, i + 1000));
    const CH = 500; const upd = new Map<string, Claim>();
    for (let i = 0; i < changes.length; i += CH) { const part = changes.slice(i, i + CH).map((r) => ({ ...r.claim, ...r.patch, updated_at: now })); await db.upsert('claims', part as any); part.forEach((c) => upd.set(c.id, c)); }
    if (upd.size) set((s) => ({ claims: s.claims.map((c) => upd.get(c.id) || c) }));
    const acts = changes.map((r) => ({ id: uid(), claim_id: r.claim.id, actor_id: me?.id ?? null, actor_name: me?.full_name ?? 'System', kind: 'bulk', summary: `${op.label} (bulk)`, meta: { op_id: op.id }, created_at: now }));
    for (let i = 0; i < acts.length; i += 500) { const part = acts.slice(i, i + 500); await db.upsert('claim_activity', part); set((s) => ({ activity: [...s.activity, ...(part as Activity[])] })); }
    set((s) => ({ bulkOps: [op, ...s.bulkOps] })); return { opId: op.id, changed: changes.length, blocked: prev.counts.blocked };
  },
  async undoBulk(opId) {
    const st = get(); const op = st.bulkOps.find((o) => o.id === opId); if (!op) throw new Error('Operation not found'); if (op.status === 'undone') throw new Error('Already undone'); if (op.undo_until && op.undo_until < nowISO()) throw new Error('The undo window has passed');
    const rows = (await db.find('bulk_op_rows', { op_id: opId })) as { claim_id: string; before: any; after: any }[]; const plan = planUndo(rows, new Map(st.claims.map((c) => [c.id, c]))); const me = st.me(); const now = nowISO();
    const upd = new Map<string, Claim>(); const byId = new Map(st.claims.map((c) => [c.id, c]));
    for (const r of plan.revert) { const c = byId.get(r.claimId)!; upd.set(c.id, { ...c, ...r.patch, updated_at: now }); }
    const list = [...upd.values()]; for (let i = 0; i < list.length; i += 500) await db.upsert('claims', list.slice(i, i + 500) as any);
    if (upd.size) set((s) => ({ claims: s.claims.map((c) => upd.get(c.id) || c) }));
    const acts = list.map((c) => ({ id: uid(), claim_id: c.id, actor_id: me?.id ?? null, actor_name: me?.full_name ?? 'System', kind: 'bulk', summary: `Undid bulk: ${op.label}`, meta: { op_id: opId, undo: true }, created_at: now }));
    for (let i = 0; i < acts.length; i += 500) { const part = acts.slice(i, i + 500); await db.upsert('claim_activity', part); set((s) => ({ activity: [...s.activity, ...(part as Activity[])] })); }
    const next: BulkOp = { ...op, status: plan.conflicts ? 'partly_undone' : 'undone', undone_at: now, undone_by: me?.id ?? null, undone_count: plan.reverted }; await db.upsert('bulk_ops', [next]); set((s) => ({ bulkOps: s.bulkOps.map((o) => (o.id === opId ? next : o)) }));
    return { reverted: plan.reverted, conflicts: plan.conflicts };
  },
  async listFeedback() { try { return (await db.list('feedback')).sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at))); } catch { return []; } },
  async setFeedbackStatus(id, status) { await db.update('feedback', [id], { status }); },
  async submitFeedback(o) { const me = get().me(); const row = { id: uid(), user_id: me?.id ?? null, user_name: me?.full_name ?? null, route: o.route, build: (typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev'), kind: o.kind, body: o.body, status: 'new', created_at: nowISO() }; await db.upsert('feedback', [row as any]); },
  async sendFaxDoc(o) {
    const st = get(); const me = st.me(); const cfg = resolveFaxCfg(st.settings.fax_cfg);
    if (db.mode === 'local' || !hasSupabase) {
      if (cfg.provider !== 'mock' && !cfg.enabled) throw new Error('Fax is switched off — Admin → Fax setup');
      const row: FaxLog = { id: uid(), appeal_id: o.appealId, claim_id: o.claimId, client_id: o.clientId, to_number: o.to, subject: o.subject, pages: o.pages, provider: 'mock', provider_id: 'demo-' + Date.now().toString(36), status: 'test', error: null, sent_by: me?.id ?? null, sent_by_name: me?.full_name ?? null, created_at: nowISO(), delivered_at: nowISO() };
      await db.upsert('fax_log', [row]); set((s) => ({ faxLog: [row, ...s.faxLog] })); return row;
    }
    const { data } = await supabase!.auth.getSession(); const r = await fetch('/.netlify/functions/fax?action=send', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify(o) });
    const j: any = await r.json().catch(() => ({})); if (j.row) set((s) => ({ faxLog: [j.row, ...s.faxLog.filter((x) => x.id !== j.row.id)] })); if (!r.ok || !j.ok) throw new Error(j.error || `Fax failed (${r.status})`); return j.row as FaxLog;
  },
  async createAppeal(a) {
    const c = get().claims.find((x) => x.id === a.claim_id); if (!c) throw new Error('Claim not found'); const me = get().me(); const now = nowISO();
    const row: Appeal = { id: uid(), claim_id: c.id, client_id: c.client_id, level: a.level, kind: a.kind, status: 'draft', payer: c.payer, template: a.template ?? null, form_id: a.form_id ?? null, due_on: a.due_on ?? null, filed_on: null, decided_on: null, method: null, tracking_no: null, amount_disputed: a.amount_disputed ?? c.balance, amount_recovered: null, reason: a.reason ?? null, outcome_note: null, letter: a.letter || {}, form_values: {}, attachments: [], created_by: me?.id ?? null, created_at: now, updated_at: now };
    await db.upsert('appeals', [row]); set((s) => ({ appeals: [...s.appeals, row] }));
    await get().logActivity(c.id, 'appeal', `${row.kind === 'underpayment_dispute' ? 'Underpayment dispute' : row.kind === 'corrected_claim' ? 'Corrected claim' : 'Appeal'} drafted (level ${row.level})${row.due_on ? ` · due ${fmtDate(row.due_on)}` : ''}`, { appeal_id: row.id });
    return row;
  },
  async updateAppeal(id, patch) {
    const old = get().appeals.find((x) => x.id === id); if (!old) return; const next = { ...old, ...patch, updated_at: nowISO() } as Appeal; await db.upsert('appeals', [next]); set((s) => ({ appeals: s.appeals.map((x) => (x.id === id ? next : x)) }));
    if (patch.status && patch.status !== old.status) {
      const claim = get().claims.find((x) => x.id === old.claim_id); const L = `${old.kind === 'corrected_claim' ? 'Corrected claim' : old.kind === 'underpayment_dispute' ? 'Underpayment dispute' : 'Appeal'} L${old.level}`;
      await get().logActivity(old.claim_id, 'appeal', `${L} → ${patch.status}${next.tracking_no ? ` · ref ${next.tracking_no}` : ''}${patch.status === 'won' || patch.status === 'partial' ? ` · recovered $${(next.amount_recovered || 0).toFixed(2)}` : ''}${next.outcome_note ? ` — ${next.outcome_note}` : ''}`, { appeal_id: id });
      if (claim && (patch.status === 'sent' || patch.status === 'pending')) await get().patchClaims([claim.id], { custom: { ...(claim.custom || {}), appeal_level: old.level, appeal_filed: next.filed_on || todayISO() }, next_fu: claim.next_fu || next.due_on || null });
      if (claim && patch.status === 'lost' && old.level < 3) void get().notify({ title: `Appeal L${old.level} lost — ${claim.claim_no}`, body: 'Consider the next level before the appeal window closes.', link: `/appeals?claim=${claim.id}`, severity: 'warn', user_id: claim.assigned_to });
    }
  },
  async loadFormFile(formId) { const r = (await db.find('payer_form_files', { form_id: formId }, { limit: 1 }))[0]; return r?.data_b64 ?? null; },
  async saveFormFile(form, b64) { await db.upsert('payer_forms', [form]); await db.upsert('payer_form_files', [{ form_id: form.id, data_b64: b64 }], 'form_id'); set((s) => ({ payerForms: [...s.payerForms.filter((f) => f.id !== form.id), form] })); },
  async probeSummary() { if (db.mode !== 'supabase' || !db.rpc) return false; try { await db.rpc('claim_summary', { p_clients: null, p_today: todayISO(), p_buckets: [] }); return true; } catch { return false; } },
  async refreshSummary() { if (db.mode !== 'supabase' || !db.rpc) return; try { const buckets = bucketsFrom(get().config).map((b) => ({ label: b.label, min: b.min, max: b.max })); set({ summary: (await db.rpc('claim_summary', { p_clients: null, p_today: todayISO(), p_buckets: buckets })) as ClaimSummary }); } catch { /* keep the last summary */ } },
  async ensureClaims(ids) {
    const lg = get().large; if (!lg) return; const need = ids.filter((i) => !lg.loaded.includes(i)); if (!need.length) return;
    const rows = (await Promise.all(need.map((id) => db.find('claims', { client_id: id })))).flat() as Claim[]; let loaded = [...lg.loaded, ...need]; let claims = [...get().claims, ...rows];
    if (claims.length > lg.threshold * 2) { const keep = new Set(ids); claims = claims.filter((c) => keep.has(c.client_id)); loaded = loaded.filter((i) => keep.has(i)); }
    set({ claims, large: { ...lg, loaded } });
  },
  async sweepNudge() {
    const st = get(); const sw = unresolvedSweep(st.claims, st.appeals, todayISO(), resolveIntelCfg(st.settings.intel_cfg).sweep); const hi = (['deadline_expired', 'appeal_overdue', 'missing_pending'] as const).reduce((a, k) => a + sw[k].length, 0); const all = new Set(Object.values(sw).flatMap((l) => l.map((c) => c.id))).size;
    if (!all) return 0; const key = 'sweep:' + todayISO(); if (st.notifications.some((n) => n.title.startsWith('Unresolved tracker') && n.created_at.slice(0, 10) === todayISO())) return all; void key;
    await get().notify({ title: `Unresolved tracker: ${all.toLocaleString('en-US')} claims need attention${hi ? ` (${hi} urgent)` : ''}`, body: 'No owner, no follow-up date, stale, missing from file or past a deadline.', link: '/unresolved', severity: hi ? 'high' : 'warn', role: 'supervisor' }); return all;
  },
  async loadRates(force) { if (get().ratesLoaded && !force) return; try { const rows = (await db.list('fee_rates')) as FeeRate[]; set({ feeRates: rows, ratesLoaded: true }); } catch { set({ feeRates: [], ratesLoaded: true }); } },
  async saveRates(scheduleId, rows, replace = false) {
    await get().loadRates(); const old = get().feeRates.filter((r) => r.schedule_id === scheduleId); const have = new Map(old.map((r) => [`${r.cpt}|${r.modifier}`, r]));
    const out: FeeRate[] = []; for (const r of rows) { const cpt = r.cpt.trim().toUpperCase(); if (!cpt || !(r.amount >= 0)) continue; const mod = (r.modifier || '').trim().toUpperCase(); out.push({ id: have.get(`${cpt}|${mod}`)?.id || uid(), schedule_id: scheduleId, cpt, modifier: mod, amount: Math.round(r.amount * 100) / 100 }); }
    if (replace) { const keep = new Set(out.map((r) => r.id)); const drop = old.filter((r) => !keep.has(r.id)).map((r) => r.id); for (let i = 0; i < drop.length; i += 500) await db.remove('fee_rates', drop.slice(i, i + 500)); }
    for (let i = 0; i < out.length; i += 1000) await db.upsert('fee_rates', out.slice(i, i + 1000));
    set((st) => { const ids = new Set(out.map((r) => r.id)); const gone = replace ? new Set(old.map((r) => r.id)) : new Set<string>(); return { feeRates: [...st.feeRates.filter((r) => !ids.has(r.id) && !gone.has(r.id)), ...out] }; });
    return out.length;
  },
  async recalcExpected(opts = {}) {
    await get().loadRates(); const st = get(); const cfg = resolveReimbCfg(st.settings.reimb_cfg);
    const dir = st.config.filter((o) => o.category === 'payer' && o.active); const pi = buildPayerIndex(dir.map((o) => ({ value: o.value, aliases: o.meta.aliases })));
    const pool = st.claims.filter((c) => !c.closed_at && (!opts.clientId || c.client_id === opts.clientId));
    const { changed, gaps } = recalcExpected(pool, new Map(st.clients.map((c) => [c.id, c])), { cfg, schedules: st.feeSchedules.filter((f) => f.active), rates: buildRatesIndex(st.feeRates), canon: (n) => pi.canon(n).name }, nowISO());
    for (let i = 0; i < changed.length; i += 500) { const part = changed.slice(i, i + 500); await db.upsert('claims', part as any); }
    if (changed.length) { const m = new Map(changed.map((c) => [c.id, c])); set((s) => ({ claims: s.claims.map((c) => m.get(c.id) || c) })); }
    return { changed: changed.length, gaps: Object.fromEntries(gaps) };
  },

  async patchClaims(ids, patch, summary, kind = 'field') {
    const full = { ...patch, updated_at: nowISO() };
    await db.update('claims', ids, full);
    const s = new Set(ids);
    set((st) => ({ claims: st.claims.map((c) => (s.has(c.id) ? { ...c, ...full } : c)) }));
    if (summary) await get().logActivity(ids, kind, summary);
  },

  async assign(ids, userId) {
    const u = get().profiles.find((p) => p.id === userId);
    await get().patchClaims(ids, { assigned_to: userId }, userId ? `Assigned to ${u?.full_name}` : 'Unassigned', 'assign');
  },

  async addNote(claimId, body, pinned = false, clientVisible = false) {
    const me = get().me();
    const n: Note = { id: uid(), claim_id: claimId, author_id: me?.id ?? null, author_name: me?.full_name ?? null, body, pinned, client_visible: clientVisible, created_at: nowISO() };
    await db.upsert('claim_notes', [n]);
    set((s) => ({ notes: [...s.notes, n] }));
    await get().logActivity(claimId, 'note', (clientVisible ? '[shared with client] ' : '') + (body.length > 90 ? body.slice(0, 90) + '…' : body));
  },

  async setLifecycle(claimId, to, input) {
    const st = get(); const c = st.claims.find((x) => x.id === claimId); if (!c) return { ok: false, message: 'Claim not found' };
    const from = lifecycleOf(c); const defs = lifecycleDefs(st.config);
    const r = checkTransition(from, to, { ...input, canWriteOff: st.has('assign') }, defs); if (!r.ok) return { ok: false, message: r.message };
    const now = new Date().toISOString(); const custom = { ...c.custom, lifecycle: to, lifecycle_at: now, reopened: to === 'REO' ? true : c.custom?.reopened };
    const patch: Partial<Claim> = { custom };
    if (defs.find((d) => d.code === to)?.terminal) Object.assign(patch, { closed_at: now, closed_reason: input.reason || (to === 'WOF' ? 'Write-off approved' : 'Resolved'), resolution: to === 'WOF' ? 'adjustment' : c.resolution ?? null });
    if (to === 'REO') Object.assign(patch, { closed_at: null, closed_reason: null });
    await get().patchClaims([claimId], patch, `Status ${from} → ${to}${input.reason ? ' — ' + input.reason : ''}${input.amount ? ' ($' + input.amount + ')' : ''}`, 'lifecycle');
    return { ok: true };
  },
  async saveQaConfig(cfg) { const me = get().me(); await db.upsert('qa_config', [{ id: 'main', value: cfg, updated_at: nowISO(), updated_by: me?.id ?? null }] as any); set({ qaConfig: cfg }); void get().audit_('settings', 'QA settings changed', { sample: cfg.sample_rate_pct, forms: cfg.forms.length }, 'qa_config', 'main'); },
  async generateQaSample({ from, to, only }) {
    const st = get(); const cfg = st.qaConfig; const cm = new Map(st.claims.map((c) => [c.id, c])); const carc = st.carcMap(); const term = new Set(st.config.filter((o) => o.category === 'end_action' && o.meta.terminal).map((o) => o.value));
    const { picks, plan } = planSample({ touches: st.workLog.filter((w) => !w.legacy && inScopeTouch(st, w)), reviews: st.qaReviews, profiles: st.profiles, claims: cm, config: cfg, riskOf: (w) => { const r = autoChecks(w, cm.get(w.claim_id), carc, term); return { risk: r.risk, reasons: r.findings.map((f) => f.reason) }; }, from, to, today: todayISO(), only });
    const now = nowISO(); const rows: QaReview[] = []; let cal = 0; const base = (w: any, p: any): QaReview => ({ id: uid(), work_log_id: w.id, claim_id: w.claim_id, client_id: w.client_id, analyst_id: w.user_id, reviewer_id: null, form_id: cfg.forms[0]?.id ?? null, form_version: cfg.forms[0]?.version ?? 1, status: 'queued', sample_source: p.source, risk: p.risk, answers: {}, errors: [], score: null, result: null, comments: null, coaching: null, is_calibration: false, calibration_group: null, analyst_ack_at: null, dispute_note: null, dispute_outcome: null, resolved_by: null, resolved_at: null, review_seconds: null, queued_at: now, reviewed_at: null, created_at: now, updated_at: now });
    for (const p of picks) { const r = base(p.touch, p); if (p.calibration) { const g = uid(); r.is_calibration = true; r.calibration_group = g; r.sample_source = 'calibration'; const r2 = { ...base(p.touch, p), id: uid(), is_calibration: true, calibration_group: g, sample_source: 'calibration' }; rows.push(r, r2); cal++; } else rows.push(r); }
    for (let i = 0; i < rows.length; i += 400) await db.upsert('qa_reviews', rows.slice(i, i + 400) as any);
    set((s) => ({ qaReviews: [...s.qaReviews, ...rows] })); void get().audit_('qa', `Generated QA sample: ${rows.length} reviews queued (${from} → ${to})`, { picks: picks.length, calibration: cal }, 'qa_reviews');
    return { created: rows.length, calibration: cal, perAnalyst: plan.map((x) => ({ name: x.analyst.full_name, picked: x.picked, eligible: x.eligible })) };
  },
  async startQaReview(id) {
    const st = get(); const me = st.me(); const r = st.qaReviews.find((x) => x.id === id); if (!r || !me) return { ok: false, message: 'Review not found' };
    if (r.analyst_id === me.id) return { ok: false, message: 'You cannot review your own work' };
    if (r.reviewer_id && r.reviewer_id !== me.id && r.status === 'in_review') return { ok: false, message: 'Another reviewer has this open' };
    if (r.is_calibration && st.qaReviews.some((x) => x.calibration_group === r.calibration_group && x.id !== r.id && x.reviewer_id === me.id)) return { ok: false, message: 'Calibration needs a different reviewer for the second copy' };
    const next = { ...r, reviewer_id: me.id, status: 'in_review' as const, updated_at: nowISO() }; await db.upsert('qa_reviews', [next] as any); set((s) => ({ qaReviews: s.qaReviews.map((x) => (x.id === id ? next : x)) })); return { ok: true };
  },
  async submitQaReview(id, rv) {
    const st = get(); const me = st.me(); const r = st.qaReviews.find((x) => x.id === id); if (!r || !me) return null; const form = st.qaConfig.forms.find((f) => f.id === r.form_id) || st.qaConfig.forms[0]; const sc = scoreReview(form, rv.answers, { errors: rv.errors, cfg: st.qaConfig });
    const now = nowISO(); const next: QaReview = { ...r, reviewer_id: me.id, answers: rv.answers, errors: rv.errors, comments: rv.comments || null, coaching: rv.coaching || null, score: sc.score, result: sc.result, status: 'completed', review_seconds: rv.seconds, reviewed_at: now, updated_at: now };
    await db.upsert('qa_reviews', [next] as any); set((s) => ({ qaReviews: s.qaReviews.map((x) => (x.id === id ? next : x)) }));
    if (!r.is_calibration) { const patch = { audit_status: sc.result === 'pass' ? ('pass' as const) : ('fail' as const), audit_remarks: [rv.comments, ...rv.errors.map((e) => e.note).filter(Boolean)].filter(Boolean).join(' · ').slice(0, 500) || null, audit_by: me.id, audited_at: now }; await db.update('work_log', [r.work_log_id], patch); set((s) => ({ workLog: s.workLog.map((w) => (w.id === r.work_log_id ? { ...w, ...patch } : w)) })); }
    if (r.claim_id && !r.is_calibration) await get().logActivity(r.claim_id, 'audit', `QA ${sc.result} (${sc.score}%)${rv.errors.length ? ': ' + rv.errors.map((e) => e.note || e.category).join('; ') : ''}`);
    if (r.analyst_id && !r.is_calibration) void get().notify({ title: `QA review: ${sc.result === 'pass' ? 'passed' : sc.result === 'critical' ? 'critical finding' : 'needs attention'} (${sc.score}%)`, body: rv.coaching || rv.comments || undefined, link: '/me', severity: sc.result === 'pass' ? 'info' : sc.result === 'critical' ? 'high' : 'warn', user_id: r.analyst_id });
    return next;
  },
  async respondQaReview(id, action, note) {
    const st = get(); const r = st.qaReviews.find((x) => x.id === id); if (!r) return; const now = nowISO();
    const next: QaReview = action === 'ack' ? { ...r, status: 'acknowledged', analyst_ack_at: now, updated_at: now } : { ...r, status: 'disputed', dispute_note: note || null, analyst_ack_at: now, updated_at: now };
    await db.upsert('qa_reviews', [next] as any); set((s) => ({ qaReviews: s.qaReviews.map((x) => (x.id === id ? next : x)) }));
    if (action === 'dispute') void get().notify({ title: 'QA review disputed', body: note || undefined, link: '/qa?tab=disputes', severity: 'warn', role: 'qa' });
  },
  async resolveQaDispute(id, o) {
    const st = get(); const me = st.me(); const r = st.qaReviews.find((x) => x.id === id); if (!r || !me) return; const form = st.qaConfig.forms.find((f) => f.id === r.form_id) || st.qaConfig.forms[0]; const now = nowISO();
    const sc = o.outcome === 'overturned' && o.answers ? scoreReview(form, o.answers, { errors: r.errors, cfg: st.qaConfig }) : null;
    const next: QaReview = { ...r, status: 'resolved', dispute_outcome: o.outcome, resolved_by: me.id, resolved_at: now, updated_at: now, comments: [r.comments, `Dispute ${o.outcome}: ${o.note}`].filter(Boolean).join('\n'), ...(sc ? { answers: o.answers!, score: sc.score, result: sc.result, errors: r.errors.filter((e) => sc.failed.includes(e.criterion)) } : {}) };
    await db.upsert('qa_reviews', [next] as any); set((s) => ({ qaReviews: s.qaReviews.map((x) => (x.id === id ? next : x)) }));
    if (sc && !r.is_calibration) { const patch = { audit_status: sc.result === 'pass' ? ('pass' as const) : ('fail' as const), audited_at: now }; await db.update('work_log', [r.work_log_id], patch); set((s) => ({ workLog: s.workLog.map((w) => (w.id === r.work_log_id ? { ...w, ...patch } : w)) })); }
    if (r.analyst_id) void get().notify({ title: `Your QA dispute was ${o.outcome}`, body: o.note, link: '/me', severity: 'info', user_id: r.analyst_id });
  },
  async loadSnapshots(force) { if (get().snapshotsLoaded && !force) return; const rows = (await db.list('claim_snapshots')) as ClaimSnapshot[]; set({ snapshots: rows, snapshotsLoaded: true }); },
  async applyEra({ era, plan, fileName }) {
    const st = get(); let posted = 0, denied = 0; const recs: Recovery[] = []; const now = nowISO();
    for (const r of plan.rows) {
      if (r.match !== 'matched' || !r.claim) continue; const c = st.claims.find((x) => x.id === r.claim!.id) || r.claim; const e = r.era;
      const adj = r.codes.filter((x) => /^(CO|PR|OA|PI)-/.test(x)); const merged = [...new Set([...(e.denied ? [] : splitDenials(c.denial_codes)), ...adj])].join(', ');
      const patch: Partial<Claim> = { custom: { ...c.custom, era: { trace: era.trace, date: era.date, paid: e.paid, patientResp: e.patientResp, icn: e.icn, status: e.statusLabel, codes: r.codes, payer: era.payer }, era_expected_balance: r.expectedBalance, ...(!c.closed_at && !['CLS', 'WOF'].includes(lifecycleOf(c)) ? { lifecycle: r.lifecycle, lifecycle_at: now } : {}) }, ...(merged ? { denial_codes: merged } : {}), flags: e.reversal ? [...new Set([...(c.flags || []), 'era_reversal'])] : c.flags };
      patch.paid_amt = Math.round(((c.paid_amt || 0) * (e.reversal ? 1 : 1) + (e.reversal ? -e.paid : e.paid)) * 100) / 100; if (e.allowed != null) patch.allowed_amt = e.allowed; patch.patient_resp = e.patientResp || c.patient_resp || null; if (e.denied && !c.denial_date) patch.denial_date = era.date || todayISO();
      await get().patchClaims([c.id], patch);
      await get().logActivity(c.id, 'era', `ERA ${era.trace || ''}: ${e.statusLabel} · paid $${e.paid.toFixed(2)}${e.patientResp ? ` · patient $${e.patientResp.toFixed(2)}` : ''}${r.codes.length ? ' · ' + r.codes.join(', ') : ''}`, { key: `${era.trace}:${e.pcn}:${e.icn || ''}`, trace: era.trace, paid: e.paid });
      if (r.recovery) recs.push({ id: uid(), created_at: now, ...r.recovery }); if (e.denied) denied++; posted++;
    }
    if (recs.length) { await db.upsert('recoveries', recs); set((s) => ({ recoveries: [...s.recoveries, ...recs] })); }
    void get().audit_('import', `Posted ERA ${era.trace || fileName}: ${posted} claims, ${recs.length} payments ($${recs.reduce((a, x) => a + x.amount, 0).toFixed(2)})`, { file: fileName, trace: era.trace }, 'recoveries', era.trace || undefined);
    return { posted, recoveries: recs.length, denied };
  },
  async saveItem(kind, body, o = {}) {
    const old = o.id ? get().userItems.find((x) => x.id === o.id) : undefined; const now = new Date().toISOString();
    const row: UserItem = { id: o.id || uid(), kind, owner_id: old?.owner_id ?? get().meId, client_id: o.client_id ?? old?.client_id ?? null, name: o.name ?? old?.name ?? null, shared: o.shared ?? old?.shared ?? false, body, created_at: old?.created_at ?? now, updated_at: now };
    await db.upsert('user_items', [row]); set((s) => ({ userItems: [...s.userItems.filter((x) => x.id !== row.id), row] })); return row;
  },
  async delItem(id) { await db.remove('user_items', [id]); set((s) => ({ userItems: s.userItems.filter((x) => x.id !== id) })); },
  async snooze(ids, until, reason) {
    for (const id of ids) { const c = get().claims.find((x) => x.id === id); if (!c) continue; await get().patchClaims([id], { custom: { ...c.custom, snooze_until: until, snooze_reason: until ? reason : null } }, until ? `Snoozed until ${until} — ${reason}` : 'Snooze cleared', 'snooze'); }
  },

  /** One "touch" = one row of the old production tracker. Updates the claim's current RCA/end-action/status too. */
  async recordTouch(claimId, t) {
    const st = get();
    const me = st.me(); const claim = st.claims.find((c) => c.id === claimId); if (!claim) return;
    const client = st.clients.find((c) => c.id === claim.client_id);
    const sup = st.profiles.find((p) => p.id === (me?.supervisor_id ?? client?.supervisor_id));
    const age = ageDays(claim, client);
    const bucket = bucketFor(age, bucketsFrom(st.config))?.label ?? null;
    const prior = claim.touch_count;
    const log: WorkLog = {
      id: uid(), claim_id: claimId, client_id: claim.client_id, user_id: me?.id ?? null, user_name: me?.full_name ?? null, emp_code: me?.emp_code ?? null,
      supervisor_name: sup?.full_name ?? null, work_date: todayISO(), comment: t.comment, rca: t.rca ?? null, rca_detail: t.rca_detail ?? null,
      end_action: t.end_action ?? null, end_sub: t.end_sub ?? null, mode: t.mode ?? null, balance: claim.balance, age_days: age, bucket,
      next_fu: t.next_fu ?? null, multi_touch: prior > 0, time_spent_sec: t.time_spent_sec ?? null, call_ref: t.call_ref ?? null, contact_name: t.contact_name ?? null, ack_at: null, audit_status: 'pending', audit_remarks: null, audit_by: null, audited_at: null, legacy: false, created_at: nowISO(),
    };
    const ea = st.config.find((c) => c.category === 'end_action' && c.value === t.end_action);
    const newStatus = (ea?.meta.status as string) || claim.status;
    const terminal = !!ea?.meta.terminal;
    const patch: Partial<Claim> = {
      rca: log.rca, rca_detail: log.rca_detail, end_action: log.end_action, end_sub: log.end_sub, mode: log.mode, next_fu: log.next_fu,
      status: newStatus, touch_count: prior + 1, last_touched_at: log.created_at,
      assigned_to: claim.assigned_to ?? me?.id ?? null,
    };
    if (!claim.closed_at) { const lc = deriveLifecycle({ ...claim, ...patch } as Claim); if (lc !== lifecycleOf(claim) && !['CLS', 'WOF'].includes(lifecycleOf(claim))) patch.custom = { ...claim.custom, lifecycle: lc, lifecycle_at: log.created_at }; }
    await db.upsert('work_log', [log]);
    set((s) => ({ workLog: [...s.workLog, log] }));
    await get().patchClaims([claimId], patch);
    void get().runRules('touch', { claimIds: [claimId] }).catch(() => undefined);
    await get().logActivity(claimId, 'touch', `${log.end_action ?? 'Touch'}${log.end_sub ? ' · ' + log.end_sub : ''}${log.rca_detail ? ' — ' + log.rca_detail : ''}${terminal ? ' (closed out of worklist)' : ''}`);
  },

  async applyToSimilar(claimIds, t) {
    for (const id of claimIds) await get().recordTouch(id, { ...t, comment: '(bulk) ' + t.comment, time_spent_sec: 0 });
  },

  async raiseRequest(r) {
    const me = get().me(); const ids = practiceIds(me); const cl = get().claims.find((c) => c.id === r.claim_id)?.client_id; const cid = r.client_id || cl || (get().clientScope.length === 1 ? get().clientScope[0] : ids[0]);
    if (!me || !cid || !ids.includes(cid) || !portalPerms(me).can_message) return;
    const row: ClientRequest = { id: uid(), client_id: cid, claim_id: r.claim_id ?? null, author_id: me.id, author_name: me.full_name, kind: r.kind, body: r.body, status: 'open', response: null, responded_by: null, responded_at: null, created_at: nowISO() };
    await db.upsert('client_requests', [row]); set((s) => ({ requests: [...s.requests, row] }));
  },
  async createApproval({ claim_id, amount, body }) {
    const me = get().me(); const c = get().claims.find((x) => x.id === claim_id); if (!me || !c) return;
    const row: ClientRequest = { id: uid(), client_id: c.client_id, claim_id, author_id: me.id, author_name: me.full_name, kind: 'approval', amount, decision: null, body, status: 'open', response: null, responded_by: null, responded_at: null, created_at: nowISO() };
    await db.upsert('client_requests', [row]); set((s) => ({ requests: [...s.requests, row] }));
    await get().logActivity(claim_id, 'approval', `Requested client approval to adjust $${amount.toFixed(2)}`);
  },
  async decideApproval(id, decision, note) {
    const me = get().me(); const r = get().requests.find((x) => x.id === id); if (!r) return;
    const patch = { decision, response: note || (decision === 'approved' ? 'Approved by the practice.' : 'Declined by the practice.'), status: 'answered' as const, responded_by: me?.id ?? null, responded_at: nowISO() };
    await db.update('client_requests', [id], patch); set((s) => ({ requests: s.requests.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));
    if (r.claim_id && me?.role !== 'client') await get().logActivity(r.claim_id, 'approval', `Client ${decision} adjustment of $${(r.amount || 0).toFixed(2)}`);
    await get().notify({ title: `Client ${decision} an adjustment ($${(r.amount || 0).toFixed(2)})`, body: note || undefined, link: r.claim_id ? '/requests' : '/requests', severity: decision === 'approved' ? 'info' : 'warn', user_id: r.author_id });
  },
  async answerRequest(id, response, status = 'answered') {
    const me = get().me(); const patch = { response, status, responded_by: me?.id ?? null, responded_at: nowISO() };
    await db.update('client_requests', [id], patch); set((s) => ({ requests: s.requests.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));
  },

  async find(table, where, opts) { return db.find(table, where, opts); },

  async audit_(kind, summary, meta = {}, entity, entityId) {
    const me = get().me(); if (!me) return;
    try { await db.upsert('audit_log', [{ id: uid(), actor_id: me.id, actor_name: me.full_name, actor_role: me.role, kind, entity: entity ?? null, entity_id: entityId ?? null, summary, meta, created_at: nowISO() }]); } catch { /* auditing must never break the action */ }
  },

  async applyImport({ plan, client, settings, mode, fileName, fileHash, asOf, templateName, totalRows, runRules, guardrailsAck }) {
    const st = get(); const me = st.me(); const batchId = uid(); const now = nowISO(); const CH = 400;
    const buckets = bucketsFrom(st.config);
    const chunked = async (table: TableName, rows: any[]) => { for (let i = 0; i < rows.length; i += CH) await get().save(table, rows.slice(i, i + CH)); };
    const reducedV = plan.changes.filter((c) => c.delta < 0).reduce((a, c) => a - c.delta, 0) + plan.closes.reduce((a, c) => a + Math.max(0, c.amount), 0);
    const batch: any = { id: batchId, client_id: client.id, template_name: templateName, file_name: fileName, mode, status: 'committed', as_of: asOf, file_hash: fileHash, total_rows: totalRows,
      new_rows: plan.creates.length, updated_rows: plan.changes.length, dropped_rows: plan.closes.length + plan.reviews.length, skipped_rows: plan.stats.skipped || 0, total_balance: Math.round(plan.totalBalance * 100) / 100, created_by: me?.id ?? null, created_at: now,
      rules: settings, guardrails: plan.guardrails.map((g) => ({ id: g.id, level: g.level, title: g.title, acked: guardrailsAck.includes(g.id) })), summary: {} };
    await get().save('import_batches', [batch]);
    try {
      // permanent claim UIDs: sequential per client, allocated atomically by the database when available
      if (plan.creates.length) {
        const tag = clientTag(client); let start = 0;
        try { if (db.rpc) { const r = await db.rpc('alloc_claim_uids', { p_client: client.id, p_n: plan.creates.length }); if (typeof r === 'number' || typeof r === 'string') start = Number(r); } } catch { start = 0; }
        if (!start) start = maxSeq(get().claims.filter((c) => c.client_id === client.id), tag);
        const ids = allocateUids(tag, start, plan.creates.length); plan.creates.forEach((c, i) => { c.claim_uid = ids[i]; });
      }
      await chunked('claims', plan.creates); await chunked('claims', plan.changes.map((c) => c.next)); await chunked('claims', plan.unchanged.map((c) => c.next)); await chunked('claims', plan.reviews.map((c) => c.next));   // reappeared claims travel inside changes / unchanged
      await chunked('claims', plan.closes.map((c) => c.next)); await chunked('claims', plan.misses.map((c) => c.next));
      const logRows = plan.log.map((l) => ({ id: uid(), batch_id: batchId, client_id: client.id, row_no: l.row_no, claim_id: l.claim_id, claim_key: l.claim_key, action: l.action, code: l.code, severity: l.severity, message: l.message, before: l.before ?? null, after: l.after ?? null, created_at: now }));
      for (let i = 0; i < logRows.length; i += CH) await db.upsert('import_log', logRows.slice(i, i + CH));
      const actor = me?.full_name ?? 'Import'; const mkAct = (claim_id: string, kind: string, summary: string) => ({ id: uid(), claim_id, actor_id: me?.id ?? null, actor_name: actor, kind, summary, meta: { batchId }, created_at: now });
      const acts = [
        ...plan.changes.filter((c) => Math.abs(c.delta) > 0.004).map((c) => mkAct(c.claim.id, 'balance', `Balance ${c.delta < 0 ? 'decreased' : 'increased'} ${Math.abs(c.delta).toFixed(2)} (${c.claim.balance.toFixed(2)} → ${c.next.balance.toFixed(2)}) via import`)),
        ...plan.changes.filter((c) => c.kind === 'REOPENED').map((c) => mkAct(c.claim.id, 'reopen', c.claim.resolved_by ? `Back on the aging file after being resolved as ${c.claim.resolution || 'closed'} by ${get().profiles.find((p) => p.id === c.claim.resolved_by)?.full_name || 'a reviewer'} — reopened; that decision's recovery credits were reversed` : 'Re-appeared on aging report — reopened')),
        ...plan.changes.filter((c) => c.kind === 'REKEYED').map((c) => mkAct(c.claim.id, 'identity', `Claim # ${c.claim.claim_no} → ${c.next.claim_no}; history carried over`)),
        ...plan.reviews.map((c) => mkAct(c.claim.id, 'review', `Absent from the aging file (${asOf ? asOf.slice(5, 7) + '/' + asOf.slice(8, 10) + '/' + asOf.slice(0, 4) : 'latest'}) — waiting for a supervisor/manager to mark it paid, written off or restore it`)),
        ...plan.reappeared.map((c) => mkAct(c.claim.id, 'review', 'Back on the aging file — removed from the missing-claims review queue')),
        ...plan.creates.filter((c) => (c.flags || []).includes('key_reuse')).map((c) => mkAct(c.id, 'identity', `Claim # was already used by a different patient/DOS — created as a separate claim (${c.claim_uid})`)),
        ...plan.creates.map((c) => mkAct(c.id, 'import', `Created from ${fileName} · UID ${c.claim_uid}`)),
        ...plan.closes.map((c) => mkAct(c.claim.id, 'close', c.reason === 'zero balance' ? 'Zero balance in aging file — closed' : 'Dropped off aging report — closed (payment or adjustment posted)')),
      ];
      { const rev = new Set(plan.changes.filter((c) => c.kind === 'REOPENED' && c.claim.resolved_by).map((c) => c.claim.id)); const gone = get().recoveries.filter((r) => r.claim_id && rev.has(r.claim_id) && String(r.basis).startsWith('review_')).map((r) => r.id); if (gone.length) await get().del('recoveries', gone); }
      for (let i = 0; i < acts.length; i += CH) { const part = acts.slice(i, i + CH); await db.upsert('claim_activity', part); set((s) => ({ activity: [...s.activity, ...(part as Activity[])] })); }
      const lastBatch = get().batches.filter((b) => b.client_id === client.id && b.status !== 'rolled_back' && b.status !== 'failed').map((b) => b.created_at).sort().pop() || '';
      const eraCredit = new Map<string, number>(); for (const r of get().recoveries) if (r.basis === 'era835' && r.client_id === client.id && r.claim_id && r.created_at > lastBatch) eraCredit.set(r.claim_id, (eraCredit.get(r.claim_id) || 0) + r.amount * (r.share ?? 1));
      const recs = buildRecoveries(plan, get().workLog, settings, { batchId, now, asOf, clientId: client.id, uid, eraCredit });
      for (let i = 0; i < recs.length; i += CH) await get().save('recoveries', recs.slice(i, i + CH) as any);
      const day = asOf || now.slice(0, 10); const snaps: ClaimSnapshot[] = [...plan.creates, ...plan.changes.map((c) => c.next), ...plan.unchanged.map((c) => c.next)].map((c) => { const a = ageDays(c, client); return { id: uid(), batch_id: batchId, claim_id: c.id, client_id: client.id, as_of: day, balance: c.balance, billed_amt: c.billed_amt, payer: c.payer, provider: c.provider, age_days: a, bucket: bucketFor(a, buckets)?.label ?? null, created_at: now }; });
      try { for (let i = 0; i < snaps.length; i += CH) await db.upsert('claim_snapshots', snaps.slice(i, i + CH) as any); if (get().snapshotsLoaded) set((s) => ({ snapshots: [...s.snapshots, ...snaps] })); } catch { /* table arrives with migration 0008 — imports must not fail without it */ }
      const mine = get().claims.filter((c) => c.client_id === client.id);
      const final = { ...batch, summary: batchSummary(mine, client, buckets, { n: plan.closes.length + plan.changes.filter((c) => c.delta < -0.005).length, v: Math.round(reducedV) }) };
      await get().save('import_batches', [final]);
      if (plan.reviews.length) void get().notify({ title: `${plan.reviews.length} claims missing from ${client.name}'s latest file need review`, body: `$${Math.round(plan.reviews.reduce((a, c) => a + c.claim.balance, 0)).toLocaleString('en-US')} stays open until marked paid, written off or restored`, link: '/missing', severity: 'warn', role: 'supervisor' });
      void get().audit_('import', `Imported ${fileName} for ${client.name}: +${plan.creates.length} new, ${plan.changes.length} updated, ${plan.closes.length} closed, ${plan.reviews.length} to review`, { batchId, mode, asOf, guardrailsAck }, 'import_batches', batchId);
    } catch (e: any) {
      await get().save('import_batches', [{ ...batch, status: 'failed' }]);
      void get().audit_('import_failed', `Import of ${fileName} failed: ${e.message}`, { batchId }, 'import_batches', batchId);
      throw new Error(`Import failed part-way (${e.message}). The batch is marked failed — use Import history → Undo to restore.`);
    }
    let ruleChanges = 0;
    if (runRules) { try { ruleChanges = (await get().runRules('import', { batchId })).changed; } catch { /* rules never block an import */ } }
    try { await get().recalcExpected({ clientId: client.id }); } catch { /* expected column is advisory — never fail an import */ }
    return { batchId, recoveries: get().recoveries.filter((r) => r.batch_id === batchId).length, ruleChanges };
  },

  async rollbackBatch(batchId) {
    const st = get(); const batch = st.batches.find((b) => b.id === batchId); if (!batch) throw new Error('Batch not found');
    if (batch.status === 'rolled_back') throw new Error('Already rolled back');
    const later = st.batches.filter((b) => b.client_id === batch.client_id && b.id !== batchId && b.status !== 'rolled_back' && b.status !== 'failed' && b.created_at > batch.created_at);
    if (later.length) throw new Error('A newer import exists for this client. Undo that one first (imports can only be undone newest-first).');
    const rows = (await db.find('import_log', { batch_id: batchId })) as any[]; const now = nowISO();
    try { const sn = (await db.find('claim_snapshots', { batch_id: batchId })) as any[]; if (sn.length) { await db.remove('claim_snapshots', sn.map((x) => x.id)); set((s) => ({ snapshots: s.snapshots.filter((x) => x.batch_id !== batchId) })); } } catch { /* snapshot table optional until migration 0008 */ }
    const cm = new Map(st.claims.map((c) => [c.id, c])); const restore: Claim[] = []; const del: string[] = []; const keep: Claim[] = [];
    const prev = st.batches.filter((b) => b.client_id === batch.client_id && b.id !== batchId && b.status !== 'rolled_back' && b.status !== 'failed' && b.created_at < batch.created_at).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const logged = new Set<string>();
    for (const l of rows) {
      if (!l.claim_id) continue; const c = cm.get(l.claim_id); if (!c) continue; logged.add(l.claim_id);
      if (l.action === 'CREATED') {
        const worked = c.touch_count > 0 || st.notes.some((n) => n.claim_id === c.id);
        if (worked) keep.push({ ...c, closed_at: now, closed_reason: 'Import rolled back (claim had been worked)', resolution: 'rolled_back', updated_at: now }); else del.push(c.id);
      } else if (l.before && ['UPDATED', 'REOPENED', 'REKEYED', 'CLOSED', 'MISSING'].includes(l.action)) {
        if (l.action === 'MISSING' && c.resolved_by && c.closed_at) continue;   // a supervisor already decided this claim — an undo must not reopen it
        const b = l.before as Record<string, any>; const next: any = { ...c };
        for (const k of SNAP_FIELDS) { if (k === 'status' && !['REOPENED', 'CLOSED'].includes(l.action)) continue; if (k === 'custom') continue; if (k in b) next[k] = b[k]; }
        next.updated_at = now; restore.push(next);
      }
    }
    const touchOnly = st.claims.filter((c) => c.client_id === batch.client_id && c.last_batch === batchId && !logged.has(c.id)).map((c) => ({ ...c, last_batch: prev?.id ?? c.first_batch, as_of: prev?.as_of ?? null, missing_count: 0, updated_at: now }));
    for (let i = 0; i < restore.length; i += 400) await get().save('claims', restore.slice(i, i + 400) as any);
    for (let i = 0; i < touchOnly.length; i += 400) await get().save('claims', touchOnly.slice(i, i + 400) as any);
    if (keep.length) await get().save('claims', keep as any);
    if (del.length) for (let i = 0; i < del.length; i += 400) await get().del('claims', del.slice(i, i + 400));
    const recIds = st.recoveries.filter((r) => r.batch_id === batchId).map((r) => r.id); if (recIds.length) await get().del('recoveries', recIds);
    await get().save('import_batches', [{ ...batch, status: 'rolled_back', rolled_back_at: now } as any]);
    await get().logActivity([...restore.map((c) => c.id), ...keep.map((c) => c.id)].slice(0, 2000), 'rollback', `Import “${batch.file_name}” rolled back`);
    void get().audit_('import_rollback', `Rolled back import ${batch.file_name}: restored ${restore.length}, removed ${del.length}, kept-closed ${keep.length}`, { batchId }, 'import_batches', batchId);
    return { restored: restore.length + touchOnly.length, removed: del.length, kept: keep.length };
  },

  async runRules(trigger, opts = {}) {
    const st = get(); const me = st.me(); const today = todayISO(); const now = nowISO();
    const rules = st.autoRules.filter((r) => r.enabled && (trigger === 'any' || r.trigger === trigger) && (!opts.ruleIds || opts.ruleIds.includes(r.id)) && (!opts.clientId || !r.client_id || r.client_id === opts.clientId));
    if (!rules.length) return { runs: [], changed: 0 };
    const open = st.claims.filter((c) => !c.closed_at);
    const cand = opts.claimIds ? open.filter((c) => opts.claimIds!.includes(c.id)) : trigger === 'import' && opts.batchId ? open.filter((c) => c.last_batch === opts.batchId) : opts.clientId ? open.filter((c) => c.client_id === opts.clientId) : open;
    const loads = new Map<string, number>(); open.forEach((c) => c.assigned_to && loads.set(c.assigned_to, (loads.get(c.assigned_to) || 0) + 1));
    const env = { today, buckets: bucketsFrom(st.config), clients: new Map(st.clients.map((c) => [c.id, c])), payerTf: new Map(st.config.filter((o) => o.category === 'payer' && o.meta.tf_days).map((o) => [o.value.toLowerCase(), Number(o.meta.tf_days)])), batchId: opts.batchId ?? null, loads, userName: (id: string) => st.profiles.find((p) => p.id === id)?.full_name ?? id };
    const plan = planRules(rules, cand, env, trigger === 'any' ? undefined : trigger);
    const changedRuns = plan.runs.reduce((a, r) => a + r.changed, 0);
    if (!opts.dry && plan.effects.size) {
      const cm = new Map(cand.map((c) => [c.id, c])); const updated: Claim[] = []; const acts: any[] = []; const notes: Note[] = [];
      for (const [id, e] of plan.effects) {
        const c = cm.get(id)!; if (!e.applied.length) continue;
        const flags = [...new Set([...(c.flags || []).filter((f) => !e.flagsRemove.has(f)), ...e.flagsAdd])];
        const next: Claim = { ...c, ...e.patch, flags, updated_at: now };
        if (e.close) Object.assign(next, { closed_at: now, closed_reason: e.close.reason, resolution: e.close.resolution, status: 'Adjusted' });
        updated.push(next);
        const bits = [e.patch.assigned_to && `owner → ${env.userName(e.patch.assigned_to)}`, e.patch.priority && `priority → ${e.patch.priority}`, e.patch.status && `status → ${e.patch.status}`, e.patch.next_fu && `follow-up → ${e.patch.next_fu}`, e.flagsAdd.size && `flag +${[...e.flagsAdd].join(',')}`, e.flagsRemove.size && `flag −${[...e.flagsRemove].join(',')}`, e.close && 'closed'].filter(Boolean).join('; ');
        acts.push({ id: uid(), claim_id: id, actor_id: me?.id ?? null, actor_name: 'Rule engine', kind: 'rule', summary: `Rule “${e.applied.join('”, “')}”: ${bits}`, meta: { rules: e.applied }, created_at: now });
        e.notes.forEach((n) => notes.push({ id: uid(), claim_id: id, author_id: null, author_name: 'Rule engine', body: n.body, pinned: false, client_visible: n.client_visible, created_at: now }));
      }
      for (let i = 0; i < updated.length; i += 400) await get().save('claims', updated.slice(i, i + 400) as any);
      for (let i = 0; i < acts.length; i += 400) { const part = acts.slice(i, i + 400); await db.upsert('claim_activity', part); set((s) => ({ activity: [...s.activity, ...part] })); }
      if (notes.length) { await db.upsert('claim_notes', notes); set((s) => ({ notes: [...s.notes, ...notes] })); }
      const notifs: Notification[] = [];
      for (const [id, e] of plan.effects) { const c = cm.get(id)!; for (const n of e.notifications) {
        const sup = st.clients.find((x) => x.id === c.client_id)?.supervisor_id ?? st.profiles.find((p) => p.id === c.assigned_to)?.supervisor_id ?? null;
        const target = n.to === 'owner' ? { user_id: c.assigned_to, role: null } : n.to === 'supervisor' ? { user_id: sup, role: sup ? null : 'supervisor' } : n.to === 'admin' ? { user_id: null, role: 'admin' } : { user_id: null, role: null };
        if (n.to === 'owner' && !c.assigned_to) continue;
        notifs.push({ id: uid(), ...target, title: n.title, body: n.body, link: `/worklist?q=${encodeURIComponent(c.claim_no)}`, severity: 'warn', read_by: [], created_at: now });
      } }
      if (notifs.length) { await db.upsert('notifications', notifs); set((s) => ({ notifications: [...s.notifications, ...notifs] })); }
    }
    const runRows = plan.runs.filter((r) => r.matched > 0 || opts.dry).map((r) => ({ id: uid(), rule_id: r.rule.id, rule_name: r.rule.name, trigger: trigger, dry_run: !!opts.dry, matched: r.matched, changed: r.changed, actor_name: me?.full_name ?? 'system', batch_id: opts.batchId ?? null, sample: r.sample, created_at: now }));
    if (runRows.length && !opts.dry) { await db.upsert('rule_runs', runRows); set((s) => ({ ruleRuns: [...s.ruleRuns, ...(runRows as RuleRun[])] })); }
    if (!opts.dry && changedRuns) void get().audit_('rules', `Rules (${trigger}) changed ${changedRuns} claim-rule effects`, { rules: plan.runs.filter((r) => r.changed).map((r) => `${r.rule.name}: ${r.changed}`) }, 'automation_rules');
    return { runs: plan.runs, changed: plan.effects.size ? [...plan.effects.values()].filter((e) => e.applied.length).length : 0 };
  },

  async mergeClaims(keepId, dropId) {
    const st = get(); const keep = st.claims.find((c) => c.id === keepId), drop = st.claims.find((c) => c.id === dropId); if (!keep || !drop || keep.client_id !== drop.client_id) throw new Error('Pick two claims from the same client');
    const mv = async (table: TableName, rows: any[]) => { if (rows.length) await db.upsert(table, rows.map((r) => ({ ...r, claim_id: keepId }))); };
    await mv('claim_notes', st.notes.filter((n) => n.claim_id === dropId)); await mv('work_log', st.workLog.filter((w) => w.claim_id === dropId)); await mv('claim_activity', st.activity.filter((a) => a.claim_id === dropId)); await mv('recoveries', st.recoveries.filter((r) => r.claim_id === dropId));
    const aliases = [...new Set([...(keep.aliases || []), ...(drop.aliases || []), drop.claim_key || '', drop.claim_no.toUpperCase().replace(/[^A-Z0-9]/g, '')].filter((a) => a && a !== keep.claim_key))];
    const merged: Claim = { ...keep, aliases, touch_count: keep.touch_count + drop.touch_count, flags: (keep.flags || []).filter((f) => f !== 'possible_duplicate'), updated_at: nowISO(),
      last_touched_at: [keep.last_touched_at, drop.last_touched_at].filter(Boolean).sort().pop() || null, assigned_to: keep.assigned_to ?? drop.assigned_to };
    await db.upsert('claims', [merged]);
    await db.remove('claims', [dropId]);
    set((s) => ({ claims: s.claims.filter((c) => c.id !== dropId).map((c) => (c.id === keepId ? merged : c)), notes: s.notes.map((n) => (n.claim_id === dropId ? { ...n, claim_id: keepId } : n)), workLog: s.workLog.map((w) => (w.claim_id === dropId ? { ...w, claim_id: keepId } : w)), activity: s.activity.map((a) => (a.claim_id === dropId ? { ...a, claim_id: keepId } : a)), recoveries: s.recoveries.map((r) => (r.claim_id === dropId ? { ...r, claim_id: keepId } : r)) }));
    await get().logActivity(keepId, 'merge', `Merged duplicate claim ${drop.claim_no} into this claim; its number is remembered as an alias`);
    void get().audit_('merge', `Merged ${drop.claim_no} into ${keep.claim_no}`, { keepId, dropId }, 'claims', keepId);
  },

  async resolveMissing(decisions) {
    const st = get(); const me = st.me(); const skipped: Skipped[] = []; if (!me || !st.has('resolve_missing')) return { done: 0, skipped: decisions.map((d) => ({ claimId: d.claimId, reason: 'You do not have permission to resolve claims' })) };
    const cm = new Map(st.claims.map((c) => [c.id, c])); const now = nowISO(); const limit = Number((st.settings.workflow as any)?.writeOffLimit ?? 1000); const ctx = { now, actor: { id: me.id, name: me.full_name, role: me.role }, writeOffLimit: limit, canOverrideLimit: isMgmt(me.role), workLog: st.workLog, uid, attributionWindowDays: resolveSettings(st.settings.import as any, null).attributionWindowDays };
    const claims: Claim[] = [], acts: any[] = [], recs: any[] = [], touches: any[] = [];
    for (const d of decisions) {
      const c = cm.get(d.claimId); const err = validateDecision(c, d, ctx); if (err || !c) { skipped.push({ claimId: d.claimId, reason: err || 'Claim not found' }); continue; }
      const a = applyDecision(c, d, ctx); claims.push(a.next); acts.push({ id: uid(), actor_id: me.id, actor_name: me.full_name, created_at: now, ...a.activity }); recs.push(...a.recoveries.map((r) => ({ ...r, user_name: r.user_name })));
      if (a.touch) touches.push({ id: uid(), created_at: now, ...a.touch, emp_code: me.emp_code, supervisor_name: null });
    }
    try { for (let i = 0; i < claims.length; i += 400) await get().save('claims', claims.slice(i, i + 400) as any); } catch (e: any) { return { done: 0, skipped: [{ claimId: decisions[0]?.claimId || '', reason: /already resolved/i.test(e.message) ? 'Someone else already resolved one of these claims — refresh and try again' : e.message }] }; }
    for (let i = 0; i < acts.length; i += 400) { const part = acts.slice(i, i + 400); await db.upsert('claim_activity', part); set((s) => ({ activity: [...s.activity, ...(part as Activity[])] })); }
    for (let i = 0; i < recs.length; i += 400) await get().save('recoveries', recs.slice(i, i + 400) as any);
    for (let i = 0; i < touches.length; i += 400) await get().save('work_log', touches.slice(i, i + 400) as any);
    if (claims.length) void get().audit_('review', `Resolved ${claims.length} missing claim${claims.length === 1 ? '' : 's'}`, { outcomes: decisions.reduce((m: Record<string, number>, d) => ({ ...m, [d.outcome]: (m[d.outcome] || 0) + 1 }), {}), skipped: skipped.length }, 'claims');
    return { done: claims.length, skipped };
  },
  async reopenClaim(claimId, reason) {
    const st = get(); const me = st.me(); const c = st.claims.find((x) => x.id === claimId); if (!me || !c) return { ok: false, message: 'Claim not found' };
    if (!st.has('resolve_missing')) return { ok: false, message: 'You do not have permission to reopen claims' }; if (!c.closed_at) return { ok: false, message: 'Claim is not closed' }; if (reason.trim().length < 3) return { ok: false, message: 'Give a reason for reopening' };
    const now = nowISO(); const reversed = st.recoveries.filter((r) => r.claim_id === claimId && String(r.basis).startsWith('review_') && (!c.resolved_at || r.created_at >= c.resolved_at));
    const next: Claim = { ...c, closed_at: null, closed_reason: null, resolution: null, resolved_by: null, resolved_at: null, resolution_note: null, status: c.touch_count > 0 ? 'In Progress' : 'New', missing_count: 0, missing_since: null, flags: [...new Set([...(c.flags || []), 'reopened'])], balance: Number(c.custom?.resolved_balance ?? c.balance), custom: { ...c.custom, lifecycle: 'REO', lifecycle_at: now, reopened: true }, updated_at: now };
    if (reversed.length) await get().del('recoveries', reversed.map((r) => r.id));
    await get().save('claims', [next] as any); await get().logActivity(claimId, 'reopen', `Reopened by ${me.full_name}: ${reason.trim()}${reversed.length ? ` (reversed ${reversed.length} recovery record${reversed.length === 1 ? '' : 's'} from the earlier decision)` : ''}`, { by: me.id });
    void get().audit_('reopen', `Reopened ${c.claim_no}`, { reason }, 'claims', claimId);
    return { ok: true };
  },
  async setResolution(claimId, resolution) {
    await get().patchClaims([claimId], { resolution }, `Resolution confirmed: ${resolution}`, 'resolution');
    const type = resolution === 'paid' ? 'payment' : resolution === 'adjusted' ? 'adjustment' : 'patient';
    const recs = get().recoveries.filter((r) => r.claim_id === claimId && r.type === 'unknown'); if (recs.length) await get().save('recoveries', recs.map((r) => ({ ...r, type })) as any);
  },

  async clearFlag(ids, flag) {
    const rows = get().claims.filter((c) => ids.includes(c.id)).map((c) => ({ ...c, flags: (c.flags || []).filter((f) => f !== flag), updated_at: nowISO() }));
    for (let i = 0; i < rows.length; i += 400) await get().save('claims', rows.slice(i, i + 400) as any);
  },

  async audit(logId, status, remarks) {
    const me = get().me();
    const patch = { audit_status: status, audit_remarks: remarks || null, audit_by: me?.id ?? null, audited_at: nowISO() };
    await db.update('work_log', [logId], patch);
    set((s) => ({ workLog: s.workLog.map((w) => (w.id === logId ? { ...w, ...patch } : w)) }));
    const w = get().workLog.find((x) => x.id === logId);
    if (w) await get().logActivity(w.claim_id, 'audit', `QA ${status}${remarks ? ': ' + remarks : ''}`);
  },
}));

export const STATUS_TERMINAL = (config: ConfigOption[], status: string) => !!config.find((c) => c.category === 'status' && c.value === status)?.meta.terminal;


/** Shared by the store (flag sync) and the Exceptions page (live view). */
export function computeViolations(st: Pick<State, 'config' | 'clients' | 'profiles' | 'workLog' | 'settings' | 'claims'> & { carcMap(): Map<string, Carc> }, open: Claim[]): Violation[] {
  const buckets = bucketsFrom(st.config); void buckets;
  const today = todayISO(); const cm = new Map(st.clients.map((c) => [c.id, c]));
  const terminal = new Set(st.config.filter((o) => o.category === 'status' && o.meta.terminal).map((o) => o.value));
  const endActions = new Map(st.config.filter((o) => o.category === 'end_action').map((o) => [o.value, { status: o.meta.status as string | undefined, terminal: !!o.meta.terminal }]));
  const users = new Map(st.profiles.map((p) => [p.id, { active: p.active, name: p.full_name }]));
  const payerTf = new Map(st.config.filter((o) => o.category === 'payer' && o.meta.tf_days).map((o) => [o.value.toLowerCase(), Number(o.meta.tf_days)]));
  const touches = new Map<string, WorkLog[]>(); [...st.workLog].sort((a, b) => b.created_at.localeCompare(a.created_at)).forEach((w) => { const l = touches.get(w.claim_id); if (l) l.push(w); else touches.set(w.claim_id, [w]); });
  const fp = new Map<string, number>(); open.forEach((c) => { if (c.fingerprint) fp.set(c.client_id + c.fingerprint, (fp.get(c.client_id + c.fingerprint) || 0) + 1); });
  const carc = st.carcMap();
  const items = open.map((c) => { const client = cm.get(c.client_id); const tf = payerTf.get((c.payer || '').toLowerCase()) ?? client?.tf_days; return { today, c, client, age: ageDays(c, client), tfLeft: tf && c.dos ? tf - Math.round((Date.parse(today) - Date.parse(c.dos)) / 864e5) : null, terminal, endActions, users, carc, touchesOf: (id: string) => touches.get(id) || [], dupCountOf: (x: Claim) => (x.fingerprint ? fp.get(x.client_id + x.fingerprint) || 1 : 1) }; });
  return runChecks(items as any, (st.settings.checks || {}) as any).filter((v) => !(open.find((c) => c.id === v.claim_id)?.flags || []).includes('ign:' + v.check_id));
}
export { CHECKS };

if (typeof window !== 'undefined') (window as any).__arms = useStore; // handle for e2e/diagnostics
