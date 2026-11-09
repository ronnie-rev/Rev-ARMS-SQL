import type { Role } from '../roles';
import { LEGACY_ROLE, ROLE_ORDER } from '../roles';

export interface Cap { id: string; label: string; group: 'Sections' | 'Work' | 'Data' | 'Automation' | 'Admin' | 'Quality'; help: string; locked?: Role[] }
export const CAPS: Cap[] = [
  { id: 'access_control', label: 'Control section (menu + pages)', group: 'Sections', help: 'Shows the Control section: Allocation, Import, ERA, Exceptions, Rules, Audit log. Each page also needs its own permission below.' },
  { id: 'access_admin', label: 'Admin section (menu + pages)', group: 'Sections', help: 'Shows the Admin console (each tab also needs its own permission). Always on for Sr. Management and Admin (cannot be removed).', locked: ['sr_mgmt', 'sys_admin'] },
  { id: 'work_claims', label: 'Work claims (touches, notes)', group: 'Work', help: 'Record touches, add notes, change status/priority.' },
  { id: 'self_assign', label: 'Take unassigned claims', group: 'Work', help: 'Assign unowned claims to yourself.' },
  { id: 'assign', label: 'Assign / reassign claims', group: 'Work', help: 'Bulk assign, smart allocate, reassign.' },
  { id: 'bulk_edit', label: 'Bulk edit claims', group: 'Work', help: 'Change status/priority/follow-up on many claims at once.' },
  { id: 'close_claims', label: 'Close / adjust claims', group: 'Work', help: 'Use closing end actions (adjustments) and manual close.' },
  { id: 'resolve_missing', label: 'Resolve missing claims & reopen', group: 'Work', help: 'Decide claims that dropped off an aging file (paid / written off / restore), see the review queue, and reopen resolved claims. Write-offs over the limit need a manager.' },
  { id: 'merge_claims', label: 'Merge duplicate claims', group: 'Work', help: 'Merge duplicates and re-link claim numbers.' },
  { id: 'delete_claims', label: 'Delete claims', group: 'Work', help: 'Permanently delete claims. Sr. Management only by default.' },
  { id: 'import', label: 'Import aging files', group: 'Data', help: 'Upload and commit aging / work-log files.' },
  { id: 'rollback_import', label: 'Undo imports', group: 'Data', help: 'Roll back the latest import for a client.' },
  { id: 'export', label: 'Export data (CSV)', group: 'Data', help: 'Download worklists, trackers, ledgers.' },
  { id: 'view_phi', label: 'See patient names', group: 'Data', help: 'When off, patient names are masked for this role.' },
  { id: 'view_money', label: 'See recoveries & $ attribution', group: 'Data', help: 'Recovery ledger and per-user dollar attribution.' },
  { id: 'view_audit_log', label: 'View audit log', group: 'Data', help: 'System audit trail and PHI-access log.' },
  { id: 'run_rules', label: 'Run rules & checks', group: 'Automation', help: 'Run automation rules and quality checks on demand.' },
  { id: 'manage_rules', label: 'Create / edit rules', group: 'Automation', help: 'Rule builder and quality-check settings.' },
  { id: 'manage_reports', label: 'Manage report schedules', group: 'Automation', help: 'Create and schedule client / internal reports.' },
  { id: 'audit_touches', label: 'QA-audit touches', group: 'Quality', help: 'Pass/fail work and leave remarks.' },
  { id: 'manage_qa', label: 'Manage QA program', group: 'Quality', help: 'Sample rate, scorecards, error categories, KPI targets, performance weights, dispute resolution.' },
  { id: 'approve_adjustments', label: 'Request client approvals', group: 'Quality', help: 'Send write-off / adjustment approval requests to clients.' },
  { id: 'manage_payer_rules', label: 'Payer & filing rules', group: 'Admin', help: 'Payer directory, filing limits (TFL/AFL/CCFL), fee schedules & expected reimbursement, scorecard thresholds, priority and bulk-action setup, appeal letters and payer forms. Managers by default.' },
  { id: 'manage_users', label: 'Manage users & invites', group: 'Admin', help: 'Roles, supervisors, invites. Admin cannot create or edit Sr. Management / Admin accounts. Always on for Sr. Management and Admin.', locked: ['sr_mgmt', 'sys_admin'] },
  { id: 'edit_content', label: 'Edit knowledge & templates', group: 'Admin', help: 'Playbooks, letters, snippets, outcomes, articles, denial codes, resources and the payer directory.' },
  { id: 'manage_clients', label: 'Manage clients & providers', group: 'Admin', help: 'Client settings, providers, RCA lists.' },
  { id: 'edit_config', label: 'Edit configuration', group: 'Admin', help: 'Buckets, statuses, taxonomy, import templates, security, backup. Always on for Sr. Management and Admin (cannot be removed).', locked: ['sr_mgmt', 'sys_admin'] },
  { id: 'manage_permissions', label: 'Edit this permission matrix', group: 'Admin', help: 'Changes what every role can do — the highest-risk setting. Sr. Management only by default; always on for Sr. Management.', locked: ['sr_mgmt'] },
];

