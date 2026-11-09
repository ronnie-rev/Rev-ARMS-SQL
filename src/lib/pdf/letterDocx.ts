/** Edited letter (HTML) → Word (.docx), so the letter can be finished in Word. docx is loaded on demand. */
type Run = { text: string; bold?: boolean; italics?: boolean; underline?: boolean; br?: boolean };
interface P { runs: Run[]; bullet?: boolean; num?: number; align?: 'left' | 'center' | 'right' | 'both' }
function runsOf(n: Node, st: Partial<Run>, out: Run[]) {
  if (n.nodeType === 3) { const t = (n.textContent || '').replace(/\s+/g, ' '); if (t.trim() || t === ' ') out.push({ text: t, ...st }); return; } if (!(n instanceof HTMLElement)) return; const tag = n.tagName.toLowerCase();
  if (tag === 'br') { out.push({ text: '', br: true }); return; } const next = { ...st, bold: st.bold || tag === 'strong' || tag === 'b', italics: st.italics || tag === 'em' || tag === 'i', underline: st.underline || tag === 'u' }; n.childNodes.forEach((c) => runsOf(c, next, out));
}
export function htmlToParas(html: string): P[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html'); const ps: P[] = [];
  doc.body.childNodes.forEach((n) => {
    if (!(n instanceof HTMLElement)) return; const tag = n.tagName.toLowerCase();
    if (tag === 'ul' || tag === 'ol') { let i = 1; n.querySelectorAll(':scope > li').forEach((li) => { const runs: Run[] = []; li.childNodes.forEach((c) => runsOf(c, {}, runs)); ps.push({ runs, bullet: tag === 'ul', num: tag === 'ol' ? i++ : undefined }); }); return; }
    const runs: Run[] = []; n.childNodes.forEach((c) => runsOf(c, /^h[1-3]$/.test(tag) ? { bold: true } : {}, runs)); ps.push({ runs: runs.length ? runs : [{ text: ' ' }], align: ((n.style.textAlign as P['align']) || 'left') });
  });
  return ps;
}
const dataUrlBytes = (u: string) => { const b = atob(u.split(',')[1] || ''); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
export async function letterToDocx(html: string, o: { font?: string; sizePt?: number; logo?: string; title?: string; letterhead?: { name?: string; address?: string; phone?: string; fax?: string; npi?: string; taxId?: string; logo?: string; logoTextOnly?: boolean }; fallbackName?: string } = {}): Promise<Blob> {
  const d = await import('docx'); const font = o.font || 'Times New Roman'; const size = (o.sizePt || 11) * 2; const children: any[] = [];
  const lh = o.letterhead;
  if (lh) { // left-aligned letterhead like the original Appeal Forge letters
    const lines = [lh.address, [lh.phone && `Phone ${lh.phone}`, lh.fax && `Fax ${lh.fax}`].filter(Boolean).join('   ·   '), [lh.npi && `Group NPI ${lh.npi}`, lh.taxId && `TIN ${lh.taxId}`].filter(Boolean).join('   ·   ')].filter(Boolean) as string[];
    const textParas = lines.map((t) => new d.Paragraph({ spacing: { after: 10 }, children: [new d.TextRun({ text: t, font, size: 19, color: '334155' })] }));
    let logoCell: any = null;
    if (lh.logo && !lh.logoTextOnly) { try { const img = new Image(); img.src = lh.logo; await img.decode().catch(() => {}); const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 3; const h = 46, w = Math.min(170, Math.round(h * ratio)); logoCell = new d.Paragraph({ children: [new d.ImageRun({ data: dataUrlBytes(lh.logo), transformation: { width: w, height: Math.round(w / ratio) } } as any)] }); } catch { /* bad logo */ } }
    if (logoCell) { const none = { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' }; const nb = { top: none, bottom: none, left: none, right: none }; children.push(new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, borders: { ...nb, insideHorizontal: none, insideVertical: none } as any, rows: [new d.TableRow({ children: [new d.TableCell({ borders: nb, width: { size: 38, type: d.WidthType.PERCENTAGE }, verticalAlign: d.VerticalAlign.CENTER, children: [logoCell] }), new d.TableCell({ borders: nb, width: { size: 62, type: d.WidthType.PERCENTAGE }, verticalAlign: d.VerticalAlign.CENTER, children: textParas })] })] })); }
    else { children.push(new d.Paragraph({ spacing: { after: 20 }, children: [new d.TextRun({ text: lh.name || o.fallbackName || 'Practice', bold: true, font, size: 32 })] }), ...textParas); }
    children.push(new d.Paragraph({ spacing: { after: 220 }, border: { bottom: { style: d.BorderStyle.SINGLE, size: 14, color: '111827', space: 4 } }, children: [] }));
  } else if (o.logo) { try { children.push(new d.Paragraph({ children: [new d.ImageRun({ data: dataUrlBytes(o.logo), transformation: { width: 130, height: 56 } } as any)], spacing: { after: 80 } })); } catch { /* bad logo */ } }
  for (const p of htmlToParas(html)) {
    const kids = p.runs.map((r) => (r.br ? new d.TextRun({ break: 1 }) : new d.TextRun({ text: r.text, bold: r.bold, italics: r.italics, underline: r.underline ? {} : undefined, font, size })));
    children.push(new d.Paragraph({ children: p.bullet ? kids : p.num ? [new d.TextRun({ text: `${p.num}. `, font, size }), ...kids] : kids, bullet: p.bullet ? { level: 0 } : undefined, indent: p.num ? { left: 360 } : undefined, spacing: { after: 140 }, alignment: p.align === 'center' ? d.AlignmentType.CENTER : p.align === 'right' ? d.AlignmentType.RIGHT : p.align === 'both' ? d.AlignmentType.JUSTIFIED : d.AlignmentType.LEFT }));
  }
  const doc = new d.Document({ title: o.title, creator: 'Revantage ClaimsIQ', sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children }] });
  return d.Packer.toBlob(doc);
}
