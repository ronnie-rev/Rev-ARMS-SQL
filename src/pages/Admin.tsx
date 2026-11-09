import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Building2, FileUp, GitBranch, Palette, Workflow, Search, Stethoscope, Users as UsersIcon } from 'lucide-react';
import { ClientAccess } from './admin/ClientAccess';
import { LifecycleEditor } from './admin/LifecycleEditor';
import { ConsoleAudit } from './admin/ConsoleAudit';
import { ArrowDown, ArrowUp, Copy, Download, Plus, Trash2, ListPlus } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, Empty, Field, Modal, PageHeader, Tabs, toast, useConfirm } from '../components/ui';
import { practiceIds, ROLE_LABEL, type Category, type Client, type ConfigOption, type ImportTemplate, type Profile, type Role } from '../lib/types';
import { downloadFile, uid, setWorkspaceTz, US_TIMEZONES } from '../lib/utils';
import { assignableRoles, canEditUser, canSupervise, ROLE_META, ROLE_ORDER } from '../lib/roles';
import { fieldsFor } from '../lib/pms';
import { validateClient, validateOption, validateProfile, normName } from '../lib/engine/adminvalidate';
import Limits from './admin/Limits';
import GoLive from './admin/GoLive';
import Controls from './admin/Controls';
import RecRules from './admin/RecRules';
import AppealLibrary from './admin/AppealLibrary';
import FaxSetup from './admin/FaxSetup';
import DocServices from './admin/DocServices';
import Feedback from './admin/Feedback';
import ClientSops from './admin/ClientSops';
import EmailIntake from './admin/EmailIntake';
import AccessAudit from './admin/AccessAudit';
import IntelRules from './admin/IntelRules';
import Reimbursement from './admin/Reimbursement';
import AppealForms from './admin/AppealForms';
import ScoreRules from './admin/ScoreRules';
import { BulkRules, PriorityRules } from './admin/BulkPriority';
import { SampleBar, type SampleSpec } from '../components/SampleBar';
import { CLIENT_SAMPLE, LIST_SAMPLES, TREE_SAMPLES, USER_SAMPLE, yes } from '../lib/samples';
import { Backup, Doctor, ImportRules, PayerLinks, Permissions, Security } from './admin/Extras';

type Tab = 'docservices' | 'accessaudit' | 'emailin' | 'clientsops' | 'feedback' | 'faxsetup' | 'applib' | 'recrules' | 'controls' | 'intelrules' | 'golive' | 'buckets2' | 'bulkrules' | 'prirules' | 'scorerules' | 'aforms' | 'reimb' | 'limits' | 'stages' | 'doctor' | 'import' | 'permissions' | 'security' | 'carc' | 'resources' | 'playbooks' | 'letters' | 'articles' | 'outcomes' | 'backup' | 'users' | 'access' | 'snippets' | 'clients' | 'buckets' | 'statuses' | 'lifecycle' | 'rca' | 'actions' | 'lists' | 'payers' | 'fields' | 'templates' | 'workspace' | 'audit';
interface Item { id: Tab; label: string; hint: string; kw?: string }
export const ADMIN_GROUPS: { name: string; icon: ReactNode; items: Item[] }[] = [
  { name: 'Manager controls', icon: <Workflow size={14} />, items: [{ id: 'controls', label: 'All controls', hint: 'Every rule managers can change, in one place', kw: 'rules settings thresholds overview' }, { id: 'recrules', label: 'Recommendation rules', hint: 'Create your own “if this, recommend that” rules', kw: 'custom rule builder next best action automation' }, { id: 'intelrules', label: 'Intelligence rules', hint: 'Next best action, forecast, capacity, signals, calculators', kw: 'recommend thresholds automation' }] },
  { name: 'Overview', icon: <Stethoscope size={14} />, items: [{ id: 'feedback', label: 'Tester feedback', hint: 'Bugs and ideas sent from the app', kw: 'bug report ideas' }, { id: 'golive', label: 'Go-live checklist', hint: 'Everything to link or confirm before real users sign in', kw: 'launch production sso mfa email smtp legal' }, { id: 'docservices', label: 'Document services', hint: 'Local Office→PDF, server OCR, grammar', kw: 'gotenberg stirling languagetool docker pdf ocr' }, { id: 'doctor', label: 'Setup doctor', hint: 'Health score, self-test, connectivity', kw: 'health check test' }, { id: 'audit', label: 'Console audit', hint: 'Seed dummy data and validate every setting', kw: 'validate qa test dummy' }] },
  { name: 'People & access', icon: <UsersIcon size={14} />, items: [{ id: 'accessaudit', label: 'Access audit', hint: 'Who can see and do what; client restrictions', kw: 'security permissions roles tenant client restriction review' }, { id: 'users', label: 'Staff & roles', hint: 'Team members, supervisors, targets, skills', kw: 'users employees' }, { id: 'access', label: 'Client access', hint: 'Client logins, practices, view-only permissions', kw: 'portal invite client users' }, { id: 'permissions', label: 'Permissions', hint: 'What each role can do', kw: 'rbac capabilities' }, { id: 'security', label: 'Security & privacy', hint: 'PHI masking, idle timeout, watermark', kw: 'phi hipaa' }] },
  { name: 'Practices & payers', icon: <Building2 size={14} />, items: [{ id: 'clients', label: 'Clients & providers', hint: 'Practices, PMS, supervisors, providers', kw: 'practice' }, { id: 'clientsops', label: 'Client SOPs', hint: 'Standing instructions shown on matching claims', kw: 'sop instructions client rules cpt payer provider' }, { id: 'payers', label: 'Payers', hint: 'Directory, timely filing, follow-up windows, links', kw: 'insurance tfl' }, { id: 'buckets2', label: 'Issue buckets', hint: 'Custom per-client buckets for bulk issues', kw: 'bulk issue bucket status custom' }, { id: 'bulkrules', label: 'Bulk actions', hint: 'Allowed actions, limits, undo window', kw: 'bulk undo' }, { id: 'prirules', label: 'Smart priority', hint: 'Worklist order weights', kw: 'worklist sort criticality' }, { id: 'scorerules', label: 'Scorecard rules', hint: 'Payer behaviour-change thresholds', kw: 'alerts denial rate days to pay' }, { id: 'applib', label: 'Appeal library', hint: 'Letter templates, rationales and CPT groups (Appeal Forge)', kw: 'appeal letters templates rationale cpt denial forge' }, { id: 'emailin', label: 'Email-to-claim', hint: 'File payer emails onto claims', kw: 'inbound email postmark intake' }, { id: 'faxsetup', label: 'Fax setup', hint: 'Send appeals by fax: provider, caller ID, cover sheet', kw: 'fax phaxio documo srfax send' }, { id: 'aforms', label: 'Appeal forms', hint: 'Payer reconsideration / appeal PDFs with auto-mapped fields', kw: 'pdf form appeal reconsideration' }, { id: 'reimb', label: 'Reimbursement', hint: 'Expected %, GCR, fee schedules, underpayment rules', kw: 'expected underpayment contract allowable gcr' }, { id: 'limits', label: 'Filing limits', hint: 'TFL / AFL / CCFL per payer, escalation, digest', kw: 'timely filing appeal deadline corrected claim' }] },
  { name: 'Workflow & taxonomy', icon: <GitBranch size={14} />, items: [{ id: 'buckets', label: 'Aging buckets', hint: 'Day ranges and colors' }, { id: 'stages', label: 'Claim queues', hint: 'eCW-style A/R queues, first match wins', kw: 'stages' }, { id: 'lifecycle', label: 'Lifecycle statuses', hint: 'Native 18-state model and transition rules', kw: 'native status' }, { id: 'statuses', label: 'Workflow statuses', hint: 'Legacy statuses mapped from end actions' }, { id: 'rca', label: 'Root causes', hint: 'Category › detail', kw: 'rca' }, { id: 'actions', label: 'End actions', hint: 'Action › sub-category, follow-up days', kw: 'outcome' }, { id: 'lists', label: 'Modes & priority', hint: 'Contact modes, priority levels' }, { id: 'fields', label: 'Custom fields', hint: 'Extra claim columns' }] },
  { name: 'Import & data', icon: <FileUp size={14} />, items: [{ id: 'templates', label: 'Import templates', hint: 'PMS column mappings' }, { id: 'import', label: 'Import rules', hint: 'Identity, overwrite policy, guardrails', kw: 'reconcile duplicates' }, { id: 'backup', label: 'Backup & restore', hint: 'Export / import all configuration', kw: 'export' }] },
  { name: 'Knowledge & templates', icon: <BookOpen size={14} />, items: [{ id: 'carc', label: 'Denial codes', hint: 'CARC overrides and additions' }, { id: 'articles', label: 'Knowledge articles', hint: 'SOPs, checklists, KPI & escalation guides' }, { id: 'playbooks', label: 'Playbooks', hint: 'Checklists per root-cause detail' }, { id: 'outcomes', label: 'Note templates', hint: 'Note-builder outcomes' }, { id: 'snippets', label: 'Comment snippets', hint: 'One-click comments' }, { id: 'letters', label: 'Letter templates', hint: 'Appeal and patient letters' }, { id: 'resources', label: 'Resource library', hint: 'Portals, policies, forms' }] },
  { name: 'Workspace', icon: <Palette size={14} />, items: [{ id: 'workspace', label: 'Branding & workspace', hint: 'Name, accent color, SLA, model, daily targets', kw: 'theme logo sla' }] },
];
/** Each Admin tab needs its own capability (Admin section access alone shows only the Setup doctor). */
export const TAB_CAP: Record<string, string> = { docservices: 'access_admin', accessaudit: 'manage_users', emailin: 'manage_payer_rules', clientsops: 'manage_payer_rules', feedback: 'access_admin', faxsetup: 'manage_payer_rules', applib: 'manage_payer_rules', recrules: 'manage_payer_rules', controls: 'manage_payer_rules', intelrules: 'manage_payer_rules', golive: 'edit_config', doctor: 'access_admin', users: 'manage_users', access: 'manage_clients', clients: 'manage_clients', permissions: 'manage_permissions', payers: 'manage_payer_rules', limits: 'manage_payer_rules', reimb: 'manage_payer_rules', aforms: 'manage_payer_rules', scorerules: 'manage_payer_rules', bulkrules: 'manage_payer_rules', buckets2: 'manage_payer_rules', prirules: 'manage_payer_rules', carc: 'edit_content', articles: 'edit_content', playbooks: 'edit_content', letters: 'edit_content', outcomes: 'edit_content', snippets: 'edit_content', resources: 'edit_content' };
const capFor = (t: string) => TAB_CAP[t] ?? 'edit_config';
const ALL_ITEMS = ADMIN_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.name })));

