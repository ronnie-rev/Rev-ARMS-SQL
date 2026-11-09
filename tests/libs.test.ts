import { describe, expect, it } from 'vitest';
import { buildIcs } from '../src/lib/ical';
import { fmtPhone, parsePhone, phoneOk } from '../src/lib/phone';
import { extraDates } from '../src/lib/engine/dates';
import { readLetter } from '../src/lib/engine/letterreader';
import { readDocument } from '../src/lib/engine/docintel';
import { weeklyAnomalies } from '../src/lib/engine/anomaly';
import { qualityIssues } from '../src/lib/engine/appealforge';

describe('open-source library integrations', () => {
  it('ics: all-day events with reminders', () => {
    const s = buildIcs([{ title: 'Appeal deadline — CLM-1', date: '2026-12-01', description: 'Aetna', uid: 'a1' }, { title: 'bad', date: 'x' }]); expect(s).toContain('BEGIN:VEVENT'); expect(s).toContain('20261201'); expect(s.match(/BEGIN:VALARM/g)!.length).toBe(2); expect(s).toContain('CLM-1'); expect(buildIcs([])).toBe(''); expect(buildIcs([{ title: 'No extras', date: '2026-12-02' }])).toContain('20261202');
  });
  it('libphonenumber: formats and validates US numbers', () => {
    expect(fmtPhone('800.555.0101')).toBe('(800) 555-0101'); expect(phoneOk('(301) 555-0142')).toBe(true); expect(phoneOk('123')).toBe(false); expect(parsePhone('(301) 555-0142').e164).toBe('+13015550142');
    expect(qualityIssues({ html: '<p>x</p>', payerFax: '12345', claimNo: 'C1' }).some((x) => /fax number/.test(x.text))).toBe(true); expect(readDocument('Fax: 800.555.0101 Phone: (301) 555-0142').faxes[0]).toBe('(800) 555-0101');
  });
  it('chrono: finds dates written in words that fixed patterns miss', () => {
    const d = extraDates('This notice was mailed on the 20th of October, 2026. Received Nov 3rd 2026. Call next Friday.'); expect(d.map((x) => x.iso)).toEqual(['2026-10-20', '2026-11-03']);
    expect(readLetter('Letter sent October 5th, 2026 about claim CL12345').dates.some((x) => x.iso === '2026-10-05')).toBe(true);
  });
  it('simple-statistics: flags only unusual, material weekly movements', () => {
    const today = '2026-11-09'; const day = (n: number) => new Date(Date.parse(today + 'T12:00:00Z') - n * 864e5).toISOString().slice(0, 10);
    const wl: any[] = []; const touch = (w: number, n: number) => { for (let i = 0; i < n; i++) wl.push({ work_date: day(7 * w + 1 + (i % 6)) }); }; touch(0, 20); for (let w = 1; w <= 8; w++) touch(w, 80 + (w % 3) * 4);
    const rec: any[] = []; for (let w = 0; w <= 8; w++) rec.push({ occurred_on: day(7 * w + 2), amount: w === 0 ? 5100 : 5000 + (w % 2) * 200 });
    const claims: any[] = []; for (let w = 0; w <= 8; w++) for (let i = 0; i < (w === 0 ? 30 : 6); i++) claims.push({ denial_date: day(7 * w + 1 + (i % 5)), denial_codes: 'CO-50', payer: 'Aetna' });
    const a = weeklyAnomalies({ workLog: wl, recoveries: rec, claims, today }); const ids = a.map((x) => x.id); expect(ids).toContain('touches'); expect(ids).toContain('denials'); expect(ids).toContain('denials:Aetna'); expect(ids).not.toContain('recovered');
    const t = a.find((x) => x.id === 'touches')!; expect(t.direction).toBe('down'); expect(t.good).toBe(false); expect(a.find((x) => x.id === 'denials')!.direction).toBe('up'); expect(a[0].good).toBe(false); expect(weeklyAnomalies({ workLog: [], recoveries: [], claims: [], today })).toEqual([]);
  });
});
