import { describe, expect, it } from 'vitest';
import { cashForecast, capacityPlan, detectAnomalies, nextBestAction, type NbaCtx } from '../src/lib/engine/intelligence';
import { resolveLimitsCfg, type Deadline } from '../src/lib/engine/limits';

const cfg = resolveLimitsCfg(null); const TODAY = '2026-06-01';
const claim = (o: any = {}) => ({ id: 'c1', client_id: 'k', claim_no: 'C1', balance: 1000, expected_amt: null, closed_at: null, flags: [], assigned_to: 'u1', next_fu: '2026-06-10', denial_codes: null, pms_status: 'Billed', last_billed: '2026-05-20', dos: '2026-05-01', custom: {}, rca: null, ...o });
const ec = (o: any = {}, e: any = {}) => ({ c: claim(o), open: true, fuDue: false, stale: false, age: 30, ...e }) as any;
const dl = (kind: string, left: number): Deadline => ({ kind: kind as any, days: 180, basis: 'dos', start: '2026-01-01', startSrc: 'exact', due: '2026-07-01', left, tier: 'ok', relevant: true, satisfied: false, from: 'payer' });
const ctx = (o: Partial<NbaCtx> = {}): NbaCtx => ({ today: TODAY, deadlines: () => [], limitsCfg: cfg, underpay: new Map(), appeals: new Map(), payerDays: () => 40, collect: () => ({ p: 0.6, expected: 600, factors: [] }), ...o });

describe('next best action', () => {
  it('missing-from-file claims need a decision first', () => { const n = nextBestAction(ec({ flags: ['missing_review'], missing_since: '2026-05-25' }), ctx()); expect(n.kind).toBe('resolve_missing'); expect(n.why[0]).toContain('Dropped off'); });
  it('denied inside the appeal window → appeal, more urgent as the window closes', () => {
    const a = nextBestAction(ec({ denial_codes: 'CO-50' }), ctx({ deadlines: () => [dl('afl', 60)] })); const b = nextBestAction(ec({ denial_codes: 'CO-50' }), ctx({ deadlines: () => [dl('afl', 5)] }));
    expect(a.kind).toBe('appeal'); expect(b.urgency).toBeGreaterThan(a.urgency); expect(b.why.join()).toContain('5 days');
  });
  it('correctable denial → corrected claim; expired → write-off review', () => {
    expect(nextBestAction(ec({ denial_codes: 'CO-16' }), ctx({ deadlines: () => [dl('ccfl', 20)] })).kind).toBe('corrected_claim');
    expect(nextBestAction(ec({ denial_codes: 'CO-50' }), ctx({ deadlines: () => [dl('afl', -12)] })).kind).toBe('writeoff_review');
  });
  it('overdue appeal beats everything except nothing', () => { const m = new Map([['c1', [{ status: 'sent', due_on: '2026-05-20', kind: 'appeal', level: 1 } as any]]]); expect(nextBestAction(ec({ denial_codes: 'CO-50' }), ctx({ appeals: m })).kind).toBe('appeal_overdue'); });
  it('slow-paying payer with no denial → status call; quiet healthy claim → monitor', () => {
    expect(nextBestAction(ec({ last_billed: '2026-02-01' }), ctx()).kind).toBe('status_call');
    expect(nextBestAction(ec(), ctx()).kind).toBe('monitor');
  });
  it('housekeeping: unowned, no follow-up', () => { expect(nextBestAction(ec({ assigned_to: null }), ctx()).kind).toBe('assign'); expect(nextBestAction(ec({ next_fu: null }), ctx()).kind).toBe('set_followup'); });
  it('lists alternatives and never recommends on closed claims', () => { const n = nextBestAction(ec({ assigned_to: null, next_fu: null }), ctx()); expect(n.also.length).toBeGreaterThan(0); expect(nextBestAction(ec({ closed_at: '2026-05-01' }), ctx()).kind).toBe('monitor'); });
  it('patient responsibility remainder → bill patient', () => { expect(nextBestAction(ec({ balance: 120, patient_resp: 120 }), ctx()).kind).toBe('patient_bill'); });
});
describe('cash forecast', () => {
  it('lands expected dollars in weeks implied by payer pay time; denied waits longer', () => {
    const col = (x: any) => ({ p: 0.5, expected: x.c.balance * 0.5, factors: [] });
    const f = cashForecast([ec({ balance: 1000, last_billed: '2026-05-15' }), ec({ id: 'c2', balance: 800, denial_codes: 'CO-50' })], col, () => 30, TODAY, 12);
    expect(f.total).toBe(900); expect(f.weeks[1].expected).toBe(500); expect(f.weeks.findIndex((w) => w.expected === 400)).toBeGreaterThanOrEqual(3); expect(f.byPayer.length).toBe(1);
  });
});
describe('capacity plan', () => {
  it('suggests moving surplus demand from overloaded to slack staff', () => {
    const staff = [{ id: 'a', full_name: 'A', daily_target: 10 }, { id: 'b', full_name: 'B', daily_target: 10 }]; const ecs = [...Array.from({ length: 80 }, (_, i) => ec({ id: 'x' + i, assigned_to: 'a' })), ...Array.from({ length: 10 }, (_, i) => ec({ id: 'y' + i, assigned_to: 'b' })), ec({ id: 'z', assigned_to: null })];
    const p = capacityPlan(ecs, staff, () => true); expect(p.rows[0].status).toBe('over'); expect(p.transfers[0]).toMatchObject({ fromId: 'a', toId: 'b' }); expect(p.transfers[0].n).toBeLessThanOrEqual(30); expect(p.unowned).toBe(1);
  });
});
describe('anomalies', () => {
  it('flags big balance swings and unowned inventory', () => {
    const batches = [{ id: 'b1', client_id: 'k', created_at: '2026-05-01', total_balance: 100000, file_name: 'a' }, { id: 'b2', client_id: 'k', created_at: '2026-05-08', total_balance: 60000, file_name: 'b' }] as any;
    const ecs = Array.from({ length: 10 }, (_, i) => ec({ id: 'q' + i, assigned_to: i < 4 ? null : 'u' }));
    const a = detectAnomalies({ ecs, batches, workLog: [], staff: [], today: TODAY }); expect(a.find((x) => x.id.startsWith('jump'))?.severity).toBe('high'); expect(a.some((x) => x.id === 'unassigned')).toBe(true);
  });
});

