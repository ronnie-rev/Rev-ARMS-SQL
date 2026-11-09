import { describe, expect, it } from 'vitest';
import { detectDateOrder, fingerprint, isTotalRow, normClaimNo, normName, parseDate, parseMoney } from '../src/lib/engine/normalize';
import { buildRows, collapse } from '../src/lib/engine/rows';
import { convertReport } from '../src/lib/engine/convert';
import { buildIndex, matchRows } from '../src/lib/engine/match';
import { buildPlan, type PlanInput } from '../src/lib/engine/reconcile';
import { buildRecoveries } from '../src/lib/engine/attribution';
import { planRules, RULE_TEMPLATES, type Env } from '../src/lib/engine/rules';
import { DEFAULT_IMPORT, resolveSettings, type ImportSettings } from '../src/lib/engine/settings';
import type { AutoRule, Claim, Client, WorkLog } from '../src/lib/types';

const S = (o: Partial<ImportSettings> = {}): ImportSettings => resolveSettings({ missingPolicy: 'auto_close', phiFree: false, ...o });   // engine tests exercise the legacy auto-close path; the review path is in missing.test.ts
const client = { id: 'c1', name: 'Test Clinic', aging_basis: 'dos', tf_days: 365 } as unknown as Client;
const MAP: Record<string, string> = { claim_no: 'Claim', patient_name: 'Patient', dos: 'DOS', payer: 'Payer', balance: 'Balance', billed_amt: 'Billed', cpt: 'CPT', last_billed: 'Billed On', account_id: 'Acct', pms_status: 'Status', line_no: '' };
const HEAD = ['Claim', 'Patient', 'DOS', 'Payer', 'Balance', 'Billed', 'CPT', 'Billed On', 'Acct', 'Status'];
const row = (o: Record<string, any>) => ({ Claim: 'C1001', Patient: 'DOE, JANE', DOS: '2026-03-01', Payer: 'Aetna', Balance: 100, Billed: 150, CPT: '99213', 'Billed On': '2026-03-05', Acct: 'A1', Status: 'Billed', ...o });
const mk = (o: Partial<Claim> = {}): Claim => ({
  id: crypto.randomUUID(), client_id: 'c1', claim_no: 'C1001', claim_key: 'C1001', aliases: [], fingerprint: fingerprint({ patient_name: 'DOE, JANE', dos: '2026-03-01', cpt: '99213', billed_amt: 150 }), flags: [], missing_count: 0,
  account_id: 'A1', patient_name: 'DOE, JANE', dos: '2026-03-01', last_billed: '2026-03-05', payer: 'Aetna', provider: null, provider_type: null, cpt: '99213', billed_amt: 150, balance: 100, pms_status: 'Billed', denial_codes: null,
  status: 'In Progress', rca: 'Coding', rca_detail: 'Missing/Invalid Modifier', end_action: 'Claim Submitted', end_sub: null, mode: 'Call', assigned_to: 'u1', priority: 'High', next_fu: '2026-12-01', touch_count: 2, last_touched_at: '2026-10-01T00:00:00Z',
  custom: {}, first_batch: 'b0', last_batch: 'b0', closed_at: null, closed_reason: null, created_at: '2026-09-01', updated_at: '2026-09-01', ...o,
} as Claim);

function run(raw: Record<string, any>[], existing: Claim[], s = S(), extra: Partial<PlanInput> = {}, mode: 'snapshot' | 'merge' = 'snapshot', decisions = {}) {
  const built = buildRows(raw, HEAD, MAP, s, [], '2026-10-27');
  const col = collapse(built.rows, s);
  const matches = matchRows(col.rows, buildIndex(existing, s), s, decisions);
  const plan = buildPlan({ rows: col.rows, matches, existing, client, settings: s, mode, batchId: 'b1', now: '2026-10-27T10:00:00Z', asOf: '2026-10-27', priorBatches: [], knownPayers: new Set(['aetna']),
    pre: { skipped: built.skipped, dups: col.dropped, aggregated: col.aggregated, conflicts: col.conflicts, badDateRows: 0, totalRows: raw.length }, ...extra });
  return { plan, built, col, matches };
}