export default function Admin() {
  const has = useStore((st) => st.has); const [sp, setSp] = useSearchParams(); const want = ((sp.get('tab') as Tab) || (has('manage_payer_rules') ? 'controls' : 'doctor')); const [q, setQ] = useState('');
  const allowed = (i: Item) => has(capFor(i.id)); const tab: Tab = ALL_ITEMS.find((i) => i.id === want && allowed(i))?.id ?? ALL_ITEMS.find(allowed)?.id ?? 'doctor';
  const set = (t: Tab) => setSp({ tab: t }, { replace: false });
  const cur = ALL_ITEMS.find((i) => i.id === tab);
  const match = (i: Item) => allowed(i) && (!q || `${i.label} ${i.hint} ${i.kw || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="Admin console" sub="Settings apply instantly to every screen" />
      <div className="grid lg:grid-cols-[250px_1fr] gap-6 items-start">
        <aside className="panel p-3 lg:sticky lg:top-0 max-h-[calc(100vh-120px)] overflow-auto">
          <div className="relative mb-3"><Search size={14} className="absolute left-3 top-3 muted" /><input className="input !pl-9" placeholder="Find a setting…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {ADMIN_GROUPS.map((g) => { const items = g.items.filter(match); return items.length ? (
            <div key={g.name} className="mb-3"><div className="nav-sec flex items-center gap-1.5 !px-2">{g.icon}{g.name}</div>
              {items.map((i) => <button key={i.id} onClick={() => set(i.id)} className="nav-item w-full text-left !py-1.5 !text-[13px]" data-active={tab === i.id}>{i.label}</button>)}</div>) : null; })}
          {q && !ALL_ITEMS.some(match) && <div className="text-xs muted p-2">No settings match “{q}”.</div>}
        </aside>
        <div className="min-w-0">
          {cur && <div className="mb-4"><div className="text-[11px] muted">{cur.group}</div><div className="text-[17px] font-semibold">{cur.label}</div><div className="text-[12.5px] muted">{cur.hint}</div></div>}
      {tab === 'doctor' && <Doctor />}
      {tab === 'docservices' && <DocServices />}
      {tab === 'golive' && <GoLive />}
      {tab === 'controls' && <Controls />}
      {tab === 'recrules' && <RecRules />}
      {tab === 'applib' && <AppealLibrary />}
      {tab === 'faxsetup' && <FaxSetup />}
      {tab === 'feedback' && <Feedback />}
      {tab === 'clientsops' && <ClientSops />}
      {tab === 'emailin' && <EmailIntake />}
      {tab === 'accessaudit' && <AccessAudit />}
      {tab === 'intelrules' && <IntelRules />}
      {tab === 'import' && <ImportRules />}
      {tab === 'permissions' && <Permissions />}
      {tab === 'security' && <Security />}
      {tab === 'backup' && <Backup />}
      {tab === 'carc' && <ListEditor category="carc" title="Denial codes (overrides & additions)" help="Value = code (e.g. CO-29). Overrides the built-in dictionary or adds new codes. Drives root-cause suggestions, denial insights and pattern mining." cols={[{ k: 'meta.meaning', l: 'Meaning', t: 'text' }, { k: 'meta.rca', l: 'Root cause category', t: 'text' }, { k: 'meta.rca_detail', l: 'Detail', t: 'text' }, { k: 'meta.action', l: 'First move', t: 'text' }, { k: 'meta.family', l: 'Family', t: 'text' }]} defaults={{ meta: {} }} />}
      {tab === 'outcomes' && <ListEditor category="outcome" title="Note templates (outcomes)" help="Used by the Note builder. Variables: {contact} {payer} {claim} {balance} {rep} {ref} {reason} {docs} {received} {check} {allowed} {paid} {next} {nextdate} {today} {codes} {via}. Wrap optional parts in [[ … ]] — they disappear when a variable inside is empty." cols={[{ k: 'meta.id', l: 'Key', t: 'text' }, { k: 'meta.body', l: 'Template', t: 'area' }]} defaults={{ meta: { id: '', body: '' } }} />}
      {tab === 'playbooks' && <ListEditor category="playbook" title="Denial playbooks" help="Checklists shown on the claim under “Denial workup”. Tie one to denial codes (CO-29, 16, CO-*, * = any denial) in “Denial codes”, or leave codes empty and set Value = the root-cause DETAIL it applies to. Steps: one per line; start a line with ! to mark it required." cols={[{ k: 'meta.codes', l: 'Denial codes (comma)', t: 'text' }, { k: 'meta.steps', l: 'Steps (one per line, ! = required)', t: 'area' }]} defaults={{ meta: { codes: '', steps: '' } }} />}
      {tab === 'articles' && <ListEditor category="kb_article" title="Knowledge articles (Knowledge → RCM playbook)" help="Value = article title. Section groups it in the hub. Body: one line per item — '# ' sub-heading, '- ' bullet, '1. ' numbered step, '| a | b |' table row. Give an article the same title as a built-in one to replace it; deactivate (delete) to fall back to the built-in." cols={[{ k: 'meta.section', l: 'Section', t: 'select', opts: ['SOP', 'Checklist', 'KPI', 'Escalation', 'Client comms'] }, { k: 'meta.summary', l: 'Summary', t: 'text' }, { k: 'meta.body', l: 'Body', t: 'area' }]} defaults={{ meta: { section: 'SOP', summary: '', body: '- First step' } }} />}
      {tab === 'letters' && <ListEditor category="letter" title="Letter templates" help="Variables: {payer} {claim} {patient} {dos} {cpt} {billed} {balance} {paid} {allowed} {expected} {variance} {codes} {reason} {practice} {provider} {date} {user} {level} {deadline} {denial_date} {tracking}. [[ optional {var} text ]] disappears when the variable is empty. The appeal builder auto-picks a letter by Denial codes (CO-29, 16, CO-*) or Kind; leave both empty to rely on the built-in match by title." cols={[{ k: 'meta.kind', l: 'Kind', t: 'select', opts: ['', 'appeal', 'reconsideration', 'corrected_claim', 'underpayment_dispute', 'external_review'] }, { k: 'meta.codes', l: 'Denial codes (comma)', t: 'text' }, { k: 'meta.body', l: 'Body', t: 'area' }]} defaults={{ meta: { kind: '', codes: '', body: '' } }} />}
      {tab === 'resources' && <ListEditor category="resource" title="Resource library" help="Policy sites, portals, tools and forms. Leave “Payers” empty for a global link, or list payer names (comma-separated) to show it only on those payers’ claims." cols={[{ k: 'meta.url', l: 'URL', t: 'text' }, { k: 'meta.kind', l: 'Kind', t: 'select', opts: ['portal', 'policy', 'tool', 'form', 'reference'] }, { k: 'meta.payers', l: 'Payers', t: 'text' }, { k: 'meta.note', l: 'Note', t: 'text' }]} defaults={{ meta: { url: '', kind: 'reference' } }} />}
      {tab === 'users' && <Users />}
      {tab === 'clients' && <Clients />}
      {tab === 'buckets' && <ListEditor category="bucket" title="Aging buckets" help="Ranges in days, evaluated against each client’s aging basis. Keep them contiguous; leave max empty for open-ended." cols={[{ k: 'meta.min', l: 'From (days)', t: 'number' }, { k: 'meta.max', l: 'To (days)', t: 'number' }]} color defaults={{ meta: { min: 0, max: null } }} />}
      {tab === 'stages' && <ListEditor category="stage" title="Claim stages (A/R queues)" help="Evaluated top to bottom; the first match wins. “Rule” gives built-in logic (credit, appeal, denied, no-response window…); “Keywords” also match the PMS status, our status and end action text. Keep one “billed” stage last as the catch-all." cols={[{ k: 'meta.rule', l: 'Rule', t: 'select', opts: ['credit', 'patient', 'appeal', 'hold', 'denied', 'rejected', 'secondary', 'unbilled', 'noresponse', 'billed', 'custom'] }, { k: 'meta.keywords', l: 'Keywords (comma)', t: 'text' }, { k: 'meta.patientAR', l: 'Patient A/R', t: 'bool' }]} color defaults={{ meta: { rule: 'custom', keywords: '' } }} />}
      {tab === 'statuses' && <ListEditor category="status" title="Claim statuses" help="End actions map to a status automatically. Mark a status “closes out” to remove claims from active worklists and totals (e.g. Adjusted, Billed to Patient)." cols={[{ k: 'meta.terminal', l: 'Closes out', t: 'bool' }]} color cascade={['claims.status']} />}
      {tab === 'rca' && <TreeEditor parentCat="rca" childCat="rca_detail" title="Root cause categories › details" cascade={{ parent: ['claims.rca', 'work_log.rca'], child: ['claims.rca_detail', 'work_log.rca_detail'] }} />}
      {tab === 'actions' && <TreeEditor parentCat="end_action" childCat="end_sub" title="End actions › sub-categories" actionMeta cascade={{ parent: ['claims.end_action', 'work_log.end_action'], child: ['claims.end_sub', 'work_log.end_sub'] }} />}
      {tab === 'lists' && <div className="grid lg:grid-cols-2 gap-4"><ListEditor category="mode" title="Mode of resolution" cols={[]} cascade={['claims.mode', 'work_log.mode']} /><ListEditor category="priority" title="Priorities" cols={[]} color cascade={['claims.priority']} /></div>}
      {tab === 'payers' && <ListEditor category="payer" title="Payer directory" help="Contact intel shown to specialists on every claim, plus a timely-filing window that drives “days left” and TF-risk alerts. Matched case-insensitively on payer name." cols={[{ k: 'meta.tf_days', l: 'TF days', t: 'number' }, { k: 'meta.appeal_days', l: 'Appeal days', t: 'number' }, { k: 'meta.followup_days', l: 'Follow-up after (days)', t: 'number' }, { k: 'meta.phone', l: 'Phone', t: 'text' }, { k: 'meta.tips', l: 'Tips / IVR path', t: 'text' }, { k: 'meta.appeal_address', l: 'Appeal address', t: 'text' }, { k: 'meta.appeal_city_state_zip', l: 'Appeal city, state ZIP', t: 'text' }, { k: 'meta.appeal_fax', l: 'Appeal fax', t: 'text' }, { k: 'meta.appeal_phone', l: 'Appeal phone', t: 'text' }, { k: 'meta.appeal_portal', l: 'Appeal portal URL', t: 'text' }]} />}
      {tab === 'payers' && <div className="mt-4"><PayerLinks /></div>}
      {tab === 'limits' && <Limits />}
      {tab === 'reimb' && <Reimbursement />}
      {tab === 'aforms' && <AppealForms />}
      {tab === 'scorerules' && <ScoreRules />}
      {tab === 'bulkrules' && <BulkRules />}
      {tab === 'buckets2' && <ListEditor category="issue_bucket" title="Issue buckets (bulk-issue lanes)" help="Name the recurring bulk problems for a client (e.g. “Wrong payer ID”, “Missing modifier 25”). Managers then select claims in the Worklist → Bulk actions → Move to issue bucket. Leave Client empty to offer the bucket for every client." cols={[{ k: 'meta.client', l: 'Client (blank = all)', t: 'select', opts: ['', ...useStore.getState().clients.map((c) => c.name)] }, { k: 'meta.description', l: 'What it means / how to fix', t: 'text' }]} color defaults={{ meta: { client: '', description: '' } }} />}
      {tab === 'prirules' && <PriorityRules />}
      {tab === 'snippets' && <ListEditor category="snippet" title="Comment snippets" help="One-click comment templates in the touch form. Variables: {payer} {claim} {balance} {date}." cols={[{ k: 'meta.body', l: 'Text', t: 'text' }]} defaults={{ meta: { body: '' } }} />}
      {tab === 'fields' && <ListEditor category="field" title="Custom claim fields" help="Add your own columns (e.g. Denial type, Appeal level). They appear on the claim, can be mapped during import, and are stored per claim." cols={[{ k: 'meta.type', l: 'Type', t: 'select', opts: ['text', 'number', 'date', 'select'] }, { k: 'meta.options', l: 'Options (comma-separated, for select)', t: 'text' }]} defaults={{ meta: { type: 'text' } }} />}
      {tab === 'templates' && <Templates />}
      {tab === 'workspace' && <Workspace />}
      {tab === 'access' && <ClientAccess />}
      {tab === 'lifecycle' && <LifecycleEditor />}
      {tab === 'audit' && <ConsoleAudit />}
        </div>
      </div>
    </div>
  );
}

// ───────── helpers ─────────
const freeName = (base: string, taken: string[]) => { let n = base, i = 1; const t = taken.map((x) => x.toLowerCase()); while (t.includes(n.toLowerCase())) n = `${base} ${++i}`; return n; };
const getPath = (o: any, p: string) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o: any, p: string, v: any) => { const c = structuredClone(o); const ks = p.split('.'); let t = c; ks.slice(0, -1).forEach((k) => (t = t[k] ||= {})); t[ks[ks.length - 1]] = v; return c; };

function useCascade() {
  const { claims, workLog, save } = useStore();
  return async (fields: string[], from: string, to: string) => {
    for (const f of fields) {
      const [tbl, col] = f.split('.');
      const rows = (tbl === 'claims' ? claims : workLog).filter((r: any) => r[col] === from);
      if (rows.length) await save(tbl === 'claims' ? 'claims' : 'work_log', rows.map((r: any) => ({ ...r, [col]: to })) as any);
    }
  };
}

interface Col { k: string; l: string; t: 'number' | 'bool' | 'text' | 'select' | 'area'; opts?: string[] }

function ListEditor({ category, title, help, cols, color, defaults, cascade }: { category: Category; title: string; help?: string; cols: Col[]; color?: boolean; defaults?: Partial<ConfigOption>; cascade?: string[] }) {
  const { config, save, del } = useStore();
  const cascadeFn = useCascade();
  const { confirm, node } = useConfirm();
  const items = useMemo(() => config.filter((c) => c.category === category).sort((a, b) => a.sort - b.sort), [config, category]);
  const [bulk, setBulk] = useState(false); const [txt, setTxt] = useState('');
  const [rej, setRej] = useState(0); const [errs, setErrs] = useState<Record<string, string[]>>({});
  const upd = async (o: ConfigOption, patch: Partial<ConfigOption>) => { const next = { ...o, ...patch }; const e = validateOption(next, config); if (e.length) { setErrs((x) => ({ ...x, [o.id]: e.map((y) => y.msg) })); setRej((n) => n + 1); toast.err(e[0].msg); return; } setErrs((x) => { const { [o.id]: _, ...r } = x; return r; }); await save('config_options', [next]); };
  const freeName = () => { let n = 'New item', i = 1; while (items.some((x) => x.value.toLowerCase() === n.toLowerCase())) n = 'New item ' + ++i; return n; };
  const add = () => save('config_options', [{ id: uid(), category, value: freeName(), parent: null, label: null, color: color ? '#6366f1' : null, sort: items.length, active: true, meta: {}, ...defaults } as ConfigOption]);
  const move = async (i: number, d: -1 | 1) => { const a = items[i], b = items[i + d]; if (!b) return; await save('config_options', [{ ...a, sort: b.sort }, { ...b, sort: a.sort }]); };
  const rename = async (o: ConfigOption, v: string) => { v = v.trim(); if (v === o.value) return; if (validateOption({ ...o, value: v }, config).length) return upd(o, { value: v }); if (cascade) await cascadeFn(cascade, o.value, v); await upd(o, { value: v }); if (cascade) toast.ok('Renamed everywhere it is used'); };
  const spec: SampleSpec = useMemo(() => {
    const keys = cols.map((c) => c.k); const headers = ['value', ...keys, ...(color ? ['color'] : []), 'active'];
    const cell = (o: ConfigOption, k: string) => { const v = getPath(o, k); return typeof v === 'boolean' ? (v ? 'yes' : 'no') : v == null ? '' : String(v); };
    return {
      name: category, headers, rows: LIST_SAMPLES[category] || [{ value: 'Example item', active: 'yes' }],
      note: 'First column “value” identifies the row: existing values are updated, new values are added. Use yes/no for checkboxes.',
      current: () => items.map((o) => Object.fromEntries(headers.map((h) => [h, h === 'value' ? o.value : h === 'color' ? o.color || '' : h === 'active' ? (o.active ? 'yes' : 'no') : cell(o, h)]))),
      onImport: async (rows) => {
        let added = 0, updated = 0; const bad: string[] = []; const out: ConfigOption[] = []; const known = new Map(items.map((o) => [o.value.toLowerCase(), o]));
        rows.forEach((r, i) => {
          const v = (r.value || '').trim(); if (!v) return; let o: ConfigOption = known.get(v.toLowerCase()) || { id: uid(), category, value: v, parent: null, label: null, color: null, sort: items.length + out.length, active: true, meta: {}, ...defaults } as ConfigOption; const isNew = !known.has(v.toLowerCase());
          for (const c of cols) { if (!(c.k in r) || r[c.k] === '') continue; const raw = r[c.k]; o = setPath(o, c.k, c.t === 'number' ? Number(raw) : c.t === 'bool' ? yes(raw) : raw) as ConfigOption; }
          if (color && r.color) o = { ...o, color: r.color }; if ('active' in r && r.active !== '') o = { ...o, active: yes(r.active) };
          const e = validateOption(o, isNew ? [...config, o] : config.filter((x) => x.id !== o.id).concat(o)); if (e.length) { bad.push(`row ${i + 2} “${v}”: ${e[0].msg}`); return; }
          out.push(o); known.set(v.toLowerCase(), o); isNew ? added++ : updated++;
        });
        if (out.length) await save('config_options', out); if (!out.length && bad.length) throw new Error(bad[0]);
        return `Imported: ${added} added, ${updated} updated${bad.length ? `, ${bad.length} skipped (${bad[0]})` : ''}`;
      },
    };
  }, [cols, category, color, items, config, defaults, save]);
  return (
    <Card title={title} actions={<><SampleBar spec={spec} /><button className="btn btn-sm" onClick={() => setBulk(true)}><ListPlus size={13} />Bulk add</button><button className="btn btn-primary btn-sm" onClick={add}><Plus size={13} />Add</button></>}>
      {help && <p className="text-xs muted mb-3">{help}</p>}
      {items.length === 0 ? <Empty title="Nothing configured yet" /> : (
        <div className="space-y-1.5">
          {items.map((o, i) => (
            <div key={o.id} className="panel2 p-2 flex items-center gap-2 flex-wrap">
              <div className="flex flex-col"><button className="muted hover:text-inherit" onClick={() => move(i, -1)}><ArrowUp size={12} /></button><button className="muted hover:text-inherit" onClick={() => move(i, 1)}><ArrowDown size={12} /></button></div>
              {color && <input type="color" value={o.color || '#6366f1'} onChange={(e) => upd(o, { color: e.target.value })} className="w-7 h-7 rounded bg-transparent border-0 p-0 cursor-pointer" />}
              <input className={'input !w-48 ' + (errs[o.id] ? '!border-red-400' : '')} defaultValue={o.value} key={o.value + rej} onBlur={(e) => rename(o, e.target.value)} />
              {cols.map((c) => (
                <label key={c.k} className="flex items-center gap-1.5 text-[11px] muted">{c.l}
                  {c.t === 'bool' ? <input type="checkbox" checked={!!getPath(o, c.k)} onChange={(e) => upd(o, setPath(o, c.k, e.target.checked) as any)} />
                    : c.t === 'select' ? <select className="input !w-24" value={getPath(o, c.k) ?? ''} onChange={(e) => upd(o, setPath(o, c.k, e.target.value) as any)}>{c.opts!.map((x) => <option key={x}>{x}</option>)}</select>
                    : c.t === 'area' ? <textarea className="input !w-[420px]" rows={3} key={o.id + c.k + rej} defaultValue={getPath(o, c.k) ?? ''} onBlur={(e) => upd(o, setPath(o, c.k, e.target.value) as any)} />
                    : <input className={'input ' + (c.t === 'number' ? '!w-20' : '!w-56')} type={c.t === 'number' ? 'number' : 'text'} key={o.id + c.k + rej} defaultValue={getPath(o, c.k) ?? ''} onBlur={(e) => upd(o, setPath(o, c.k, c.t === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value) as any)} />}
                </label>))}
              {errs[o.id] && <div className="basis-full text-[11.5px] text-red-500 pl-6">{errs[o.id].join(' · ')}</div>}
              <div className="ml-auto flex items-center gap-2"><label className="text-[11px] muted flex items-center gap-1"><input type="checkbox" checked={o.active} onChange={(e) => upd(o, { active: e.target.checked })} />active</label>
                <button className="btn btn-ghost btn-sm btn-danger" onClick={async () => { if (await confirm(`Delete “${o.value}”? Existing claims keep their stored value.`)) del('config_options', [o.id]); }}><Trash2 size={13} /></button></div>
            </div>))}
        </div>)}
      <Modal open={bulk} onClose={() => setBulk(false)} title="Bulk add (one per line)" footer={<button className="btn btn-primary" onClick={async () => { const lines = txt.split('\n').map((s) => s.trim()).filter(Boolean).filter((l) => !items.some((i) => i.value.toLowerCase() === l.toLowerCase())); await save('config_options', lines.map((v, i) => ({ id: uid(), category, value: v, parent: null, label: null, color: color ? '#6366f1' : null, sort: items.length + i, active: true, meta: {}, ...defaults })) as any); setTxt(''); setBulk(false); toast.ok(`${lines.length} added`); }}>Add</button>}>
        <textarea className="input" rows={10} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Paste your dropdown values here" /></Modal>
      {node}
    </Card>
  );
}

function TreeEditor({ parentCat, childCat, title, actionMeta, cascade }: { parentCat: Category; childCat: Category; title: string; actionMeta?: boolean; cascade: { parent: string[]; child: string[] } }) {
  const { config, save, del, clients, providers } = useStore();
  const cascadeFn = useCascade();
  const { confirm, node } = useConfirm();
  const parents = useMemo(() => config.filter((c) => c.category === parentCat).sort((a, b) => a.sort - b.sort), [config, parentCat]);
  const statuses = config.filter((c) => c.category === 'status').sort((a, b) => a.sort - b.sort);
  const [selId, setSelId] = useState(parents[0]?.id || '');
  const sel = parents.find((p) => p.id === selId) || parents[0];
  const kids = useMemo(() => config.filter((c) => c.category === childCat && c.parent === sel?.value).sort((a, b) => a.sort - b.sort), [config, childCat, sel]);
  const [txt, setTxt] = useState(''); const [bulk, setBulk] = useState(false);
  const mk = (category: Category, value: string, sort: number, parent: string | null, meta = {}): ConfigOption => ({ id: uid(), category, value, parent, label: null, color: null, sort, active: true, meta });
  const treeSpec: SampleSpec = {
    name: parentCat, headers: ['type', 'parent', 'value', 'status', 'fu_days', 'terminal'], rows: TREE_SAMPLES[parentCat] || [],
    note: 'type = parent or child. A child row needs its parent’s name. Parents on action trees may carry status, follow-up days and “terminal” (yes/no).',
    current: () => parents.flatMap((p) => [{ type: 'parent', parent: '', value: p.value, status: String(p.meta.status ?? ''), fu_days: String(p.meta.fu_days ?? ''), terminal: p.meta.terminal ? 'yes' : '' }, ...config.filter((c) => c.category === childCat && c.parent === p.value).sort((a, b) => a.sort - b.sort).map((c) => ({ type: 'child', parent: p.value, value: c.value, status: '', fu_days: '', terminal: '' }))]),
    onImport: async (rows) => {
      const out: ConfigOption[] = []; let added = 0, updated = 0; const bad: string[] = []; const find = (cat: Category, v: string, par: string | null) => [...config, ...out].find((c) => c.category === cat && c.value.toLowerCase() === v.toLowerCase() && (c.parent ?? null) === par);
      const put = (o: ConfigOption, isNew: boolean) => { const i = out.findIndex((x) => x.id === o.id); if (i >= 0) out[i] = o; else out.push(o); if (isNew) added++; else updated++; };
      rows.forEach((r, i) => {
        const v = (r.value || '').trim(); if (!v) return; const type = (r.type || 'child').toLowerCase(); const par = (r.parent || '').trim();
        if (type === 'parent') { const ex = find(parentCat, v, null); const meta = actionMeta ? { ...(ex?.meta || { status: 'In Progress', fu_days: 7 }), ...(r.status ? { status: r.status } : {}), ...(r.fu_days !== '' && r.fu_days != null ? { fu_days: Number(r.fu_days) } : {}), ...(r.terminal ? { terminal: yes(r.terminal) } : {}) } : ex?.meta || {}; if (actionMeta && meta.status && !statuses.some((x) => x.value === meta.status)) { bad.push(`row ${i + 2}: unknown status “${meta.status}”`); return; } put(ex ? { ...ex, meta } : mk(parentCat, v, parents.length + out.length, null, meta), !ex); }
        else { if (!par) { bad.push(`row ${i + 2} “${v}”: child rows need a parent`); return; } if (!find(parentCat, par, null)) put(mk(parentCat, par, parents.length + out.length, null, actionMeta ? { status: 'In Progress', fu_days: 7 } : {}), true); const ex = find(childCat, v, par); if (!ex) put(mk(childCat, v, out.length, par), true); }
      });
      if (out.length) await save('config_options', out); if (!out.length && bad.length) throw new Error(bad[0]);
      return `Imported: ${added} added, ${updated} updated${bad.length ? `, ${bad.length} skipped (${bad[0]})` : ''}`;
    },
  };
  const renameParent = async (o: ConfigOption, v: string) => { v = v.trim(); if (!v || v === o.value) return; await cascadeFn(cascade.parent, o.value, v); const ch = config.filter((c) => c.category === childCat && c.parent === o.value).map((c) => ({ ...c, parent: v })); await save('config_options', [{ ...o, value: v }, ...ch]); };
  const renameKid = async (o: ConfigOption, v: string) => { v = v.trim(); if (!v || v === o.value) return; await cascadeFn(cascade.child, o.value, v); await save('config_options', [{ ...o, value: v }]); };
  const moveP = async (i: number, d: -1 | 1) => { const a = parents[i], b = parents[i + d]; if (b) await save('config_options', [{ ...a, sort: b.sort }, { ...b, sort: a.sort }]); };
  const moveK = async (i: number, d: -1 | 1) => { const a = kids[i], b = kids[i + d]; if (b) await save('config_options', [{ ...a, sort: b.sort }, { ...b, sort: a.sort }]); };
  const rcaClients = parentCat === 'rca';
  return (
    <div className="grid lg:grid-cols-5 gap-4">
      <Card title={title.split(' › ')[0]} className="lg:col-span-2" actions={<><SampleBar spec={treeSpec} /><button className="btn btn-primary btn-sm" onClick={async () => { const o = mk(parentCat, freeName('New item', parents.map((x) => x.value)), parents.length, null, actionMeta ? { status: 'In Progress', fu_days: 7 } : {}); await save('config_options', [o]); setSelId(o.id); }}><Plus size={13} /></button></>}>
        <div className="space-y-1 max-h-[560px] overflow-auto">
          {parents.map((p, i) => (
            <div key={p.id} onClick={() => setSelId(p.id)} className={'flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer ' + (sel?.id === p.id ? 'bg-brand-600/20 ring-1 ring-brand-500' : 'hover:bg-[var(--panel2)]') + (p.active ? '' : ' opacity-50')}>
              <div className="flex flex-col"><button onClick={(e) => { e.stopPropagation(); moveP(i, -1); }} className="muted"><ArrowUp size={11} /></button><button onClick={(e) => { e.stopPropagation(); moveP(i, 1); }} className="muted"><ArrowDown size={11} /></button></div>
              <span className="text-[13px] font-semibold flex-1 truncate">{p.value}</span><span className="text-[10px] muted">{config.filter((c) => c.category === childCat && c.parent === p.value).length}</span>
            </div>))}
        </div>
      </Card>
      <Card title={sel ? <span>{sel.value}</span> : 'Select an item'} className="lg:col-span-3" actions={sel && <><button className="btn btn-sm" onClick={() => setBulk(true)}><ListPlus size={13} />Bulk add</button><button className="btn btn-primary btn-sm" onClick={() => save('config_options', [mk(childCat, freeName('New item', kids.map((x) => x.value)), kids.length, sel.value)])}><Plus size={13} /></button></>}>
        {sel && (
          <>
            <div className="panel2 p-3 mb-3 flex flex-wrap gap-3 items-end">
              <Field label="Name" className="w-56"><input className="input" key={sel.id + sel.value} defaultValue={sel.value} onBlur={(e) => renameParent(sel, e.target.value)} /></Field>
              {parentCat === 'rca' && <Field label="Collectability weight" className="w-40"><input type="number" step="0.05" className="input" value={sel.meta.weight ?? 1} onChange={(e) => save('config_options', [{ ...sel, meta: { ...sel.meta, weight: Number(e.target.value) } }])} /></Field>}
              {actionMeta && <>
                <Field label="Sets claim status to" className="w-48"><select className="input" value={sel.meta.status || ''} onChange={(e) => save('config_options', [{ ...sel, meta: { ...sel.meta, status: e.target.value } }])}>{statuses.map((s) => <option key={s.id}>{s.value}</option>)}</select></Field>
                <Field label="Default F/U (days)" className="w-32"><input type="number" className="input" value={sel.meta.fu_days ?? ''} onChange={(e) => save('config_options', [{ ...sel, meta: { ...sel.meta, fu_days: e.target.value === '' ? null : Number(e.target.value) } }])} /></Field>
                <label className="flex items-center gap-1.5 text-xs pb-2"><input type="checkbox" checked={!!sel.meta.terminal} onChange={(e) => save('config_options', [{ ...sel, meta: { ...sel.meta, terminal: e.target.checked } }])} />Closing action</label></>}
              <label className="flex items-center gap-1.5 text-xs pb-2"><input type="checkbox" checked={sel.active} onChange={(e) => save('config_options', [{ ...sel, active: e.target.checked }])} />Active</label>
              <button className="btn btn-danger btn-sm mb-1.5 ml-auto" onClick={async () => { if (await confirm(`Delete “${sel.value}” and its ${kids.length} sub-items?`)) { await del('config_options', [sel.id, ...kids.map((k) => k.id)]); setSelId(''); } }}><Trash2 size={13} />Delete</button>
            </div>
            {rcaClients && <div className="text-[11px] muted mb-3">Client-specific lists: restrict which categories a client sees in <b>Clients & providers</b> ({clients.filter((c) => c.rca_allowed?.includes(sel.value)).length} clients currently allow this).</div>}
            <div className="space-y-1">
              {kids.map((k, i) => (
                <div key={k.id} className={'panel2 p-1.5 flex items-center gap-2 ' + (k.active ? '' : 'opacity-50')}>
                  <div className="flex flex-col"><button className="muted" onClick={() => moveK(i, -1)}><ArrowUp size={11} /></button><button className="muted" onClick={() => moveK(i, 1)}><ArrowDown size={11} /></button></div>
                  <input className="input" key={k.id + k.value} defaultValue={k.value} onBlur={(e) => renameKid(k, e.target.value)} />
                  <label className="text-[11px] muted flex items-center gap-1"><input type="checkbox" checked={k.active} onChange={(e) => save('config_options', [{ ...k, active: e.target.checked }])} />on</label>
                  <button className="btn btn-ghost btn-sm btn-danger" onClick={() => del('config_options', [k.id])}><Trash2 size={13} /></button>
                </div>))}
              {kids.length === 0 && <div className="muted text-sm py-4 text-center">{actionMeta ? 'No sub-categories — this end action can be saved without one.' : 'No details yet.'}</div>}
            </div>
          </>)}
      </Card>
      <Modal open={bulk} onClose={() => setBulk(false)} title={`Bulk add to ${sel?.value}`} footer={<button className="btn btn-primary" onClick={async () => { const lines = txt.split('\n').map((s) => s.trim()).filter(Boolean); await save('config_options', lines.map((v, i) => mk(childCat, v, kids.length + i, sel!.value)) as any); setTxt(''); setBulk(false); }}>Add</button>}>
        <textarea className="input" rows={10} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="One per line" /></Modal>
      <span className="hidden">{providers.length}</span>{node}
    </div>
  );
}

// ───────── users ─────────
function Users() {
  const { profiles, save, mode, meId, clients, me } = useStore(); const myRole = me()?.role; const roleOpts = assignableRoles(myRole);
  const [add, setAdd] = useState(false); const [f, setF] = useState({ full_name: '', email: '', role: 'user_prod' as Role, emp_code: '', client_id: '' });
  const sups = profiles.filter((p) => canSupervise(p.role));
  const [rejU, setRejU] = useState(0);
  const usDateIn = (v: string) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim()); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : v.trim() || null; };
  const userSpec: SampleSpec = {
    name: 'users', headers: ['email', 'full_name', 'role', 'emp_code', 'daily_target', 'hire_date', 'active'], rows: USER_SAMPLE,
    note: 'Rows are matched by email. Existing users are updated. New users are created in demo mode; with Supabase, people sign up themselves first (invite them), then import to set role, target and hire date. Dates as MM/DD/YYYY.',
    current: () => profiles.map((p) => ({ email: p.email, full_name: p.full_name, role: p.role, emp_code: p.emp_code || '', daily_target: String(p.daily_target ?? ''), hire_date: p.hire_date ? `${p.hire_date.slice(5, 7)}/${p.hire_date.slice(8, 10)}/${p.hire_date.slice(0, 4)}` : '', active: p.active ? 'yes' : 'no' })),
    onImport: async (rows) => {
      const out: Profile[] = []; let added = 0, updated = 0; const bad: string[] = [];
      rows.forEach((r, i) => {
        const email = (r.email || '').trim().toLowerCase(); if (!email) return; const ex = profiles.find((p) => p.email.toLowerCase() === email); const role = (r.role || ex?.role || 'user_prod') as Role; if (!(role in ROLE_LABEL)) { bad.push(`row ${i + 2}: unknown role “${r.role}”`); return; }
        if (!ex && mode !== 'local') { bad.push(`row ${i + 2}: ${email} has not signed up yet`); return; }
        const next = { ...(ex || { id: uid(), email, supervisor_id: null, client_id: null, active: true, skills: [], client_ids: [], portal: {}, created_at: new Date().toISOString() }), full_name: r.full_name?.trim() || ex?.full_name || email, role, emp_code: r.emp_code?.trim() || ex?.emp_code || null, daily_target: r.daily_target ? Number(r.daily_target) : ex?.daily_target ?? 40, hire_date: r.hire_date ? usDateIn(r.hire_date) : ex?.hire_date ?? null, active: r.active ? yes(r.active) : ex?.active ?? true } as Profile;
        const e = validateProfile(next, ex ? profiles : [...profiles, next], clients.map((c) => c.id)); if (e.length) { bad.push(`row ${i + 2} ${email}: ${e[0].msg}`); return; } out.push(next); ex ? updated++ : added++;
      });
      if (out.length) await save('profiles', out); if (!out.length && bad.length) throw new Error(bad[0]);
      return `Imported: ${added} added, ${updated} updated${bad.length ? `, ${bad.length} skipped (${bad[0]})` : ''}`;
    },
  };
  const upd = async (p: Profile, patch: Partial<Profile>) => { if (!canEditUser(myRole, p.role) || (patch.role && !roleOpts.includes(patch.role))) { toast.err('You cannot change this account or assign that role'); return; } const next = { ...p, ...patch }; const e = validateProfile(next, profiles, clients.map((c) => c.id)); if (e.length) { toast.err(e[0].msg); setRejU((n) => n + 1); return; } await save('profiles', [next]); };
  return (
    <Card title="Users" actions={<><SampleBar spec={userSpec} />{mode === 'local' && <button className="btn btn-primary btn-sm" onClick={() => setAdd(true)}><Plus size={13} />Add user</button>}</>}>
      {mode === 'supabase' && <p className="text-xs muted mb-3">People create their own account on the sign-in screen (first account becomes Admin). Then set their role, employee code, supervisor and target here. Disable a user to block access without deleting history.</p>}
      <div className="overflow-auto"><table className="grid"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Emp code</th><th>Reports to</th><th>Daily target</th><th>Hire date</th><th>Payer skills</th><th>Client access</th><th>Active</th></tr></thead><tbody>
        {profiles.map((p) => (
          <tr key={p.id}><td><input className="input !w-44" key={p.id + rejU} defaultValue={p.full_name} onBlur={(e) => e.target.value !== p.full_name && upd(p, { full_name: e.target.value })} /></td><td className="muted text-xs">{p.email}</td>
            <td><select className="input !w-44" value={p.role} disabled={p.id === meId || !canEditUser(myRole, p.role)} title={canEditUser(myRole, p.role) ? ROLE_META[p.role].desc : 'Only Sr. Management can change this account'} onChange={(e) => upd(p, { role: e.target.value as Role })}>{ROLE_ORDER.filter((k) => k === p.role || roleOpts.includes(k)).map((k) => <option key={k} value={k} title={ROLE_META[k].desc}>{ROLE_LABEL[k]}</option>)}</select></td>
            <td><input className="input !w-24" key={p.id + 'e' + rejU} defaultValue={p.emp_code || ''} onBlur={(e) => (e.target.value || null) !== p.emp_code && upd(p, { emp_code: e.target.value.trim() || null })} /></td>
            <td><select className="input !w-40" value={p.supervisor_id || ''} onChange={(e) => upd(p, { supervisor_id: e.target.value || null })}><option value="">—</option>{sups.filter((s) => s.id !== p.id).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></td>
            <td><input type="number" min={0} max={1000} className="input !w-20" key={p.id + 'd' + rejU} defaultValue={p.daily_target} onBlur={(e) => Number(e.target.value) !== p.daily_target && upd(p, { daily_target: Number(e.target.value) })} /></td>
            <td><input type="date" className="input !w-36" key={p.id + 'h' + rejU} defaultValue={p.hire_date || ''} onBlur={(e) => (e.target.value || null) !== (p.hire_date || null) && upd(p, { hire_date: e.target.value || null })} title="Used for new-hire QA sampling" /></td>
            <td><input className="input !w-44" placeholder="Aetna, Cigna…" defaultValue={(p.skills || []).join(', ')} onBlur={(e) => upd(p, { skills: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></td>
            <td>{p.role === 'client' ? <Link className="underline text-xs" to="/admin?tab=access">{practiceIds(p).length} practice(s) →</Link> : <details className="text-xs relative"><summary className="cursor-pointer whitespace-nowrap">{p.client_scope === 'assigned' ? <b style={{ color: '#d97706' }}>{(p.client_ids || []).length} client(s) only</b> : 'All clients'}</summary><div className="absolute z-20 mt-1 p-2 rounded-lg border hair bg-[var(--panel)] w-56 max-h-64 overflow-auto shadow-lg space-y-1">
              <select className="input" value={p.client_scope || 'all'} onChange={(e) => upd(p, { client_scope: e.target.value as 'all' | 'assigned' })}><option value="all">Sees every client</option><option value="assigned">Only assigned clients</option></select>
              {(p.client_scope === 'assigned') && clients.map((c) => <label key={c.id} className="flex gap-1.5 items-center"><input type="checkbox" checked={(p.client_ids || []).includes(c.id)} onChange={(e) => upd(p, { client_ids: e.target.checked ? [...(p.client_ids || []), c.id] : (p.client_ids || []).filter((x) => x !== c.id) })} />{c.name}</label>)}
              <div className="muted text-[10.5px]">Enforced by the database, not just the screen.</div></div></details>}</td>
            <td><input type="checkbox" checked={p.active} disabled={p.id === meId} onChange={(e) => upd(p, { active: e.target.checked })} /></td></tr>))}</tbody></table></div>
      {mode === 'supabase' && <Invites />}
      <Modal open={add} onClose={() => setAdd(false)} title="Add user (demo mode)" footer={<button className="btn btn-primary" onClick={async () => { const cand = { id: uid(), ...f, client_id: f.role === 'client' ? f.client_id || null : null, emp_code: f.emp_code || null }; const ve = validateProfile(cand as any, profiles, clients.map((c) => c.id)); if (ve.length) return toast.err(ve[0].msg); await save('profiles', [{ id: uid(), ...f, client_id: f.role === 'client' ? f.client_id || null : null, supervisor_id: null, daily_target: 40, active: true }]); setAdd(false); }}>Add</button>}>
        <div className="space-y-3"><Field label="Full name"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field><Field label="Email"><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Role"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{ROLE_ORDER.filter((k) => roleOpts.includes(k)).map((k) => <option key={k} value={k} title={ROLE_META[k].desc}>{ROLE_LABEL[k]}</option>)}</select></Field><Field label="Emp code"><input className="input" value={f.emp_code} onChange={(e) => setF({ ...f, emp_code: e.target.value })} /></Field>{f.role === 'client' && <Field label="Client (their dashboard)"><select className="input" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}><option value="">Select…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}</div></Modal>
    </Card>
  );
}

function Invites() {
  const { invites, clients, save, del, me } = useStore(); const roleOpts = assignableRoles(me()?.role);
  const [f, setF] = useState({ email: '', role: 'user_prod' as Role, client_id: '', full_name: '' });
  return (
    <div className="mt-6 pt-5 border-t hair"><div className="label">Invite a staff member (pre-assigns their role) — client logins are created under Client access</div>
      <p className="text-xs muted mb-3">Add their email here, then ask them to sign up with that same email — they are provisioned with this role automatically. Client users only ever see their own practice (enforced in the database).</p>
      <div className="flex gap-2 flex-wrap"><input className="input !w-56" placeholder="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /><input className="input !w-44" placeholder="Full name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        <select className="input !w-40" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{ROLE_ORDER.filter((k) => k !== 'client' && roleOpts.includes(k)).map((k) => <option key={k} value={k}>{ROLE_META[k].label}</option>)}</select>
        {f.role === 'client' && <select className="input !w-48" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}><option value="">Client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        <button className="btn btn-primary" disabled={!f.email || (f.role === 'client' && !f.client_id)} onClick={async () => { await save('invites', [{ email: f.email.trim().toLowerCase(), role: f.role, client_id: f.role === 'client' ? f.client_id : null, full_name: f.full_name || null } as any]); setF({ ...f, email: '', full_name: '' }); toast.ok('Invite saved'); }}>Save invite</button></div>
      {invites.filter((i) => i.role !== 'client').length > 0 && <div className="mt-3 flex gap-2 flex-wrap">{invites.filter((i) => i.role !== 'client').map((i) => <Chip key={i.email} color="#06b6d4">{i.email} · {i.role}<button className="ml-1" onClick={() => del('invites', [i.email])}>×</button></Chip>)}</div>}
    </div>
  );
}

// ───────── clients ─────────
function Clients() {
  const { clients, providers, profiles, config, save, del } = useStore();
  const { confirm, node } = useConfirm();
  const [sel, setSel] = useState<string>(clients[0]?.id || '');
  const c = clients.find((x) => x.id === sel);
  const rcas = config.filter((o) => o.category === 'rca' && o.active).sort((a, b) => a.sort - b.sort);
  const pms = ['Standard', 'eCW', 'Tebra', 'OfficeAlly', 'ModMed', 'Nextech', 'AdvancedMD', 'athena', 'Other'];
  const [rejC, setRejC] = useState(0);
  const clientSpec: SampleSpec = {
    name: 'clients', headers: ['name', 'code', 'pms', 'aging_basis', 'tf_days', 'active'], rows: CLIENT_SAMPLE, note: 'Rows are matched by client name. aging_basis = dos or billed.',
    current: () => clients.map((k) => ({ name: k.name, code: k.code || '', pms: k.pms || '', aging_basis: k.aging_basis, tf_days: k.tf_days == null ? '' : String(k.tf_days), active: k.active ? 'yes' : 'no' })),
    onImport: async (rows) => {
      const out: Client[] = []; let added = 0, updated = 0; const bad: string[] = [];
      rows.forEach((r, i) => { const name = normName(r.name || ''); if (!name) return; const ex = clients.find((k) => k.name.toLowerCase() === name.toLowerCase()); const next = { ...(ex || { id: uid(), color: '#6366f1', supervisor_id: null, rca_allowed: null, settings: {} }), name, code: r.code?.trim().toUpperCase() || ex?.code || null, pms: r.pms?.trim() || ex?.pms || 'Standard', aging_basis: (r.aging_basis || ex?.aging_basis || 'dos').toLowerCase(), tf_days: r.tf_days ? Number(r.tf_days) : ex?.tf_days ?? null, active: r.active ? yes(r.active) : ex?.active ?? true } as Client; const e = validateClient(next, ex ? clients : [...clients, next]); if (e.length) { bad.push(`row ${i + 2} “${name}”: ${e[0].msg}`); return; } out.push(next); ex ? updated++ : added++; });
      if (out.length) await save('clients', out); if (!out.length && bad.length) throw new Error(bad[0]);
      return `Imported: ${added} added, ${updated} updated${bad.length ? `, ${bad.length} skipped (${bad[0]})` : ''}`;
    },
  };
  const upd = async (patch: Partial<Client>) => { if (!c) return; const next = { ...c, ...patch, name: patch.name != null ? normName(patch.name) : c.name }; const e = validateClient(next, clients); if (e.length) { toast.err(e[0].msg); setRejC((n) => n + 1); return; } await save('clients', [next]); };
  const myProv = providers.filter((p) => p.client_id === sel);
  return (
    <div className="grid lg:grid-cols-4 gap-4">
      <Card title="Clients" actions={<><SampleBar spec={clientSpec} /><button className="btn btn-primary btn-sm" onClick={async () => { const free = (b: string, f: (x: string) => boolean) => { let n = b, i = 1; while (f(n)) n = b + ' ' + ++i; return n; }; const n = { id: uid(), name: free('New client', (x) => clients.some((k) => k.name.toLowerCase() === x.toLowerCase())), code: null as string | null, pms: 'Standard', color: '#6366f1', supervisor_id: null, aging_basis: 'dos', tf_days: null, rca_allowed: null, active: true, settings: {} }; await save('clients', [n as any]); setSel(n.id); }}><Plus size={13} /></button></>}>
        <div className="space-y-1">{clients.map((x) => <button key={x.id} onClick={() => setSel(x.id)} className={'w-full text-left px-2.5 py-2 rounded-lg flex items-center gap-2 text-[13px] font-semibold ' + (sel === x.id ? 'bg-brand-600/20 ring-1 ring-brand-500' : 'hover:bg-[var(--panel2)]')}><span className="w-2.5 h-2.5 rounded-full" style={{ background: x.color }} />{x.name}{!x.active && <Chip color="#64748b">off</Chip>}</button>)}</div>
      </Card>
      {c ? (
        <div className="lg:col-span-3 space-y-4">
          <Card title="Profile">
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Name"><input className="input" key={c.id + rejC} defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && upd({ name: e.target.value })} /></Field>
              <Field label="Code"><input className="input" key={c.id + 'c' + rejC} defaultValue={c.code || ''} onBlur={(e) => e.target.value !== (c.code || '') && upd({ code: e.target.value || null })} /></Field>
              <Field label="PMS"><select className="input" value={c.pms} onChange={(e) => upd({ pms: e.target.value })}>{pms.map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field label="Supervisor"><select className="input" value={c.supervisor_id || ''} onChange={(e) => upd({ supervisor_id: e.target.value || null })}><option value="">—</option>{profiles.filter((p) => ['supervisor', 'admin'].includes(p.role)).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
              <Field label="Aging based on"><select className="input" value={c.aging_basis} onChange={(e) => upd({ aging_basis: e.target.value as any })}><option value="dos">Date of service</option><option value="billed">Last billed date</option></select></Field>
              <Field label="Timely filing (days)" hint="Default window; payer rules override"><input type="number" className="input" key={c.id + 't' + rejC} defaultValue={c.tf_days ?? ''} onBlur={(e) => upd({ tf_days: e.target.value ? Number(e.target.value) : null })} /></Field>
              <Field label="Colour"><input type="color" className="input !p-1 !h-9" value={c.color} onChange={(e) => upd({ color: e.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" checked={c.active} onChange={(e) => upd({ active: e.target.checked })} />Active</label>
              <button className="btn btn-danger self-end justify-center" onClick={async () => { if (await confirm(`Delete ${c.name} and ALL its claims, notes and history? This cannot be undone.`)) { await del('clients', [c.id]); setSel(''); } }}><Trash2 size={13} />Delete client</button>
            </div>
          </Card>
          <Card title="Root-cause categories this client uses" actions={<button className="btn btn-sm" onClick={() => upd({ rca_allowed: null })}>Use all</button>}>
            <p className="text-xs muted mb-2">{c.rca_allowed ? 'Restricted — specialists only see the selected categories for this client.' : 'All categories are available.'}</p>
            <div className="flex flex-wrap gap-1.5">{rcas.map((r) => { const on = !c.rca_allowed || c.rca_allowed.includes(r.value); return <button key={r.id} className={'chip ' + (on ? 'bg-brand-600 text-white' : 'panel2 muted')} onClick={() => { const cur = c.rca_allowed || rcas.map((x) => x.value); upd({ rca_allowed: cur.includes(r.value) ? cur.filter((x) => x !== r.value) : [...cur, r.value] }); }}>{r.value}</button>; })}</div>
          </Card>
          <Card title="Providers" actions={<button className="btn btn-primary btn-sm" onClick={() => save('providers', [{ id: uid(), client_id: c.id, name: (() => { let n = 'New provider', i = 1; while (myProv.some((x) => x.name === n)) n = 'New provider ' + ++i; return n; })(), type: 'Main Surgeon' }])}><Plus size={13} /></button>}>
            <div className="space-y-1.5">{myProv.map((p) => <div key={p.id} className="flex gap-2"><input className="input" defaultValue={p.name} onBlur={(e) => { const v = normName(e.target.value); if (!v) return toast.err('Provider name is required'); if (myProv.some((x) => x.id !== p.id && x.name.toLowerCase() === v.toLowerCase())) return toast.err('That provider already exists for this client'); void save('providers', [{ ...p, name: v }]); }} /><input className="input !w-48" defaultValue={p.type} list="ptypes" onBlur={(e) => save('providers', [{ ...p, type: e.target.value }])} /><input className="input !w-32" placeholder="NPI" defaultValue={p.npi || ''} onBlur={(e) => save('providers', [{ ...p, npi: e.target.value.trim() || null }])} /><button className="btn btn-ghost btn-sm btn-danger" onClick={() => del('providers', [p.id])}><Trash2 size={13} /></button></div>)}
              <datalist id="ptypes"><option>Main Surgeon</option><option>Physician Assistant-PA</option><option>Nurse Practitioner</option><option>Facility</option></datalist>
              {myProv.length === 0 && <div className="muted text-sm">No providers.</div>}</div>
          </Card>
          <Letterhead c={c} />
        </div>) : <Empty title="Select or create a client" />}
      {node}
    </div>
  );
}

// ───────── templates ─────────
function Templates() {
  const { templates, save, del } = useStore();
  const [edit, setEdit] = useState<ImportTemplate | null>(null);
  const { confirm, node } = useConfirm(); const names = templates.map((t) => t.name);
  return (
    <Card title="Import templates" actions={<button className="btn btn-primary btn-sm" onClick={() => setEdit({ id: uid(), name: freeName('New template', names), pms: 'Custom', kind: 'aging', builtin: false, mapping: {}, options: {} })}><Plus size={13} />New</button>}>
      <p className="text-xs muted mb-3">Each template maps your PMS export’s column headers (aliases, first match wins) to ARMS fields. Built-ins can be edited or duplicated; auto-detection picks the best match for an uploaded file.</p>
      <table className="grid"><thead><tr><th>Name</th><th>PMS</th><th>Type</th><th>Fields mapped</th><th /></tr></thead><tbody>
        {templates.map((t) => <tr key={t.id}><td className="font-semibold">{t.name}{t.builtin && <Chip color="#6366f1" className="ml-2">built-in</Chip>}</td><td>{t.pms}</td><td>{t.kind}</td><td>{Object.values(t.mapping).filter((a) => a.length).length}</td>
          <td className="text-right whitespace-nowrap"><button className="btn btn-sm" onClick={() => setEdit(structuredClone(t))}>Edit</button> <button className="btn btn-sm" onClick={() => save('import_templates', [{ ...structuredClone(t), id: uid(), name: freeName(t.name + ' (copy)', names), builtin: false }])}><Copy size={12} /></button> <button className="btn btn-sm btn-danger" onClick={async () => (await confirm('Delete template?')) && del('import_templates', [t.id])}><Trash2 size={12} /></button></td></tr>)}</tbody></table>
      <Modal wide open={!!edit} onClose={() => setEdit(null)} title="Edit template" footer={<button className="btn btn-primary" onClick={async () => { const nm = normName(edit!.name); if (!nm) return toast.err('Template name is required'); if (templates.some((t) => t.id !== edit!.id && t.name.toLowerCase() === nm.toLowerCase())) return toast.err(`A template named “${nm}” already exists`); await save('import_templates', [{ ...edit!, name: nm }]); setEdit(null); toast.ok('Saved'); }}>Save</button>}>
        {edit && <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3"><Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field><Field label="PMS"><input className="input" value={edit.pms} onChange={(e) => setEdit({ ...edit, pms: e.target.value })} /></Field>
            <Field label="Type"><select className="input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as any })}><option value="aging">Aging</option><option value="worklog">Work log</option></select></Field></div>
          <div className="label">Header aliases per field (comma-separated)</div>
          <div className="space-y-2">{fieldsFor(edit.kind).map((f) => <div key={f.key} className="flex items-center gap-2"><span className="w-44 text-[13px] font-semibold shrink-0">{f.label}</span><input className="input" value={(edit.mapping[f.key] || []).join(', ')} onChange={(e) => setEdit({ ...edit, mapping: { ...edit.mapping, [f.key]: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })} /></div>)}</div>
        </div>}
      </Modal>{node}
    </Card>
  );
}

// ───────── workspace ─────────
function Workspace() {
  const s = useStore();
  const { settings, setSetting, mode } = s;
  const { confirm, node } = useConfirm();
  const brand = settings.branding || { appName: 'ClaimsIQ' }; const sla = settings.sla || { staleDays: 14 };
  const backup = () => downloadFile(`arms-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ clients: s.clients, providers: s.providers, config: s.config, templates: s.templates, rules: s.rules, profiles: s.profiles, claims: s.claims, workLog: s.workLog, notes: s.notes }), 'application/json');
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Branding & rules">
        <div className="space-y-3">
          <Field label="App name"><input className="input" defaultValue={brand.appName} onBlur={(e) => setSetting('branding', { ...brand, appName: e.target.value })} /></Field>
          <Field label="Write-off limit for team leads / SMEs ($)" hint="Resolving a missing claim as written off above this amount needs a Manager or Sr. Management."><input type="number" min={0} className="input" defaultValue={(settings.workflow as any)?.writeOffLimit ?? 1000} onBlur={(e) => setSetting('workflow', { ...(settings.workflow || {}), writeOffLimit: Math.max(0, Number(e.target.value) || 0) })} /></Field>
          <Field label="Workspace time zone" hint="“Today” for deadlines, follow-ups and reports follows this zone, whatever device someone is on."><select className="input" value={sla.tz || ''} onChange={(e) => { setWorkspaceTz(e.target.value); void setSetting('sla', { ...sla, tz: e.target.value }); }}><option value="">Each person’s own device</option>{US_TIMEZONES.map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}</select></Field>
          <Field label="Mark a claim stale after (days without a touch)"><input type="number" className="input" defaultValue={sla.staleDays} onBlur={(e) => setSetting('sla', { ...sla, staleDays: Number(e.target.value) })} /></Field>
        </div>
      </Card>
      <Card title="Analytics & privacy">
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!settings.model?.maskPhi} onChange={(e) => setSetting('model', { ...(settings.model || {}), maskPhi: e.target.checked })} />Mask patient names in staff screens (PHI minimisation)</label>
          <Field label="Cash-forecast timing: % of expected recovery landing in 0-30 / 31-60 / 61-90 days" hint="Must sum to 100. Tune to your payers’ real pay lag.">
            <div className="flex gap-2">{[0, 1, 2].map((i) => <input key={i} type="number" className="input !w-20" defaultValue={Math.round(((settings.model?.forecast || [0.35, 0.35, 0.3])[i]) * 100)} onBlur={(e) => { const f = [...(settings.model?.forecast || [0.35, 0.35, 0.3])]; f[i] = Number(e.target.value) / 100; setSetting('model', { ...(settings.model || {}), forecast: f }); }} />)}</div></Field>
          <Field label="Minimum cases before a next-best-action is recommended"><input type="number" className="input !w-24" defaultValue={settings.model?.minSupport ?? 3} onBlur={(e) => setSetting('model', { ...(settings.model || {}), minSupport: Math.max(1, Number(e.target.value)) })} /></Field>
        </div>
      </Card>
      <Card title="Data">
        <div className="space-y-3 text-sm"><p className="muted">Storage: <b className="text-inherit">{mode === 'supabase' ? 'Supabase (live)' : 'Browser demo data'}</b></p>
          <button className="btn" onClick={backup}><Download size={14} />Download JSON backup</button>
          {mode === 'local' && <div><button className="btn btn-danger" onClick={async () => (await confirm('Wipe demo data and re-seed?')) && s.resetDemo()}>Reset demo data</button>
            <div className="mt-3 flex flex-wrap gap-2 items-center"><button className="btn" onClick={async () => (await confirm('Replace all demo data with the stress dataset (5,000+ open claims, 5 clients, every aging bucket, QA reviews)? Takes a few seconds.')) && s.resetDemo('large')}>Load stress dataset (5,000+ claims)</button><button className="btn" onClick={async () => (await confirm('Replace all demo data with the small demo set?')) && s.resetDemo('demo')}>Load small demo</button><span className="text-xs muted">Stored in this browser’s IndexedDB only.</span></div></div>}</div>
      </Card>{node}
    </div>
  );
}

