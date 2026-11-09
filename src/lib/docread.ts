// One entry point that turns any common document into text (and rows, for spreadsheets) — entirely in the browser.
// PDF text layers, Word (.docx), Excel (.xlsx), CSV/TSV, RTF, HTML, e-mail (.eml), plain text and X12 are read directly; scans and photos are flagged for local OCR.
import { docxToHtml } from './docx/docxhtml';

export type DocKind = 'pdf' | 'image' | 'docx' | 'xlsx' | 'csv' | 'rtf' | 'html' | 'eml' | 'text' | 'legacy' | 'unknown';
export interface Sheet { name: string; rows: string[][] }
export interface Extracted { kind: DocKind; text: string; sheets?: Sheet[]; needsOcr?: boolean; pages?: number; warning?: string }
export const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.csv,.tsv,.txt,.rtf,.htm,.html,.eml,.835,.edi,.x12,.doc,.xls';
export const MAX_BYTES = 25 * 1024 * 1024;

export function kindOf(name: string, type = ''): DocKind {
  const n = name.toLowerCase();
  if (/\.pdf$/.test(n) || type === 'application/pdf') return 'pdf'; if (/\.(png|jpe?g|webp|bmp)$/.test(n) || /^image\//.test(type)) return 'image'; if (/\.docx$/.test(n)) return 'docx'; if (/\.(xlsx|xlsm)$/.test(n)) return 'xlsx';
  if (/\.(csv|tsv)$/.test(n)) return 'csv'; if (/\.rtf$/.test(n)) return 'rtf'; if (/\.html?$/.test(n)) return 'html'; if (/\.eml$/.test(n)) return 'eml'; if (/\.(txt|835|edi|x12|md|log)$/.test(n) || type === 'text/plain') return 'text'; if (/\.(doc|xls|ppt|pptx)$/.test(n)) return 'legacy'; return 'unknown';
}

/** RFC-4180-ish CSV / TSV parser (quoted fields, embedded commas and newlines). */
export function parseCsv(text: string, delim?: string): string[][] {
  const t = text.replace(/^﻿/, ''); const d = delim || (t.split('\n', 1)[0].split('\t').length > t.split('\n', 1)[0].split(',').length ? '\t' : ','); const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === d) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; } else cur += c; }
  row.push(cur); if (row.some((x) => x.trim())) rows.push(row); return rows;
}
const sheetText = (sheets: Sheet[]) => sheets.map((s) => (sheets.length > 1 ? `# ${s.name}\n` : '') + s.rows.slice(0, 5000).map((r) => r.join('\t')).join('\n')).join('\n\n');
export function rtfToText(rtf: string): string {
  let s = rtf.replace(/\{\\\*[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '').replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\par[d]?\b ?/g, '\n').replace(/\\(?:line|tab)\b ?/g, (m) => (m.startsWith('\\tab') ? '\t' : '\n')).replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode(+n < 0 ? +n + 65536 : +n));
  s = s.replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, ''); return s.replace(/\n{3,}/g, '\n\n').trim();
}
export function htmlToPlain(html: string): string { return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(p|div|tr|h\d|li)>/gi, '\n').replace(/<\/t[dh]>/gi, '\t').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim(); }
export function emlToText(eml: string): string {
  const [head, ...rest] = eml.replace(/\r\n/g, '\n').split(/\n\n/); const body = rest.join('\n\n'); const hdr = (k: string) => new RegExp(`^${k}:\\s*(.+)$`, 'im').exec(head)?.[1]?.trim();
  const qp = (s: string) => s.replace(/=\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  let text = body; const plain = /Content-Type:\s*text\/plain[\s\S]*?\n\n([\s\S]*?)(?=\n--|$)/i.exec(body); const html = /Content-Type:\s*text\/html[\s\S]*?\n\n([\s\S]*?)(?=\n--|$)/i.exec(body);
  if (plain) text = plain[1]; else if (html) text = htmlToPlain(html[1]); else if (/<html|<body|<p>/i.test(body)) text = htmlToPlain(body);
  if (/quoted-printable/i.test(eml)) text = qp(text); return [`From: ${hdr('From') || ''}`, `To: ${hdr('To') || ''}`, `Date: ${hdr('Date') || ''}`, `Subject: ${hdr('Subject') || ''}`, '', text.trim()].join('\n');
}

/** Reads any supported file. Scans / photos come back with `needsOcr` so the caller can run the local OCR engine. */
export async function extractText(file: File): Promise<Extracted> {
  if (file.size > MAX_BYTES) throw new Error(`File is over ${MAX_BYTES / 1024 / 1024} MB`); const kind = kindOf(file.name, file.type);
  switch (kind) {
    case 'image': return { kind, text: '', needsOcr: true };
    case 'pdf': {
      const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; let out = ''; const n = Math.min(doc.numPages, 40);
      for (let i = 1; i <= n; i++) { const pg = await doc.getPage(i); const tc = await pg.getTextContent(); out += tc.items.map((x: any) => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n'; }
      const pages = doc.numPages; await (doc as any).destroy?.(); const s = out.replace(/\s+/g, ' ').trim(); const good = s.length >= 80 && (s.match(/[A-Za-z]/g) || []).length / s.length > 0.45; return { kind, text: good ? out : '', needsOcr: !good, pages };
    }
    case 'docx': { const r = await docxToHtml(await file.arrayBuffer()); return { kind, text: r.text, warning: r.text.trim() ? undefined : 'No readable text — the document may contain only pictures. Export it to PDF and use OCR.' }; }
    case 'xlsx': {
      const ExcelJS = (await import('exceljs')).default; const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer()); const sheets: Sheet[] = [];
      wb.eachSheet((ws) => { const rows: string[][] = []; ws.eachRow({ includeEmpty: false }, (row) => { const vals: string[] = []; const n = row.cellCount; for (let c = 1; c <= n; c++) { const v: any = row.getCell(c).value; vals.push(v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'object' ? String(v.text ?? v.result ?? (v.richText ? v.richText.map((x: any) => x.text).join('') : '')) : String(v)); } rows.push(vals); }); if (rows.length) sheets.push({ name: ws.name, rows }); });
      return { kind, text: sheetText(sheets), sheets };
    }
    case 'csv': { const rows = parseCsv(await file.text()); return { kind, text: rows.map((r) => r.join('\t')).join('\n'), sheets: [{ name: file.name, rows }] }; }
    case 'rtf': return { kind, text: rtfToText(await file.text()) };
    case 'html': return { kind, text: htmlToPlain(await file.text()) };
    case 'eml': return { kind, text: emlToText(await file.text()) };
    case 'text': return { kind, text: await file.text() };
    case 'legacy': return { kind, text: '', warning: 'Older .doc / .xls / .ppt files cannot be read in the browser. Open it in Word or Excel and Save As .docx / .xlsx (or PDF), then drop it again.' };
    default: return { kind, text: '', warning: 'This file type is not supported. Use PDF, image, Word (.docx), Excel (.xlsx), CSV, RTF, HTML, e-mail (.eml) or text.' };
  }
}
