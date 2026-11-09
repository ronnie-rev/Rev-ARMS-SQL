/** Rich-text letter (HTML from the editor) → PDF with jsPDF. Handles paragraphs, headings, bold/italic/underline, bullet + numbered lists, alignment. */
type Run = { text: string; bold?: boolean; italic?: boolean };
interface Block { runs: Run[]; size: number; align: 'left' | 'center' | 'right' | 'justify'; indent: number; bullet?: string; gap: number }

function runsOf(n: Node, st: { bold?: boolean; italic?: boolean }, out: Run[]) {
  if (n.nodeType === 3) { const t = (n.textContent || '').replace(/\s+/g, ' '); if (t) out.push({ text: t, ...st }); return; }
  if (!(n instanceof HTMLElement)) return; const tag = n.tagName.toLowerCase();
  if (tag === 'br') { out.push({ text: '\n', ...st }); return; }
  const next = { bold: st.bold || tag === 'strong' || tag === 'b', italic: st.italic || tag === 'em' || tag === 'i' };
  n.childNodes.forEach((c) => runsOf(c, next, out));
}
export function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html'); const blocks: Block[] = [];
  const align = (e: HTMLElement) => ((e.style.textAlign || 'left') as Block['align']);
  const walk = (parent: Element, indent: number) => parent.childNodes.forEach((n) => {
    if (!(n instanceof HTMLElement)) return; const tag = n.tagName.toLowerCase();
    if (tag === 'ul' || tag === 'ol') { let i = 1; n.childNodes.forEach((li) => { if (li instanceof HTMLElement && li.tagName.toLowerCase() === 'li') { const runs: Run[] = []; li.childNodes.forEach((c) => { if (!(c instanceof HTMLElement && /^(ul|ol)$/i.test(c.tagName))) runsOf(c, {}, runs); }); blocks.push({ runs, size: 11, align: 'left', indent: indent + 18, bullet: tag === 'ul' ? '•' : `${i++}.`, gap: 2 }); li.querySelectorAll(':scope > ul, :scope > ol').forEach((sub) => walk(sub.parentElement!, indent + 18)); } }); return; }
    if (/^h[1-3]$/.test(tag)) { const runs: Run[] = []; runsOf(n, { bold: true }, runs); blocks.push({ runs, size: tag === 'h1' ? 16 : tag === 'h2' ? 14 : 12, align: align(n), indent, gap: 6 }); return; }
    if (tag === 'p' || tag === 'blockquote' || tag === 'div') { const runs: Run[] = []; runsOf(n, {}, runs); blocks.push({ runs: runs.length ? runs : [{ text: ' ' }], size: 11, align: align(n), indent, gap: 6 }); }
  });
  walk(doc.body, 0); return blocks;
}
export interface PdfLetterhead { name?: string; address?: string; phone?: string; fax?: string; npi?: string; taxId?: string; logo?: string; logoTextOnly?: boolean }
export async function letterToPdf(html: string, opts: { title?: string; margin?: number; logo?: string; letterhead?: PdfLetterhead; fallbackName?: string } = {}): Promise<Blob> {
  const { jsPDF } = await import('jspdf'); const pdf = new jsPDF({ unit: 'pt', format: 'letter' }); const m = opts.margin ?? 64; const W = pdf.internal.pageSize.getWidth() - m * 2; const H = pdf.internal.pageSize.getHeight() - m; let y = m;
  if (opts.title) pdf.setProperties({ title: opts.title });
  const lh = opts.letterhead;
  if (lh) { // left-aligned letterhead like the original Appeal Forge letters: logo (or name) left, address/contact beside it, heavy rule
    const lines = [lh.address || '', [lh.phone && `Phone ${lh.phone}`, lh.fax && `Fax ${lh.fax}`].filter(Boolean).join('   ·   '), [lh.npi && `Group NPI ${lh.npi}`, lh.taxId && `TIN ${lh.taxId}`].filter(Boolean).join('   ·   ')].filter(Boolean);
    let hasLogo = false; let lw = 0; let lhh = 0;
    if (lh.logo && !lh.logoTextOnly) { try { const pr = pdf.getImageProperties(lh.logo); const mh = 46, mw = 170; const sc = Math.min(mh / pr.height, mw / pr.width); lw = pr.width * sc; lhh = pr.height * sc; pdf.addImage(lh.logo, pr.fileType || 'PNG', m, y - 8, lw, lhh); hasLogo = true; } catch { /* unreadable logo — text letterhead only */ } }
    pdf.setFont('times', 'normal').setFontSize(9.5).setTextColor(51, 65, 85);
    if (hasLogo) { const tx = m + lw + 14; const wrapped = lines.flatMap((t) => pdf.splitTextToSize(t, W - lw - 14) as string[]); const th = wrapped.length * 12; let ty = y - 8 + Math.max(0, (lhh - th) / 2) + 9; for (const l of wrapped) { pdf.text(l, tx, ty); ty += 12; } y += Math.max(lhh, th) - 2; }
    else { pdf.setFont('times', 'bold').setFontSize(16).setTextColor(17, 24, 39); pdf.text(lh.name || opts.fallbackName || 'Practice', m, y + 10); y += 22; pdf.setFont('times', 'normal').setFontSize(9.5).setTextColor(51, 65, 85); for (const t of lines) for (const l of pdf.splitTextToSize(t, W)) { pdf.text(l, m, y + 8); y += 12; } }
    y += 6; pdf.setDrawColor(17, 24, 39).setLineWidth(1.6).line(m, y, m + W, y); y += 18; pdf.setTextColor(0, 0, 0);
  } else if (opts.logo) { try { const props = pdf.getImageProperties(opts.logo); const w = 130, h = Math.min(60, (props.height / props.width) * w); pdf.addImage(opts.logo, 'PNG', m, y - 20, w, h); y += h - 4; } catch { /* unreadable logo — letter still exports */ } }
  for (const b of htmlToBlocks(html)) {
    const lh = b.size * 1.35; const x0 = m + b.indent; const maxW = W - b.indent;
    // split runs into words with their style, then wrap
    const words: { w: string; bold?: boolean; italic?: boolean; nl?: boolean }[] = []; for (const r of b.runs) { if (r.text === '\n') { words.push({ w: '', nl: true }); continue; } for (const w of r.text.split(/(\s+)/)) if (w) words.push({ w, bold: r.bold, italic: r.italic }); }
    const font = (w: { bold?: boolean; italic?: boolean }) => { pdf.setFont('times', w.bold && w.italic ? 'bolditalic' : w.bold ? 'bold' : w.italic ? 'italic' : 'normal'); pdf.setFontSize(b.size); };
    const lines: { w: string; bold?: boolean; italic?: boolean }[][] = [[]]; let cur = 0;
    for (const w of words) { if (w.nl) { lines.push([]); cur = 0; continue; } font(w); const wd = pdf.getTextWidth(w.w); if (cur + wd > maxW && w.w.trim() && lines[lines.length - 1].length) { lines.push([]); cur = 0; } if (!lines[lines.length - 1].length && !w.w.trim()) continue; lines[lines.length - 1].push(w); cur += wd; }
    lines.forEach((ln, li) => {
      if (y + lh > H) { pdf.addPage(); y = m; }
      if (b.bullet && li === 0) { pdf.setFont('times', 'normal'); pdf.setFontSize(b.size); pdf.text(b.bullet, x0 - 14, y + b.size); }
      const total = ln.reduce((a, w) => { font(w); return a + pdf.getTextWidth(w.w); }, 0); let x = b.align === 'center' ? x0 + (maxW - total) / 2 : b.align === 'right' ? x0 + maxW - total : x0;
      for (const w of ln) { font(w); pdf.text(w.w, x, y + b.size); x += pdf.getTextWidth(w.w); }
      y += lh;
    });
    y += b.gap;
  }
  return pdf.output('blob');
}
/** Plain text (old-style template) → editor HTML */
export const textToHtml = (t: string) => t.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('');
