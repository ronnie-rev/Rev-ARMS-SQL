// Editor HTML → Word (.docx) with tables, pictures, headings, lists, bold / italic / underline, alignment and links. DOM-free so it runs in the browser and in tests.
import { AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';

interface N { tag: string; attrs: Record<string, string>; kids: N[]; text?: string }
const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'col']);
const unesc = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&emsp;/g, '\t').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
/** Tiny well-formed-HTML parser (the editor always emits well-formed HTML). */
export function parseHtml(html: string): N[] {
  const root: N = { tag: 'root', attrs: {}, kids: [] }; const stack = [root]; const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*?)?)\s*(\/?)>|([^<]+)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[5] != null) { stack[stack.length - 1].kids.push({ tag: '#text', attrs: {}, kids: [], text: unesc(m[5]) }); continue; } if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) { for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; } continue; }
    const attrs: Record<string, string> = {}; for (const a of (m[3] || '').matchAll(/([a-zA-Z-:]+)\s*=\s*"([^"]*)"|([a-zA-Z-:]+)\s*=\s*'([^']*)'/g)) attrs[(a[1] || a[3]).toLowerCase()] = unesc(a[2] ?? a[4] ?? '');
    const n: N = { tag, attrs, kids: [] }; stack[stack.length - 1].kids.push(n); if (!VOID.has(tag) && !m[4]) stack.push(n);
  }
  return root.kids;
}

/** Width / height of a PNG or JPEG from its header bytes. */
export function imgSize(b: Uint8Array): { w: number; h: number; type: 'png' | 'jpg' } | null {
  if (b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23], type: 'png' };
  if (b[0] === 0xff && b[1] === 0xd8) { let i = 2; while (i < b.length - 9) { if (b[i] !== 0xff) { i++; continue; } const mk = b[i + 1]; if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], type: 'jpg' }; i += 2 + ((b[i + 2] << 8) | b[i + 3]); } }
  return null;
}
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
interface St { b?: boolean; i?: boolean; u?: boolean; color?: string; size?: number; link?: boolean }
const align = (n: N) => { const s = /text-align:\s*(\w+)/.exec(n.attrs.style || '')?.[1] || n.attrs.align; return s === 'center' ? AlignmentType.CENTER : s === 'right' ? AlignmentType.RIGHT : s === 'justify' ? AlignmentType.JUSTIFIED : undefined; };

