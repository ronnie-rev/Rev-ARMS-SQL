// PDF editing engine (pdf-lib): annotations burned into the file, page operations, merge / split, watermark, page / Bates numbers, metadata scrub, PHI finder.
// Annotation coordinates are PDF points from the top-left of the page AS DISPLAYED (after any /Rotate), so they stay correct on rotated pages.
import { PDFDocument, PDFName, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type FontName = 'Helvetica' | 'Times' | 'Courier';
interface Base { id: string; page: number }
export type Annot = Base & (
  | { kind: 'text'; x: number; y: number; w?: number; text: string; size: number; color: string; font: FontName; bold?: boolean; italic?: boolean }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; mode: 'highlight' | 'whiteout' | 'redact' | 'box'; color?: string }
  | { kind: 'draw'; pts: [number, number][]; color: string; width: number }
  | { kind: 'image'; x: number; y: number; w: number; h: number; dataUrl: string }
  | { kind: 'stamp'; x: number; y: number; text: string; color: string; size: number }
  | { kind: 'check'; x: number; y: number; size: number; color: string }
);
export const hexRgb = (hex: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0; return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const uid = () => Math.random().toString(36).slice(2, 10);
export const newId = uid;

/** View point (rotated page, top-left origin) → unrotated PDF point (bottom-left origin, what pdf-lib draws in). */
export function viewToPage(rot: number, W: number, H: number, vx: number, vy: number): [number, number] {
  const r = ((rot % 360) + 360) % 360; let X = vx, Y = vy;
  if (r === 90) { X = vy; Y = H - vx; } else if (r === 180) { X = W - vx; Y = H - vy; } else if (r === 270) { X = W - vy; Y = vx; }
  return [X, H - Y];
}
const fontFor = (n: FontName, bold?: boolean, italic?: boolean) => n === 'Times' ? (bold && italic ? StandardFonts.TimesRomanBoldItalic : bold ? StandardFonts.TimesRomanBold : italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman) : n === 'Courier' ? (bold && italic ? StandardFonts.CourierBoldOblique : bold ? StandardFonts.CourierBold : italic ? StandardFonts.CourierOblique : StandardFonts.Courier) : (bold && italic ? StandardFonts.HelveticaBoldOblique : bold ? StandardFonts.HelveticaBold : italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica);
/** Standard PDF fonts cover Latin-1 only: keep what encodes, swap common punctuation, replace the rest with "?" so saving never fails. */
export function safeText(font: PDFFont, s: string): string {
  const set = new Set(font.getCharacterSet()); const map: Record<string, string> = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '•': '•', ' ': ' ', '…': '...', '✓': 'v', '✔': 'v' };
  return [...s].map((c) => { if (c === '\n') return c; const cp = c.codePointAt(0)!; if (set.has(cp)) return c; const m = map[c]; if (m && [...m].every((x) => set.has(x.codePointAt(0)!))) return m; return '?'; }).join('');
}
function wrap(font: PDFFont, text: string, size: number, w?: number): string[] {
  const out: string[] = []; for (const para of text.split('\n')) { if (!w) { out.push(para); continue; } let line = ''; for (const word of para.split(' ')) { const t = line ? line + ' ' + word : word; if (line && font.widthOfTextAtSize(t, size) > w) { out.push(line); line = word; } else line = t; } out.push(line); } return out;
}

