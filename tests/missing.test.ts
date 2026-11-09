import { describe, expect, it } from 'vitest';
import { buildIndex, matchRows } from '../src/lib/engine/match';
import { buildPlan } from '../src/lib/engine/reconcile';
import { buildRows, collapse } from '../src/lib/engine/rows';
import { DEFAULT_IMPORT, resolveSettings } from '../src/lib/engine/settings';
import { applyDecision, suggest, validateDecision, type Decision } from '../src/lib/engine/resolution';
import { allocateUids, clientTag, formatUid, maxSeq, parseUid, validUid } from '../src/lib/engine/uid';
import { fingerprint, normClaimNo } from '../src/lib/engine/normalize';
import type { Claim, Client } from '../src/lib/types';

const client = (id: string, code: string): Client => ({ id, name: code + ' Practice', code, pms: 'eCW', color: '#000', supervisor_id: null, aging_basis: 'dos', tf_days: 365, rca_allowed: null, active: true, settings: {} } as any);
const HEAD = ['Claim Number', 'Patient Name', 'Date of Service', 'Payer', 'CPT', 'Billed Amt', 'Balance', 'Encounter #'];
const MAP: Record<string, string | null> = { claim_no: 'Claim Number', patient_name: 'Patient Name', dos: 'Date of Service', payer: 'Payer', cpt: 'CPT', billed_amt: 'Billed Amt', balance: 'Balance', encounter_no: 'Encounter #' };
const mk = (n: number, o: Record<string, any> = {}) => ({ 'Claim Number': 'C' + (100000 + n), 'Patient Name': `PATIENT${n}, TEST`, 'Date of Service': '03/15/2026', Payer: 'Aetna', CPT: '99213', 'Billed Amt': 100 + n, Balance: 100 + n, 'Encounter #': 'E' + n, ...o });
const S = resolveSettings({ phiFree: false }, null);
function run(file: Record<string, any>[], existing: Claim[], c: Client, asOf: string, s = S) {
  const built = buildRows(file, HEAD, MAP, s, []); const col = collapse(built.rows, s); const matches = matchRows(col.rows, buildIndex(existing, s), s);
  return buildPlan({ rows: col.rows, matches, existing, client: c, settings: s, mode: 'snapshot', batchId: 'b-' + asOf, now: asOf + 'T10:00:00Z', asOf, priorBatches: [], knownPayers: new Set(['aetna']), pre: { skipped: built.skipped, dups: col.dropped, aggregated: col.aggregated, conflicts: col.conflicts, badDateRows: 0, totalRows: file.length } });
}
const commit = (plan: ReturnType<typeof run>, existing: Claim[]): Claim[] => { const m = new Map(existing.map((c) => [c.id, c])); [...plan.creates, ...plan.changes.map((x) => x.next), ...plan.unchanged.map((x) => x.next), ...plan.closes.map((x) => x.next), ...plan.misses.map((x) => x.next), ...plan.reviews.map((x) => x.next)].forEach((c) => m.set(c.id, c)); return [...m.values()]; };

describe('claim UID', () => {
  it('is unique per client, checksummed and sequential', () => { const a = clientTag({ code: 'cps', name: 'x' }), b = clientTag({ code: null, name: 'Summit Dermatology' }); expect(a).toBe('CPS'); expect(b).toBe('SD'); const u = allocateUids('CPS', 41, 3, new Date('2026-03-01')); expect(u).toEqual(['RR-CPS-26-0000042-' + u[0].slice(-1), 'RR-CPS-26-0000043-' + u[1].slice(-1), 'RR-CPS-26-0000044-' + u[2].slice(-1)]); expect(new Set(u).size).toBe(3); u.forEach((x) => expect(validUid(x)).toBe(true)); expect(validUid(u[0].slice(0, -1) + (u[0].slice(-1) === '0' ? '1' : '0'))).toBe(false); expect(parseUid(formatUid('AB', 2027, 12))!.seq).toBe(12); expect(formatUid('CPS', 2026, 42)).toBe('RR-CPS-26-0000042-F'); /* same value as the SQL function format_claim_uid */ expect(maxSeq([{ claim_uid: u[2] }, { claim_uid: u[0] }, { claim_uid: null }], 'CPS')).toBe(44); expect(maxSeq([{ claim_uid: u[2] }], 'ZZ')).toBe(0); });
});

