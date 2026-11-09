// "Setup doctor": validates the whole configuration and explains every problem in plain language.
import type { AutoRule, Claim, Client, ConfigOption, ImportTemplate, Profile, ReportSchedule } from '../types';
import { canConfigure, isProducer } from '../roles';
import { DEFAULT_IMPORT, type ImportSettings } from './settings';
import { CAPS, mergePerms, type Perms } from './permissions';
import { validateClient, validateOption } from './adminvalidate';

export interface Finding { id: string; level: 'error' | 'warn' | 'info' | 'ok'; area: string; title: string; detail: string; fix?: { label: string; to: string } }
export interface DoctorInput { config: ConfigOption[]; clients: Client[]; profiles: Profile[]; templates: ImportTemplate[]; rules: AutoRule[]; schedules: ReportSchedule[]; claims: Claim[]; importSettings?: Partial<ImportSettings>; perms?: Perms | null }

export function diagnoseSetup(d: DoctorInput): { findings: Finding[]; score: number } {
  const f: Finding[] = []; const add = (level: Finding['level'], area: string, id: string, title: string, detail: string, fix?: Finding['fix']) => f.push({ id, level, area, title, detail, fix });
  const act = (c: string) => d.config.filter((o) => o.category === c && o.active);
  // buckets
  const b = act('bucket').map((o) => ({ l: o.value, min: Number(o.meta.min ?? 0), max: o.meta.max == null || o.meta.max === '' ? null : Number(o.meta.max) })).sort((a, c) => a.min - c.min);
  if (!b.length) add('error', 'Aging buckets', 'b-none', 'No aging buckets', 'Aging cannot be computed.', { label: 'Add buckets', to: '/admin?tab=buckets' });
  else {
    const issues: string[] = []; if (b[0].min !== 0) issues.push(`first bucket starts at ${b[0].min}, not 0`);
    for (let i = 0; i < b.length - 1; i++) { if (b[i].max == null) issues.push(`“${b[i].l}” is open-ended but not last`); else if (b[i + 1].min !== b[i].max! + 1) issues.push(b[i + 1].min <= b[i].max! ? `“${b[i].l}” overlaps “${b[i + 1].l}”` : `gap between “${b[i].l}” and “${b[i + 1].l}”`); }
    if (b[b.length - 1].max != null) issues.push('last bucket should be open-ended (leave “To” empty)');
    if (new Set(b.map((x) => x.l)).size !== b.length) issues.push('duplicate bucket labels');
    issues.length ? add('error', 'Aging buckets', 'b-shape', 'Aging buckets have gaps/overlaps', issues.join('; '), { label: 'Fix buckets', to: '/admin?tab=buckets' }) : add('ok', 'Aging buckets', 'b-ok', `${b.length} buckets, contiguous`, 'No gaps or overlaps.');
  }
  // statuses / end actions
  const st = new Set(act('status').map((o) => o.value)); const term = act('status').filter((o) => o.meta.terminal);
  !term.length ? add('warn', 'Statuses', 's-term', 'No closing statuses', 'Mark at least one status as “closes out” (e.g. Adjusted) or claims never leave worklists.', { label: 'Edit statuses', to: '/admin?tab=statuses' }) : add('ok', 'Statuses', 's-ok', `${st.size} statuses, ${term.length} closing`, '');
  const ea = act('end_action'); const badEa = ea.filter((o) => !o.meta.status || !st.has(o.meta.status));
  badEa.length ? add('error', 'End actions', 'ea-status', `${badEa.length} end action(s) map to a missing status`, badEa.map((o) => `${o.value} → ${o.meta.status || '∅'}`).join('; '), { label: 'Fix end actions', to: '/admin?tab=actions' }) : ea.length && add('ok', 'End actions', 'ea-ok', `${ea.length} end actions mapped to valid statuses`, '');
  const noFu = ea.filter((o) => !o.meta.terminal && !o.meta.fu_days); noFu.length && add('info', 'End actions', 'ea-fu', `${noFu.length} non-closing end action(s) have no default follow-up days`, noFu.map((o) => o.value).slice(0, 6).join(', '), { label: 'Set follow-ups', to: '/admin?tab=actions' });
  // RCA
  const rca = act('rca'); const details = act('rca_detail'); const empty = rca.filter((r) => !details.some((x) => x.parent === r.value));
  empty.length ? add('warn', 'Root causes', 'rca-empty', `${empty.length} root-cause categories have no details`, empty.map((r) => r.value).join(', '), { label: 'Add details', to: '/admin?tab=rca' }) : rca.length && add('ok', 'Root causes', 'rca-ok', `${rca.length} categories, ${details.length} details`, '');
  const orphan = details.filter((x) => !rca.some((r) => r.value === x.parent)); orphan.length && add('warn', 'Root causes', 'rca-orphan', `${orphan.length} detail(s) point to a missing category`, orphan.slice(0, 5).map((o) => o.value).join(', '));
  const dup = rca.map((r) => r.value.toLowerCase()).filter((v, i, a) => a.indexOf(v) !== i); dup.length && add('warn', 'Root causes', 'rca-dup', 'Duplicate root-cause names', [...new Set(dup)].join(', '));
  const badW = rca.filter((r) => r.meta.weight != null && (Number(r.meta.weight) < 0 || Number(r.meta.weight) > 1.6)); badW.length && add('warn', 'Root causes', 'rca-w', 'Collectability weights outside 0–1.6', badW.map((r) => `${r.value}=${r.meta.weight}`).join(', '));
  // payers
  const known = new Set(act('payer').flatMap((p) => [p.value.toLowerCase(), ...String(p.meta.aliases || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)]));
  const unseen = [...new Set(d.claims.map((c) => c.payer || '').filter((p) => p && p !== 'Unknown' && !known.has(p.toLowerCase())))];
  unseen.length ? add('info', 'Payers', 'p-unseen', `${unseen.length} payer name(s) in data are not in the directory`, unseen.slice(0, 8).join(', '), { label: 'Open payers', to: '/admin?tab=payers' }) : d.claims.length && add('ok', 'Payers', 'p-ok', 'All payers in data are in the directory', '');
  const noTf = act('payer').filter((p) => !p.meta.tf_days); noTf.length && add('info', 'Payers', 'p-tf', `${noTf.length} payer(s) have no timely-filing window`, 'TF-risk alerts fall back to the client default.', { label: 'Add TF days', to: '/admin?tab=payers' });
  const noLinks = act('payer').filter((p) => !p.meta.portal && !(p.meta.links || []).length); noLinks.length && add('info', 'Payers', 'p-links', `${noLinks.length} payer(s) have no portal/policy links`, 'Specialists get no one-click portal or policy access for them.', { label: 'Add links', to: '/admin?tab=payers' });
  // users & clients
  const users = d.profiles.filter((p) => p.active);
  !users.some((u) => canConfigure(u.role)) ? add('error', 'Users', 'u-admin', 'No active admin', 'Nobody can change configuration.') : add('ok', 'Users', 'u-ok', `${users.length} active users`, '');
  const spec = users.filter((u) => isProducer(u.role)); const noSup = spec.filter((u) => !u.supervisor_id); noSup.length && add('warn', 'Users', 'u-sup', `${noSup.length} specialist(s) have no supervisor`, noSup.map((u) => u.full_name).join(', '), { label: 'Assign supervisors', to: '/admin?tab=users' });
  const noTarget = spec.filter((u) => !u.daily_target); noTarget.length && add('info', 'Users', 'u-target', `${noTarget.length} specialist(s) have no daily target`, 'Productivity scorecards show 0% for them.');
  const badClient = users.filter((u) => u.role === 'client' && !u.client_id); badClient.length && add('error', 'Users', 'u-client', `${badClient.length} client user(s) not linked to a practice`, 'They would see nothing.', { label: 'Link clients', to: '/admin?tab=users' });
  const inactiveOwners = d.claims.filter((c) => !c.closed_at && c.assigned_to && !users.some((u) => u.id === c.assigned_to)); inactiveOwners.length && add('warn', 'Users', 'u-orphan', `${inactiveOwners.length} open claims are assigned to inactive users`, 'Reassign them from Allocation.', { label: 'Reassign', to: '/allocation' });
  const tplPms = new Set(d.templates.map((t) => t.pms));
  d.clients.filter((c) => c.active).forEach((c) => { if (!c.supervisor_id) add('warn', 'Clients', 'c-sup-' + c.id, `${c.name}: no supervisor`, '', { label: 'Open clients', to: '/admin?tab=clients' }); if (!tplPms.has(c.pms) && c.pms !== 'Other') add('info', 'Clients', 'c-tpl-' + c.id, `${c.name}: no import template for PMS “${c.pms}”`, 'Imports will use auto-detection / the standard template.'); if (c.rca_allowed?.some((r) => !rca.some((x) => x.value === r))) add('warn', 'Clients', 'c-rca-' + c.id, `${c.name}: RCA list references removed categories`, ''); });
  d.clients.length && d.clients.every((c) => c.supervisor_id) && add('ok', 'Clients', 'c-ok', 'Every client has a supervisor', '');
  // import
  const s = { ...DEFAULT_IMPORT, ...(d.importSettings || {}) } as ImportSettings; const bad: string[] = [];
  if (s.closeAfterMisses < 1) bad.push('closeAfterMisses must be ≥ 1'); if (s.maxDropPct <= 0 || s.maxDropPct > 100) bad.push('maxDropPct out of range'); if (s.maxTotalDeltaPct <= 0) bad.push('maxTotalDeltaPct must be > 0');
  bad.length ? add('error', 'Import rules', 'i-bad', 'Import settings invalid', bad.join('; '), { label: 'Fix', to: '/admin?tab=import' }) : add('ok', 'Import rules', 'i-ok', 'Import rules valid', `${s.granularity}-level, identity “${s.identity}”, guardrails ${s.maxDropPct}% drop / ±${s.maxTotalDeltaPct}% swing.`);
  const needed = ['claim_no', 'dos', 'payer', 'balance']; d.templates.filter((t) => t.kind === 'aging').forEach((t) => { const miss = needed.filter((n) => !(t.mapping[n] || []).length); miss.length && add('warn', 'Import templates', 't-' + t.id, `Template “${t.name}” has no aliases for ${miss.join(', ')}`, 'Auto-mapping may fail for this PMS.', { label: 'Edit templates', to: '/admin?tab=templates' }); });
  // rules & schedules
  const ids = new Set(d.profiles.filter((p) => p.active).map((p) => p.id));
  d.rules.forEach((r) => { if (!r.enabled) return; if (!r.conditions.length) add('warn', 'Rules', 'r-nc-' + r.id, `Rule “${r.name}” has no conditions`, 'It will never fire.', { label: 'Open rules', to: '/rules' }); if (!r.actions.length) add('warn', 'Rules', 'r-na-' + r.id, `Rule “${r.name}” has no actions`, '', { label: 'Open rules', to: '/rules' }); r.actions.filter((a) => a.type === 'assign').forEach((a) => { const pool = a.pool || []; if (!pool.length) add('warn', 'Rules', 'r-pool-' + r.id, `Rule “${r.name}” assigns to an empty pool`, '', { label: 'Open rules', to: '/rules' }); else if (pool.some((u) => !ids.has(u))) add('warn', 'Rules', 'r-pu-' + r.id, `Rule “${r.name}” assigns to inactive/missing users`, '', { label: 'Open rules', to: '/rules' }); }); });
  d.rules.some((r) => r.enabled) ? add('ok', 'Rules', 'r-ok', `${d.rules.filter((r) => r.enabled).length} rule(s) enabled`, '') : add('info', 'Rules', 'r-none', 'No automation rules enabled', 'Add rules (or templates) to auto-prioritise and route claims.', { label: 'Open rules', to: '/rules' });
  d.schedules.filter((x) => x.active && !x.recipients.length).forEach((x) => add('warn', 'Reports', 'sch-' + x.id, `Schedule “${x.name}” has no recipients`, '', { label: 'Open reports', to: '/reports' }));
  // permissions
  const perms = mergePerms(d.perms); if (!perms.user_prod.work_claims) add('warn', 'Permissions', 'perm-work', 'Users (Production) cannot work claims', 'The “Work claims” capability is off for the User (Production) role.', { label: 'Open permissions', to: '/admin?tab=permissions' });
  if (!perms.tl_prod_qa.import) add('info', 'Permissions', 'perm-import', 'Team leads cannot import', 'Only managers can upload aging files.');
  add('info', 'Permissions', 'perm-n', `${CAPS.length} capabilities across 6 roles`, 'UI-level fine-grained control; the database enforces the coarse role boundaries (clients, specialists, admins).');
  const snippets = act('snippet').length; !snippets && add('info', 'Notes', 'sn', 'No comment snippets', 'Add reusable snippets for faster notes.', { label: 'Add snippets', to: '/admin?tab=snippets' });
  !d.claims.length && add('info', 'Data', 'd-none', 'No claims loaded yet', 'Import an aging file to begin.', { label: 'Import', to: '/import' });
  const errs = f.filter((x) => x.level === 'error').length, warns = f.filter((x) => x.level === 'warn').length;
  // field-level validation of every stored setting (catches values typed before validation existed, or imported from a backup)
  const badOpts = d.config.map((o) => ({ o, e: validateOption(o, d.config) })).filter((x) => x.e.length);
  if (badOpts.length) add('warn', 'Field validation', 'fv', `${badOpts.length} setting(s) have invalid values`, badOpts.slice(0, 6).map((x) => `${x.o.category} “${x.o.value}”: ${x.e[0].msg}`).join('; ') + (badOpts.length > 6 ? ' …' : ''), { label: 'Open console audit', to: '/admin?tab=audit' });
  for (const c of d.clients) { const ve = validateClient(c, d.clients); if (ve.length) add('warn', 'Clients', 'cv-' + c.id, `Client “${c.name}” has invalid fields`, ve.map((x) => x.msg).join('; '), { label: 'Edit clients', to: '/admin?tab=clients' }); }
  return { findings: f, score: Math.max(0, 100 - errs * 20 - warns * 6) };
}
