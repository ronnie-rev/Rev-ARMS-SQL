// Bulk actions: build a PREVIEW (what changes, what is blocked and why), apply with a recorded before-state, and UNDO safely.
import type { Claim, ConfigOption } from '../types';

export type BulkKind = 'owner' | 'status' | 'priority' | 'next_fu' | 'flag_add' | 'flag_remove' | 'snooze' | 'bucket';
export const BULK_LABEL: Record<BulkKind, string> = { owner: 'Reassign owner', status: 'Set workflow status', priority: 'Set priority', next_fu: 'Set follow-up date', flag_add: 'Add flag', flag_remove: 'Remove flag', snooze: 'Snooze / hold', bucket: 'Move to issue bucket' };
export const BULK_CAP: Record<BulkKind, string> = { owner: 'assign', status: 'bulk_edit', priority: 'bulk_edit', next_fu: 'bulk_edit', flag_add: 'bulk_edit', flag_remove: 'bulk_edit', snooze: 'work_claims', bucket: 'bulk_edit' };
export interface BulkAction { kind: BulkKind; /** owner id | status | priority | ISO date | flag | ISO date (snooze until) */ value?: string | null; /** next_fu: days from today instead of a date */ offsetDays?: number; /** only touch claims matching this (e.g. unassigned only) */ onlyIf?: 'unassigned' | 'assigned' | 'open' }
export interface BulkCfg { maxRows: number; reasonOver: number; undoHours: number; allowKinds: BulkKind[]; protectFlags: string[] }
export const DEFAULT_BULK_CFG: BulkCfg = { maxRows: 5000, reasonOver: 200, undoHours: 72, allowKinds: ['owner', 'status', 'priority', 'next_fu', 'flag_add', 'flag_remove', 'snooze', 'bucket'], protectFlags: ['possible_duplicate', 'missing_review'] };
export const resolveBulkCfg = (raw?: Partial<BulkCfg> | null): BulkCfg => ({ ...DEFAULT_BULK_CFG, ...(raw || {}) });
export const validateBulkCfg = (c: BulkCfg): string[] => { const e: string[] = []; if (!(c.maxRows >= 1 && c.maxRows <= 50000)) e.push('Max rows must be 1–50,000'); if (!(c.undoHours >= 0 && c.undoHours <= 24 * 90)) e.push('Undo window must be 0–2,160 hours'); if (!(c.reasonOver >= 0)) e.push('Reason threshold cannot be negative'); if (!c.allowKinds.length) e.push('Allow at least one action'); return e; };

export interface BulkCtx { today: string; cfg: BulkCfg; ownerIds: Set<string>; statuses: Set<string>; priorities: Set<string>; has: (cap: string) => boolean; flagNames?: Set<string> }
export interface BulkRow { claim: Claim; status: 'change' | 'noop' | 'blocked'; reason?: string; patch: Partial<Claim>; before: Record<string, any>; after: Record<string, any> }
export interface BulkPreview { rows: BulkRow[]; counts: { total: number; change: number; noop: number; blocked: number }; errors: string[]; needsReason: boolean; blockedReasons: Record<string, number> }
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function previewBulk(claims: Claim[], a: BulkAction, ctx: BulkCtx): BulkPreview {
  const errors: string[] = []; const rows: BulkRow[] = []; const br: Record<string, number> = {};
  if (!ctx.cfg.allowKinds.includes(a.kind)) errors.push(`“${BULK_LABEL[a.kind]}” is switched off in Admin → Bulk actions`);
  if (!ctx.has(BULK_CAP[a.kind])) errors.push(`You do not have permission to ${BULK_LABEL[a.kind].toLowerCase()}`);
  if (claims.length > ctx.cfg.maxRows) errors.push(`Too many claims (${claims.length.toLocaleString('en-US')}) — the limit is ${ctx.cfg.maxRows.toLocaleString('en-US')}; narrow the selection`);
  const target = a.kind === 'next_fu' ? (a.offsetDays != null ? addDays(ctx.today, a.offsetDays) : a.value || null) : a.value ?? null;
  if (a.kind === 'owner' && a.value && !ctx.ownerIds.has(a.value)) errors.push('Pick a valid owner');
  if (a.kind === 'status' && !(a.value && ctx.statuses.has(a.value))) errors.push('Pick a valid status');
  if (a.kind === 'priority' && !(a.value && ctx.priorities.has(a.value))) errors.push('Pick a valid priority');
  if (a.kind === 'next_fu' && !(target && /^\d{4}-\d{2}-\d{2}$/.test(target))) errors.push('Pick a follow-up date (or days from today)');
  if (a.kind === 'snooze' && !(a.value && /^\d{4}-\d{2}-\d{2}$/.test(a.value) && a.value > ctx.today)) errors.push('Snooze until a future date');
  if ((a.kind === 'flag_add' || a.kind === 'flag_remove') && !a.value) errors.push('Name the flag');
  if (a.kind === 'flag_remove' && a.value && ctx.cfg.protectFlags.includes(a.value)) errors.push(`The “${a.value}” flag is protected — resolve it where it was raised`);
  const block = (c: Claim, reason: string) => { br[reason] = (br[reason] || 0) + 1; rows.push({ claim: c, status: 'blocked', reason, patch: {}, before: {}, after: {} }); };
  for (const c of claims) {
    if (errors.length) { rows.push({ claim: c, status: 'blocked', reason: 'Fix the action settings first', patch: {}, before: {}, after: {} }); continue; }
    if (c.closed_at) { block(c, 'Claim is closed'); continue; }
    if (a.onlyIf === 'unassigned' && c.assigned_to) { block(c, 'Already has an owner'); continue; } if (a.onlyIf === 'assigned' && !c.assigned_to) { block(c, 'Has no owner'); continue; }
    const patch: Partial<Claim> = {}; const before: Record<string, any> = {}; const after: Record<string, any> = {};
    const set = (k: string, v: any, cur: any) => { if ((cur ?? null) !== (v ?? null)) { (patch as any)[k] = v; before[k] = cur ?? null; after[k] = v ?? null; } };
    if (a.kind === 'owner') set('assigned_to', a.value || null, c.assigned_to);
    else if (a.kind === 'status') set('status', a.value, c.status);
    else if (a.kind === 'priority') set('priority', a.value, c.priority);
    else if (a.kind === 'next_fu') set('next_fu', target, c.next_fu);
    else if (a.kind === 'snooze') { const cur = c.custom?.snooze_until ?? null; if (cur !== a.value) { patch.custom = { ...(c.custom || {}), snooze_until: a.value }; before.custom_snooze_until = cur; after.custom_snooze_until = a.value; } }
    else if (a.kind === 'bucket') { const cur = (c.custom?.issue_bucket as string) ?? null; if (cur !== (a.value || null)) { const cu = { ...(c.custom || {}) } as Record<string, any>; if (a.value) cu.issue_bucket = a.value; else delete cu.issue_bucket; patch.custom = cu; before.custom_issue_bucket = cur; after.custom_issue_bucket = a.value || null; } }
    else if (a.kind === 'flag_add') { const f = c.flags || []; if (!f.includes(a.value!)) { patch.flags = [...f, a.value!]; before.flags = f; after.flags = patch.flags; } }
    else if (a.kind === 'flag_remove') { const f = c.flags || []; if (f.includes(a.value!)) { patch.flags = f.filter((x) => x !== a.value); before.flags = f; after.flags = patch.flags; } }
    rows.push(Object.keys(patch).length ? { claim: c, status: 'change', patch, before, after } : { claim: c, status: 'noop', reason: 'Already set', patch, before, after });
  }
  const change = rows.filter((r) => r.status === 'change').length;
  return { rows, counts: { total: rows.length, change, noop: rows.filter((r) => r.status === 'noop').length, blocked: rows.filter((r) => r.status === 'blocked').length }, errors, needsReason: change > ctx.cfg.reasonOver, blockedReasons: br };
}

