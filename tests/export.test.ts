import { describe, it, expect } from 'vitest';
import { toCSV, toXLSX, toPDF, toHTML, formatCell } from '../src/lib/export';
import { REPORTS, runReport, emptyParams } from '../src/lib/engine/reportdefs';
import { enrichClaims } from '../src/lib/engine/enrich';

const r = { columns: [{ key: 'a', label: 'Name' }, { key: 'b', label: 'Bal', type: 'money' as const }], rows: [{ a: '=HYPERLINK("x")', b: 1234.4 }, { a: 'x,"y"', b: 5 }], totals: { b: 1239.4 }, summary: [{ label: 'Open', value: '$1,239' }] };
const meta = { title: 'T <b>', filters: ['Client: A'], generatedAt: '2026-01-01' };
describe('export', () => {
  it('csv escapes and neutralises formulas', () => { const c = toCSV(r); expect(c).toContain("'=HYPERLINK"); expect(c).toContain('"x,""y"""'); expect(c).toContain('Total'); });
  it('formats', () => { expect(formatCell(0.256, 'pct')).toBe('26%'); expect(formatCell(1234.5, 'money')).toBe('$1,235'); });
  it('html escapes', () => expect(toHTML(r, meta)).toContain('T &lt;b&gt;'));
  it('xlsx is a zip', async () => { const b = await toXLSX(r, meta); const u = new Uint8Array(await b.arrayBuffer()); expect(String.fromCharCode(u[0], u[1])).toBe('PK'); });
  it('pdf has header', async () => { const b = await toPDF(r, meta); const u = new Uint8Array(await b.arrayBuffer()); expect(String.fromCharCode(...u.slice(0, 4))).toBe('%PDF'); });
  it('every report runs on empty data', () => {
    const ctx: any = { ecs: enrichClaims ? [] : [], claims: [], workLog: [], recoveries: [], batches: [], profiles: [], clients: [], config: [], carc: new Map(), violations: [], today: '2026-01-15', showPhi: false };
    for (const d of REPORTS) { const out = runReport(d.id, ctx, emptyParams('2026-01-15')); expect(out.result.columns.length, d.id).toBeGreaterThan(0); expect(Array.isArray(out.result.rows)).toBe(true); }
  });
});