describe('normalisation', () => {
  it('claim numbers compare equal across formats', () => {
    const k = (v: any) => normClaimNo(v).key;
    expect(k('CLM-00123')).toBe('CLM00123'); expect(k('clm 00123')).toBe('CLM00123'); expect(k(123)).toBe('123'); expect(k('000123')).toBe('123'); expect(k('123.0')).toBe('123'); expect(k(' 12/3-4 ')).toBe('1234');
    expect(k('0')).toBe('0'); expect(k(null)).toBe('');
  });
  it('flags Excel scientific notation instead of trusting it', () => { expect(normClaimNo('1.23457E+11').sci).toBe(true); expect(normClaimNo('1.23457E+11').key).not.toBe('123457'); });
  it('strips configured prefixes', () => expect(normClaimNo('CPS-100234', { stripPrefix: ['CPS-'] }).key).toBe('100234'));
  it('names are order/punctuation independent', () => { expect(normName('DOE, JANE A.')).toBe(normName('Jane A Doe')); expect(normName('O\'Brien, Pat')).toBe(normName('Pat OBrien')); });
  it('parses money variants', () => {
    expect(parseMoney('$1,234.50')).toBe(1234.5); expect(parseMoney('(45.00)')).toBe(-45); expect(parseMoney('12.50-')).toBe(-12.5); expect(parseMoney('100 CR')).toBe(-100); expect(parseMoney('1.234,56')).toBe(1234.56);
    expect(parseMoney('N/A')).toBeNull(); expect(parseMoney('')).toBeNull(); expect(parseMoney('#N/A')).toBeNull(); expect(parseMoney(0)).toBe(0); expect(parseMoney('−7.25')).toBe(-7.25);
  });
  it('parses dates with order awareness', () => {
    expect(parseDate('2026-03-04')).toBe('2026-03-04'); expect(parseDate('03/04/2026', 'mdy')).toBe('2026-03-04'); expect(parseDate('03/04/2026', 'dmy')).toBe('2026-04-03');
    expect(parseDate('25/03/2026', 'mdy')).toBe('2026-03-25'); expect(parseDate('20260314')).toBe('2026-03-14'); expect(parseDate('14-Mar-26')).toBe('2026-03-14'); expect(parseDate('Mar 14, 2026')).toBe('2026-03-14');
    expect(parseDate('02/30/2026')).toBeNull(); expect(parseDate(46000)).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(parseDate('garbage')).toBeNull();
  });
  it('detects dd/mm columns', () => { expect(detectDateOrder(['25/03/2026', '01/02/2026']).order).toBe('dmy'); expect(detectDateOrder(['03/25/2026']).order).toBe('mdy'); expect(detectDateOrder(['01/02/2026']).certain).toBe(false); });
  it('recognises totals', () => { expect(isTotalRow(['Grand Total', null, 5000])).toBe(true); expect(isTotalRow(['Smith', 'Aetna'])).toBe(false); });
  it('fingerprint ignores name formatting and claim number', () => {
    expect(fingerprint({ patient_name: 'DOE, JANE', dos: '2026-03-01', cpt: '99213', billed_amt: 150 })).toBe(fingerprint({ patient_name: 'Jane Doe', dos: '2026-03-01', cpt: '99213', billed_amt: 150 }));
  });
});

