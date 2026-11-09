// Field-level validation for every Admin console form. Pure and shared by the UI (inline errors, blocked saves),
// the Setup doctor and the Console audit, so a rule is written once and tested once.
import type { Client, ConfigOption, Profile, Role } from '../types';
import { ROLE_ORDER } from '../roles';

export interface FieldError { field: string; msg: string }
const ok: FieldError[] = [];
const url = (s: string) => { try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } };
const hex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);
const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v);
const num = (v: unknown) => v === null || v === undefined || v === '' ? null : Number(v);
const RULES = ['credit', 'patient', 'appeal', 'hold', 'denied', 'rejected', 'secondary', 'unbilled', 'noresponse', 'billed', 'custom'];

export const normName = (s: string) => s.trim().replace(/\s+/g, ' ');

/** One config row (any category). `all` is the full config list, used for uniqueness and cross-row checks. */
export function validateOption(o: ConfigOption, all: ConfigOption[]): FieldError[] {
  const e: FieldError[] = []; const v = o.value ?? '';
  if (!v.trim()) e.push({ field: 'value', msg: 'Value is required' });
  else {
    if (v.length > 120 && !['letter', 'snippet', 'playbook', 'kb_article'].includes(o.category)) e.push({ field: 'value', msg: 'Keep it under 120 characters' });
    if (v !== v.trim()) e.push({ field: 'value', msg: 'Remove leading/trailing spaces' });
    if (all.some((x) => x.id !== o.id && x.category === o.category && (x.parent || '') === (o.parent || '') && x.value.trim().toLowerCase() === v.trim().toLowerCase())) e.push({ field: 'value', msg: `“${v.trim()}” already exists here` });
  }
  const m = o.meta || {};
  if (o.color && !hex(o.color)) e.push({ field: 'color', msg: 'Colour must be a hex value like #3b82ec' });
  switch (o.category) {
    case 'bucket': {
      const min = num(m.min), max = num(m.max);
      if (min == null || !int(min) || min < 0) e.push({ field: 'meta.min', msg: 'From must be a whole number ≥ 0' });
      if (max != null && (!int(max) || (min != null && max < min))) e.push({ field: 'meta.max', msg: 'To must be a whole number ≥ From (or empty for open-ended)' });
      if (min != null && o.active) for (const x of all) if (x.id !== o.id && x.category === 'bucket' && x.active) { const a = num(x.meta?.min) ?? 0, b = num(x.meta?.max) ?? Infinity; if (min <= b && (max ?? Infinity) >= a) { e.push({ field: 'meta.min', msg: `Overlaps “${x.value}” (${a}–${b === Infinity ? '∞' : b})` }); break; } }
      break; }
    case 'payer': {
      for (const [k, lo, hi] of [['tf_days', 1, 1095], ['followup_days', 1, 365], ['appeal_days', 1, 730]] as const) { const n = num(m[k]); if (n != null && (!int(n) || n < lo || n > hi)) e.push({ field: 'meta.' + k, msg: `${k.replace('_', ' ')} must be a whole number ${lo}–${hi}` }); }
      if (m.phone && !/^[\d\s().+\-xX#,]{7,32}$/.test(String(m.phone))) e.push({ field: 'meta.phone', msg: 'Phone looks invalid' });
      if (m.portal && !url(String(m.portal))) e.push({ field: 'meta.portal', msg: 'Portal must be a full http(s) URL' });
      break; }
    case 'stage': if (m.rule && !RULES.includes(String(m.rule))) e.push({ field: 'meta.rule', msg: 'Unknown rule' }); if (m.rule === 'custom' && !String(m.keywords || '').trim()) e.push({ field: 'meta.keywords', msg: 'A custom queue needs at least one keyword' }); break;
    case 'end_action': { const f = num(m.fu_days); if (f != null && (!int(f) || f < 0 || f > 365)) e.push({ field: 'meta.fu_days', msg: 'Follow-up days must be 0–365' }); if (m.status && !all.some((x) => x.category === 'status' && x.value === m.status)) e.push({ field: 'meta.status', msg: `Status “${m.status}” does not exist` }); break; }
    case 'carc': if (!/^(CO|PR|OA|PI|CR)-\d{1,3}$|^[A-Z]{1,2}\d{1,4}$/i.test(v.trim())) e.push({ field: 'value', msg: 'Use a code like CO-45, PR-1, N290 or MA130' }); break;
    case 'letter': case 'snippet': if (!String(m.body || '').trim()) e.push({ field: 'meta.body', msg: 'Body cannot be empty' }); break;
    case 'kb_article': if (!String(m.body || '').trim()) e.push({ field: 'meta.body', msg: 'Article body cannot be empty' }); if (m.section && !['SOP', 'Checklist', 'KPI', 'Escalation', 'Client comms'].includes(String(m.section))) e.push({ field: 'meta.section', msg: 'Unknown section' }); break;
    case 'playbook': if (!String(m.steps || '').trim()) e.push({ field: 'meta.steps', msg: 'Add at least one step' }); break;
    case 'resource': if (m.url && !url(String(m.url))) e.push({ field: 'meta.url', msg: 'URL must start with http(s)://' }); break;
    case 'field': if (m.type && !['text', 'number', 'date', 'bool', 'select'].includes(String(m.type))) e.push({ field: 'meta.type', msg: 'Type must be text, number, date, select or bool' }); break;
  }
  return e.length ? e : ok;
}

/** Whole-config consistency (used by the Setup doctor and the audit). */
export function validateConfig(all: ConfigOption[]): FieldError[] {
  const e: FieldError[] = []; const act = (c: string) => all.filter((o) => o.category === c && o.active);
  const b = act('bucket').map((x) => ({ n: x.value, min: num(x.meta?.min) ?? 0, max: num(x.meta?.max) })).sort((p, q) => p.min - q.min);
  if (!b.length) e.push({ field: 'bucket', msg: 'No aging buckets are active' });
  b.forEach((x, i) => { if (i && b[i - 1].max != null && x.min !== (b[i - 1].max as number) + 1) e.push({ field: 'bucket', msg: `Gap or overlap between “${b[i - 1].n}” and “${x.n}”` }); if (x.max == null && i < b.length - 1) e.push({ field: 'bucket', msg: `“${x.n}” is open-ended but not last` }); });
  if (!act('status').some((s) => s.meta?.terminal)) e.push({ field: 'status', msg: 'No status closes a claim out' });
  for (const ea of act('end_action')) if (ea.meta?.status && !all.some((s) => s.category === 'status' && s.value === ea.meta.status)) e.push({ field: 'end_action', msg: `End action “${ea.value}” maps to missing status “${ea.meta.status}”` });
  for (const c of ['rca_detail', 'end_sub'] as const) for (const d of all.filter((o) => o.category === c)) if (d.parent && !all.some((p) => p.category === (c === 'rca_detail' ? 'rca' : 'end_action') && p.value === d.parent)) e.push({ field: c, msg: `“${d.value}” belongs to missing parent “${d.parent}”` });
  const st = act('stage'); if (st.length && !st.some((s) => s.meta?.rule === 'billed')) e.push({ field: 'stage', msg: 'No catch-all “billed” queue — some claims may have no queue' });
  return e;
}

export function validateClient(c: Partial<Client>, all: Client[]): FieldError[] {
  const e: FieldError[] = [];
  if (!normName(c.name || '')) e.push({ field: 'name', msg: 'Name is required' }); else if (all.some((x) => x.id !== c.id && x.name.trim().toLowerCase() === normName(c.name!).toLowerCase())) e.push({ field: 'name', msg: 'Another client has this name' });
  if (c.code && !/^[A-Za-z0-9]{2,8}$/.test(c.code)) e.push({ field: 'code', msg: 'Code: 2–8 letters/digits' }); else if (c.code && all.some((x) => x.id !== c.id && (x.code || '').toLowerCase() === c.code!.toLowerCase())) e.push({ field: 'code', msg: 'Code already used' });
  if (c.tf_days != null && (!int(c.tf_days) || c.tf_days < 1 || c.tf_days > 1095)) e.push({ field: 'tf_days', msg: 'Timely filing must be 1–1095 days' });
  if (c.aging_basis && !['dos', 'billed'].includes(c.aging_basis)) e.push({ field: 'aging_basis', msg: 'Aging basis must be dos or billed' });
  if (c.color && !hex(c.color)) e.push({ field: 'color', msg: 'Colour must be hex' });
  return e;
}

const ROLES: Role[] = ROLE_ORDER;
export function validateProfile(p: Partial<Profile>, all: Profile[], clientIds: string[] = []): FieldError[] {
  const e: FieldError[] = [];
  if (!(p.full_name || '').trim()) e.push({ field: 'full_name', msg: 'Name is required' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test((p.email || '').trim())) e.push({ field: 'email', msg: 'Enter a valid email' }); else if (all.some((x) => x.id !== p.id && x.email.toLowerCase() === p.email!.trim().toLowerCase())) e.push({ field: 'email', msg: 'Email already in use' });
  if (!p.role || !ROLES.includes(p.role)) e.push({ field: 'role', msg: 'Pick a role' });
  if (p.daily_target != null && (!int(p.daily_target) || p.daily_target < 0 || p.daily_target > 1000)) e.push({ field: 'daily_target', msg: 'Daily target must be 0–1000' });
  if (p.emp_code && all.some((x) => x.id !== p.id && x.emp_code && x.emp_code.toLowerCase() === p.emp_code!.toLowerCase())) e.push({ field: 'emp_code', msg: 'Employee code already used' });
  if (p.supervisor_id && p.supervisor_id === p.id) e.push({ field: 'supervisor_id', msg: 'Cannot report to themselves' });
  if (p.role === 'client' && !(p.client_id || (p.client_ids || []).length)) e.push({ field: 'client_ids', msg: 'Client users need at least one practice' });
  for (const id of p.client_ids || []) if (clientIds.length && !clientIds.includes(id)) e.push({ field: 'client_ids', msg: 'Unknown practice assigned' });
  return e;
}

export interface NumRule { k: string; label: string; min: number; max: number; int?: boolean }
export const IMPORT_NUMS: NumRule[] = [{ k: 'maxDropPct', label: 'Max claims closed (%)', min: 0, max: 100 }, { k: 'maxTotalDeltaPct', label: 'Max A/R swing (%)', min: 0, max: 500 }, { k: 'maxInvalidPct', label: 'Max invalid rows (%)', min: 0, max: 100 }, { k: 'maxBadDatePct', label: 'Max bad dates (%)', min: 0, max: 100 }, { k: 'closeAfterMisses', label: 'Close after N misses', min: 1, max: 12, int: true }, { k: 'attributionWindowDays', label: 'Attribution window (days)', min: 1, max: 365, int: true }];
export function validateImportSettings(s: Record<string, any>): FieldError[] { const e: FieldError[] = []; for (const r of IMPORT_NUMS) { const v = s[r.k]; if (v == null) continue; if (typeof v !== 'number' || Number.isNaN(v) || v < r.min || v > r.max || (r.int && !Number.isInteger(v))) e.push({ field: r.k, msg: `${r.label}: ${r.int ? 'whole number ' : ''}${r.min}–${r.max}` }); } return e; }