export interface ApplyOpts { /** Renders page `index` of `bytes` to a JPEG (used to flatten pages that contain redactions so the hidden text is really gone). */ rasterize?: (bytes: Uint8Array, index: number) => Promise<{ jpeg: Uint8Array; w: number; h: number }> }
/** Burns annotations into the PDF. Pages containing a redaction are flattened to an image when `rasterize` is supplied. */
export async function applyAnnots(bytes: Uint8Array, annots: Annot[], o: ApplyOpts = {}): Promise<Uint8Array> {
  if (!annots.length) return bytes; const doc = await PDFDocument.load(bytes, { ignoreEncryption: true }); const pages = doc.getPages(); const cache = new Map<string, PDFFont>(); const redactPages = new Set<number>();
  const font = async (n: FontName, b?: boolean, i?: boolean) => { const k = fontFor(n, b, i); if (!cache.has(k)) cache.set(k, await doc.embedFont(k)); return cache.get(k)!; };
  for (const a of annots) {
    const pg: PDFPage | undefined = pages[a.page]; if (!pg) continue; const W = pg.getWidth(), H = pg.getHeight(); const rot = pg.getRotation().angle; const P = (x: number, y: number) => viewToPage(rot, W, H, x, y); const rd = degrees(((rot % 360) + 360) % 360);
    const rectOf = (x: number, y: number, w: number, h: number) => { const [x1, y1] = P(x, y), [x2, y2] = P(x + w, y + h); return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }; };
    switch (a.kind) {
      case 'rect': { const r = rectOf(a.x, a.y, a.w, a.h); if (a.mode === 'highlight') pg.drawRectangle({ ...r, color: hexRgb(a.color || '#fde047'), opacity: 0.4 }); else if (a.mode === 'whiteout') pg.drawRectangle({ ...r, color: rgb(1, 1, 1) }); else if (a.mode === 'redact') { pg.drawRectangle({ ...r, color: rgb(0, 0, 0) }); redactPages.add(a.page); } else pg.drawRectangle({ ...r, borderColor: hexRgb(a.color || '#dc2626'), borderWidth: 1.5, opacity: 0 }); break; }
      case 'text': { const f = await font(a.font, a.bold, a.italic); const lines = wrap(f, safeText(f, a.text), a.size, a.w); lines.forEach((ln, i) => { const [px, py] = P(a.x, a.y + a.size * 0.86 + i * a.size * 1.2); if (ln) pg.drawText(ln, { x: px, y: py, size: a.size, font: f, color: hexRgb(a.color), rotate: rd }); }); break; }
      case 'draw': { for (let i = 1; i < a.pts.length; i++) { const [x1, y1] = P(a.pts[i - 1][0], a.pts[i - 1][1]), [x2, y2] = P(a.pts[i][0], a.pts[i][1]); pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: a.width, color: hexRgb(a.color), lineCap: 1 as any }); } break; }
      case 'image': { const png = /^data:image\/png/.test(a.dataUrl); const raw = Uint8Array.from(atob(a.dataUrl.split(',')[1] || ''), (c) => c.charCodeAt(0)); let img; try { img = png ? await doc.embedPng(raw) : await doc.embedJpg(raw); } catch { continue; } const [px, py] = P(a.x, a.y + a.h); pg.drawImage(img, { x: px, y: py, width: a.w, height: a.h, rotate: rd }); break; }
      case 'stamp': { const f = await font('Helvetica', true); const t = safeText(f, a.text.toUpperCase()); const w = f.widthOfTextAtSize(t, a.size) + 12, h = a.size + 10; const c = [P(a.x, a.y), P(a.x + w, a.y), P(a.x + w, a.y + h), P(a.x, a.y + h)]; for (let i = 0; i < 4; i++) pg.drawLine({ start: { x: c[i][0], y: c[i][1] }, end: { x: c[(i + 1) % 4][0], y: c[(i + 1) % 4][1] }, thickness: 2, color: hexRgb(a.color) }); const [tx, ty] = P(a.x + 6, a.y + 5 + a.size * 0.86); pg.drawText(t, { x: tx, y: ty, size: a.size, font: f, color: hexRgb(a.color), rotate: rd }); break; }
      case 'check': { const f = await font('Helvetica'); void f; const z = await doc.embedFont(StandardFonts.ZapfDingbats); const [px, py] = P(a.x, a.y + a.size * 0.86); pg.drawText('✔', { x: px, y: py, size: a.size, font: z, color: hexRgb(a.color), rotate: rd }); break; }
    }
  }
  let out = await doc.save();
  if (redactPages.size && o.rasterize) {
    const d2 = await PDFDocument.load(out); const order = [...redactPages].sort((a, b) => b - a);
    for (const idx of order) { const { jpeg, w, h } = await o.rasterize(out, idx); const img = await d2.embedJpg(jpeg); const page = d2.insertPage(idx, [w, h]); page.drawImage(img, { x: 0, y: 0, width: w, height: h }); d2.removePage(idx + 1); }
    out = await d2.save();
  }
  return out;
}