describe('same claim number across clients and inside a client', () => {
  it('two practices may use the same claim # and encounter # — each file only matches its own client', () => {
    const A = client('A', 'AAA'), B = client('B', 'BBB'); const fileA = [mk(1)], fileB = [mk(1, { 'Patient Name': 'OTHER, PERSON' })];
    const pa = run(fileA, [], A, '2026-10-01'); const cA = commit(pa, []).map((c) => ({ ...c, id: 'a-' + c.id.slice(0, 6) })); expect(pa.creates).toHaveLength(1);
    const pb = run(fileB, [], B, '2026-10-01'); expect(pb.creates).toHaveLength(1); expect(pb.creates[0].claim_no).toBe(cA[0].claim_no); expect(pb.creates[0].client_id).toBe('B'); expect(pb.creates[0].id).not.toBe(pa.creates[0].id);
    const again = run(fileB, commit(pb, []), B, '2026-10-08'); expect(again.creates).toHaveLength(0);
  });
  it('encounter # is captured', () => { const p = run([mk(7)], [], client('A', 'AAA'), '2026-10-01'); expect(p.creates[0].encounter_no).toBe('E7'); });
  it('a recycled claim # for a different patient/DOS becomes a separate claim, never a merge', () => {
    const A = client('A', 'AAA'); const first = commit(run([mk(1)], [], A, '2026-10-01'), []);
    const p = run([mk(1, { 'Patient Name': 'STRANGER, NEW', 'Date of Service': '09/09/2026' })], first, A, '2026-10-08');
    expect(p.creates).toHaveLength(1); expect(p.creates[0].claim_no).toBe('C100001~2'); expect(p.creates[0].flags).toContain('key_reuse'); expect(p.changes).toHaveLength(0);
    const all = commit(p, first); const third = run([mk(1), mk(1, { 'Patient Name': 'STRANGER, NEW', 'Date of Service': '09/09/2026' })], all, A, '2026-10-15'); expect(third.creates).toHaveLength(0);
  });
  it('DOS or name corrections for the SAME patient do not trigger reuse', () => { const A = client('A', 'AAA'); const first = commit(run([mk(1)], [], A, '2026-10-01'), []); const p = run([mk(1, { 'Date of Service': '03/16/2026' })], first, A, '2026-10-08'); expect(p.creates).toHaveLength(0); const q = run([mk(1, { 'Patient Name': 'PATIENT1 TEST' })], first, A, '2026-10-08'); expect(q.creates).toHaveLength(0); });
});

