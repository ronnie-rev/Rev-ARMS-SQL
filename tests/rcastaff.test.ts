import { describe, expect, it } from 'vitest';
import { driftLeaders, rcaDrift, rcaWeekly } from '../src/lib/engine/rcadrift';
import { forecastStaffing } from '../src/lib/engine/staffforecast';
const today = '2026-03-10'; const day = (n: number) => new Date(Date.parse(today + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);
const W = (rca: string, ago: number, claim = 'c1') => ({ claim_id: claim, rca, work_date: day(ago) }) as any; const payerOf = () => 'Aetna';
describe('root-cause drift', () => {
  it('detects a real shift in reason mix and ignores noise', () => {
    const base = [...Array.from({ length: 60 }, (_, i) => W('Coding', 40 + (i % 50))), ...Array.from({ length: 40 }, (_, i) => W('Auth', 40 + (i % 50)))];
    const recent = [...Array.from({ length: 12 }, (_, i) => W('Coding', i)), ...Array.from({ length: 28 }, (_, i) => W('Auth', i % 25))];
    const r = rcaDrift([...base, ...recent], payerOf, today, { payer: 'Aetna' }); const auth = r.rows.find((x) => x.rca === 'Auth')!; expect(auth.significant).toBe(true); expect(auth.direction).toBe('up'); expect(r.headline).toMatch(/Auth/);
    const steady = rcaDrift([...base, ...Array.from({ length: 10 }, (_, i) => W(i < 6 ? 'Coding' : 'Auth', i))], payerOf, today, { payer: 'Aetna' }); expect(steady.rows.every((x) => !x.significant)).toBe(true);
    expect(driftLeaders([...base, ...recent], payerOf, today).length).toBe(1); expect(rcaWeekly([...base, ...recent], payerOf, today, 'Aetna').series.length).toBe(2);
  });
});
describe('staffing forecast', () => {
  const mk = (n: number, o: any) => Array.from({ length: n }, (_, i) => ({ id: 'c' + i, ...o(i) })) as any[];
  it('shows demand passing capacity and the people needed, and extra hires close the gap', () => {
    const claims = [...mk(3000, () => ({ closed_at: null, created_at: day(200) })), ...mk(160, (i) => ({ closed_at: null, created_at: day(i % 50) })), ...mk(80, (i) => ({ closed_at: day(i % 50), created_at: day(100) }))];
    const log = mk(1600, (i) => ({ work_date: day(i % 50), claim_id: 'c1' })); const people = Array.from({ length: 5 }, () => ({ daily_target: 40 }));
    const f = forecastStaffing({ claims, workLog: log, people, today }); expect(f.base.openNow).toBe(3160); expect(f.breakWeek).not.toBeNull(); expect(f.weeks.length).toBe(8); expect(f.peakGapFte).toBeGreaterThan(0);
    const more = forecastStaffing({ claims, workLog: log, people, today }, { extraFte: 5 }); expect(more.peakGapFte).toBeLessThan(f.peakGapFte); expect(more.summary.length).toBeGreaterThan(10);
  });
});
