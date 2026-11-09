import { describe, expect, it } from 'vitest';
import { CARC_DEFAULTS, carcMap, normCode, splitCodes, suggestFromCodes } from '../src/lib/engine/carc';
import { CHECKS, runChecks, syncFlags, type CheckCtx } from '../src/lib/engine/checks';
import { minePatterns } from '../src/lib/engine/patterns';
import { compose, DEFAULT_OUTCOMES, quality, render, tidy } from '../src/lib/engine/notes';
import { qaRisk } from '../src/lib/engine/qa';
import { resolveLinks, STARTER_RESOURCES } from '../src/lib/engine/links';
import { can, CAPS, DEFAULT_PERMS, mergePerms } from '../src/lib/engine/permissions';
import { diagnoseSetup } from '../src/lib/engine/health';
import { planRules, RULE_TEMPLATES, type Env } from '../src/lib/engine/rules';
import type { AutoRule, Claim, WorkLog } from '../src/lib/types';

const CM = carcMap();
const mk = (o: Partial<Claim> = {}): Claim => ({ id: crypto.randomUUID(), client_id: 'c1', claim_no: 'K1', claim_key: 'K1', aliases: [], fingerprint: 'f', flags: [], missing_count: 0, account_id: 'A', patient_name: 'DOE, J', dos: '2026-03-01', last_billed: '2026-03-05', payer: 'Aetna', provider: 'Dr H', provider_type: null, cpt: '99213', billed_amt: 150, balance: 100, pms_status: 'Billed', denial_codes: null, status: 'In Progress', rca: null, rca_detail: null, end_action: null, end_sub: null, mode: null, assigned_to: 'u1', priority: 'Normal', next_fu: '2026-12-01', touch_count: 0, last_touched_at: null, custom: {}, first_batch: 'b', last_batch: 'b', closed_at: null, closed_reason: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01', ...o } as Claim);
const wl = (o: Partial<WorkLog> = {}): WorkLog => ({ id: crypto.randomUUID(), claim_id: 'x', client_id: 'c1', user_id: 'u1', user_name: 'U', work_date: '2026-10-20', created_at: '2026-10-20T10:00:00Z', end_action: 'Claim Submitted', rca: 'Coding', rca_detail: 'Missing/Invalid Modifier', mode: 'Call', comment: 'Called Aetna, spoke with Jo, ref# AB12345. Claim in process, follow up 11/20.', ...o } as WorkLog);

function ctx(c: Claim, over: Partial<CheckCtx> = {}, touches: WorkLog[] = [], dup = 1) {
  return { today: '2026-10-27', c, age: 240, tfLeft: 100, terminal: new Set(['Adjusted', 'Billed to Patient']), endActions: new Map([['Claim Submitted', { status: 'Claim Submitted' }]]), users: new Map([['u1', { active: true, name: 'Una' }]]), carc: CM, touchesOf: () => touches, dupCountOf: () => dup, ...over };
}
const hit = (c: Claim, id: string, over: Partial<CheckCtx> = {}, touches: WorkLog[] = [], dup = 1) => runChecks([ctx(c, over, touches, dup)], {}, [id]).map((v) => v.check_id).includes(id);

describe('denial code dictionary', () => {
  it('normalises codes', () => { expect(normCode('co29')).toBe('CO-29'); expect(normCode('PR 1')).toBe('PR-1'); expect(normCode('45')).toBe('CO-45'); expect(splitCodes('CO-16, pr1;CO 97')).toEqual(['CO-16', 'PR-1', 'CO-97']); });
  it('suggests root cause by weighted vote', () => {
    expect(suggestFromCodes('CO-29', CM)!.rca).toBe('Timely Filing'); expect(suggestFromCodes('CO-45, CO-16', CM)!.rca).toBe('Additional Information Requested'); expect(suggestFromCodes('XX-999', CM)).toBeNull();
  });
  it('has unique codes', () => expect(new Set(CARC_DEFAULTS.map((c) => c.code)).size).toBe(CARC_DEFAULTS.length));
  it('allows overrides', () => { const m = carcMap([{ code: 'co-16', meaning: 'x', rca: 'Coding', action: 'y', family: 'F' }]); expect(m.get('CO-16')!.rca).toBe('Coding'); });
});

describe('quality checks', () => {
  it('accounting checks', () => {
    expect(hit(mk({ balance: 300, billed_amt: 100 }), 'bal_gt_billed')).toBe(true); expect(hit(mk({ balance: -5 }), 'credit_balance')).toBe(true); expect(hit(mk({ balance: 10 }), 'tiny_balance')).toBe(true);
    expect(hit(mk({ balance: 0 }), 'zero_open')).toBe(true); expect(hit(mk({ touch_count: 0 }), 'old_unworked')).toBe(true); expect(hit(mk({ touch_count: 2 }), 'old_unworked')).toBe(false);
    expect(hit(mk({ last_billed: '2026-02-01' }), 'dos_after_billed')).toBe(true); expect(hit(mk(), 'tf_passed_open', { tfLeft: -5 })).toBe(true); expect(hit(mk({ end_action: 'Claim Appealed' }), 'tf_passed_open', { tfLeft: -5 })).toBe(false);
    expect(hit(mk({ assigned_to: null }), 'tf_imminent_unowned', { tfLeft: 12 })).toBe(true);
  });
  it('workflow checks', () => {
    expect(hit(mk({ touch_count: 1, next_fu: null }), 'fu_missing')).toBe(true); expect(hit(mk({ status: 'Adjusted', next_fu: '2026-11-01' }), 'fu_on_closed')).toBe(true);
    expect(hit(mk({ status: 'Adjusted', balance: 50, last_touched_at: '2026-09-01T00:00:00Z' }), 'terminal_lingering')).toBe(true);
    expect(hit(mk({ end_action: 'Claim Submitted', status: 'In Progress' }), 'status_action_mismatch')).toBe(true); expect(hit(mk({ status: 'New', touch_count: 2 }), 'new_but_touched')).toBe(true);
    const three = [wl(), wl(), wl()]; expect(hit(mk(), 'loop_same_action', {}, three)).toBe(true); expect(hit(mk(), 'loop_same_action', {}, [wl(), wl({ end_action: 'Claim Appealed' }), wl()])).toBe(false);
    expect(hit(mk({ touch_count: 7 }), 'many_touches')).toBe(true); expect(hit(mk({ assigned_to: 'gone' }), 'owner_inactive')).toBe(true);
    expect(hit(mk({ assigned_to: 'u1' }), 'owner_inactive', { users: new Map([['u1', { active: false, name: 'Una' }]]) })).toBe(true);
    expect(hit(mk({ end_action: 'Claim Appealed', last_touched_at: '2026-08-01T00:00:00Z' }), 'appeal_stale')).toBe(true);
  });
  it('coding checks', () => {
    expect(hit(mk({ denial_codes: 'CO-29', rca: 'Coding' }), 'carc_rca_mismatch')).toBe(true); expect(hit(mk({ denial_codes: 'CO-29', rca: 'Timely Filing' }), 'carc_rca_mismatch')).toBe(false);
    expect(hit(mk({ denial_codes: 'ZZ-999' }), 'carc_unknown')).toBe(true); expect(hit(mk({ pms_status: 'Denied' }), 'denied_no_codes')).toBe(true); expect(hit(mk({ cpt: '9921' }), 'cpt_format')).toBe(true); expect(hit(mk({ cpt: '99213-25, J1234' }), 'cpt_format')).toBe(false);
  });
  it('identity/data checks', () => { expect(hit(mk(), 'dup_charge', {}, [], 2)).toBe(true); expect(hit(mk({ payer: 'Unknown' }), 'payer_unknown')).toBe(true); expect(hit(mk({ dos: null }), 'no_dos')).toBe(true); });
  it('honours settings: disable, severity and thresholds', () => {
    const c = mk({ balance: 40 }); expect(runChecks([ctx(c)], { tiny_balance: { params: { max: 50 } } }, ['tiny_balance']).length).toBe(1); expect(runChecks([ctx(c)], { tiny_balance: { enabled: false } }, ['tiny_balance']).length).toBe(0);
    expect(runChecks([ctx(mk({ balance: -1 }))], { credit_balance: { severity: 'high' } }, ['credit_balance'])[0].severity).toBe('high');
  });
  it('flag sync replaces managed flags only', () => { expect(syncFlags(['manual', 'chk:old'], [{ claim_id: 'x', check_id: 'new', severity: 'low', message: '' }])).toEqual(['manual', 'chk:new']); });
  it('every check has a unique id and a help text', () => { expect(new Set(CHECKS.map((c) => c.id)).size).toBe(CHECKS.length); CHECKS.forEach((c) => expect(c.help.length).toBeGreaterThan(10)); });
  it('a clean claim passes everything', () => { const c = mk({ touch_count: 1, next_fu: '2026-12-01', last_touched_at: '2026-10-20T00:00:00Z' }); expect(runChecks([ctx(c, { age: 30 })]).map((v) => v.check_id)).toEqual([]); });
});

describe('pattern miner', () => {
  const claims = (n: number, o: Partial<Claim>) => Array.from({ length: n }, (_, i) => mk({ claim_no: `${o.payer}${i}${o.rca}`, ...o }));
  it('finds a payer×root-cause concentration', () => {
    const cs = [...claims(20, { payer: 'Aetna', rca: 'Authorization' }), ...claims(5, { payer: 'Aetna', rca: 'Coding' }), ...claims(40, { payer: 'Cigna', rca: 'Coding' }), ...claims(15, { payer: 'Cigna', rca: 'Billing Error' })];
    const p = minePatterns({ claims: cs, workLog: [], batches: [], carc: CM, today: '2026-10-27' }); expect(p.some((x) => x.kind === 'payer-rca' && x.title.includes('Aetna') && x.title.includes('Authorization'))).toBe(true);
  });
  it('finds a systemic payer+CPT+denial-family cluster', () => {
    const cs = [...claims(18, { payer: 'Aetna', cpt: '15830', denial_codes: 'CO-97' }), ...claims(30, { payer: 'Cigna', cpt: '99213' })]; const p = minePatterns({ claims: cs, workLog: [], batches: [], carc: CM, today: '2026-10-27' });
    expect(p.some((x) => x.kind === 'systemic' && x.title.includes('15830'))).toBe(true); expect(p.some((x) => x.kind === 'cpt-denial')).toBe(true);
  });
  it('detects a surging root cause week over week', () => {
    const logs: WorkLog[] = []; for (let w = 2; w < 8; w++) for (let i = 0; i < 2 + (w % 2); i++) logs.push(wl({ work_date: new Date(Date.parse('2026-10-27') - w * 7 * 864e5 - 864e5).toISOString().slice(0, 10), rca: 'Coding' }));
    for (let i = 0; i < 14; i++) logs.push(wl({ work_date: '2026-10-25', rca: 'Coding' }));
    expect(minePatterns({ claims: [], workLog: logs, batches: [], carc: CM, today: '2026-10-27' }).some((x) => x.kind === 'trend')).toBe(true);
  });
  it('stays quiet on uniform data', () => { const cs = [...claims(30, { payer: 'Aetna', rca: 'Coding' }), ...claims(30, { payer: 'Cigna', rca: 'Coding' })]; expect(minePatterns({ claims: cs, workLog: [], batches: [], carc: CM, today: '2026-10-27' }).filter((x) => x.kind === 'payer-rca').length).toBe(0); });
});

describe('note builder', () => {
  const ctx = { payer: 'Aetna', claim: 'CLM-1', balance: 1250.5, today: '2026-10-27' };
  it('composes natural notes and drops empty optional facts', () => {
    const full = compose({ contact: 'Call', rep: 'Jo', ref: 'AB12345', outcomeId: 'in_process', received: '10/02', nextDate: '11/20' }, ctx);
    expect(full).toContain('Called Aetna'); expect(full).toContain('spoke with Jo'); expect(full).toContain('ref# AB12345'); expect(full).toContain('Follow up 11/20');
    const bare = compose({ contact: 'Portal', outcomeId: 'in_process' }, ctx); expect(bare).not.toContain('ref#'); expect(bare).not.toContain('{'); expect(bare).not.toContain('()'); expect(bare).toContain('Checked the portal for Aetna');
  });
  it('render elides segments with missing vars', () => { expect(render('A[[ {x}]] B[[ {y}]]', { x: '1' })).toBe('A 1 B'); });
  it('every built-in outcome renders without leftovers', () => DEFAULT_OUTCOMES.forEach((o) => { const t = compose({ contact: 'Call', outcomeId: o.id }, ctx); expect(t).not.toMatch(/[{}]/); expect(t.length).toBeGreaterThan(15); }));
  it('scores note quality and says what is missing', () => {
    const good = quality('Called Aetna, spoke with Jo, ref# AB12345. Claim denied for missing modifier; corrected claim will be resubmitted. Follow up 11/20, check $120.', { mode: 'Call', nextFu: '2026-11-20' }); expect(good.score).toBeGreaterThanOrEqual(85);
    const bad = quality('called', { mode: 'Call' }); expect(bad.score).toBeLessThan(30); expect(bad.missing.join(' ')).toMatch(/reference/i);
  });
  it('tidies abbreviations and casing', () => { expect(tidy('called ins re: pt auth. f/u in 2 wks  ')).toBe('Called insurance re: patient authorization. Follow-up in 2 wks.'); expect(tidy('')).toBe(''); });
});

describe('auto-QA risk', () => {
  const term = new Set(['Adjustments']); const c = mk({ denial_codes: 'CO-29' });
  it('flags weak notes and contradictions', () => {
    const r = qaRisk(wl({ comment: 'ok', call_ref: null, rca: 'Coding', next_fu: null }), c, CM, term); expect(r.risk).toBeGreaterThan(60); expect(r.reasons.join('|')).toMatch(/short/); expect(r.reasons.join('|')).toMatch(/denial code/);
  });
  it('rates good work low', () => { const r = qaRisk(wl({ rca: 'Timely Filing', call_ref: 'R1', next_fu: '2026-11-20' }), c, CM, term); expect(r.risk).toBeLessThan(25); });
  it('flags adjusting something still processing', () => expect(qaRisk(wl({ end_action: 'Adjustments - Contractual', comment: 'Payer says claim is still in process, ref# AB12345', balance: 900 }), mk(), CM, term).reasons.join('|')).toMatch(/still processing/));
});

describe('payer links', () => {
  it('merges payer links, scoped library items and smart searches', () => {
    const l = resolveLinks('Aetna', { portal: 'https://provider.aetna.example/login', links: [{ label: 'Appeals form', url: 'https://aetna.example/appeal.pdf', kind: 'form' }, { label: 'bad', url: 'javascript:alert(1)' }] },
      [{ id: '1', value: 'NPI Registry', meta: { url: 'https://npiregistry.cms.hhs.gov/' } }, { id: '2', value: 'Cigna only', meta: { url: 'https://cigna.example', payers: 'cigna' } }], { cpt: '15830, 99213', codes: 'CO-97', rcaDetail: 'Charges Bundled/Inclusive' });
    const labels = l.map((x) => x.label); expect(labels).toContain('NPI Registry'); expect(labels).not.toContain('Cigna only'); expect(labels).not.toContain('bad'); expect(labels.some((x) => x.includes('policy for CPT 15830'))).toBe(true);
    expect(l.find((x) => x.label.includes('policy for CPT'))!.url).toContain('site%3Aprovider.aetna.example'); expect(l.every((x) => /^https?:/.test(x.url))).toBe(true);
  });
  it('starter library URLs are https', () => STARTER_RESOURCES.forEach((r) => expect(r.url).toMatch(/^https:\/\//)));
});

describe('permissions', () => {
  it('defaults are sensible and admin is locked in', () => {
    const p = mergePerms({ sr_mgmt: { manage_permissions: false }, sys_admin: { access_admin: false }, user_prod: { import: true } }); expect(can(p, 'sr_mgmt', 'manage_permissions')).toBe(true); expect(can(p, 'sys_admin', 'access_admin')).toBe(true); expect(can(p, 'user_prod', 'import')).toBe(true);
    expect(can(p, 'user_prod', 'assign')).toBe(false); expect(can(p, 'client', 'work_claims')).toBe(false); expect(can(p, 'tl_prod_qa', 'import')).toBe(true); expect(can(p, undefined, 'import')).toBe(false);
  });
  it('every role defines every capability', () => Object.values(DEFAULT_PERMS).forEach((r) => CAPS.forEach((c) => expect(typeof r[c.id]).toBe('boolean'))));
});

describe('setup doctor', () => {
  const opt = (category: any, value: string, o: any = {}) => ({ id: value, category, value, parent: null, label: null, color: null, sort: 0, active: true, meta: {}, ...o });
  it('flags bucket gaps and missing statuses', () => {
    const cfg = [opt('bucket', 'a', { meta: { min: 0, max: 30 } }), opt('bucket', 'b', { meta: { min: 40, max: 60 } }), opt('end_action', 'X', { meta: { status: 'Nope' } }), opt('status', 'New')] as any;
    const r = diagnoseSetup({ config: cfg, clients: [], profiles: [], templates: [], rules: [], schedules: [], claims: [] }); const ids = r.findings.map((f) => f.id);
    expect(ids).toContain('b-shape'); expect(ids).toContain('ea-status'); expect(ids).toContain('u-admin'); expect(r.score).toBeLessThan(70);
  });
  it('passes a healthy minimal setup', () => {
    const cfg = [opt('bucket', '0-30', { meta: { min: 0, max: 30 } }), opt('bucket', '31+', { meta: { min: 31, max: null } }), opt('status', 'New'), opt('status', 'Done', { meta: { terminal: true } }), opt('end_action', 'Submit', { meta: { status: 'New', fu_days: 7 } }), opt('rca', 'Coding'), opt('rca_detail', 'Mod', { parent: 'Coding' })] as any;
    const r = diagnoseSetup({ config: cfg, clients: [], profiles: [{ id: 'a', role: 'admin', active: true, full_name: 'A' } as any], templates: [], rules: [], schedules: [], claims: [] }); expect(r.findings.filter((f) => f.level === 'error').length).toBe(0);
  });
});

describe('rules: claim-accounting logic', () => {
  const env = (): Env => ({ carc: CM, collect: () => 0.1, today: '2026-10-27', buckets: [{ label: 'all', min: 0, max: null, color: '' }], clients: new Map(), payerTf: new Map(), batchId: null, loads: new Map(), userName: (i) => i });
  const rule = (o: Partial<AutoRule>): AutoRule => ({ id: 'r', name: 'R', description: null, enabled: true, trigger: 'daily', client_id: null, match: 'all', conditions: [], actions: [], stop: false, sort: 0, ...o });
  it('matches on denial family, check flags and collectability', () => {
    const c = mk({ denial_codes: 'CO-29', flags: ['chk:loop_same_action'] });
    const p = planRules([rule({ conditions: [{ field: 'denial_family', op: 'contains', value: 'Timely filing' }, { field: 'flag', op: 'contains', value: 'chk:loop' }, { field: 'collectability', op: 'lt', value: 15 }], actions: [{ type: 'priority', value: 'Critical' }, { type: 'notify', value: 'Escalate', to: 'supervisor' }] })], [c], env());
    expect(p.effects.get(c.id)!.patch.priority).toBe('Critical'); expect(p.effects.get(c.id)!.notifications[0].to).toBe('supervisor');
  });
  it('auto-codes root cause from denial codes only when unambiguous and empty', () => {
    const t = { ...RULE_TEMPLATES.find((x) => x.name.startsWith('Auto-code'))!, id: 't', sort: 0 } as AutoRule; const a = mk({ denial_codes: 'CO-197' }), b = mk({ denial_codes: 'CO-197', rca: 'Coding' }), z = mk({ denial_codes: 'ZZ-1' });
    const p = planRules([t], [a, b, z], env()); expect(p.effects.get(a.id)!.patch.rca).toBe('Authorization'); expect(p.effects.get(b.id)).toBeUndefined(); expect(p.effects.get(z.id)).toBeUndefined();
  });
  it('all built-in templates only reference real fields and action types', () => {
    const fields = new Set(['balance', 'billed_amt', 'age', 'bucket', 'tf_left', 'days_since_touch', 'touch_count', 'payer', 'client', 'status', 'priority', 'rca', 'rca_detail', 'end_action', 'pms_status', 'denial_codes', 'cpt', 'provider', 'owner', 'flag', 'denial_family', 'collectability', 'days_open', 'check_count', 'is_new', 'is_reopened', 'fu_overdue']);
    RULE_TEMPLATES.forEach((t) => { t.conditions.forEach((c) => expect(fields.has(c.field)).toBe(true)); expect(t.actions.length).toBeGreaterThan(0); });
  });
});

import { buildPayerIndex } from '../src/lib/engine/payers';
describe('payer canonicalisation', () => {
  const idx = buildPayerIndex([{ value: 'Aetna', aliases: 'Aetna Inc, AETNA HEALTH' }, { value: 'UnitedHealthcare', aliases: 'UHC, United Healthcare' }, { value: 'BCBS of Texas' }]);
  it('maps spelling variants to the directory name', () => {
    expect(idx.canon('AETNA').name).toBe('Aetna'); expect(idx.canon('aetna inc').how).toBe('alias'); expect(idx.canon('UHC').name).toBe('UnitedHealthcare'); expect(idx.canon('United Healthcare Insurance').known).toBe(true);
    expect(idx.canon('BCBS Texas').known).toBe(true); expect(idx.canon('Brand New').known).toBe(false); expect(idx.canon('').name).toBe('Unknown');
  });
});

import { buildReport, isDue } from '../src/lib/engine/report';
describe('reports', () => {
  const client = { id: 'c1', name: 'Test <Clinic>', aging_basis: 'dos', tf_days: 365, active: true } as any;
  const claims = [mk({ patient_name: 'SECRET, PATIENT', claim_no: 'PHI-123', balance: 500 }), mk({ patient_name: 'OTHER, ONE', claim_no: 'PHI-456', balance: 700, dos: '2025-01-01', denial_codes: 'CO-29' })];
  const d = { clients: [client], claims, batches: [], recoveries: [{ client_id: 'c1', amount: 250, occurred_on: '2026-10-20' }] as any, buckets: [{ label: '0-180', min: 0, max: 180, color: '' }, { label: '181+', min: 181, max: null, color: '' }], carc: carcMap(), today: '2026-10-27' };
  it('builds a PHI-free client report with escaped names', () => {
    const r = buildReport(d, 'client', 'c1'); expect(r.html).not.toContain('SECRET'); expect(r.html).not.toContain('PHI-123'); expect(r.html).toContain('Test &lt;Clinic&gt;'); expect(r.summary.openAR).toBe(1200); expect(r.summary.resolved30).toBe(250); expect(r.html).toContain('Timely filing');
  });
  it('builds an internal digest', () => expect(buildReport(d, 'internal').html).toContain('Test &lt;Clinic&gt;'));
  it('schedules fire once per period at/after the hour', () => {
    const s = { cadence: 'weekly' as const, day: 2, hour_utc: 13, last_sent_at: null, active: true };
    expect(isDue(s, new Date('2026-10-27T14:00:00Z'))).toBe(true);   // Tuesday
    expect(isDue(s, new Date('2026-10-27T12:00:00Z'))).toBe(false); expect(isDue(s, new Date('2026-10-28T14:00:00Z'))).toBe(false); expect(isDue({ ...s, last_sent_at: '2026-10-27T13:05:00Z' }, new Date('2026-10-27T15:00:00Z'))).toBe(false);
    expect(isDue({ ...s, cadence: 'monthly', day: 31 }, new Date('2026-02-28T14:00:00Z'))).toBe(true);   // clamps to month end
    expect(isDue({ ...s, active: false }, new Date('2026-10-27T14:00:00Z'))).toBe(false);
  });
});

import { clientLoads, planDay } from '../src/lib/engine/dayplan';
describe('day planner', () => {
  const e = (client: string, o: any = {}) => ({ c: { client_id: client, balance: 1000, touch_count: 0 }, open: true, fuDue: false, tfLeft: null, ...o }) as any;
  it('weights urgency and splits the target across clients', () => {
    const mine = [...Array.from({ length: 10 }, () => e('A', { fuDue: true, c: { client_id: 'A', balance: 2000, touch_count: 1 } })), ...Array.from({ length: 10 }, () => e('B'))];
    const plan = planDay(clientLoads(mine), 40, new Map([['A', 5]]));
    expect(plan.length).toBe(2); expect(plan.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 5); expect(plan[0].clientId).toBe('A'); expect(plan[0].quota).toBeGreaterThan(plan[1].quota); expect(plan[0].remaining).toBe(plan[0].quota - 5);
    expect(plan.reduce((s, r) => s + r.quota, 0)).toBeGreaterThanOrEqual(38);
  });
  it('never starves a small client and handles empty input', () => { const p = planDay(clientLoads([...Array.from({ length: 50 }, () => e('A', { fuDue: true })), e('B')]), 40, new Map()); expect(p.find((r) => r.clientId === 'B')!.quota).toBeGreaterThanOrEqual(1); expect(planDay([], 40, new Map())).toEqual([]); });
});

import { deriveStage, stageDefs, STAGE_DEFAULTS } from '../src/lib/engine/stages';
describe('claim stages', () => {
  const defs = stageDefs([]); const ctx = { today: '2026-10-27', followupDays: () => 30 };
  const st = (o: Partial<Claim>) => deriveStage(mk({ last_billed: '2026-10-10', ...o }), defs, ctx).value;
  it('derives the lifecycle stage in priority order', () => {
    expect(st({ balance: -5 })).toBe('Credit / refund'); expect(st({ denial_codes: 'PR-1, PR-2' })).toBe('Patient responsibility'); expect(st({ end_action: 'Claim Appealed' })).toBe('In appeal');
    expect(st({ status: 'Awaiting Documents' })).toBe('Waiting on documents'); expect(st({ pms_status: 'Denied' })).toBe('Denied'); expect(st({ denial_codes: 'CO-97' })).toBe('Denied'); expect(st({ pms_status: 'Rejected by clearinghouse' })).toBe('Rejected (front-end)');
    expect(st({ pms_status: 'Partially Paid' })).toBe('Secondary / COB'); expect(st({ pms_status: 'Unbilled', last_billed: null, touch_count: 0 })).toBe('Unbilled / not sent');
    expect(st({ pms_status: 'Billed Primary' })).toBe('Billed — awaiting payer');
  });
  it('flags silent claims past the payer follow-up window, but not fresh ones', () => {
    expect(st({ pms_status: 'Billed Primary', last_billed: '2026-08-01', last_touched_at: null })).toBe('No response'); expect(st({ pms_status: 'Billed Primary', last_billed: '2026-10-20' })).toBe('Billed — awaiting payer');
    expect(st({ pms_status: 'Billed', last_billed: '2026-08-01', last_touched_at: '2026-10-20T00:00:00Z' })).toBe('Billed — awaiting payer');
  });
  it('contractual-only codes do not make a denial; defaults are unique', () => { expect(st({ denial_codes: 'CO-45', pms_status: 'Billed' })).toBe('Billed — awaiting payer'); expect(new Set(STAGE_DEFAULTS.map((d) => d.value)).size).toBe(STAGE_DEFAULTS.length); });
  it('honours a configured custom stage and order', () => { const cfg = [{ id: '1', category: 'stage', value: 'VIP review', sort: 0, active: true, color: '#f0f', meta: { rule: 'custom', keywords: 'vip' } }, { id: '2', category: 'stage', value: 'Everything else', sort: 1, active: true, color: '#999', meta: { rule: 'billed' } }] as any; const d = stageDefs(cfg); expect(deriveStage(mk({ pms_status: 'VIP hold' }), d, ctx).value).toBe('VIP review'); expect(deriveStage(mk(), d, ctx).value).toBe('Everything else'); });
});
