// Client for the LOCAL document services in deploy/services (Gotenberg, Stirling-PDF, LanguageTool), reached only through the same-origin /svc/ path.
// Nothing leaves your own server. Every call degrades gracefully: when a service is not running, probeServices() says so and the app falls back to its in-browser tools.
export type ServiceId = 'gotenberg' | 'stirling' | 'languagetool';
export interface ServiceStatus { up: boolean; detail?: string }
export const SVC_BASE = '/svc';
const PROBE: Record<ServiceId, { path: string; ok: (j: any) => boolean }> = {
  gotenberg: { path: '/gotenberg/health', ok: (j) => /up/i.test(String(j?.status || '')) },
  stirling: { path: '/stirling/api/v1/info/status', ok: (j) => /up/i.test(String(j?.status || '')) },
  languagetool: { path: '/languagetool/v2/languages', ok: (j) => Array.isArray(j) && j.length > 0 },
};
export const MAX_BYTES = 25 * 1024 * 1024;
const timeout = (ms: number) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; };

let cache: { at: number; v: Record<ServiceId, ServiceStatus> } | null = null;
/** Is each service answering? JSON is required — the single-page app answers unknown paths with HTML, which must not be mistaken for a live service. Cached for 30 s. */
export async function probeServices(force = false, f: typeof fetch = fetch): Promise<Record<ServiceId, ServiceStatus>> {
  if (!force && cache && Date.now() - cache.at < 30000) return cache.v;
  const out = {} as Record<ServiceId, ServiceStatus>;
  await Promise.all((Object.keys(PROBE) as ServiceId[]).map(async (id) => {
    const t = timeout(3000);
    try { const r = await f(SVC_BASE + PROBE[id].path, { signal: t.signal }); const ct = r.headers.get('content-type') || ''; if (!r.ok) out[id] = { up: false, detail: `HTTP ${r.status}` }; else if (!/json/i.test(ct)) out[id] = { up: false, detail: 'not running (no JSON answer)' }; else { const j = await r.json(); out[id] = PROBE[id].ok(j) ? { up: true } : { up: false, detail: 'unexpected answer' }; } }
    catch (e: any) { out[id] = { up: false, detail: e?.name === 'AbortError' ? 'timed out' : 'not reachable' }; } finally { t.done(); }
  }));
  cache = { at: Date.now(), v: out }; return out;
}
export const resetProbe = () => { cache = null; };

async function post(path: string, form: FormData, ms: number, f: typeof fetch): Promise<Response> {
  const t = timeout(ms); try { const r = await f(SVC_BASE + path, { method: 'POST', body: form, signal: t.signal }); if (!r.ok) throw new Error(`The service answered ${r.status}${r.status === 413 ? ' (file too large)' : ''}`); return r; } catch (e: any) { throw new Error(e?.name === 'AbortError' ? 'The service took too long' : e?.message || 'The service could not be reached'); } finally { t.done(); }
}
const bytesOf = async (r: Response) => { const b = new Uint8Array(await r.arrayBuffer()); if (b.length < 5 || String.fromCharCode(...b.slice(0, 5)) !== '%PDF-') throw new Error('The service did not return a PDF'); return b; };
const guard = (blob: Blob) => { if (blob.size > MAX_BYTES) throw new Error(`File is over ${MAX_BYTES / 1024 / 1024} MB`); };

/** Gotenberg: Word / Excel / PowerPoint (including .doc .xls .ppt .odt) → PDF with the real layout. */
export async function convertToPdf(file: Blob, filename: string, f: typeof fetch = fetch): Promise<Uint8Array> { guard(file); const fd = new FormData(); fd.append('files', file, filename); return bytesOf(await post('/gotenberg/forms/libreoffice/convert', fd, 130000, f)); }
/** Stirling-PDF: compress (level 1 = light … 9 = strongest). */
export async function compressPdf(pdf: Uint8Array, level = 5, f: typeof fetch = fetch): Promise<Uint8Array> { const blob = new Blob([pdf as unknown as BlobPart], { type: 'application/pdf' }); guard(blob); const fd = new FormData(); fd.append('fileInput', blob, 'document.pdf'); fd.append('optimizeLevel', String(Math.max(1, Math.min(9, level)))); return bytesOf(await post('/stirling/api/v1/misc/compress-pdf', fd, 180000, f)); }
/** Stirling-PDF: OCR on the server (no page limit) — returns a searchable PDF. Pages that already have text are skipped. */
export async function ocrPdfOnServer(pdf: Uint8Array, f: typeof fetch = fetch): Promise<Uint8Array> { const blob = new Blob([pdf as unknown as BlobPart], { type: 'application/pdf' }); guard(blob); const fd = new FormData(); fd.append('fileInput', blob, 'document.pdf'); fd.append('languages', 'eng'); fd.append('ocrType', 'skip-text'); fd.append('ocrRenderType', 'sandwich'); fd.append('sidecar', 'false'); return bytesOf(await post('/stirling/api/v1/misc/ocr-pdf', fd, 600000, f)); }

export interface GrammarMatch { message: string; short: string; offset: number; length: number; text: string; replacements: string[]; category: string; ruleId: string; context: string }
/** LanguageTool: spelling and grammar. Offsets refer to the text you sent. */
export async function checkGrammar(text: string, f: typeof fetch = fetch): Promise<GrammarMatch[]> {
  const body = new URLSearchParams({ text: text.slice(0, 60000), language: 'en-US', enabledOnly: 'false' }); const t = timeout(30000);
  try { const r = await f(SVC_BASE + '/languagetool/v2/check', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: t.signal }); if (!r.ok) throw new Error(`The grammar service answered ${r.status}`); const j = await r.json();
    return (j.matches || []).map((m: any): GrammarMatch => ({ message: m.message || '', short: m.shortMessage || '', offset: m.offset, length: m.length, text: text.slice(m.offset, m.offset + m.length), replacements: (m.replacements || []).slice(0, 4).map((x: any) => x.value), category: m.rule?.category?.name || '', ruleId: m.rule?.id || '', context: m.context?.text || '' })); }
  catch (e: any) { throw new Error(e?.name === 'AbortError' ? 'The grammar service took too long' : e?.message || 'The grammar service could not be reached'); } finally { t.done(); }
}
export const OFFICE_EXT = /\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf)$/i;