// ───────── page operations ─────────
export async function rotatePages(bytes: Uint8Array, idx: number[], delta: number): Promise<Uint8Array> { const d = await PDFDocument.load(bytes, { ignoreEncryption: true }); const ps = d.getPages(); for (const i of idx) if (ps[i]) ps[i].setRotation(degrees((((ps[i].getRotation().angle + delta) % 360) + 360) % 360)); return d.save(); }
export async function deletePages(bytes: Uint8Array, idx: number[]): Promise<Uint8Array> { const d = await PDFDocument.load(bytes, { ignoreEncryption: true }); if (idx.length >= d.getPageCount()) throw new Error('A PDF needs at least one page.'); for (const i of [...new Set(idx)].sort((a, b) => b - a)) d.removePage(i); return d.save(); }
export async function movePage(bytes: Uint8Array, from: number, to: number): Promise<Uint8Array> { const d = await PDFDocument.load(bytes, { ignoreEncryption: true }); const n = d.getPageCount(); if (from < 0 || from >= n || to < 0 || to >= n || from === to) return bytes; const [cp] = await d.copyPages(d, [from]); d.removePage(from); d.insertPage(to, cp); return d.save(); }
export async function duplicatePage(bytes: Uint8Array, i: number): Promise<Uint8Array> { const d = await PDFDocument.load(bytes, { ignoreEncryption: true }); const [cp] = await d.copyPages(d, [i]); d.insertPage(i + 1, cp); return d.save(); }
export async function insertBlank(bytes: Uint8Array, at: number): Promise<Uint8Array> { const d = await PDFDocument.load(bytes, { ignoreEncryption: true }); const ref = d.getPages()[Math.max(0, Math.min(at, d.getPageCount()) - 1)] || d.getPages()[0]; d.insertPage(at, [ref?.getWidth() || 612, ref?.getHeight() || 792]); return d.save(); }
export async function extractPages(bytes: Uint8Array, idx: number[]): Promise<Uint8Array> { const s = await PDFDocument.load(bytes, { ignoreEncryption: true }); const d = await PDFDocument.create(); for (const p of await d.copyPages(s, idx)) d.addPage(p); return d.save(); }
export async function mergePdfs(list: Uint8Array[]): Promise<Uint8Array> { const d = await PDFDocument.create(); for (const b of list) { const s = await PDFDocument.load(b, { ignoreEncryption: true }); for (const p of await d.copyPages(s, s.getPageIndices())) d.addPage(p); } return d.save(); }
/** "1-3, 5, 8-" → [[0,1,2],[4],[7..n-1]] (zero-based, in order, clipped to the page count). */
export function parseRanges(spec: string, n: number): number[][] { const out: number[][] = []; for (const part of spec.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) { const m = /^(\d*)\s*-\s*(\d*)$/.exec(part); let a: number, b: number; if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; } else if (/^\d+$/.test(part)) a = b = +part; else continue; a = Math.max(1, a); b = Math.min(n, b); if (a > b) continue; out.push(Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i)); } return out; }
export async function splitRanges(bytes: Uint8Array, spec: string): Promise<Uint8Array[]> { const d = await PDFDocument.load(bytes, { ignoreEncryption: true }); const r = parseRanges(spec, d.getPageCount()); if (!r.length) throw new Error('Enter page ranges like 1-3, 5, 8-'); const out: Uint8Array[] = []; for (const idx of r) out.push(await extractPages(bytes, idx)); return out; }
export async function newBlank(pages = 1, size: 'letter' | 'a4' = 'letter'): Promise<Uint8Array> { const d = await PDFDocument.create(); for (let i = 0; i < pages; i++) d.addPage(size === 'a4' ? [595.28, 841.89] : [612, 792]); return d.save(); }
/** Images → one PDF (each page sized to its image, fitted inside Letter). */
export async function imagesToPdf(imgs: { bytes: Uint8Array; type: string }[]): Promise<Uint8Array> { const d = await PDFDocument.create(); for (const im of imgs) { const e = /png/i.test(im.type) ? await d.embedPng(im.bytes) : await d.embedJpg(im.bytes); const s = Math.min(1, 612 / e.width, 792 / e.height); const p = d.addPage([e.width * s, e.height * s]); p.drawImage(e, { x: 0, y: 0, width: e.width * s, height: e.height * s }); } return d.save(); }

