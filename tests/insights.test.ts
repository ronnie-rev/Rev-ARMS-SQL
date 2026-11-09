import { describe, expect, it } from 'vitest';
import { buildInsightIndex } from '../src/lib/engine/insights';
const E = (id: string, c: any = {}, o: any = {}) => ({ c: { id, claim_no: 'N' + id, client_id: 'c1', payer: 'Aetna', balance: 500, touch_count: 1, denial_codes: null, custom: {}, ...c }, age: 30, tfLeft: null, open: true, ...o }) as any;
describe('claim insights', () => {
  const base = { appeals: [] as any[], today: '2026-03-10', payerDays: () => 30 };
  it('ranks broken promises and filing deadlines first and explains why', () => {
    const m = buildInsightIndex({ ...base, ecs: [E('1', { custom: { promise_date: '2026-03-01' } }, { tfLeft: 10 })] }); const l = m.get('1')!;
    expect(l.map((x) => x.id)).toEqual(['promise_broken', 'tf_critical']); expect(l[0].detail).toMatch(/9 days ago/);
  });
  it('spots silent appeals, lost appeals, slow payers, near-90 aging, duplicates, low value', () => {
    const appeals = [{ id: 'a', claim_id: '2', status: 'sent', filed_on: '2026-01-20', level: 1 }, { id: 'b', claim_id: '3', status: 'lost', level: 2 }] as any[];
    const m = buildInsightIndex({ ...base, appeals, dupIds: new Set(['5']), ecs: [E('2'), E('3'), E('4', {}, { age: 120 }), E('5'), E('6', { balance: 12, touch_count: 4 }), E('7', {}, { age: 86 })] });
    expect(m.get('2')!.some((x) => x.id === 'appeal_silent')).toBe(true); expect(m.get('3')!.some((x) => x.id === 'lost_appeal')).toBe(true); expect(m.get('4')!.some((x) => x.id === 'payer_slow')).toBe(true);
    expect(m.get('5')!.some((x) => x.id === 'duplicate')).toBe(true); expect(m.get('6')!.some((x) => x.id === 'low_value')).toBe(true); expect(m.get('7')!.some((x) => x.id === 'crossing_90')).toBe(true);
  });
  it('says "due to pay soon" instead of escalating a claim inside the payer norm, and applies client MUST rules', () => {
    const m = buildInsightIndex({ ...base, collect: () => ({ p: 0.8 }), sops: [{ id: 's', client_id: null, title: 't', instruction: 'Never write off Aetna', level: 'must', active: true, payers: ['Aetna'], cpts: [], providers: [], codes: [] }], ecs: [E('8', {}, { age: 29 })] });
    const ids = m.get('8')!.map((x) => x.id); expect(ids).toContain('pay_soon'); expect(ids[0]).toBe('sop_must');
  });
});

describe('repeat denial pattern is selective', () => {
  const today = '2026-03-10'; const day = (n: number) => new Date(Date.parse(today + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);
  const mk = (n: number, code: string, ago: number, pre: string) => Array.from({ length: n }, (_, i) => ({ c: { id: pre + i, claim_no: pre + i, client_id: 'c', payer: 'Aetna', balance: 400, touch_count: 1, denial_codes: code, denial_date: day(ago), custom: {}, closed_at: null }, age: 40, tfLeft: null, open: true }) as any);
  const has = (ecs: any[], id: string) => !!buildInsightIndex({ ecs, appeals: [], today, payerDays: () => null }).get(id)?.some((x) => x.id === 'repeat_payer_code');
  it('fires for a large, live, fixable cluster only', () => {
    const live = [...mk(14, 'CO-50', 10, 'a'), ...mk(10, 'CO-16', 10, 'b')]; expect(has(live, 'a0')).toBe(true);
    expect(has([...mk(14, 'CO-50', 200, 'a'), ...mk(10, 'CO-16', 200, 'b')], 'a0')).toBe(false);   // old backlog, not live
    expect(has([...mk(5, 'CO-50', 10, 'a'), ...mk(40, 'CO-16', 10, 'b')], 'a0')).toBe(false);        // too small / small share
    expect(has([...mk(20, 'CO-45', 10, 'a'), ...mk(5, 'CO-16', 10, 'b')], 'a0')).toBe(false);        // routine contractual adjustment
  });
});
