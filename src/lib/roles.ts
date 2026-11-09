// The one place that defines who is who. Everything else (permissions defaults, navigation, analyst lists, QA, Supabase RLS classes)
// reads these flags — to add or change a role, edit ROLE_META and the matching defaults in engine/permissions.ts.
export type Role = 'sr_mgmt' | 'sys_admin' | 'manager' | 'tl_prod_qa' | 'tl_qa' | 'sme_prod_qa' | 'sme_qa' | 'user_prod_qa' | 'user_prod' | 'qa_ext' | 'viewer' | 'client';

export interface RoleMeta {
  label: string; desc: string;
  /** does production work (owns claims, has a daily target, appears in allocation / productivity / QA sampling) */ produces: boolean;
  /** may review other people's work in QA */ qa: boolean;
  /** team lead or SME: allocation, inventory updates, Control section */ lead: boolean;
  /** management tier (Manager, Sr. Management, Admin): sees across teams */ mgmt: boolean;
  /** may change system configuration (taxonomy, users, security) */ config: boolean;
  /** individual contributor (regular user) */ ic: boolean;
  /** landing page */ home: '/me' | '/' | '/portal' | '/qa';
  /** coarse class used by database policies (see migration 0011) */ rls: 'admin' | 'supervisor' | 'specialist' | 'auditor' | 'viewer' | 'client';
}
export const ROLE_META: Record<Role, RoleMeta> = {
  sr_mgmt: { label: 'Sr. Management', desc: 'Full access to everything, including users, permissions and configuration.', produces: false, qa: true, lead: true, mgmt: true, config: true, ic: false, home: '/', rls: 'admin' },
  sys_admin: { label: 'Admin', desc: 'System administrator: configuration, users, clients, imports and rules. No claim work, QA, PHI or money views by default.', produces: false, qa: false, lead: false, mgmt: true, config: true, ic: false, home: '/', rls: 'admin' },
  manager: { label: 'Manager', desc: 'Runs operations: everything in Control, QA, reporting, clients and knowledge content. No user, security or permission settings.', produces: false, qa: true, lead: true, mgmt: true, config: false, ic: false, home: '/', rls: 'admin' },
  tl_prod_qa: { label: 'Team Lead (QA & Production)', desc: 'Works claims, reviews QA, allocates and updates inventory. No Admin settings.', produces: true, qa: true, lead: true, mgmt: false, config: false, ic: false, home: '/', rls: 'supervisor' },
  tl_qa: { label: 'Team Lead (QA)', desc: 'Leads QA, allocates and updates inventory. Does not work claims. No Admin settings.', produces: false, qa: true, lead: true, mgmt: false, config: false, ic: false, home: '/', rls: 'supervisor' },
  sme_prod_qa: { label: 'SME (Production + QA)', desc: 'Subject-matter expert: works claims, reviews QA, allocates and updates inventory. No Admin settings.', produces: true, qa: true, lead: true, mgmt: false, config: false, ic: false, home: '/me', rls: 'supervisor' },
  sme_qa: { label: 'SME (QA)', desc: 'Subject-matter expert for QA: reviews, allocates and updates inventory. No Admin settings.', produces: false, qa: true, lead: true, mgmt: false, config: false, ic: false, home: '/', rls: 'supervisor' },
  user_prod_qa: { label: 'User (Production + QA)', desc: 'Works claims and reviews teammates’ work in QA.', produces: true, qa: true, lead: false, mgmt: false, config: false, ic: true, home: '/me', rls: 'specialist' },
  user_prod: { label: 'User (Production)', desc: 'Works claims. No Control or Admin sections.', produces: true, qa: false, lead: false, mgmt: false, config: false, ic: true, home: '/me', rls: 'specialist' },
  qa_ext: { label: 'QA Analyst (External)', desc: 'Placeholder for an outsourced QA department: reviews and scores work only — no claim work, allocation or Control access.', produces: false, qa: true, lead: false, mgmt: false, config: false, ic: false, home: '/qa', rls: 'auditor' },
  viewer: { label: 'Viewer', desc: 'Read-only.', produces: false, qa: false, lead: false, mgmt: false, config: false, ic: false, home: '/', rls: 'viewer' },
  client: { label: 'Client', desc: 'Practice portal (view-only).', produces: false, qa: false, lead: false, mgmt: false, config: false, ic: false, home: '/portal', rls: 'client' },
};
/** display order (most → least access) */
export const ROLE_ORDER: Role[] = ['sr_mgmt', 'sys_admin', 'manager', 'tl_prod_qa', 'tl_qa', 'sme_prod_qa', 'sme_qa', 'user_prod_qa', 'user_prod', 'qa_ext', 'viewer', 'client'];
export const STAFF_ROLES: Role[] = ROLE_ORDER.filter((r) => r !== 'client');
export const ROLE_LABEL = Object.fromEntries(ROLE_ORDER.map((r) => [r, ROLE_META[r].label])) as Record<Role, string>;

/** roles saved by earlier versions → current role */
export const LEGACY_ROLE: Record<string, Role> = { admin: 'sr_mgmt', supervisor: 'tl_prod_qa', specialist: 'user_prod', auditor: 'sme_qa' };
export const normRole = (r: string | null | undefined): Role => (r && r in ROLE_META ? (r as Role) : (r && LEGACY_ROLE[r]) || 'user_prod');
const m = (r?: string | null) => (r ? ROLE_META[normRole(r)] : undefined);
export const isProducer = (r?: string | null) => !!m(r)?.produces;
export const isQaRole = (r?: string | null) => !!m(r)?.qa;
export const isLead = (r?: string | null) => !!m(r)?.lead;
export const isMgmt = (r?: string | null) => !!m(r)?.mgmt;
export const canConfigure = (r?: string | null) => !!m(r)?.config;
export const isIC = (r?: string | null) => !!m(r)?.ic;
export const isStaffRole = (r?: string | null) => !!r && normRole(r) !== 'client';
/** people who can be somebody's “reports to” */
export const canSupervise = (r?: string | null) => isLead(r);
/** Who may assign which roles (privilege-escalation guard): Sr. Mgmt anyone; Admin anyone except Sr. Mgmt / Admin; nobody else. */
export const assignableRoles = (actor?: string | null): Role[] => { const a = actor ? normRole(actor) : null; return a === 'sr_mgmt' ? ROLE_ORDER : a === 'sys_admin' ? ROLE_ORDER.filter((r) => r !== 'sr_mgmt' && r !== 'sys_admin') : []; };
export const canEditUser = (actor?: string | null, target?: string | null) => { const a = actor ? normRole(actor) : null; if (a === 'sr_mgmt') return true; if (a === 'sys_admin') return !!target && normRole(target) !== 'sr_mgmt' && normRole(target) !== 'sys_admin'; return false; };
export const homeFor = (r?: string | null) => m(r)?.home ?? '/';
export const rlsClass = (r?: string | null) => m(r)?.rls ?? 'specialist';

/** does a notification addressed to `target` (a role id or a group: qa | admin | supervisor | all) reach a user with `role`? */
export function roleMatches(target: string | null | undefined, role: string | null | undefined): boolean {
  if (!target || !role) return false; const t = target.toLowerCase(); const me = normRole(role);
  if (t === 'all') return true; if (t === 'qa' || t === 'auditor') return isQaRole(me); if (t === 'admin') return isMgmt(me); if (t === 'supervisor') return isLead(me); if (t === 'specialist') return isProducer(me);
  return t === me;
}