export interface MarkOpts { text: string; size?: number; opacity?: number; color?: string; angle?: number; pages?: number[] }
export async function watermark(bytes: Uint8Array, o: MarkOpts): Promise<Uint8Array> {
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true }); const f = await d.embedFont(StandardFonts.HelveticaBold); const t = safeText(f, o.text); const size = o.size || 64; const ang = o.angle ?? 45;
  d.getPages().forEach((pg, i) => { if (o.pages && !o.pages.includes(i)) return; const w = f.widthOfTextAtSize(t, size); const cx = pg.getWidth() / 2, cy = pg.getHeight() / 2; const rad = (ang * Math.PI) / 180; pg.drawText(t, { x: cx - (w / 2) * Math.cos(rad) + (size / 3) * Math.sin(rad), y: cy - (w / 2) * Math.sin(rad) - (size / 3) * Math.cos(rad), size, font: f, color: hexRgb(o.color || '#94a3b8'), opacity: o.opacity ?? 0.25, rotate: degrees(ang) }); });
  return d.save();
}
export type Pos = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br';
export interface NumberOpts { template: string; start?: number; pos?: Pos; size?: number; prefix?: string; digits?: number; margin?: number }
/** Page numbers and Bates numbers. Template tokens: {n} page, {N} page count, {bates} prefix + zero-padded running number. */
export async function numberPages(bytes: Uint8Array, o: NumberOpts): Promise<Uint8Array> {
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true }); const f = await d.embedFont(StandardFonts.Helvetica); const size = o.size || 9; const N = d.getPageCount(); const m = o.margin ?? 28;
  d.getPages().forEach((pg, i) => { const n = (o.start ?? 1) + i; const t = safeText(f, o.template.replace(/\{n\}/g, String(n)).replace(/\{N\}/g, String(N)).replace(/\{bates\}/g, `${o.prefix || ''}${String(n).padStart(o.digits ?? 6, '0')}`)); const w = f.widthOfTextAtSize(t, size); const pos = o.pos || 'bc'; const x = pos[1] === 'l' ? m : pos[1] === 'r' ? pg.getWidth() - m - w : (pg.getWidth() - w) / 2; const y = pos[0] === 't' ? pg.getHeight() - m : m - 6 + 6; pg.drawText(t, { x, y, size, font: f, color: rgb(0.2, 0.2, 0.2) }); });
  return d.save();
}
/** Clears title / author / subject / keywords / XMP so no practice or patient detail travels with the file. */
export async function scrubMetadata(bytes: Uint8Array): Promise<Uint8Array> { const d = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); d.setTitle(''); d.setAuthor(''); d.setSubject(''); d.setKeywords([]); d.setCreator('ClaimsIQ'); d.setProducer('ClaimsIQ'); try { d.catalog.delete(PDFName.of('Metadata')); } catch { /* none */ } return d.save(); }
export async function optimize(bytes: Uint8Array): Promise<Uint8Array> { const d = await PDFDocument.load(bytes, { ignoreEncryption: true }); return d.save({ useObjectStreams: true }); }
export async function pageInfo(bytes: Uint8Array): Promise<{ pages: number; sizes: { w: number; h: number; rot: number }[]; encrypted: boolean }> { const d = await PDFDocument.load(bytes, { ignoreEncryption: true }); return { pages: d.getPageCount(), sizes: d.getPages().map((p) => ({ w: p.getWidth(), h: p.getHeight(), rot: p.getRotation().angle })), encrypted: d.isEncrypted }; }

