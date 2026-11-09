import { describe, expect, it } from 'vitest';
import { buildWorkbook } from '../src/lib/xlsx';
describe('xlsx export', () => {
  it('writes a styled, filtered workbook that reads back, with formula-injection guarded', async () => {
    const wb = await buildWorkbook([{ name: 'Clients: A/R?', rows: [{ Client: '=HYPERLINK("http://x")', Balance: 1234.5, Note: '-5' }, { Client: 'Plain', Balance: 10, Note: '' }], columns: [{ key: 'Client' }, { key: 'Balance', format: 'money' }, { key: 'Note' }], note: 'generated' }, { name: 'clients a r', rows: [{ A: 1 }] }]);
    const ExcelJS = (await import('exceljs')).default; const buf = await wb.xlsx.writeBuffer(); const back = new ExcelJS.Workbook(); await back.xlsx.load(buf as any);
    expect(back.worksheets.map((w) => w.name)).toEqual(['Clients A R', 'clients a r 2']);
    const ws = back.worksheets[0]; expect(ws.getCell(1, 1).value).toBe('generated'); expect(ws.getCell(2, 1).value).toBe('Client'); expect(ws.getCell(3, 1).value).toBe("'=HYPERLINK(\"http://x\")"); expect(ws.getCell(3, 2).value).toBe(1234.5); expect(ws.getCell(3, 2).numFmt).toContain('$');
    expect(ws.getCell(3, 3).value).toBe('-5'); expect(ws.autoFilter).toBeTruthy(); expect(ws.views[0].state).toBe('frozen');
  });
});
