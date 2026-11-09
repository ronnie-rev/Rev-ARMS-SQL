import { PDFDocument } from 'pdf-lib';
import type { FaxCfg } from '../engine/fax';
import { formatFax } from '../engine/fax';

/** Cover sheet (page 1 of every fax): who it is for / from, how many pages, the claim reference (never a patient name) and a confidentiality notice. */
export async function coverSheetPdf(o: { cfg: FaxCfg; to: { name?: string; fax: string }; from: { practice?: string; person?: string; phone?: string; fax?: string }; pages: number; re: string; note?: string; logo?: string }): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf'); const d = new jsPDF({ unit: 'pt', format: 'letter' }); const m = 64; let y = 72;
  if (o.logo) { try { const pr = d.getImageProperties(o.logo); const w = 140, h = Math.min(64, (pr.height / pr.width) * w); d.addImage(o.logo, 'PNG', m, y - 24, w, h); y += h; } catch { /* ignore bad logo */ } }
  d.setFont('helvetica', 'bold').setFontSize(30).text('FAX', 612 - m, 80, { align: 'right' }); d.setFont('helvetica', 'bold').setFontSize(13).text(o.from.practice || '', m, y); y += 22;
  d.setDrawColor(180).line(m, y, 612 - m, y); y += 26;
  const row = (k: string, v: string) => { d.setFont('helvetica', 'bold').setFontSize(10).setTextColor(110).text(k.toUpperCase(), m, y); d.setFont('helvetica', 'normal').setFontSize(12).setTextColor(20).text(v || '—', m + 110, y); y += 26; };
  row('To', o.to.name || ''); row('Fax', formatFax(o.to.fax)); row('From', [o.from.person, o.from.practice].filter(Boolean).join(' — ')); row('Phone', o.from.phone || ''); row('Reply fax', o.from.fax || (o.cfg.fromNumber ? formatFax(o.cfg.fromNumber) : '')); row('Date', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })); row('Pages', `${o.pages} (including this cover)`); row('Re', o.re);
  y += 6; d.setFont('helvetica', 'bold').setFontSize(10).setTextColor(110).text('MESSAGE', m, y); y += 16; d.setFont('helvetica', 'normal').setFontSize(12).setTextColor(20); const note = d.splitTextToSize(o.note || o.cfg.coverNote, 612 - m * 2); d.text(note, m, y); y += note.length * 15 + 24;
  d.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(110); d.text(d.splitTextToSize(o.cfg.confidentiality, 612 - m * 2), m, 720);
  return new Uint8Array(d.output('arraybuffer'));
}
/** Merge cover + letter + payer form + supporting PDFs into one fax document. Returns the bytes and the page count. */
export async function mergePdfs(parts: Uint8Array[]): Promise<{ bytes: Uint8Array; pages: number }> {
  const out = await PDFDocument.create(); for (const p of parts) { const src = await PDFDocument.load(p, { ignoreEncryption: true }); const pg = await out.copyPages(src, src.getPageIndices()); pg.forEach((x) => out.addPage(x)); }
  return { bytes: await out.save(), pages: out.getPageCount() };
}
export const toB64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