describe('row building & collapsing', () => {
  it('skips totals, repeated headers, bad rows; keeps good ones', () => {
    const { rows, skipped } = buildRows([row({}), row({ Claim: 'Grand Total', Balance: 9999 }), Object.fromEntries(HEAD.map((h) => [h, h])), row({ Claim: 'C2', Balance: 'abc' }), row({ Claim: 'C3', DOS: '2099-01-01' })], HEAD, MAP, S(), [], '2026-10-27');
    expect(rows.length).toBe(1); expect(skipped.map((r) => r.skip!.code).sort()).toEqual(['DOS_FUTURE', 'HEADER_REPEAT', 'NO_BALANCE', 'TOTAL_ROW']);
  });
  it('generates a stable ID when claim number is missing', () => {
    const a = buildRows([row({ Claim: '' })], HEAD, MAP, S(), [], '2026-10-27').rows[0]; const b = buildRows([row({ Claim: null, Balance: 55 })], HEAD, MAP, S(), [], '2026-10-27').rows[0];
    expect(a.generated).toBe(true); expect(a.key).toBe(b.key);                                   // same charge → same ID even if balance moved
    expect(buildRows([row({ Claim: '' })], HEAD, MAP, S({ missingKey: 'skip' }), [], '2026-10-27').skipped[0].skip!.code).toBe('NO_IDENTITY');
  });
  it('treats Excel scientific-notation ids as missing', () => { const r = buildRows([row({ Claim: '1.23457E+11' })], HEAD, MAP, S(), [], '2026-10-27').rows[0]; expect(r.generated).toBe(true); expect(r.issues.some((i) => i.code === 'SCI_NOTATION')).toBe(true); });
  it('drops exact duplicates, aggregates differing charge lines', () => {
    const built = buildRows([row({}), row({}), row({ CPT: '11042', Balance: 40, Billed: 60 })], HEAD, MAP, S(), [], '2026-10-27'); const c = collapse(built.rows, S());
    expect(c.rows.length).toBe(1); expect(c.dropped.length).toBe(1); expect(c.rows[0].balance).toBe(140); expect(c.rows[0].billed_amt).toBe(210); expect(c.rows[0].cpt).toContain('11042');
  });
  it('line granularity keeps lines distinct', () => {
    const s = S({ granularity: 'line' }); const c = collapse(buildRows([row({}), row({ CPT: '11042', Balance: 40 })], HEAD, MAP, s, [], '2026-10-27').rows, s);
    expect(c.rows.length).toBe(2); expect(new Set(c.rows.map((r) => r.key)).size).toBe(2);
  });
  it('duplicates policy skip flags conflicts', () => { const s = S({ duplicates: 'skip' }); const c = collapse(buildRows([row({}), row({ Balance: 55 })], HEAD, MAP, s, [], '2026-10-27').rows, s); expect(c.rows.length).toBe(0); expect(c.conflicts.length).toBe(2); });
  it('reads dd/mm dates once the column proves it', () => {
    const r = buildRows([row({ DOS: '25/03/2026' }), row({ Claim: 'C2', DOS: '03/04/2026' })], HEAD, MAP, S(), [], '2026-10-27'); expect(r.dateOrder).toBe('dmy'); expect(r.rows[1].dos).toBe('2026-04-03');
  });
});

