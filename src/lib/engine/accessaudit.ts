// Access audit: reads the permission matrix, the people and the client assignments and reports anything that is riskier than it should be. Pure.
import type { Claim, Client, Profile } from '../types';
import { DEFAULT_PERMS, type Perms } from './permissions';
import { ROLE_META, ROLE_ORDER, type Role } from '../roles';

export interface AuditFinding { level: 'high' | 'warn' | 'info'; area: 'Roles' | 'People' | 'Clients' | 'Portal'; msg: string; fix: string }
export interface RoleRow { role: Role; label: string; users: number; caps: number; phi: boolean; money: boolean; exportData: boolean; admin: boolean; changed: string[] }
const SENSITIVE = ['view_phi', 'view_money', 'export', 'delete_claims', 'manage_users', 'manage_permissions', 'edit_config', 'view_audit_log'];

export function accessAudit(o: { profiles: Profile[]; clients: Client[]; claims: Claim[]; perms: Perms; phiFree: boolean }): { findings: AuditFinding[]; roles: RoleRow[] } {
  const f: AuditFinding[] = []; const add = (level: AuditFinding['level'], area: AuditFinding['area'], msg: string, fix: string) => f.push({ level, area, msg, fix });
  const active = o.profiles.filter((p) => p.active); const staff = active.filter((p) => p.role !== 'client'); const clientsById = new Map(o.clients.map((c) => [c.id, c]));
  const roles: RoleRow[] = ROLE_ORDER.map((r) => { const p = o.perms[r] || {}; const d = DEFAULT_PERMS[r] || {}; return { role: r, label: ROLE_META[r].label, users: active.filter((x) => x.role === r).length, caps: Object.values(p).filter(Boolean).length, phi: !!p.view_phi, money: !!p.view_money, exportData: !!p.export, admin: !!p.access_admin, changed: Object.keys(p).filter((k) => !!p[k] !== !!d[k]).map((k) => `${p[k] ? '+' : '−'}${k}`) }; });

  // roles
  const sr = active.filter((p) => p.role === 'sr_mgmt'); if (sr.length === 0) add('high', 'People', 'No active Sr. Management account — nobody can change permissions.', 'Promote a trusted person to Sr. Management.');
  if (sr.length > 3) add('warn', 'People', `${sr.length} people have unrestricted Sr. Management access.`, 'Keep it to 2–3; use Manager for day-to-day operations.');
  for (const r of roles) {
    if (r.changed.length) add('info', 'Roles', `${r.label} differs from defaults: ${r.changed.slice(0, 6).join(', ')}${r.changed.length > 6 ? '…' : ''}`, 'Confirm the change was intentional (Admin → Permissions).');
    const p = o.perms[r.role] || {};
    if (r.role !== 'sr_mgmt' && p.manage_permissions) add('high', 'Roles', `${r.label} can edit the permission matrix.`, 'Remove “Edit this permission matrix” — only Sr. Management should hold it.');
    if (['user_prod', 'user_prod_qa', 'viewer', 'qa_ext'].includes(r.role) && p.manage_users) add('high', 'Roles', `${r.label} can manage users.`, 'Remove “Manage users & invites”.');
    if (['user_prod', 'user_prod_qa', 'viewer', 'qa_ext'].includes(r.role) && p.delete_claims) add('high', 'Roles', `${r.label} can permanently delete claims.`, 'Remove “Delete claims”.');
    if (r.role === 'viewer' && (p.export || p.work_claims)) add('warn', 'Roles', 'Viewer can export or work claims, which a read-only role should not.', 'Turn off export / work for Viewer.');
    if (r.role === 'client' && Object.values(p).some(Boolean)) add('high', 'Roles', 'Client role has staff permissions turned on.', 'Clients must have every permission off; portal rights are set per user.');
    if (!o.phiFree && p.export && p.view_phi && !ROLE_META[r.role].mgmt && !ROLE_META[r.role].lead && r.users > 0) add('warn', 'Roles', `${r.label} can both see patient names and export data (${r.users} people).`, 'If the workspace is PHI-free this is low risk; otherwise limit export to leads.');
    if (r.role === 'sys_admin' && (p.view_phi || p.view_money)) add('warn', 'Roles', 'Admin can see PHI or money, which the role is meant to exclude.', 'Turn off view_phi / view_money for Admin.');
  }

  // people
  for (const p of staff) {
    if (p.client_scope === 'assigned' && !(p.client_ids || []).length) add('warn', 'People', `${p.full_name} is restricted to assigned clients but has none — they see no claims.`, 'Assign clients (Admin → Staff & roles → Client access) or set “Sees every client”.');
    if ((p.client_ids || []).some((id) => !clientsById.has(id))) add('warn', 'People', `${p.full_name} is assigned a client that no longer exists.`, 'Re-save their client list.');
  }
  const unrestricted = staff.filter((p) => ROLE_META[p.role].produces && p.client_scope !== 'assigned'); if (unrestricted.length > 0 && o.clients.length > 1) add('info', 'People', `${unrestricted.length} production user(s) can see every client.`, 'If clients must be kept apart (tenants), set them to “Only assigned clients”.');
  const inactive = new Set(o.profiles.filter((p) => !p.active).map((p) => p.id)); const stranded = o.claims.filter((c) => !c.closed_at && c.assigned_to && inactive.has(c.assigned_to)); if (stranded.length) add('warn', 'People', `${stranded.length} open claim(s) are assigned to deactivated users.`, 'Reassign them (Allocation → Reassign).');
  const noSup = staff.filter((p) => ROLE_META[p.role].produces && !p.supervisor_id); if (noSup.length) add('info', 'People', `${noSup.length} producer(s) have no supervisor set — escalations and approvals have no owner.`, 'Set “Reports to” on Staff & roles.');
  const emails = new Map<string, number>(); for (const p of o.profiles) emails.set(p.email.toLowerCase(), (emails.get(p.email.toLowerCase()) || 0) + 1); for (const [e, n] of emails) if (n > 1) add('high', 'People', `${n} accounts share the email ${e}.`, 'Remove the duplicate account.');

  // clients
  for (const c of o.clients) {
    const cover = staff.filter((p) => ROLE_META[p.role].produces && (p.client_scope !== 'assigned' || (p.client_ids || []).includes(c.id)));
    if (!cover.length) add('warn', 'Clients', `${c.name}: no production user can see this client.`, 'Assign a user to the client.');
    const portalUsers = active.filter((p) => p.role === 'client' && ((p.client_ids || []).includes(c.id) || p.client_id === c.id));
    if (!portalUsers.length) add('info', 'Clients', `${c.name}: no portal user — the practice cannot self-serve.`, 'Invite them from Admin → Client portal access.');
  }

  // portal
  for (const p of active.filter((x) => x.role === 'client')) {
    if (!practiceIdsOf(p).length) add('high', 'Portal', `${p.full_name} is a client user with no practice — behaviour is undefined.`, 'Assign a practice or deactivate.');
    if (p.portal?.show_patient && o.phiFree) add('info', 'Portal', `${p.full_name} has “show patient names” on, but the workspace is PHI-free.`, 'Harmless now; revisit if you start storing names.');
    if (p.portal?.can_download) add('info', 'Portal', `${p.full_name} can download data from the portal.`, 'Confirm the client is entitled to exports.');
  }
  const order = { high: 0, warn: 1, info: 2 }; return { findings: f.sort((a, b) => order[a.level] - order[b.level]), roles };
}
const practiceIdsOf = (p: Profile) => [...new Set([...(p.client_id ? [p.client_id] : []), ...(p.client_ids || [])])];
export { SENSITIVE };
