import { describe, expect, it } from 'vitest';
import { behaviourAlerts, payerScorecards, resolveScoreCfg, validateScoreCfg } from '../src/lib/engine/scorecard';
import type { Appeal, Claim } from '../src/lib/types';

const TODAY = '2026-10-30'; const cfg = resolveScoreCfg({ minN: 10 });
let n = 0; const mk = (o: Partial<Claim>): Claim => ({ id: 'c' + ++n, client_id: 'k', claim_no: 'X' + n, account_id: null, patient_name: null, dos: '2026-01-01', last_billed: '2026-01-01', payer: 'Aetna', provider: null, provider_type: null, cpt: '99213', billed_amt: 200, balance: 100, pms_status: null, denial_codes: null, status: 'New', rca: null, rca_detail: null, end_action: null, end_sub: null, mode: null, assigned_to: null, priority: 'Normal', next_fu: null, touch_count: 0, last_touched_at: null, custom: {}, first_batch: null, last_batch: null, closed_at: null, closed_reason: null, created_at: '2026-01-01T00:00:00Z', updated_at: '', flags: [], ...o } as Claim);
const batch = (count: number, deniedN: number, billed: string, code = 'CO-45', extra: Partial<Claim> = {}) => Array.from({ length: count }, (_, i) => mk({ last_billed: billed, denial_codes: i < deniedN ? code : null, ...extra }));
const ap = (claim: Claim, status: Appeal['status'], decided: string): Appeal => ({ id: 'a' + ++n, claim_id: claim.id, client_id: 'k', level: 1, kind: 'appeal', status, payer: 'Aetna', template: null, form_id: null, due_on: null, filed_on: null, decided_on: decided, method: null, tracking_no: null, amount_disputed: null, amount_recovered: null, reason: null, outcome_note: null, letter: {}, form_values: {}, attachments: [], created_by: null, created_at: '', updated_at: '' });

describe('payer scorecards', () => {
  it('computes denial rate, days to pay, win rate and payment % per payer and window', () => {
    const recent = batch(40, 12, '2026-10-01'), base = batch(60, 6, '2026-06-15'); const paid = Array.from({ length: 12 }, (_, i) => mk({ last_billed: '2026-09-01', closed_at: `2026-10-${10 + (i % 3)}T00:00:00Z`, resolution: 'paid', paid_amt: 120 })); const won = ap(recent[0], 'won', '2026-10-10'), lost = ap(recent[1], 'lost', '2026-10-12');
    const [c] = payerScorecards([...recent, ...base, ...paid], [won, lost], cfg, TODAY);
    expect(c.payer).toBe('Aetna'); expect(c.recent.denialRate).toBeCloseTo((12 / 52) * 100, 5); expect(c.baseline.denialRate).toBe(10); expect(c.recent.paidN).toBe(12); expect(c.recent.medianDaysToPay).toBe(40); expect(c.recent.avgPaidPct).toBe(60); expect(c.recent.winRate).toBe(50); expect(c.recent.top[0]).toEqual({ code: 'CO-45', n: 12 });
  });
  it('per-CPT cards and client scoping', () => { const cards = payerScorecards([...batch(20, 2, '2026-10-01'), ...batch(20, 10, '2026-10-01', 'CO-97', { cpt: '11042' }), ...batch(5, 0, '2026-10-01', 'x', { client_id: 'other' })], [], cfg, TODAY, { byCpt: true, clientIds: ['k'] }); expect(cards.map((c) => `${c.cpt}:${c.recent.n}`).sort()).toEqual(['11042:20', '99213:20']); });
});

describe('behaviour alerts', () => {
  const recent = batch(40, 16, '2026-10-01', 'CO-197'), base = batch(60, 6, '2026-06-15', 'CO-45');
  it('alerts on a denial spike and a new denial reason, with a stable monthly dedupe key', () => {
    const al = behaviourAlerts(payerScorecards([...recent, ...base], [], cfg, TODAY), cfg, TODAY); const up = al.find((a) => a.kind === 'denial_up')!; expect(up.severity).toBe('high'); expect(up.key).toBe('denial_up|Aetna||2026-10'); expect(up.detail).toMatch(/CO-197/); expect(al.find((a) => a.kind === 'new_denial_code')!.title).toMatch(/CO-197/);
  });
  it('stays quiet when volume is too low or nothing moved', () => { expect(behaviourAlerts(payerScorecards([...batch(5, 5, '2026-10-01'), ...batch(60, 6, '2026-06-15')], [], cfg, TODAY), cfg, TODAY)).toEqual([]); expect(behaviourAlerts(payerScorecards([...batch(40, 4, '2026-10-01'), ...batch(60, 6, '2026-06-15')], [], cfg, TODAY), cfg, TODAY)).toEqual([]); });
  it('slower payment and appeal-win drops alert; config validates', () => {
    const rp = Array.from({ length: 10 }, () => mk({ last_billed: '2026-08-15', closed_at: '2026-10-20T00:00:00Z', resolution: 'paid' })), bp = Array.from({ length: 10 }, () => mk({ last_billed: '2026-05-01', closed_at: '2026-06-10T00:00:00Z', resolution: 'paid' }));
    const cs = [...recent.slice(0, 20), ...base.slice(0, 20), ...rp, ...bp]; const apps = [...Array.from({ length: 6 }, (_, i) => ap(cs[i], i < 1 ? 'won' : 'lost', '2026-10-05')), ...Array.from({ length: 6 }, (_, i) => ap(cs[20 + i], i < 5 ? 'won' : 'lost', '2026-07-01'))];
    const al = behaviourAlerts(payerScorecards(cs, apps, cfg, TODAY), cfg, TODAY).map((a) => a.kind); expect(al).toContain('slower_pay'); expect(al).toContain('appeal_win_down'); expect(validateScoreCfg(resolveScoreCfg({ windowDays: 100, baselineDays: 50 }))[0]).toMatch(/Baseline/); expect(validateScoreCfg(cfg)).toEqual([]);
  });
});
