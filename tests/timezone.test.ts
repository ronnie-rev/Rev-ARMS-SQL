import { describe, expect, it } from 'vitest';
import { addBusinessDays, setWorkspaceTz, todayISO, usHolidays } from '../src/lib/utils';
describe('workspace time zone + business days', () => {
  it('computes US federal holidays (observed)', () => { const h = usHolidays(2026); expect(h.has('2026-07-03')).toBe(true); expect(h.has('2026-11-26')).toBe(true); expect(h.has('2026-01-19')).toBe(true); expect(h.has('2026-12-25')).toBe(true); expect(h.has('2026-05-25')).toBe(true); });
  it('skips weekends and holidays when adding business days', () => { expect(addBusinessDays('2026-11-05', 3)).toBe('2026-11-10'); expect(addBusinessDays('2026-11-24', 3)).toBe('2026-11-30'); expect(addBusinessDays('2026-12-24', 1)).toBe('2026-12-28'); expect(addBusinessDays('2026-11-10', -2)).toBe('2026-11-06'); });
  it('"today" follows the workspace zone', () => { setWorkspaceTz('Pacific/Kiritimati'); const a = todayISO(); setWorkspaceTz('Pacific/Pago_Pago'); const b = todayISO(); setWorkspaceTz(''); expect(Date.parse(a) - Date.parse(b)).toBeGreaterThanOrEqual(86400000); setWorkspaceTz('Not/AZone'); expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/); setWorkspaceTz(''); });
});