describe('identity matching', () => {
  it('matches the same claim across number formatting changes (no duplicate)', () => {
    const { plan } = run([row({ Claim: 'c-1001', Balance: 80 })], [mk()]); expect(plan.creates.length).toBe(0); expect(plan.changes.length).toBe(1); expect(plan.changes[0].changes.balance).toEqual([100, 80]);
  });
  it('re-numbered claim is linked by fingerprint and keeps history', () => {
    const c = mk(); const { plan } = run([row({ Claim: 'NEW-9' })], [c]);
    expect(plan.creates.length).toBe(0); expect(plan.changes[0].kind).toBe('REKEYED'); const n = plan.changes[0].next;
    expect(n.id).toBe(c.id); expect(n.claim_no).toBe('NEW-9'); expect(n.aliases).toContain('C1001'); expect(n.touch_count).toBe(2); expect(n.flags).toContain('rekeyed');
    // the next file may still use the old number → alias match
    const again = run([row({ Claim: 'C1001' })], [n]); expect(again.plan.creates.length).toBe(0); expect(again.matches[0].kind).toBe('alias');
  });
  it('strict identity never auto-links; ask mode defers', () => {
    expect(run([row({ Claim: 'NEW-9' })], [mk()], S({ identity: 'strict' })).plan.creates.length).toBe(1);
    const c = mk(); const a = run([row({ Claim: 'NEW-9' })], [c], S({ identity: 'ask' })); expect(a.plan.asks.length).toBe(1); expect(a.plan.creates.length).toBe(1);
    const linked = run([row({ Claim: 'NEW-9' })], [c], S({ identity: 'ask' }), {}, 'snapshot', { 2: { action: 'link', claimId: c.id } });
    expect(linked.plan.creates.length).toBe(0);
  });
  it('fingerprint never steals a claim that another row owns by key', () => {
    const c = mk(); const { plan } = run([row({}), row({ Claim: 'OTHER', Balance: 100 })], [c]);       // second row has same fingerprint but C1001 is taken
    expect(plan.creates.length).toBe(1); expect(plan.creates[0].flags).toContain('possible_duplicate');
  });
  it('identical charges twice with unknown numbers are not auto-merged', () => {
    const { plan } = run([row({ Claim: 'X1' }), row({ Claim: 'X2' })], [mk({ claim_no: 'ZZZ', claim_key: 'ZZZ' })]); expect(plan.creates.length).toBe(2); expect(plan.asks.length).toBe(2);
  });
  it('a row without a claim number links to the existing claim and never overwrites its real number', () => {
    const c = mk(); const { plan } = run([row({ Claim: '', Balance: 70 })], [c]);
    expect(plan.creates.length).toBe(0); const n = plan.changes[0].next; expect(n.id).toBe(c.id); expect(n.claim_no).toBe('C1001'); expect(n.aliases).toEqual([]); expect(n.balance).toBe(70); expect(n.flags).not.toContain('rekeyed');
  });
  it('generated IDs are stable week over week (no duplicate lines)', () => {
    const w1 = run([row({ Claim: '' })], []); const created = w1.plan.creates[0];
    const w2 = run([row({ Claim: '', Balance: 60 })], [created]); expect(w2.plan.creates.length).toBe(0); expect(w2.plan.changes.length).toBe(1);
  });
});

describe('overwrite rules', () => {
  it('updates file-owned fields, never workflow fields', () => {
    const c = mk(); const { plan } = run([row({ Balance: 40, Payer: 'Aetna Better Health', Status: 'Denied' })], [c]); const n = plan.changes[0].next;
    expect(n.balance).toBe(40); expect(n.payer).toBe('Aetna Better Health'); expect(n.pms_status).toBe('Denied'); expect(n.flags).toContain('payer_changed');
    for (const f of ['status', 'rca', 'rca_detail', 'end_action', 'assigned_to', 'priority', 'next_fu', 'touch_count'] as const) expect(n[f]).toBe(c[f]);
  });
  it('keeps stored DOS and flags a conflict; fills blanks; ignores empty file values', () => {
    const c = mk({ account_id: null }); const { plan } = run([row({ DOS: '2026-03-09', Acct: 'A9', Status: '' })], [c]); const n = plan.changes[0]?.next || plan.unchanged[0].next;
    expect(n.dos).toBe('2026-03-01'); expect(n.flags).toContain('dos_conflict'); expect(n.account_id).toBe('A9'); expect(n.pms_status).toBe('Billed');
  });
  it('flags balance increases and credits', () => {
    expect(run([row({ Balance: 130 })], [mk()]).plan.changes[0].next.flags).toContain('balance_up');
    expect(run([row({ Balance: -20 })], [mk()]).plan.changes[0].next.flags).toContain('credit_balance');
  });
  it('is idempotent: re-importing the same data changes nothing', () => {
    const c = mk(); const { plan } = run([row({})], [c]); expect(plan.changes.length).toBe(0); expect(plan.creates.length).toBe(0); expect(plan.unchanged.length).toBe(1);
  });
});

