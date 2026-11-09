import { describe, expect, it } from 'vitest';
import { appealAnalytics, chaseList } from '../src/lib/engine/appealstats';
const A = (id: string, o: any = {}) => ({ id, claim_id: 'c' + id, kind: 'appeal', level: 1, status: 'won', payer: 'Aetna', amount_disputed: 100, amount_recovered: 80, filed_on: '2026-01-01', decided_on: '2026-01-21', ...o }) as any;
describe('appeal stats', () => {
  it('rolls up win rate, recovered and days to decision', () => {
    const r = appealAnalytics([A('1'), A('2', { status: 'lost', amount_recovered: 0, decided_on: '2026-02-10' }), A('3', { status: 'sent', decided_on: null }), A('4', { status: 'draft' })], [{ id: 'c1', denial_codes: 'CO-50' } as any]);
    const p = r.byPayer[0]; expect(p.filed).toBe(3); expect(p.decided).toBe(2); expect(p.rate).toBe(50); expect(p.avgDays).toBe(30); expect(r.overall.recovered).toBe(80); expect(r.byCode.find((c) => c.key === 'CO-50')!.won).toBe(1);
  });
  it('chases silent appeals', () => {
    const c = chaseList([A('1', { status: 'sent', filed_on: '2026-01-01' }), A('2', { status: 'sent', filed_on: '2026-02-05' }), A('3', { status: 'sent', filed_on: '2026-03-05' })], '2026-03-10', 30);
    expect(c.map((x) => [x.appeal.id, x.level])).toEqual([['1', 'escalate'], ['2', 'chase']]);
  });
});
