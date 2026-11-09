import { useEffect, useRef, useState } from 'react';

/** Renders one PDF page to a canvas (pdf.js, loaded on demand). `scale` = canvas px per PDF point. */
export function PdfPageCanvas({ bytes, page, scale = 1.2, onSize, children }: { bytes: Uint8Array; page: number; scale?: number; onSize?: (w: number, h: number) => void; children?: React.ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null); const [err, setErr] = useState<string | null>(null); const [dim, setDim] = useState({ w: 0, h: 0 });
  useEffect(() => {
    let live = true; let task: { cancel(): void } | null = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise; const pg = await doc.getPage(page + 1); if (!live) return;
        const vp = pg.getViewport({ scale }); const cv = ref.current!; cv.width = vp.width; cv.height = vp.height; setDim({ w: vp.width, h: vp.height }); onSize?.(vp.width / scale, vp.height / scale);
        const t = pg.render({ canvas: cv, canvasContext: cv.getContext('2d')!, viewport: vp }); task = t; await t.promise;
      } catch (e) { if (live && !/cancel/i.test(String(e))) setErr((e as Error).message); }
    })();
    return () => { live = false; task?.cancel(); };
  }, [bytes, page, scale]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="relative inline-block border hair bg-white" style={{ width: dim.w || undefined, height: dim.h || undefined }}>{err ? <div className="p-6 text-sm text-red-500">{err}</div> : <canvas ref={ref} />}{children}</div>;
}
