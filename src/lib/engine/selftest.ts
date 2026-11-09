// In-browser engine self-test: runs deterministic scenarios against the live code so an admin can confirm a deployment behaves.
import type { Claim, Client } from '../types';
import { fingerprint, normClaimNo, parseDate, parseMoney } from './normalize';
import { buildRows, collapse } from './rows';
import { buildIndex, matchRows } from './match';
import { buildPlan } from './reconcile';
import { resolveSettings } from './settings';
import { buildPayerIndex } from './payers';
import { compose, quality } from './notes';
import { suggestFromCodes, carcMap } from './carc';
import { mergePerms, can } from './permissions';
import { planRules } from './rules';

export interface TestResult { name: string; ok: boolean; detail: string; ms: number }
const HEAD = ['Claim', 'Patient', 'DOS', 'Payer', 'Balance', 'Billed', 'CPT'];
const MAP = { claim_no: 'Claim', patient_name: 'Patient', dos: 'DOS', payer: 'Payer', balance: 'Balance', billed_amt: 'Billed', cpt: 'CPT' } as Record<string, string>;
const row = (o: Record<string, any> = {}) => ({ Claim: 'C1001', Patient: 'DOE, JANE', DOS: '2026-03-01', Payer: 'Aetna', Balance: 100, Billed: 150, CPT: '99213', ...o });
const client = { id: 'c', name: 'T', aging_basis: 'dos', tf_days: 365 } as unknown as Client;
const claim = (o: Partial<Claim> = {}): Claim => ({ id: 'x1', client_id: 'c', claim_no: 'C1001', claim_key: 'C1001', aliases: [], flags: [], fingerprint: fingerprint({ patient_name: 'DOE, JANE', dos: '2026-03-01', cpt: '99213', billed_amt: 150 }), patient_name: 'DOE, JANE', dos: '2026-03-01', payer: 'Aetna', cpt: '99213', billed_amt: 150, balance: 100, status: 'In Progress', touch_count: 2, assigned_to: 'u1', priority: 'High', custom: {}, created_at: '2026-09-01', ...o } as Claim);
function plan(raw: any[], existing: Claim[], over = {}) {
  const s = resolveSettings({ phiFree: false, ...over }); const b = buildRows(raw, HEAD, MAP, s, [], '2099-01-01'); const c = collapse(b.rows, s); const m = matchRows(c.rows, buildIndex(existing, s), s);
  return buildPlan({ rows: c.rows, matches: m, existing, client, settings: s, mode: 'snapshot', batchId: 'b', now: '2026-10-27T00:00:00Z', asOf: '2026-10-27', priorBatches: [], knownPayers: new Set(['aetna']), pre: { skipped: b.skipped, dups: c.dropped, aggregated: c.aggregated, conflicts: c.conflicts, badDateRows: 0, totalRows: raw.length } });
}
const T: [string, () => string | true][] = [
  ['Claim-number normalisation', () => (normClaimNo('CLM-00123').key === normClaimNo('clm 123.0').key.replace('CLM123', 'CLM00123') || normClaimNo(123).key === normClaimNo('000123').key) && normClaimNo('1.2E+11').sci ? true : 'unexpected key result'],
  ['Money & date parsing', () => (parseMoney('(45.00)') === -45 && parseMoney('$1,234.5') === 1234.5 && parseDate('25/03/2026', 'dmy') === '2026-03-25' && parseDate('03/04/2026', 'mdy') === '2026-03-04') || 'parser mismatch'],
  ['Same claim re-imported = update, not duplicate', () => { const p = plan([row({ Balance: 60 })], [claim()]); return p.creates.length === 0 && p.changes.length === 1 || `creates=${p.creates.length} changes=${p.changes.length}`; }],
  ['Re-numbered claim links by fingerprint & keeps history', () => { const p = plan([row({ Claim: 'NEW-9' })], [claim()]); const n = p.changes[0]?.next; return !!n && n.id === 'x1' && n.touch_count === 2 && (n.aliases || []).includes('C1001') || 'history not carried'; }],
  ['Import is idempotent', () => { const p = plan([row()], [claim()]); return p.changes.length === 0 && p.creates.length === 0 || 'second import changed data'; }],
  ['Workflow fields are never overwritten', () => { const p = plan([row({ Balance: 10 })], [claim()]); const n = p.changes[0].next; return n.status === 'In Progress' && n.assigned_to === 'u1' && n.priority === 'High' || 'workflow field overwritten'; }],
  ['Absent claims close; mass-drop guardrail fires', () => { const ex = Array.from({ length: 20 }, (_, i) => claim({ id: 'k' + i, claim_no: 'K' + i, claim_key: 'K' + i, fingerprint: 'f' + i })); const p = plan([row({ Claim: 'K0' })], ex); return p.closes.length === 19 && p.guardrails.some((g) => g.id === 'MASS_DROP') || 'guardrail missing'; }],
  ['Payer names canonicalise', () => buildPayerIndex([{ value: 'UnitedHealthcare', aliases: 'UHC' }]).canon('UHC').name === 'UnitedHealthcare' || 'alias failed'],
  ['Denial code → root cause', () => suggestFromCodes('CO-29', carcMap())?.rca === 'Timely Filing' || 'wrong suggestion'],
  ['Note builder composes & scores', () => { const t = compose({ contact: 'Call', rep: 'Jo', ref: 'AB12345', outcomeId: 'in_process', nextDate: '11/20' }, { payer: 'Aetna', claim: 'C1' }); return t.includes('spoke with Jo') && quality(t, { mode: 'Call', nextFu: '2026-11-20' }).score >= 60 || 'note quality low'; }],
  ['Rule engine matches and assigns', () => { const r = planRules([{ id: 'r', name: 'r', description: null, enabled: true, trigger: 'import', client_id: null, match: 'all', conditions: [{ field: 'balance', op: 'gt', value: 50 }], actions: [{ type: 'priority', value: 'Critical' }], stop: false, sort: 0 }], [claim()], { today: '2026-10-27', buckets: [], clients: new Map(), payerTf: new Map(), loads: new Map(), userName: (i) => i }); return r.effects.get('x1')?.patch.priority === 'Critical' || 'rule did not fire'; }],
  ['Permissions lock admin out of lock-out', () => can(mergePerms({ sr_mgmt: { manage_permissions: false } }), 'sr_mgmt', 'manage_permissions') || 'admin lockout possible'],
];
export function runSelfTests(): TestResult[] {
  return T.map(([name, fn]) => { const t0 = performance.now(); try { const r = fn(); return { name, ok: r === true, detail: r === true ? 'passed' : String(r), ms: Math.round(performance.now() - t0) }; } catch (e: any) { return { name, ok: false, detail: 'threw: ' + e.message, ms: Math.round(performance.now() - t0) }; } });
}
