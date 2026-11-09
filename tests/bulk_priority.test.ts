import { describe, expect, it } from 'vitest';
import { planUndo, previewBulk, resolveBulkCfg, validateBulkCfg } from '../src/lib/engine/bulk';
import { priorityOf, resolvePriorityCfg, validatePriorityCfg } from '../src/lib/engine/priority';
import { buildLimitIndex, deadlinesFor, resolveLimitsCfg } from '../src/lib/engine/limits';
import type { EClaim } from '../src/lib/engine/eclaim';
import type { Claim } from '../src/lib/types';

const mk = (o: Partial<Claim> = {}): Claim => ({ id: 'c' + Math.random().toString(36).slice(2, 7), client_id: 'k1', claim_no: 'X', account_id: null, patient_name: null, dos: '2026-06-01', last_billed: '2026-06-05', payer: 'Aetna', provider: null, provider_type: null, cpt: '99213', billed_amt: 500, balance: 500, pms_status: null, denial_codes: null, status: 'New', rca: null, rca_detail: null, end_action: null, end_sub: null, mode: null, assigned_to: null, priority: 'Normal', next_fu: null, touch_count: 0, last_touched_at: null, custom: {}, first_batch: null, last_batch: null, closed_at: null, closed_reason: null, created_at: '', updated_at: '', flags: [], ...o } as Claim);
const ec = (c: Claim, o: Partial<EClaim> = {}): EClaim => ({ c, client: undefined, age: 60, bucket: null, tfLeft: null, score: 0, terminal: false, open: true, owner: undefined, fuDue: false, stale: false, ...o } as EClaim);
const bctx = (o: any = {}) => ({ today: '2026-10-30', cfg: resolveBulkCfg(null), ownerIds: new Set(['u1', 'u2']), statuses: new Set(['New', 'In Progress']), priorities: new Set(['Normal', 'High', 'Critical']), has: () => true, ...o });

describe('bulk preview', () => {
  it('shows change / noop / blocked with reasons and never touches closed claims', () => {
    const cs = [mk({ id: 'a' }), mk({ id: 'b', assigned_to: 'u1' }), mk({ id: 'c', closed_at: 'x' }), mk({ id: 'd', assigned_to: 'u2' })];
    const p = previewBulk(cs, { kind: 'owner', value: 'u1', onlyIf: 'unassigned' }, bctx()); expect(p.counts).toEqual({ total: 4, change: 1, noop: 0, blocked: 3 }); expect(p.blockedReasons).toEqual({ 'Already has an owner': 2, 'Claim is closed': 1 });
    const q = previewBulk(cs, { kind: 'owner', value: 'u1' }, bctx()); expect(q.counts).toMatchObject({ change: 2, noop: 1, blocked: 1 });
  });
  it('validates action values, permissions, row limits and protected flags', () => {
    expect(previewBulk([mk()], { kind: 'status', value: 'Nope' }, bctx()).errors[0]).toMatch(/valid status/); expect(previewBulk([mk()], { kind: 'owner', value: 'u1' }, bctx({ has: () => false })).errors[0]).toMatch(/permission/);
    expect(previewBulk([mk(), mk()], { kind: 'priority', value: 'High' }, bctx({ cfg: resolveBulkCfg({ maxRows: 1 }) })).errors[0]).toMatch(/Too many/); expect(previewBulk([mk()], { kind: 'flag_remove', value: 'missing_review' }, bctx()).errors[0]).toMatch(/protected/);
    expect(previewBulk([mk()], { kind: 'snooze', value: '2026-01-01' }, bctx()).errors[0]).toMatch(/future/); expect(previewBulk([mk()], { kind: 'priority', value: 'High' }, bctx({ cfg: resolveBulkCfg({ allowKinds: ['owner'] }) })).errors[0]).toMatch(/switched off/);
    const many = previewBulk(Array.from({ length: 5 }, () => mk()), { kind: 'priority', value: 'High' }, bctx({ cfg: resolveBulkCfg({ reasonOver: 3 }) })); expect(many.needsReason).toBe(true); expect(validateBulkCfg(resolveBulkCfg({ maxRows: 0 }))[0]).toMatch(/Max rows/);
  });
  it('follow-up by date or offset; flags add/remove', () => { expect(previewBulk([mk()], { kind: 'next_fu', offsetDays: 7 }, bctx()).rows[0].patch.next_fu).toBe('2026-11-06'); expect(previewBulk([mk({ flags: ['x'] })], { kind: 'flag_add', value: 'x' }, bctx()).counts.noop).toBe(1); expect(previewBulk([mk({ flags: ['x', 'y'] })], { kind: 'flag_remove', value: 'x' }, bctx()).rows[0].patch.flags).toEqual(['y']); });
});