const LH_FIELDS: [string, string][] = [['name', 'Practice name on letters'], ['address', 'Address'], ['phone', 'Phone'], ['fax', 'Reply fax'], ['npi', 'Group NPI'], ['taxId', 'Tax ID (TIN)']];
/** Letterhead used on appeal letters and fax cover sheets for this client. */
function Letterhead({ c }: { c: Client }) {
  const { save } = useStore(); const lh = ((c.settings as any)?.letterhead || {}) as Record<string, any>; const patch = (p: Record<string, any>) => save('clients', [{ ...c, settings: { ...c.settings, letterhead: { ...lh, ...p } } }]);
  const pick = (f: File) => { if (f.size > 400_000) return toast.err('Logo must be under 400 KB'); const r = new FileReader(); r.onload = () => { const img = new Image(); img.onload = () => { const k = Math.min(1, 360 / img.width); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height); void patch({ logo: cv.toDataURL('image/png') }); }; img.src = String(r.result); }; r.readAsDataURL(f); };
  return (
    <Card title="Letterhead & fax" className="lg:col-span-2">
      <div className="grid sm:grid-cols-3 gap-3">{LH_FIELDS.map(([k, l]) => <Field key={k} label={l}><input className="input" defaultValue={lh[k] || ''} placeholder={k === 'name' ? c.name : ''} onBlur={(e) => e.target.value !== (lh[k] || '') && patch({ [k]: e.target.value.trim() })} /></Field>)}</div>
      <div className="flex items-center gap-3 mt-3">{lh.logo ? <img src={lh.logo} alt="Logo" className="h-12 bg-white rounded border hair p-1" /> : <span className="text-xs muted">No logo</span>}<label className="btn btn-sm cursor-pointer">Upload logo<input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} /></label>{lh.logo && <button className="btn btn-sm btn-ghost" onClick={() => patch({ logo: null })}>Remove</button>}</div>
      <p className="text-[11px] muted mt-2">Used on appeal letters (PDF / Word) and as the fax cover-sheet sender. The reply fax tells payers where to send their response.</p>
    </Card>
  );
}
