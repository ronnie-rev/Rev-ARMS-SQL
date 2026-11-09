// "Make searchable": runs the same self-hosted, in-browser OCR engine page by page and embeds an invisible text layer, so scanned PDFs can be searched, copied and read by the Document OCR page.
// Same PHI rules as src/lib/ocr.ts: same-origin engine files only, nothing uploaded, no logger, canvases and worker released as soon as the job ends.
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { OCR_LIMITS, ocrPaths } from '../ocr';
import { safeText, viewToPage } from './pdfedit';

export interface SearchableResult { bytes: Uint8Array; pagesOcr: number; pagesSkipped: number; words: number; text: string }
export async function makeSearchable(bytes: Uint8Array, o: { onlyScans?: boolean; onProgress?: (done: number, total: number) => void } = {}): Promise<SearchableResult> {
  const { createWorker } = await import('tesseract.js'); const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const src = await pdfjs.getDocument({ data: bytes.slice() }).promise; const n = Math.min(src.numPages, OCR_LIMITS.maxPages * 2); const out = await PDFDocument.load(bytes, { ignoreEncryption: true }); const font = await out.embedFont(StandardFonts.Helvetica); const pages = out.getPages();
  const worker = await createWorker('eng', 1, { ...ocrPaths(), cacheMethod: 'none', workerBlobURL: false, gzip: true, logger: () => {}, errorHandler: () => {} }); const canvases: HTMLCanvasElement[] = [];
  let pagesOcr = 0, pagesSkipped = 0, words = 0; const text: string[] = [];
  try {
    for (let i = 1; i <= n; i++) {
      o.onProgress?.(i - 1, n); const pg = await src.getPage(i);
      if (o.onlyScans) { const tc = await pg.getTextContent(); if (tc.items.map((x: any) => x.str).join('').replace(/\s+/g, '').length > 40) { pagesSkipped++; pg.cleanup(); continue; } }
      const scale = OCR_LIMITS.scale; const vp = pg.getViewport({ scale }); const c = document.createElement('canvas'); canvases.push(c); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      await pg.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c } as any).promise; const r = await worker.recognize(c, {}, { blocks: true }); text.push(r.data.text);
      const target = pages[i - 1]; const W = target.getWidth(), H = target.getHeight(); const rot = target.getRotation().angle;
      for (const b of r.data.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) {
        const t = safeText(font, w.text); if (!t.trim()) continue; const hPts = Math.max(4, (w.bbox.y1 - w.bbox.y0) / scale); const [px, py] = viewToPage(rot, W, H, w.bbox.x0 / scale, w.bbox.y1 / scale - hPts * 0.2);
        target.drawText(t, { x: px, y: py, size: hPts * 0.9, font, opacity: 0, rotate: degrees(rot) }); words++; // invisible text layer: selectable and searchable, not visible
      }
      c.width = c.height = 0; pg.cleanup(); pagesOcr++;
    }
    o.onProgress?.(n, n);
  } finally { canvases.forEach((c) => { c.width = c.height = 0; }); try { await worker.terminate(); } catch { /* gone */ } await (src as any).destroy?.(); }
  return { bytes: await out.save(), pagesOcr, pagesSkipped, words, text: text.join('\n\n') };
}