import { DEFAULT_INTEL_CFG, resolveIntelCfg, validateIntelCfg } from '../src/lib/engine/intelligence';
describe('manager-editable intelligence settings', () => {
  it('defaults validate, partial saved config merges, bad values are rejected', () => {
    expect(validateIntelCfg(DEFAULT_INTEL_CFG)).toEqual([]); const c = resolveIntelCfg({ nba: { staleDays: 7 }, capacity: { overPct: 130 } }); expect(c.nba.staleDays).toBe(7); expect(c.nba.defaultPayDays).toBe(45); expect(c.capacity.workdays).toBe(5);
    expect(validateIntelCfg(resolveIntelCfg({ capacity: { slackPct: 120, overPct: 110 } })).join()).toContain('below'); expect(validateIntelCfg(resolveIntelCfg({ forecast: { horizonWeeks: 1 } })).length).toBeGreaterThan(0);
  });
  it('a rule can be switched off and its urgency adjusted', () => {
    const off = resolveIntelCfg({ nba: { disabled: ['assign'] } }); expect(nextBestAction(ec({ assigned_to: null }), ctx({ cfg: off })).kind).not.toBe('assign');
    const boosted = resolveIntelCfg({ nba: { boost: { set_followup: 30 } } }); expect(nextBestAction(ec({ next_fu: null }), ctx({ cfg: boosted })).urgency).toBe(70);
  });
  it('status-call threshold follows the multiplier', () => {
    const strict = resolveIntelCfg({ nba: { statusCallMult: 1, statusCallPadDays: 0 } }); expect(nextBestAction(ec({ last_billed: '2026-04-10' }), ctx({ cfg: strict })).kind).toBe('status_call'); expect(nextBestAction(ec({ last_billed: '2026-04-10' }), ctx()).kind).not.toBe('status_call');
  });
  it('capacity thresholds and anomaly thresholds are honoured', () => {
    const staff = [{ id: 'a', full_name: 'A', daily_target: 10 }]; const ecs = Array.from({ length: 60 }, (_, i) => ec({ id: 'x' + i, assigned_to: 'a' }));
    expect(capacityPlan(ecs, staff, () => true).rows[0].status).toBe('over'); expect(capacityPlan(ecs, staff, () => true, resolveIntelCfg({ capacity: { overPct: 150 } }).capacity).rows[0].status).toBe('balanced');
    const unowned = Array.from({ length: 10 }, (_, i) => ec({ id: 'u' + i, assigned_to: i < 3 ? null : 'a' })); expect(detectAnomalies({ ecs: unowned, batches: [], workLog: [], staff: [], today: TODAY }).some((a) => a.id === 'unassigned')).toBe(true);
    expect(detectAnomalies({ ecs: unowned, batches: [], workLog: [], staff: [], today: TODAY, cfg: resolveIntelCfg({ signals: { unownedPct: 50 } }).signals }).some((a) => a.id === 'unassigned')).toBe(false);
  });
});

describe('custom + new built-in recommendations', () => {
  it('a manager rule competes on urgency and carries its own label, colour and action', () => {
    const rule: any = { id: 'r1', name: 'x', enabled: true, client_id: null, match: 'all', conditions: [{ field: 'balance', op: 'gte', value: 500 }], label: 'Escalate high-dollar', color: '#abc', urgency: 99, why: '{balance} at stake', action: { type: 'followup', days: 2 } };
    const env: any = { today: TODAY, buckets: [], clients: new Map(), payerTf: new Map() };
    const n = nextBestAction(ec({ balance: 900 }), ctx({ custom: [rule], env })); expect(n).toMatchObject({ kind: 'custom', label: 'Escalate high-dollar', color: '#abc' }); expect(n.custom?.action).toEqual({ type: 'followup', days: 2 }); expect(n.why[0]).toContain('$900');
    expect(nextBestAction(ec({ balance: 100 }), ctx({ custom: [rule], env })).kind).toBe('monitor');
    expect(nextBestAction(ec({ balance: 900 }), ctx({ custom: [{ ...rule, urgency: 10 }], env, cfg: resolveIntelCfg({}) })).kind).toBe('custom');
  });
  it('credit balances and overdue payer promises are recommended', () => {
    expect(nextBestAction(ec({ balance: -75 }), ctx()).kind).toBe('credit_balance'); const p = nextBestAction(ec({ custom: { promise_date: '2026-05-20' } }), ctx()); expect(p.kind).toBe('promise_overdue'); expect(p.why[0]).toContain('05/20/2026');
  });
});