describe('closing, reopening, missing', () => {
  it('closes absent claims in snapshot mode but not in merge mode', () => {
    const ex = [mk(), mk({ claim_no: 'C2', claim_key: 'C2', fingerprint: 'zz' })];
    expect(run([row({})], ex).plan.closes.length).toBe(1); expect(run([row({})], ex, S(), {}, 'merge').plan.closes.length).toBe(0);
  });
  it('requires N consecutive misses when configured', () => {
    const ex = [mk(), mk({ claim_no: 'C2', claim_key: 'C2', fingerprint: 'zz' })]; const s = S({ closeAfterMisses: 2 });
    const w1 = run([row({})], ex, s); expect(w1.plan.closes.length).toBe(0); expect(w1.plan.misses[0].next.flags).toContain('missing_once');
    const w2 = run([row({})], [ex[0], w1.plan.misses[0].next], s); expect(w2.plan.closes.length).toBe(1);
  });
  it('reopens a closed claim that reappears and preserves its history', () => {
    const c = mk({ closed_at: '2026-10-01', closed_reason: 'x', status: 'Adjusted' }); const { plan } = run([row({})], [c]); const ch = plan.changes[0];
    expect(ch.kind).toBe('REOPENED'); expect(ch.next.closed_at).toBeNull(); expect(ch.next.flags).toContain('reopened'); expect(ch.next.touch_count).toBe(2); expect(ch.next.status).toBe('In Progress');
  });
  it('zero balance closes existing and skips new', () => {
    expect(run([row({ Balance: 0 })], [mk()]).plan.closes.length).toBe(1); expect(run([row({ Balance: 0 })], []).plan.creates.length).toBe(0);
  });
  it('a missing-streak resets when the claim returns', () => { const c = mk({ missing_count: 1, flags: ['missing_once'] }); const n = run([row({})], [c]).plan; expect((n.changes[0]?.next || n.unchanged[0].next).missing_count).toBe(0); });
});

describe('guardrails', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => mk({ claim_no: `K${i}`, claim_key: `K${i}`, fingerprint: 'f' + i }));
  it('blocks mass drops', () => { const g = run([row({ Claim: 'K0' })], many(20)).plan.guardrails; expect(g.find((x) => x.id === 'MASS_DROP')?.level).toBe('block'); });
  it('blocks stale and identical files', () => {
    const prior = [{ id: 'p', as_of: '2026-10-30', created_at: '2026-10-30', file_hash: 'H', status: 'committed' }] as any;
    const g = run([row({})], [mk()], S(), { priorBatches: prior, fileHash: 'H' }).plan.guardrails.map((x) => x.id); expect(g).toContain('STALE_FILE'); expect(g).toContain('SAME_FILE');
  });
  it('requires an as-of date when configured', () => expect(run([row({})], [mk()], S(), { asOf: null }).plan.guardrails.find((x) => x.id === 'NO_AS_OF')?.level).toBe('block'));
  it('blocks when too many rows are invalid', () => { const g = run([row({}), row({ Claim: 'B', Balance: 'x' }), row({ Claim: 'C', Balance: 'y' })], [], S()).plan.guardrails; expect(g.some((x) => x.id === 'INVALID_ROWS')).toBe(true); });
  it('hard-blocks an empty import', () => expect(run([], [], S()).plan.guardrails[0].hard).toBe(true));
  it('lists unknown payers without blocking', () => expect(run([row({ Payer: 'Brand New Health' })], []).plan.unknownPayers[0].name).toBe('Brand New Health'));
});