describe('undo', () => {
  it('reverts untouched fields and leaves later edits alone', () => {
    const a = mk({ id: 'a', priority: 'Normal' }), b = mk({ id: 'b', priority: 'Normal' }); const p = previewBulk([a, b], { kind: 'priority', value: 'High' }, bctx());
    const rows = p.rows.map((r) => ({ claim_id: r.claim.id, before: r.before, after: r.after })); const now = new Map([['a', { ...a, priority: 'High' }], ['b', { ...b, priority: 'Critical' }]]) as Map<string, Claim>;
    const u = planUndo(rows, now); expect(u.reverted).toBe(1); expect(u.conflicts).toBe(1); expect(u.revert[0]).toMatchObject({ claimId: 'a', patch: { priority: 'Normal' } });
  });
  it('flags and snooze round-trip, merging with flags added since', () => {
    const f = mk({ id: 'f', flags: ['a'] }); const p = previewBulk([f], { kind: 'flag_add', value: 'z' }, bctx()); const rows = p.rows.map((r) => ({ claim_id: 'f', before: r.before, after: r.after }));
    expect(planUndo(rows, new Map([['f', { ...f, flags: ['a', 'z'] } as Claim]])).revert[0].patch.flags).toEqual(['a']); expect(planUndo(rows, new Map([['f', { ...f, flags: ['a', 'z', 'q'] } as Claim]])).revert[0].patch.flags).toEqual(['a', 'q']);
    const s = mk({ id: 's' }); const ps = previewBulk([s], { kind: 'snooze', value: '2026-12-01' }, bctx()); const r2 = ps.rows.map((r) => ({ claim_id: 's', before: r.before, after: r.after })); expect(planUndo(r2, new Map([['s', { ...s, custom: { snooze_until: '2026-12-01' } } as Claim]])).revert[0].patch.custom).toMatchObject({ snooze_until: null });
  });
});

describe('priority', () => {
  const cfg = resolvePriorityCfg(null); const lc = resolveLimitsCfg(null);
  const idx = buildLimitIndex({ rows: [{ id: 'r', payer: 'Aetna', client_id: null, plan_type: null, tfl_days: 180, afl_days: 60, ccfl_days: 90, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: null, notes: null, verified_on: null, active: true }], clients: [{ id: 'k1', tf_days: null }], cfg: lc });
  const dl = (x: EClaim) => deadlinesFor(x.c, idx.resolve(x.c.payer, x.c.client_id), '2026-10-30', lc);
  it('an expiring appeal outranks a bigger, calmer claim — and says why', () => {
    const urgent = priorityOf(ec(mk({ balance: 300, denial_codes: 'CO-50', denial_date: '2026-09-05' }), {}), { cfg, deadlines: dl }); const calm = priorityOf(ec(mk({ balance: 4000 }), { age: 40 }), { cfg, deadlines: dl });
    expect(urgent.score).toBeGreaterThan(calm.score); expect(urgent.parts[0].key).toBe('deadline'); expect(urgent.parts[0].label).toMatch(/AFL .*d left/); expect(urgent.deadline!.kind).toBe('afl');
  });
  it('allocation-rule boosts, follow-ups, snooze and win probability are scored', () => {
    const base = priorityOf(ec(mk()), { cfg }); const boosted = priorityOf(ec(mk()), { cfg, allocRules: [{ id: 'r', name: 'Big Aetna', client_id: null, criteria: { payers: ['Aetna'], boost: 15 } as any, assignees: [], strategy: 'balanced', active: true, sort: 0 }] }); expect(boosted.score - base.score).toBeCloseTo(15, 0); expect(boosted.parts.find((p) => p.key === 'rule')!.label).toMatch(/Big Aetna/);
    expect(priorityOf(ec(mk({ next_fu: '2026-10-01' }), { fuDue: true }), { cfg }).parts.some((p) => p.key === 'followup')).toBe(true); expect(priorityOf(ec(mk(), { snoozed: true }), { cfg }).score).toBeLessThan(base.score); expect(priorityOf(ec(mk()), { cfg, winProb: () => 0.8 }).score).toBeGreaterThan(base.score);
  });
  it('expected reimbursement caps the value used; config validation', () => { const hi = priorityOf(ec(mk({ balance: 5000, expected_amt: 100 })), { cfg }); const lo = priorityOf(ec(mk({ balance: 5000 })), { cfg }); expect(hi.parts.find((p) => p.key === 'value')!.pts).toBeLessThan(lo.parts.find((p) => p.key === 'value')!.pts); expect(validatePriorityCfg(resolvePriorityCfg({ valueCap: 0 }))[0]).toMatch(/Value cap/); expect(validatePriorityCfg(cfg)).toEqual([]); });
});
