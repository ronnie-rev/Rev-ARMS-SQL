// Word (.docx) → editable HTML + plain text, without a DOM (works in the browser and in tests). Covers what billing documents actually use:
// headings, paragraphs, bold / italic / underline, alignment, bullet and numbered lists, tables, inline pictures, line breaks and tabs.
import JSZip from 'jszip';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const attr = (tag: string, name: string) => { const m = new RegExp(`${name}="([^"]*)"`).exec(tag); return m ? m[1] : null; };
const on = (rpr: string, tag: string) => { const m = new RegExp(`<w:${tag}(?:\\s[^>]*)?/?>`).exec(rpr); if (!m) return false; const v = attr(m[0], 'w:val'); return v == null || !/^(0|false|none)$/i.test(v); };

export interface DocxOut { html: string; text: string; images: number; paragraphs: number; tables: number; warnings: string[] }
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' };

export async function docxToHtml(data: ArrayBuffer | Uint8Array): Promise<DocxOut> {
  const zip = await JSZip.loadAsync(data); const docFile = zip.file('word/document.xml'); if (!docFile) throw new Error('This is not a Word (.docx) file — save older .doc files as .docx first.');
  const xml = await docFile.async('string'); const warnings: string[] = [];
  const rels = new Map<string, string>(); const relXml = await zip.file('word/_rels/document.xml.rels')?.async('string'); if (relXml) for (const m of relXml.matchAll(/<Relationship\b[^>]*>/g)) { const id = attr(m[0], 'Id'), tg = attr(m[0], 'Target'); if (id && tg) rels.set(id, tg); }
  // numbering: numId → ordered?
  const ordered = new Map<string, boolean>(); const numXml = await zip.file('word/numbering.xml')?.async('string');
  if (numXml) { const abs = new Map<string, boolean>(); for (const m of numXml.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[\s\S]*?<\/w:abstractNum>/g)) { const f = /<w:lvl\b[^>]*w:ilvl="0"[\s\S]*?<w:numFmt w:val="([^"]+)"/.exec(m[0]); abs.set(m[1], !!f && f[1] !== 'bullet'); } for (const m of numXml.matchAll(/<w:num\b[^>]*w:numId="(\d+)"[\s\S]*?<w:abstractNumId w:val="(\d+)"/g)) ordered.set(m[1], abs.get(m[2]) ?? false); }
  let images = 0; const imgCache = new Map<string, string>();
  const imageFor = async (rid: string) => { if (imgCache.has(rid)) return imgCache.get(rid)!; const tg = rels.get(rid); if (!tg) return ''; const path = tg.startsWith('/') ? tg.slice(1) : 'word/' + tg.replace(/^\.\//, ''); const f = zip.file(path); if (!f) return ''; const ext = (path.split('.').pop() || '').toLowerCase(); if (!MIME[ext]) { warnings.push(`A ${ext} picture could not be shown.`); return ''; } const b64 = await f.async('base64'); const url = `data:${MIME[ext]};base64,${b64}`; imgCache.set(rid, url); return url; };

  const runs = async (p: string): Promise<{ html: string; text: string }> => {
    let html = '', text = '';
    for (const r of p.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
      const body = r[1]; const rpr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(body)?.[1] || ''; const b = on(rpr, 'b'), i = on(rpr, 'i'), u = on(rpr, 'u') && !/<w:u w:val="none"/.test(rpr);
      let h = '', t = '';
      for (const tok of body.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\b[^>]*\/>|<w:cr\s*\/>|<a:blip\b[^>]*r:embed="([^"]+)"/g)) {
        if (tok[1] != null) { const s = unesc(tok[1]); h += esc(s); t += s; } else if (/^<w:tab/.test(tok[0])) { h += '&emsp;'; t += '\t'; } else if (/^<w:(br|cr)/.test(tok[0])) { h += '<br>'; t += '\n'; } else if (tok[2]) { const url = await imageFor(tok[2]); if (url) { images++; h += `<img src="${url}" alt="">`; } }
      }
      if (!h) continue; if (u) h = `<u>${h}</u>`; if (i) h = `<em>${h}</em>`; if (b) h = `<strong>${h}</strong>`; html += h; text += t;
    }
    return { html, text };
  };
  const para = async (p: string) => {
    const ppr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(p)?.[1] || ''; const style = attr(/<w:pStyle\b[^>]*>/.exec(ppr)?.[0] || '', 'w:val') || ''; const jc = attr(/<w:jc\b[^>]*>/.exec(ppr)?.[0] || '', 'w:val');
    const num = /<w:numPr>[\s\S]*?<\/w:numPr>/.exec(ppr)?.[0]; const numId = num ? attr(/<w:numId\b[^>]*>/.exec(num)?.[0] || '', 'w:val') : null;
    const { html, text } = await runs(p); const lvl = /^(?:Heading|heading)\s?(\d)$/.exec(style) || /^Title$/i.exec(style); const level = lvl ? (lvl[1] ? Math.min(+lvl[1], 4) : 1) : 0;
    const align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' ? 'justify' : ''; return { html, text, level, align, list: numId && numId !== '0' ? (ordered.get(numId) ? 'ol' : 'ul') : '' };
  };

  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] || xml; let out = '', txt = ''; let paragraphs = 0, tables = 0; let openList = '';
  const closeList = () => { if (openList) { out += `</${openList}>`; openList = ''; } };
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g)) {
    const blk = m[0];
    if (blk.startsWith('<w:tbl>')) {
      closeList(); tables++; let rows = ''; let trows = '';
      for (const tr of blk.matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)) { let cells = ''; const tcells: string[] = []; for (const tc of tr[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)) { const ps = [...tc[1].matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)]; const parts = await Promise.all(ps.map((x) => runs(x[0]))); cells += `<td>${parts.map((x) => x.html).filter(Boolean).join('<br>')}</td>`; tcells.push(parts.map((x) => x.text).join(' ').trim()); } rows += `<tr>${cells}</tr>`; trows += tcells.join('\t') + '\n'; }
      out += `<table><tbody>${rows}</tbody></table>`; txt += trows; continue;
    }
    paragraphs++; const p = await para(blk);
    if (p.list) { if (openList !== p.list) { closeList(); out += `<${p.list}>`; openList = p.list; } out += `<li>${p.html}</li>`; txt += `${p.list === 'ul' ? '• ' : ''}${p.text}\n`; continue; }
    closeList(); const style = p.align ? ` style="text-align:${p.align}"` : ''; out += p.level ? `<h${Math.max(2, p.level + 1)}${style}>${p.html}</h${Math.max(2, p.level + 1)}>` : `<p${style}>${p.html || '<br>'}</p>`; txt += p.text + '\n';
  }
  closeList(); return { html: out, text: txt.replace(/\n{3,}/g, '\n\n').trim(), images, paragraphs, tables, warnings };
}