describe('recovery attribution', () => {
  const wl = (o: Partial<WorkLog>): WorkLog => ({ id: crypto.randomUUID(), claim_id: 'x', client_id: 'c1', user_id: 'u1', user_name: 'Una', created_at: '2026-10-10T10:00:00Z', end_action: 'Claim Submitted', rca: 'Coding', ...o } as WorkLog);
  it('credits the last toucher inside the window, otherwise unattributed', () => {
    const c = mk(); const { plan } = run([row({ Balance: 40 })], [c]); const ctx = { batchId: 'b1', now: '2026-10-27T10:00:00Z', asOf: '2026-10-27', clientId: 'c1', uid: () => 'r' };
    const r = buildRecoveries(plan, [wl({ claim_id: c.id, user_id: 'u9', user_name: 'Old', created_at: '2026-10-12T00:00:00Z' }), wl({ claim_id: c.id, user_id: 'u2', user_name: 'Una2', created_at: '2026-10-20T00:00:00Z' })], S(), ctx);
    expect(r[0].user_id).toBe('u2'); expect(r[0].amount).toBe(60); expect(r[0].basis).toBe('last_touch');
    expect(buildRecoveries(plan, [wl({ claim_id: c.id, created_at: '2026-06-01T00:00:00Z' })], S(), ctx)[0].basis).toBe('unattributed');
  });
  it('splits equally and classifies adjustments', () => {
    const c = mk(); const { plan } = run([], [c]); const ctx = { batchId: 'b1', now: '2026-10-27T10:00:00Z', asOf: '2026-10-27', clientId: 'c1', uid: () => crypto.randomUUID() };
    const r = buildRecoveries(plan, [wl({ claim_id: c.id, user_id: 'a' }), wl({ claim_id: c.id, user_id: 'b', created_at: '2026-10-15T00:00:00Z', end_action: 'Adjustments - Contractual' })], S({ attributionMode: 'split_equal' }), ctx);
    expect(r.length).toBe(2); expect(r.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(100, 2); expect(r[0].type).toBe('adjustment');
    const a = buildRecoveries(plan, [wl({ claim_id: c.id, end_action: 'Adjustments - Contractual', created_at: '2026-10-20T00:00:00Z' })], S(), ctx); expect(a[0].type).toBe('adjustment');
  });
});

describe('automation rules', () => {
  const env = (over: Partial<Env> = {}): Env => ({ today: '2026-10-27', buckets: [{ label: '0-30', min: 0, max: 30, color: '' }, { label: '31+', min: 31, max: null, color: '' }], clients: new Map([['c1', client]]), payerTf: new Map(), batchId: 'b1', loads: new Map(), userName: (i) => i, ...over });
  const rule = (o: Partial<AutoRule>): AutoRule => ({ id: 'r1', name: 'R', description: null, enabled: true, trigger: 'import', client_id: null, match: 'all', conditions: [], actions: [], stop: false, sort: 0, ...o });
  it('never fires without conditions', () => expect(planRules([rule({ actions: [{ type: 'priority', value: 'Critical' }] })], [mk()], env()).effects.size).toBe(0));
  it('evaluates numeric, text and bool conditions', () => {
    const c = mk({ balance: 6000, assigned_to: null }); const p = planRules([rule({ conditions: [{ field: 'balance', op: 'gt', value: 5000 }, { field: 'owner', op: 'is_empty' }, { field: 'payer', op: 'in', value: 'aetna, cigna' }], actions: [{ type: 'priority', value: 'Critical' }] })], [c], env());
    expect(p.effects.get(c.id)!.patch.priority).toBe('Critical'); expect(p.runs[0].matched).toBe(1);
  });
  it('balances assignment across a pool and respects existing load', () => {
    const cs = Array.from({ length: 6 }, (_, i) => mk({ claim_no: 'a' + i, assigned_to: null, balance: 100 + i }));
    const p = planRules([rule({ conditions: [{ field: 'owner', op: 'is_empty' }], actions: [{ type: 'assign', pool: ['u1', 'u2'], strategy: 'balanced' }] })], cs, env({ loads: new Map([['u1', 4], ['u2', 0]]) }));
    const to = [...p.effects.values()].map((e) => e.patch.assigned_to); expect(to.filter((x) => x === 'u2').length).toBeGreaterThan(to.filter((x) => x === 'u1').length);
  });
  it('does not reassign owned claims unless asked; stop ends processing', () => {
    const owned = mk({ assigned_to: 'u1' }); const base = { conditions: [{ field: 'balance', op: 'gt', value: 0 }], actions: [{ type: 'assign' as const, pool: ['u2'] }] };
    expect(planRules([rule(base)], [owned], env()).effects.get(owned.id)?.patch.assigned_to).toBeUndefined();
    const p = planRules([rule({ ...base, stop: true, actions: [{ type: 'priority', value: 'Low' }], sort: 1 }), rule({ id: 'r2', sort: 2, conditions: base.conditions, actions: [{ type: 'priority', value: 'Critical' }] })], [owned], env());
    expect(p.effects.get(owned.id)!.patch.priority).toBe('Low');
  });
  it('built-in templates are valid and fire on matching data', () => {
    const tmpl = RULE_TEMPLATES.map((t, i) => ({ ...t, id: 't' + i, sort: i })) as AutoRule[]; const credit = mk({ balance: -5 }); const small = mk({ balance: 10, claim_no: 's' });
    const p = planRules(tmpl, [credit, small], env()); expect(p.effects.get(credit.id)!.flagsAdd.has('refund_review')).toBe(true); expect(p.effects.get(small.id)!.flagsAdd.has('small_balance')).toBe(true);
  });
  it('is idempotent: a second pass over already-processed claims changes nothing', () => {
    const t = { ...RULE_TEMPLATES[1], id: 't', sort: 0 } as AutoRule; const c = mk({ balance: 10, flags: ['small_balance'], priority: 'Low' }); expect(planRules([t], [c], env()).runs[0].changed).toBe(0);
  });
});

describe('defaults', () => { it('merges client overrides field-by-field', () => { const s = resolveSettings({ closeAfterMisses: 2 }, { overwrite: { provider: 'never' } as any }); expect(s.closeAfterMisses).toBe(2); expect(s.overwrite.provider).toBe('never'); expect(s.overwrite.balance).toBe('file'); expect(DEFAULT_IMPORT.closeAfterMisses).toBe(1); }); });

describe('PHI-free import', () => {
  it('discards patient name and still gives a stable unique id', () => {
    const a = buildRows([row({ Claim: '', Patient: 'Jane Roe' })], HEAD, MAP, S({ phiFree: true }), [], '2026-10-27').rows[0]; const b = buildRows([row({ Claim: '', Patient: '' })], HEAD, MAP, S({ phiFree: true }), [], '2026-10-27').rows[0];
    expect(a.patient_name).toBeNull(); expect(a.claim_no).toBeTruthy(); expect(a.claim_no).toBe(b.claim_no);
  });
});

describe('line-level → claim-level conversion', () => {
  const run = (rs: any[], o: any = {}) => { const s = S({ phiFree: true, ...o }); const b = buildRows(rs, HEAD, MAP, s, [], '2026-10-27'); const c = collapse(b.rows, s); return { b, c, rep: convertReport(rs.length, b.rows, c) }; };
  it('rolls CPT lines into one claim, keeps totals, drops exact duplicate lines', () => {
    const { c, rep } = run([row({ CPT: '99213', Balance: 50 }), row({ CPT: '11042', Balance: 70 }), row({ CPT: '11042', Balance: 70 }), row({ Claim: 'C2', Balance: 10 })]);
    expect(c.rows.length).toBe(2); expect(c.rows.find((r) => r.claim_no === 'C1001')!.balance).toBe(120); expect(rep.exactDupes).toBe(1); expect(rep.totals.diff).toBe(0);
  });
  it('splits one claim number used by two payers instead of summing', () => {
    const { c, rep } = run([row({ Payer: 'Aetna' }), row({ Payer: 'Cigna' })]); expect(c.rows.length).toBe(2); expect(rep.splitKeys).toBe(2); expect(rep.verdict).toBe('review');
  });
  it('uses the encounter number when the claim number is blank', () => {
    const MAP2 = { ...MAP, encounter_no: 'Enc' }; const s = S({ phiFree: true }); const r = buildRows([{ ...row({ Claim: '' }), Enc: 'E-778' }, { ...row({ Claim: '', CPT: '11042' }), Enc: 'E-778' }], [...HEAD, 'Enc'], MAP2, s, [], '2026-10-27');
    expect(r.rows[0].claim_no).toBe('ENC-E778'); expect(collapse(r.rows, s).rows.length).toBe(1);
  });
});
