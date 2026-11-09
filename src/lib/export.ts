import type { Column, ReportResult } from './engine/reportdefs';
import { usDate } from './utils';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf' | 'html' | 'json' | 'print';
export interface ExportMeta { title: string; subtitle?: string; filters?: string[]; generatedAt?: string }

const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export function formatCell(v: any, type?: Column['type']): string {
  if (v === null || v === undefined || v === '') return '';
  switch (type) {
    case 'money': return fmtMoney(Number(v) || 0);
    case 'pct': return Math.round((Number(v) || 0) * 100) + '%';
    case 'int': return Math.round(Number(v) || 0).toLocaleString('en-US');
    case 'days': return String(Math.round(Number(v) || 0));
    case 'num1': return (Number(v) || 0).toFixed(1);
    case 'date': return usDate(v);
    default: return usDate(v);
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
// Neutralise spreadsheet formula injection for text cells.
const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);
const csvCell = (s: string) => (/[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);

/** Raw (machine-readable) value: numbers stay numbers, pct stays a fraction. */
const raw = (v: any, type?: Column['type']) => type === 'date' || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? usDate(v) : (['money', 'int', 'days', 'num1', 'pct'].includes(type || '') ? (v === '' || v == null ? '' : Number(v) || 0) : v == null ? '' : String(v));

export function toCSV(r: ReportResult): string {
  const lines = [r.columns.map((c) => csvCell(c.label)).join(',')];
  for (const row of r.rows) lines.push(r.columns.map((c) => { const v = raw(row[c.key], c.type); return csvCell(typeof v === 'number' ? String(v) : safe(v)); }).join(','));
  if (r.totals) lines.push(r.columns.map((c, i) => (i === 0 ? 'Total' : r.totals![c.key] != null ? String(raw(r.totals![c.key], c.type)) : '')).join(','));
  return '﻿' + lines.join('\r\n');
}

export function toJSON(r: ReportResult, meta: ExportMeta): string {
  return JSON.stringify({ title: meta.title, generatedAt: meta.generatedAt, filters: meta.filters, summary: r.summary, columns: r.columns, rows: r.rows, totals: r.totals }, null, 2);
}

export function toHTML(r: ReportResult, meta: ExportMeta): string {
  const th = r.columns.map((c) => `<th class="${c.type && c.type !== 'text' && c.type !== 'date' ? 'n' : ''}">${esc(c.label)}</th>`).join('');
  const body = r.rows.map((row) => `<tr>${r.columns.map((c) => `<td class="${c.type && c.type !== 'text' && c.type !== 'date' ? 'n' : ''}">${esc(formatCell(row[c.key], c.type))}</td>`).join('')}</tr>`).join('');
  const foot = r.totals ? `<tr class="t">${r.columns.map((c, i) => `<td class="${i ? 'n' : ''}">${i === 0 ? 'Total' : r.totals![c.key] != null ? esc(formatCell(r.totals![c.key], c.type)) : ''}</td>`).join('')}</tr>` : '';
  const kpis = r.summary.map((s) => `<div class="k"><div class="kl">${esc(s.label)}</div><div class="kv">${esc(s.value)}</div></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(meta.title)}</title><style>
body{font:13px/1.45 -apple-system,Segoe UI,Inter,sans-serif;color:#1f2937;margin:32px}h1{font-size:20px;margin:0 0 2px}.s{color:#6b7280;margin-bottom:14px}.f{font-size:11px;color:#6b7280;margin-bottom:12px}
.ks{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}.k{border:1px solid #e5e7eb;border-radius:10px;padding:8px 14px}.kl{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280}.kv{font-size:18px;font-weight:600}
table{border-collapse:collapse;width:100%}th{background:#f3f4f6;text-align:left;font-size:11px;padding:6px 8px;border-bottom:1px solid #d1d5db}td{padding:5px 8px;border-bottom:1px solid #eef0f3}.n{text-align:right;font-variant-numeric:tabular-nums}tr.t td{font-weight:600;border-top:2px solid #9ca3af}
@media print{body{margin:12mm}}</style></head><body><h1>${esc(meta.title)}</h1><div class="s">${esc(meta.subtitle || '')}</div>${meta.filters?.length ? `<div class="f">${meta.filters.map(esc).join(' · ')}</div>` : ''}<div class="ks">${kpis}</div><table><thead><tr>${th}</tr></thead><tbody>${body}${foot}</tbody></table><div class="f" style="margin-top:14px">Generated ${esc(meta.generatedAt || '')}</div></body></html>`;
}

export async function toXLSX(r: ReportResult, meta: ExportMeta): Promise<Blob> {
  const { default: writeXlsx } = await import('write-excel-file/universal');
  const head = r.columns.map((c) => ({ value: c.label, fontWeight: 'bold' as const, backgroundColor: '#E5E7EB' }));
  const cell = (v: any, c: Column) => {
    const t = c.type; const x = raw(v, t);
    if (x === '') return null;
    if (typeof x === 'number') return { value: x, type: Number, format: t === 'money' ? '[$$-409]#,##0' : t === 'pct' ? '0%' : t === 'num1' ? '0.0' : '#,##0' };
    return { value: safe(x), type: String };
  };
  const data: any[][] = [head, ...r.rows.map((row) => r.columns.map((c) => cell(row[c.key], c)))];
  if (r.totals) data.push(r.columns.map((c, i) => (i === 0 ? { value: 'Total', fontWeight: 'bold' } : r.totals![c.key] != null ? { ...(cell(r.totals![c.key], c) as any), fontWeight: 'bold' } : null)));
  const info: any[][] = [[{ value: meta.title, fontWeight: 'bold' }], [meta.subtitle || ''], ...(meta.filters || []).map((f) => [f]), [`Generated ${meta.generatedAt || ''}`], [], ...r.summary.map((s) => [s.label, s.value])];
  const out = await (writeXlsx as any)([{ data, sheet: 'Report', columns: r.columns.map((c) => ({ width: Math.max(10, Math.min(36, c.label.length + 4)) })), stickyRowsCount: 1 }, { data: info, sheet: 'Info' }]);
  return out.toBlob();
}

export async function toPDF(r: ReportResult, meta: ExportMeta): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: r.columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(); let y = 40;
  doc.setFont('helvetica', 'bold').setFontSize(16).text(meta.title, 40, y); y += 16;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110);
  if (meta.subtitle) { doc.text(meta.subtitle, 40, y); y += 12; }
  if (meta.filters?.length) { const l = doc.splitTextToSize(meta.filters.join('  ·  '), W - 80); doc.text(l, 40, y); y += l.length * 11; }
  y += 4; let x = 40;
  doc.setTextColor(30);
  for (const s of r.summary.slice(0, 6)) { doc.setFontSize(7).setTextColor(120).text(s.label.toUpperCase(), x, y); doc.setFontSize(12).setFont('helvetica', 'bold').setTextColor(30).text(s.value, x, y + 14); doc.setFont('helvetica', 'normal'); x += Math.max(90, (W - 80) / Math.max(1, Math.min(6, r.summary.length))); }
  y += 28;
  const num = (c: Column) => !!c.type && c.type !== 'text' && c.type !== 'date';
  autoTable(doc, {
    startY: y, head: [r.columns.map((c) => c.label)],
    body: r.rows.map((row) => r.columns.map((c) => formatCell(row[c.key], c.type))),
    foot: r.totals ? [r.columns.map((c, i) => (i === 0 ? 'Total' : r.totals![c.key] != null ? formatCell(r.totals![c.key], c.type) : ''))] : undefined,
    styles: { fontSize: 7.5, cellPadding: 3 }, headStyles: { fillColor: [55, 65, 81] }, footStyles: { fillColor: [243, 244, 246], textColor: 20 },
    columnStyles: Object.fromEntries(r.columns.map((c, i) => [i, { halign: num(c) ? 'right' : 'left' }])),
    didDrawPage: () => { doc.setFontSize(7).setTextColor(130).text(`Revantage ClaimsIQ · ${meta.title} · generated ${meta.generatedAt || ''} · page ${doc.getNumberOfPages()}`, 40, doc.internal.pageSize.getHeight() - 20); },
  } as any);
  return doc.output('blob');
}

export const fileName = (title: string, ext: string, date: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${date}.${ext}`;

export function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportReport(fmt: ExportFormat, r: ReportResult, meta: ExportMeta, date: string): Promise<void> {
  const m = { ...meta, generatedAt: meta.generatedAt || date };
  if (fmt === 'csv') return saveBlob(fileName(m.title, 'csv', date), new Blob([toCSV(r)], { type: 'text/csv;charset=utf-8' }));
  if (fmt === 'json') return saveBlob(fileName(m.title, 'json', date), new Blob([toJSON(r, m)], { type: 'application/json' }));
  if (fmt === 'html') return saveBlob(fileName(m.title, 'html', date), new Blob([toHTML(r, m)], { type: 'text/html' }));
  if (fmt === 'xlsx') return saveBlob(fileName(m.title, 'xlsx', date), await toXLSX(r, m));
  if (fmt === 'pdf') return saveBlob(fileName(m.title, 'pdf', date), await toPDF(r, m));
  const w = window.open('', '_blank'); w?.document.write(toHTML(r, m)); w?.document.close(); setTimeout(() => w?.print(), 300);
}
export async function copyTSV(r: ReportResult) {
  const t = [r.columns.map((c) => c.label).join('\t'), ...r.rows.map((row) => r.columns.map((c) => formatCell(row[c.key], c.type).replace(/\t/g, ' ')).join('\t'))].join('\n');
  await navigator.clipboard?.writeText(t);
}
