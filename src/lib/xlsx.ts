// Excel (.xlsx) export via ExcelJS (MIT, pinned). Loaded on demand so it never slows the first page load. Runs entirely in the browser.
export interface XlsxSheet { name: string; rows: Record<string, string | number | boolean | null | undefined>[]; /** optional column order / widths */ columns?: { key: string; width?: number; format?: 'money' | 'int' | 'pct' | 'date' }[]; note?: string }
const safeName = (n: string) => n.replace(/[\\/*?:[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
const FORMAT = { money: '$#,##0.00;[Red]-$#,##0.00', int: '#,##0', pct: '0.0"%"', date: 'mm/dd/yyyy' } as const;
/** Cells that start with = + - @ are prefixed so a spreadsheet never treats imported text as a formula (CSV/Excel formula injection). */
const guard = (v: unknown) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? "'" + v : v);

export async function buildWorkbook(sheets: XlsxSheet[], meta: { title?: string; creator?: string } = {}) {
  const ExcelJS = (await import('exceljs')).default; const wb = new ExcelJS.Workbook(); wb.creator = meta.creator || 'ClaimsIQ'; wb.created = new Date(); if (meta.title) wb.title = meta.title;
  const used = new Set<string>();
  for (const s of sheets) {
    let name = safeName(s.name); for (let i = 2; used.has(name.toLowerCase()); i++) name = safeName(s.name).slice(0, 28) + ' ' + i; used.add(name.toLowerCase());
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: s.note ? 2 : 1 }] }); const keys = s.columns?.map((c) => c.key) || [...new Set(s.rows.flatMap((r) => Object.keys(r)))];
    let r0 = 1; if (s.note) { ws.getCell(1, 1).value = s.note; ws.getCell(1, 1).font = { italic: true, color: { argb: 'FF64748B' } }; r0 = 2; }
    const head = ws.getRow(r0); keys.forEach((k, i) => { const c = head.getCell(i + 1); c.value = k; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; c.alignment = { vertical: 'middle' }; }); head.height = 20;
    s.rows.forEach((row, ri) => { const wr = ws.getRow(r0 + 1 + ri); keys.forEach((k, i) => { const v = row[k]; wr.getCell(i + 1).value = (v === undefined || v === null || v === '' ? null : (guard(v) as any)); const f = s.columns?.[i]?.format; if (f) wr.getCell(i + 1).numFmt = FORMAT[f]; }); });
    keys.forEach((k, i) => { const w = s.columns?.[i]?.width ?? Math.min(48, Math.max(10, k.length + 2, ...s.rows.slice(0, 200).map((r) => String(r[k] ?? '').length + 2))); ws.getColumn(i + 1).width = w; });
    if (s.rows.length) ws.autoFilter = { from: { row: r0, column: 1 }, to: { row: r0, column: keys.length } };
  }
  return wb;
}
export async function downloadXlsx(filename: string, sheets: XlsxSheet[], meta?: { title?: string; creator?: string }) {
  const wb = await buildWorkbook(sheets, meta); const buf = await wb.xlsx.writeBuffer(); const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename.endsWith('.xlsx') ? filename : filename + '.xlsx'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
