// Branded table PDFs (jsPDF + jspdf-autotable, both MIT, loaded on demand): worklists, huddle, client packs. Runs entirely in the browser.
export interface PdfSection { title?: string; note?: string; head: string[]; rows: (string | number | null | undefined)[][]; widths?: number[]; align?: ('left' | 'right' | 'center')[] }
export interface PdfDoc { title: string; subtitle?: string; sections: PdfSection[]; landscape?: boolean; logo?: string; footer?: string }
/** Cells that would be read as spreadsheet formulas are irrelevant in PDF, but control characters are stripped so a pasted value can never break layout. */
const clean = (v: unknown) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 500);

export async function tablePdf(doc: PdfDoc): Promise<Blob> {
  const { jsPDF } = await import('jspdf'); const autoTable = (await import('jspdf-autotable')).default;
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: doc.landscape ? 'landscape' : 'portrait' }); const W = pdf.internal.pageSize.getWidth(); const m = 36; let y = m;
  pdf.setProperties({ title: doc.title });
  if (doc.logo) { try { const pr = pdf.getImageProperties(doc.logo); const h = 34, w = Math.min(120, (pr.width / pr.height) * h); pdf.addImage(doc.logo, pr.fileType || 'PNG', m, y - 8, w, h); } catch { /* unreadable logo */ } }
  pdf.setFont('helvetica', 'bold').setFontSize(16).setTextColor(30, 41, 59); pdf.text(doc.title, doc.logo ? m + 130 : m, y + 8); y += 14;
  if (doc.subtitle) { pdf.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(100, 116, 139); pdf.text(doc.subtitle, doc.logo ? m + 130 : m, y + 6); y += 10; }
  y += doc.logo ? 24 : 14;
  for (const s of doc.sections) {
    if (s.title) { if (y > pdf.internal.pageSize.getHeight() - 90) { pdf.addPage(); y = m; } pdf.setFont('helvetica', 'bold').setFontSize(11.5).setTextColor(30, 41, 59); pdf.text(s.title, m, y + 8); y += 14; }
    if (s.note) { pdf.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(100, 116, 139); pdf.text(pdf.splitTextToSize(s.note, W - m * 2), m, y + 6); y += 12; }
    autoTable(pdf, { startY: y, head: [s.head.map(clean)], body: s.rows.map((r) => r.map(clean)), margin: { left: m, right: m }, theme: 'striped', styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' }, headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [244, 245, 250] },
      columnStyles: Object.fromEntries((s.align || []).map((a, i) => [i, { halign: a, ...(s.widths?.[i] ? { cellWidth: s.widths[i] } : {}) }])), didDrawPage: () => { pdf.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(148, 163, 184); pdf.text(`${doc.footer || 'Revantage ClaimsIQ'} · ${new Date().toLocaleDateString('en-US')} · page ${pdf.getNumberOfPages()}`, m, pdf.internal.pageSize.getHeight() - 18); } });
    y = ((pdf as any).lastAutoTable?.finalY ?? y) + 18;
  }
  return pdf.output('blob');
}