export interface DocxOpts { font?: string; sizePt?: number; title?: string; margins?: number }
export async function htmlToDocx(html: string, o: DocxOpts = {}): Promise<Blob> {
  const font = o.font || 'Calibri'; const size = Math.round((o.sizePt || 11) * 2); const tree = parseHtml(html); const numbering: { reference: string; levels: any[] }[] = []; let olCount = 0;
  const inline = (nodes: N[], st: St): (TextRun | ImageRun)[] => {
    const out: (TextRun | ImageRun)[] = [];
    for (const n of nodes) {
      if (n.tag === '#text') { const t = n.text || ''; if (t) out.push(new TextRun({ text: t, bold: st.b, italics: st.i, underline: st.u || st.link ? {} : undefined, color: st.link ? '0563C1' : st.color, font, size: st.size || size })); continue; }
      if (n.tag === 'br') { out.push(new TextRun({ break: 1, font, size })); continue; }
      if (n.tag === 'img') { const m = /^data:image\/(png|jpe?g);base64,(.*)$/.exec(n.attrs.src || ''); if (!m) continue; try { const data = b64(m[2]); const sz = imgSize(data); const k = sz ? Math.min(1, 600 / Math.max(1, sz.w)) : 1; out.push(new ImageRun({ data, type: m[1] === 'png' ? 'png' : 'jpg', transformation: { width: Math.round((sz?.w || 300) * k), height: Math.round((sz?.h || 200) * k) } } as any)); } catch { /* skip bad picture */ } continue; }
      const next: St = { ...st }; if (n.tag === 'strong' || n.tag === 'b') next.b = true; if (n.tag === 'em' || n.tag === 'i') next.i = true; if (n.tag === 'u') next.u = true; if (n.tag === 'a') next.link = true; const c = /(?:^|;)\s*color:\s*#?([0-9a-fA-F]{6})/.exec(n.attrs.style || ''); if (c) next.color = c[1]; if (n.tag === 'code') next.size = size - 2;
      out.push(...inline(n.kids, next));
    }
    return out;
  };
  const para = (n: N, extra: Record<string, unknown> = {}, st: St = {}) => new Paragraph({ children: inline(n.kids, st), alignment: align(n), spacing: { after: 120 }, ...extra });
  const blocks = (nodes: N[], depth = 0): (Paragraph | Table)[] => {
    const out: (Paragraph | Table)[] = []; let loose: N[] = []; const flush = () => { if (loose.some((x) => x.tag !== '#text' || (x.text || '').trim())) out.push(new Paragraph({ children: inline(loose, {}), spacing: { after: 120 } })); loose = []; };
    for (const n of nodes) {
      switch (n.tag) {
        case 'p': case 'div': flush(); if (n.kids.some((k) => ['p', 'table', 'ul', 'ol', 'h1', 'h2', 'h3'].includes(k.tag))) out.push(...blocks(n.kids, depth)); else out.push(para(n)); break;
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': { flush(); const lv = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3, h4: HeadingLevel.HEADING_4, h5: HeadingLevel.HEADING_5, h6: HeadingLevel.HEADING_6 }[n.tag]!; out.push(para(n, { heading: lv }, { b: true })); break; }
        case 'blockquote': flush(); for (const p of blocks(n.kids, depth)) out.push(p); break;
        case 'hr': flush(); out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } }, children: [] })); break;
        case 'ul': case 'ol': { flush(); const ref = n.tag === 'ol' ? `ol${++olCount}` : ''; if (ref) numbering.push({ reference: ref, levels: [0, 1, 2, 3].map((level) => ({ level, format: 'decimal' as const, text: `%${level + 1}.`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } } })) });
          for (const li of n.kids.filter((k) => k.tag === 'li')) { const inner = li.kids.filter((k) => ['ul', 'ol'].includes(k.tag)); const own = li.kids.filter((k) => !['ul', 'ol'].includes(k.tag)); const flat: N[] = own.flatMap((k) => (k.tag === 'p' ? k.kids : [k])); out.push(new Paragraph({ children: inline(flat, {}), spacing: { after: 60 }, ...(ref ? { numbering: { reference: ref, level: Math.min(depth, 3) } } : { bullet: { level: Math.min(depth, 3) } }) })); if (inner.length) out.push(...blocks(inner, depth + 1)); } break; }
        case 'table': { flush(); const rows: TableRow[] = []; const walk = (ns: N[]) => { for (const r of ns) { if (r.tag === 'tr') rows.push(new TableRow({ children: r.kids.filter((c) => c.tag === 'td' || c.tag === 'th').map((c) => new TableCell({ children: (blocks(c.kids, depth).length ? blocks(c.kids, depth) : [new Paragraph('')]) as any, shading: c.tag === 'th' ? { type: ShadingType.CLEAR, fill: 'EEF2F7', color: 'auto' } : undefined, columnSpan: c.attrs.colspan ? +c.attrs.colspan : undefined, width: { size: 0, type: WidthType.AUTO } })) })); else if (['tbody', 'thead', 'tfoot'].includes(r.tag)) walk(r.kids); } }; walk(n.kids); if (rows.length) { out.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })); out.push(new Paragraph({ children: [], spacing: { after: 80 } })); } break; }
        default: loose.push(n);
      }
    }
    flush(); return out;
  };
  const children = blocks(tree); if (!children.length) children.push(new Paragraph(''));
  const m = o.margins ?? 1440; const doc = new Document({ title: o.title, creator: 'Revantage ClaimsIQ', numbering: { config: numbering }, sections: [{ properties: { page: { margin: { top: m, bottom: m, left: m, right: m } } }, children }] });
  return Packer.toBlob(doc);
}
