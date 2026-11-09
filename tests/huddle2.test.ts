import { describe, expect, it } from 'vitest';
import { buildHuddle, huddleText } from '../src/lib/engine/huddle2';
const today = '2026-03-11'; // Wednesday → previous day Tuesday 2026-03-10
const E = (id: string, c: any = {}, o: any = {}) => ({ c: { id, claim_no: 'N' + id, client_id: 'c1', payer: 'Aetna', balance: 1000, assigned_to: null, next_fu: null, denial_codes: null, ...c }, client: { name: 'Clinic A' }, open: true, age: 30, tfLeft: null, fuDue: false, ...o }) as any;
describe('huddle 2.0', () => {
  it('builds the time-boxed agenda from wins, fires, capacity and unassigned work', () => {
    const ecs = [E('1', { assigned_to: 'u1' }, { tfLeft: 5 }), E('2', { assigned_to: 'u2', next_fu: '2026-03-09' }, { fuDue: true }), E('3', {}, { age: 85 }), ...Array.from({ length: 30 }, (_, i) => E('b' + i, { assigned_to: 'u2' }))];
    const insights = new Map([['1', [{ id: 'tf_critical', label: 'Filing ≤ 14d', detail: '5 days left', tone: 'bad', weight: 92 }]]]) as any;
    const h = buildHuddle({ ecs, workLog: [{ work_date: '2026-03-10', user_id: 'u1', client_id: 'c1' }, { work_date: '2026-03-10', user_id: 'u1', client_id: 'c1' }] as any, recoveries: [{ occurred_on: '2026-03-10', amount: 800, claim_id: '1', client_id: 'c1', user_name: 'Ann' }, { occurred_on: '2026-03-02', amount: 500, client_id: 'c1' }] as any, appeals: [], people: [{ id: 'u1', full_name: 'Ann', daily_target: 40 }, { id: 'u2', full_name: 'Bob', daily_target: 40 }] as any, insights, trends: [], today });
    expect(h.prevDay).toBe('2026-03-10'); expect(h.kpis.recovered).toBe(800); expect(h.kpis.recoveredMTD).toBe(1300); expect(h.kpis.touches).toBe(2); expect(h.kpis.filing7).toBe(1); expect(h.kpis.unassigned).toBe(1); expect(h.fires[0].claim_no).toBe('N1'); expect(h.wins.top[0].claim_no).toBe('N1');
    expect(h.capacity.find((c) => c.name === 'Bob')!.flag).toBe('overloaded'); expect(h.capacity.find((c) => c.name === 'Ann')!.flag).toBe('idle'); expect(h.crossing[0].n).toBe(1); expect(h.agenda.map((a) => a.title)).toEqual(['Wins', 'Fires', 'Payer blockers', 'People & capacity', 'Focus for today']); expect(h.agenda.reduce((a, s) => a + s.minutes, 0)).toBe(15);
    expect(huddleText(h)).toContain('*Fires*');
  });
  it('looks back to Friday on Mondays and filters by client', () => {
    const h = buildHuddle({ ecs: [E('1', { client_id: 'c1' }), E('2', { client_id: 'c2' })], workLog: [], recoveries: [], appeals: [], people: [], insights: new Map(), trends: [], today: '2026-03-09', clientId: 'c1' }); expect(h.prevDay).toBe('2026-03-06'); expect(h.kpis.unassigned).toBe(1);
  });
});