// ───────── PHI finder (for one-click redaction suggestions) ─────────
export interface TextItem { str: string; x: number; y: number; w: number; h: number }
export interface PhiHit { kind: 'ssn' | 'dob' | 'phone' | 'email' | 'member' | 'account' | 'npi'; text: string; x: number; y: number; w: number; h: number }
const DATE = /\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](\d{2}|\d{4})\b/;
export function findPhi(items: TextItem[]): PhiHit[] {
  const hits: PhiHit[] = []; const sub = (it: TextItem, start: number, len: number) => ({ x: it.x + (it.w * start) / Math.max(1, it.str.length), y: it.y, w: Math.max(6, (it.w * len) / Math.max(1, it.str.length)), h: it.h });
  const push = (kind: PhiHit['kind'], it: TextItem, m: RegExpExecArray, g = 0) => { const text = m[g]; const at = m.index + (g ? m[0].indexOf(m[g]) : 0); if (!hits.some((h) => h.kind === kind && h.text === text && Math.abs(h.x - it.x) < 1 && Math.abs(h.y - it.y) < 1)) hits.push({ kind, text, ...sub(it, at, text.length) }); };
  items.forEach((it, i) => {
    const s = it.str; let m: RegExpExecArray | null;
    for (const r of [/\b\d{3}-\d{2}-\d{4}\b/g]) { r.lastIndex = 0; while ((m = r.exec(s))) push('ssn', it, m); }
    { const r = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g; while ((m = r.exec(s))) push('phone', it, m); }
    { const r = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi; while ((m = r.exec(s))) push('email', it, m); }
    { const r = /(?:dob|d\.o\.b\.?|date of birth|birth\s*date|born)\s*[:#-]?\s*((?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:\d{2}|\d{4}))/gi; while ((m = r.exec(s))) push('dob', it, m, 1); }
    { const r = /(?:member|subscriber|policy|insured|medicaid|medicare)\s*(?:id|#|no\.?|number)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{5,19})\b/gi; while ((m = r.exec(s))) if (/\d/.test(m[1])) push('member', it, m, 1); }
    { const r = /(?:mrn|medical record|chart|patient\s*(?:id|account)|acct|account)\s*(?:#|no\.?|number)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,19})\b/gi; while ((m = r.exec(s))) if (/\d/.test(m[1])) push('account', it, m, 1); }
    // label and value in separate text runs: "DOB:" then "04/12/1980"
    if (/\b(dob|d\.o\.b|date of birth|birth\s*date)\b/i.test(s) && !DATE.test(s)) { const nx = items[i + 1]; if (nx && DATE.test(nx.str) && Math.abs(nx.y - it.y) < it.h) { const dm = DATE.exec(nx.str)!; hits.push({ kind: 'dob', text: dm[0], ...sub(nx, dm.index, dm[0].length) }); } }
    if (/^\s*(member|subscriber|policy|mrn|account|acct)[^A-Za-z0-9]*(id|#|no\.?|number)?\s*[:#]?\s*$/i.test(s)) { const nx = items[i + 1]; if (nx && /^[A-Z0-9][A-Z0-9-]{5,19}$/i.test(nx.str.trim()) && /\d/.test(nx.str) && Math.abs(nx.y - it.y) < it.h) hits.push({ kind: /mrn|account|acct/i.test(s) ? 'account' : 'member', text: nx.str.trim(), x: nx.x, y: nx.y, w: nx.w, h: nx.h }); }
  });
  return hits;
}

// ───────── search & document health ─────────
export interface TextHit { x: number; y: number; w: number; h: number; text: string; context: string }
/** Every occurrence of `q` in the text runs of one page, with an approximate box for the matched characters. */
export function findText(items: TextItem[], q: string, caseSensitive = false): TextHit[] {
  const needle = q.trim(); if (needle.length < 2) return []; const out: TextHit[] = []; const hay = (s: string) => (caseSensitive ? s : s.toLowerCase()); const nd = hay(needle);
  for (const it of items) { const s = hay(it.str); let at = 0; while ((at = s.indexOf(nd, at)) >= 0) { const per = it.w / Math.max(1, it.str.length); out.push({ x: it.x + per * at, y: it.y, w: Math.max(4, per * needle.length), h: it.h, text: it.str.slice(at, at + needle.length), context: it.str.length > 70 ? it.str.slice(Math.max(0, at - 25), at + needle.length + 35) : it.str }); at += nd.length; } }
  return out;
}
export interface DocMeta { title: string; author: string; creator: string; producer: string; subject: string; keywords: string; hasXmp: boolean; encrypted: boolean; formFields: number; pages: number }
export async function docMeta(bytes: Uint8Array): Promise<DocMeta> {
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); let fields = 0; try { fields = d.getForm().getFields().length; } catch { /* no form */ }
  return { title: d.getTitle() || '', author: d.getAuthor() || '', creator: d.getCreator() || '', producer: d.getProducer() || '', subject: d.getSubject() || '', keywords: d.getKeywords() || '', hasXmp: !!d.catalog.get(PDFName.of('Metadata')), encrypted: d.isEncrypted, formFields: fields, pages: d.getPageCount() };
}
export interface Health { level: 'ok' | 'warn' | 'bad'; text: string; fix?: 'ocr' | 'scrub' | 'phi' | 'optimize' }
/** Plain-language findings about a PDF with the one-click fix that applies. */
export function healthOf(m: DocMeta, o: { sizeBytes: number; textChars: number; phiHits: number | null }): Health[] {
  const out: Health[] = [];
  if (o.textChars < 40) out.push({ level: 'warn', text: 'No text layer — this looks like a scan. It cannot be searched or read by Document OCR until OCR is run.', fix: 'ocr' }); else out.push({ level: 'ok', text: 'Has a searchable text layer' });
  if (m.title || m.author || m.subject || m.keywords || m.hasXmp) out.push({ level: 'warn', text: `Metadata is present${m.author ? ` (author “${m.author}”)` : ''} — it can carry practice or patient names.`, fix: 'scrub' });
  if (o.phiHits != null) out.push(o.phiHits ? { level: 'bad', text: `${o.phiHits} possible PHI item${o.phiHits > 1 ? 's' : ''} in the text (SSN, phone, e-mail, DOB, member / account no.)`, fix: 'phi' } : { level: 'ok', text: 'No obvious PHI patterns found in the text layer' });
  if (o.sizeBytes > 5 * 1024 * 1024) out.push({ level: 'warn', text: `Large file (${(o.sizeBytes / 1048576).toFixed(1)} MB) — many payer portals and fax services reject files over 5–10 MB.`, fix: 'optimize' });
  if (m.encrypted) out.push({ level: 'warn', text: 'The file is password-protected; some edits may be restricted.' });
  if (m.formFields) out.push({ level: 'ok', text: `Fillable form with ${m.formFields} field${m.formFields > 1 ? 's' : ''}` });
  return out;
}