export interface UndoRow { claimId: string; patch: Partial<Claim>; skipped?: string }
/** Revert only the fields that still hold the value the bulk action set; anything changed since is left alone and reported. */
export function planUndo(rows: { claim_id: string; before: Record<string, any>; after: Record<string, any> }[], current: Map<string, Claim>): { revert: UndoRow[]; conflicts: number; reverted: number; missing: number } {
  const revert: UndoRow[] = []; let conflicts = 0, missing = 0;
  for (const r of rows) {
    const c = current.get(r.claim_id); if (!c) { missing++; continue; }
    const patch: Partial<Claim> = {}; let conflict = false;
    for (const k of Object.keys(r.after)) {
      if (k.startsWith('custom_')) { const f = k.slice(7); if ((c.custom?.[f] ?? null) === r.after[k]) { const cu = { ...(patch.custom || c.custom || {}) } as Record<string, any>; if (r.before[k] == null && f !== 'snooze_until') delete cu[f]; else cu[f] = r.before[k]; patch.custom = cu; } else conflict = true; }
      else if (k === 'flags') { const cur = (c.flags || []).join('|'), aft = (r.after[k] as string[]).join('|'); if (cur === aft) patch.flags = r.before[k]; else { const added = (r.after.flags as string[]).filter((f) => !(r.before.flags as string[]).includes(f)); const removed = (r.before.flags as string[]).filter((f) => !(r.after.flags as string[]).includes(f)); patch.flags = [...new Set([...(c.flags || []).filter((f) => !added.includes(f)), ...removed])]; } }
      else if (((c as any)[k] ?? null) === (r.after[k] ?? null)) (patch as any)[k] = r.before[k]; else conflict = true;
    }
    if (conflict) conflicts++; if (Object.keys(patch).length) revert.push({ claimId: r.claim_id, patch, skipped: conflict ? 'partly changed since' : undefined });
  }
  return { revert, conflicts, reverted: revert.length, missing };
}
export const describeAction = (a: BulkAction, names: { owner?: (id: string) => string }): string => {
  switch (a.kind) { case 'owner': return `Reassign to ${a.value ? names.owner?.(a.value) || 'owner' : 'Unassigned'}`; case 'status': return `Status → ${a.value}`; case 'bucket': return a.value ? `Move to issue bucket “${a.value}”` : 'Remove from issue bucket'; case 'priority': return `Priority → ${a.value}`; case 'next_fu': return a.offsetDays != null ? `Follow-up in ${a.offsetDays} days` : `Follow-up on ${a.value}`; case 'flag_add': return `Add flag ${a.value}`; case 'flag_remove': return `Remove flag ${a.value}`; case 'snooze': return `Snooze until ${a.value}`; }
};