const all = (v: boolean) => Object.fromEntries(CAPS.map((c) => [c.id, v])) as Record<string, boolean>;
const on = (ids: string[]) => ({ ...all(false), ...Object.fromEntries(ids.map((i) => [i, true])) });
const USER_BASE = ['work_claims', 'self_assign', 'view_phi', 'export'];
// Team leads and SMEs: everything up to (not including) Admin — allocation, inventory updates, rules, QA.
const LEAD = ['access_control', 'resolve_missing', 'assign', 'bulk_edit', 'close_claims', 'merge_claims', 'import', 'rollback_import', 'export', 'view_phi', 'view_money', 'view_audit_log', 'run_rules', 'manage_rules', 'manage_reports', 'audit_touches', 'approve_adjustments'];
export const DEFAULT_PERMS: Record<Role, Record<string, boolean>> = {
  // Risk tiers: Sr. Management = everything. Admin = system setup (config, users, clients, imports, rules) but no claim work, QA, PHI or money views.
  // Manager = operations (Control, QA, reports, clients, knowledge content) but not users, security or the permission matrix.
  sr_mgmt: all(true),
  sys_admin: on(['manage_payer_rules', 'access_admin', 'access_control', 'edit_config', 'edit_content', 'manage_users', 'manage_clients', 'import', 'rollback_import', 'run_rules', 'manage_rules', 'manage_reports', 'view_audit_log', 'export']),
  manager: on([...LEAD, ...USER_BASE, 'manage_qa', 'access_admin', 'manage_clients', 'edit_content', 'manage_payer_rules']),
  tl_prod_qa: on([...LEAD, ...USER_BASE, 'manage_qa']),
  tl_qa: on([...LEAD, 'manage_qa']),
  sme_prod_qa: on([...LEAD, ...USER_BASE]),
  sme_qa: on(LEAD),
  user_prod_qa: on([...USER_BASE, 'audit_touches']),
  user_prod: on(USER_BASE),
  qa_ext: on(['audit_touches', 'view_phi']),   // placeholder for an outsourced QA department
  viewer: on(['view_phi']),
  client: all(false),
};

export type Perms = Record<string, Record<string, boolean>>;
export function mergePerms(over?: Perms | null): Perms {
  const out: Perms = {}; for (const r of ROLE_ORDER) out[r] = { ...DEFAULT_PERMS[r], ...(over?.[r] || {}) };
  for (const [old, now] of Object.entries(LEGACY_ROLE)) if (over?.[old] && old !== now && !over?.[now]) Object.assign(out[now], over[old]);   // settings saved before the role refresh
  for (const c of CAPS) for (const r of c.locked || []) out[r][c.id] = true;         // lock-out protection
  return out;
}
export const can = (perms: Perms, role: Role | string | undefined, cap: string) => !!role && !!perms[role]?.[cap];