describe('M1 (1000) → M2 (900 + 300 new): missing claims wait for review', () => {
  const A = client('A', 'AAA'); const m1 = Array.from({ length: 1000 }, (_, i) => mk(i));
  const base = commit(run(m1, [], A, '2026-09-01'), []);
  const m2 = [...Array.from({ length: 900 }, (_, i) => mk(i)), ...Array.from({ length: 300 }, (_, i) => mk(5000 + i))];
  const lenient = resolveSettings({ maxDropPct: 50 }, null);
  const p2 = run(m2, base, A, '2026-09-08', lenient);
  it('keeps the 100 absent claims open and queues them for review (no silent close)', () => { expect(p2.creates).toHaveLength(300); expect(p2.reviews).toHaveLength(100); expect(p2.closes).toHaveLength(0); expect(p2.reviews.every((r) => !r.next.closed_at && r.next.flags!.includes('missing_review') && r.next.missing_since === '2026-09-08')).toBe(true); });
  it('a third file that still lacks them keeps them queued once, and one that has them again clears the flag', () => {
    const after = commit(p2, base); const m3 = [...m2]; const p3 = run(m3, after, A, '2026-09-15', lenient); expect(p3.reviews).toHaveLength(0); expect(p3.misses.filter((x) => x.next.flags!.includes('missing_review')).length).toBe(100);
    const back = run([...m3, mk(950)], commit(p3, after), A, '2026-09-22', lenient); expect(back.reappeared).toHaveLength(1); expect(commit(back, commit(p3, after)).find((c) => c.claim_no === 'C100950')!.flags).not.toContain('missing_review');
  });
  it('legacy auto_close policy still closes them', () => { const p = run(m2, base, A, '2026-09-08', resolveSettings({ maxDropPct: 50, missingPolicy: 'auto_close' }, null)); expect(p.closes).toHaveLength(100); expect(p.reviews).toHaveLength(0); });
  it('a half-empty export is blocked by the mass-drop guardrail', () => { const p = run(m2.slice(0, 300), base, A, '2026-09-08'); expect(p.guardrails.some((g) => g.id === 'MASS_DROP' && g.level === 'block')).toBe(true); });
  it('resolving: paid, written off, patient, duplicate, restore — recorded with date, end action, recoveries and a touch', () => {
    const c = p2.reviews[0].next; const ctx = { now: '2026-09-10T09:00:00Z', actor: { id: 'u1', name: 'Priya', role: 'manager' }, writeOffLimit: 500, canOverrideLimit: false, workLog: [], uid: (() => { let n = 0; return () => 'r' + ++n; })() };
    const paid: Decision = { claimId: c.id, outcome: 'paid', paid: c.balance, endAction: 'Payment Posted', resolvedOn: '2026-09-09' };
    expect(validateDecision(c, paid, ctx)).toBeNull(); const a = applyDecision(c, paid, ctx); expect(a.next.closed_at!.slice(0, 10)).toBe('2026-09-09'); expect(a.next.resolution).toBe('paid'); expect(a.next.balance).toBe(0); expect(a.next.resolved_by).toBe('u1'); expect(a.next.flags).not.toContain('missing_review'); expect(a.recoveries.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(c.balance, 2); expect(a.recoveries[0].type).toBe('payment'); expect(a.touch!.end_action).toBe('Payment Posted'); expect(a.activity.summary).toMatch(/09\/09\/2026.*Paid/);
    expect(validateDecision(c, { claimId: c.id, outcome: 'written_off', resolvedOn: '2026-09-09' }, ctx)).toMatch(/reason/); expect(validateDecision({ ...c, balance: 900 }, { claimId: c.id, outcome: 'written_off', note: 'timely filing', resolvedOn: '2026-09-09' }, ctx)).toMatch(/manager/); expect(validateDecision({ ...c, balance: 900 }, { claimId: c.id, outcome: 'written_off', note: 'tf', resolvedOn: '2026-09-09' }, { ...ctx, canOverrideLimit: true })).toBeNull();
    expect(validateDecision(c, { claimId: c.id, outcome: 'paid', paid: c.balance - 10, resolvedOn: '2026-09-09' }, ctx)).toMatch(/remaining/); const split = applyDecision(c, { claimId: c.id, outcome: 'paid', paid: c.balance - 10, adjusted: 10, note: 'contractual', resolvedOn: '2026-09-09' }, ctx); expect(split.recoveries.map((r) => r.type).sort()).toEqual(['adjustment', 'payment']);
    const dup = applyDecision(c, { claimId: c.id, outcome: 'duplicate', note: 'dup of C1', resolvedOn: '2026-09-09' }, ctx); expect(dup.recoveries.length).toBeGreaterThan(0) as unknown; 
    const rest = applyDecision(c, { claimId: c.id, outcome: 'restore', resolvedOn: '2026-09-09' }, ctx); expect(rest.next.closed_at).toBeNull(); expect(rest.next.flags).not.toContain('missing_review'); expect(rest.next.missing_since).toBeNull(); expect(validateDecision({ ...c, closed_at: 'x' }, paid, ctx)).toBe('Already closed');
  });
  it('suggests from evidence, never from a guess alone', () => { const c = p2.reviews[0].next; expect(suggest(c, { workLog: [], eraPaid: 50 }).confidence).toBe('high'); expect(suggest(c, { workLog: [] }).confidence).toBe('low'); });
});

void DEFAULT_IMPORT; void fingerprint; void normClaimNo;

describe('plan completeness (every claim the plan touches must be persisted)', () => {
  it('reappeared / reviews / changes / unchanged / creates are disjoint and cover every touched claim', () => {
    const A = client('A', 'AAA'); const base = commit(run(Array.from({ length: 20 }, (_, i) => mk(i)), [], A, '2026-09-01'), []);
    const p = run([...Array.from({ length: 12 }, (_, i) => mk(i, i < 3 ? { Balance: 50 } : {})), mk(99)], base, A, '2026-09-08', resolveSettings({ maxDropPct: 100, maxTotalDeltaPct: 100 }, null));
    const ids = [...p.creates.map((c) => c.id), ...p.changes.map((x) => x.next.id), ...p.unchanged.map((x) => x.next.id), ...p.reviews.map((x) => x.next.id), ...p.closes.map((x) => x.next.id), ...p.misses.map((x) => x.next.id)];
    expect(new Set(ids).size).toBe(ids.length); expect(p.creates).toHaveLength(1); expect(p.changes).toHaveLength(3); expect(p.unchanged).toHaveLength(9); expect(p.reviews).toHaveLength(8); expect(ids).toHaveLength(21);
  });
});

describe('rows with no claim #, patient name or DOB still get a stable unique identity', () => {
  const map = { dos: 'DOS', payer: 'Payer', cpt: 'CPT', billed_amt: 'Billed', balance: 'Balance', account_id: 'Acct', claim_no: 'Claim' } as any;
  const build = (raw: Record<string, any>[]) => buildRows(raw, ['DOS', 'Payer', 'CPT', 'Billed', 'Balance', 'Acct', 'Claim'], map, DEFAULT_IMPORT);
  it('uses account + DOS + CPT + charge when there is no patient', () => { const o = build([{ DOS: '04/10/2026', Payer: 'Aetna', CPT: '99213', Billed: 200, Balance: 100, Acct: 'A-77', Claim: '' }]); expect(o.rows).toHaveLength(1); expect(o.rows[0].generated).toBe(true); expect(o.rows[0].fp).not.toBe(''); });
  it('falls back to DOS/CPT/payer/charge and keeps identical rows as separate claims, flagged', () => {
    const r = { DOS: '04/10/2026', Payer: 'Aetna', CPT: '99213', Billed: 200, Balance: 100, Acct: '', Claim: '' };
    const a = build([r, { ...r }, { ...r, Balance: 90 }]); const b = build([r, { ...r }]);
    expect(a.rows).toHaveLength(3); expect(new Set(a.rows.map((x) => x.key)).size).toBe(3); expect(a.rows[1].issues.some((i) => i.code === 'IDENTICAL_ROW')).toBe(true);
    expect(b.rows.map((x) => x.key)).toEqual(a.rows.slice(0, 2).map((x) => x.key));   // stable across files → no duplicates next month
  });
  it('still rejects a row with nothing to identify it by', () => { const o = build([{ DOS: '', Payer: 'Aetna', CPT: '', Billed: '', Balance: 50, Acct: '', Claim: '' }]); expect(o.rows).toHaveLength(0); });
});
