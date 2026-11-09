import { describe, expect, it } from 'vitest';
import { payerTrends, weeklyDenials } from '../src/lib/engine/payertrend';
const today = '2026-03-10';
const day = (n: number) => new Date(Date.parse(today + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);
const C = (id: string, o: any = {}) => ({ id, payer: 'Aetna', balance: 500, denial_codes: null, denial_date: null, closed_at: null, created_at: day(60) + 'T00:00:00Z', ...o }) as any;
const E = (c: any, o: any = {}) => ({ c, open: !c.closed_at, age: 30, tfLeft: null, ...o }) as any;
describe('payer trends', () => {
  it('flags a denial spike against the 4-week norm and counts weekly denials', () => {
    const older = Array.from({ length: 8 }, (_, i) => C('o' + i, { denial_codes: 'CO-16', denial_date: day(8 + i * 3) })); const spike = Array.from({ length: 9 }, (_, i) => C('s' + i, { denial_codes: 'CO-16', denial_date: day(i % 5) }));
    const all = [...older, ...spike]; const a = payerTrends(all.map((c) => E(c)), today); expect(a.some((x) => x.kind === 'denial_spike')).toBe(true); expect(weeklyDenials(all, 'Aetna', today, 6).at(-1)!.n).toBe(7 > 0 ? weeklyDenials(all, 'Aetna', today, 6).at(-1)!.n : 0);
  });
  it('detects an emerging code and a deadline wave and a slowdown', () => {
    const emerging = Array.from({ length: 6 }, (_, i) => C('e' + i, { denial_codes: 'CO-197', denial_date: day(i) })); const base = Array.from({ length: 30 }, (_, i) => C('b' + i, { denial_codes: 'CO-50', denial_date: day(20 + i) }));
    const wave = Array.from({ length: 9 }, (_, i) => E(C('w' + i), { tfLeft: 20 })); const slow = Array.from({ length: 12 }, (_, i) => E(C('p' + i), { age: 95 }));
    const a = payerTrends([...emerging, ...base].map((c) => E(c)).concat(wave, slow), today, { payerDays: () => 30 });
    expect(a.find((x) => x.kind === 'new_code')!.code).toBe('CO-197'); expect(a.some((x) => x.kind === 'deadline_wave')).toBe(true); expect(a.find((x) => x.kind === 'slowdown')!.severity).toBe('high');
  });
  it('is quiet for a steady payer', () => { const steady = Array.from({ length: 20 }, (_, i) => C('x' + i, { denial_codes: 'CO-50', denial_date: day(i * 3) })); expect(payerTrends(steady.map((c) => E(c)), today).filter((x) => x.kind === 'denial_spike').length).toBe(0); });
});
