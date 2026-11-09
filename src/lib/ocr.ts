// Browser-side OCR for scanned payer letters / EOBs. PHI rules (see docs/OCR_SECURITY.md):
//  • everything runs in this tab — the document, the page images and the extracted text are never uploaded, stored, cached or logged
//  • the engine (worker, WebAssembly core, English model) is self-hosted under /ocr — no CDN, no public OCR API
//  • no logger is attached, so recognised text never reaches the console
//  • the worker is terminated and every canvas released as soon as the job ends (or fails)
export const OCR_LIMITS = { maxPages: 15, maxBytes: 25 * 1024 * 1024, idleMs: 10 * 60 * 1000, scale: 2 } as const;
export const OCR_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
export interface OcrResult { text: string; pages: number; chars: number }
export class OcrError extends Error {}

/** Same-origin only: refuses to start if the asset base was ever pointed at another host. */
export function ocrPaths(origin = typeof location !== 'undefined' ? location.origin : '') {
  const base = `${origin}/ocr`; if (!/^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) throw new OcrError('OCR requires HTTPS');
  return { workerPath: `${base}/worker.min.js`, corePath: `${base}/core`, langPath: `${base}/lang` };
}

export async function ocrFile(file: File, onProgress?: (done: number, total: number) => void): Promise<OcrResult> {
  if (!OCR_TYPES.includes(file.type) && !/\.(pdf|png|jpe?g)$/i.test(file.name)) throw new OcrError('Only PDF, PNG or JPEG files can be read');
  if (file.size > OCR_LIMITS.maxBytes) throw new OcrError(`File is over ${OCR_LIMITS.maxBytes / 1024 / 1024} MB`);
  const { createWorker } = await import('tesseract.js'); const paths = ocrPaths();
  const worker = await createWorker('eng', 1, { ...paths, cacheMethod: 'none', workerBlobURL: false, gzip: true, logger: () => {}, errorHandler: () => {} });
  const canvases: HTMLCanvasElement[] = [];
  try {
    const out: string[] = [];
    if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
      const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; const n = Math.min(doc.numPages, OCR_LIMITS.maxPages);
      for (let i = 1; i <= n; i++) {
        const page = await doc.getPage(i); const vp = page.getViewport({ scale: OCR_LIMITS.scale }); const c = document.createElement('canvas'); canvases.push(c); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
        await page.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c } as any).promise; const r = await worker.recognize(c); out.push(r.data.text); c.width = c.height = 0; page.cleanup(); onProgress?.(i, n);
      }
      await (doc as any).destroy?.(); return { text: out.join('\n\n'), pages: n, chars: out.join('').length };
    }
    // images: decode locally and hand the worker a canvas (no blob: URL fetches, which the CSP does not allow)
    const bmp = await createImageBitmap(file); const c = document.createElement('canvas'); canvases.push(c); c.width = bmp.width; c.height = bmp.height; c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
    const r = await worker.recognize(c); onProgress?.(1, 1); return { text: r.data.text, pages: 1, chars: r.data.text.length };
  } finally { canvases.forEach((c) => { c.width = c.height = 0; }); try { await worker.terminate(); } catch { /* worker already gone */ } }
}

/** Text that is long enough and mostly letters — otherwise the PDF is a scan and needs OCR. */
export const looksLikeText = (t: string) => { const s = t.replace(/\s+/g, ' ').trim(); return s.length >= 80 && (s.match(/[A-Za-z]/g) || []).length / s.length > 0.45; };
