import { describe, expect, it } from 'vitest';
import { tablePdf } from '../src/lib/pdf/tablePdf';
describe('table PDF', () => {
  it('builds a multi-section PDF with autotable and survives odd cell values', async () => {
    const blob = await tablePdf({ title: 'Test', subtitle: 'sub', sections: [{ title: 'A', head: ['x', 'y'], rows: [[1, 'two'], [null, undefined], ['=SUM(A1)', 'a\u0001b']] }, { head: ['k'], rows: Array.from({ length: 120 }, (_, i) => [i]) }] });
    const buf = new Uint8Array(await blob.arrayBuffer()); expect(String.fromCharCode(...buf.slice(0, 5))).toBe('%PDF-'); expect(buf.length).toBeGreaterThan(2000);
  });
});
