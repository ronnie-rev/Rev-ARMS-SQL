import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { checkGrammar, compressPdf, convertToPdf, ocrPdfOnServer, probeServices, resetProbe } from '../src/lib/services';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const html = () => new Response('<!doctype html><title>app</title>', { status: 200, headers: { 'content-type': 'text/html' } });
const pdf = async () => new Uint8Array(await (await PDFDocument.create().then((d) => (d.addPage(), d))).save());

describe('local document services client', () => {
  it('reports each service honestly: JSON health = up, SPA HTML / errors / network failure = down', async () => {
    resetProbe(); const f = (async (u: string) => { if (u.includes('gotenberg')) return json({ status: 'up' }); if (u.includes('stirling')) return html(); if (u.includes('languagetool')) throw new TypeError('network'); return json({}, 404); }) as unknown as typeof fetch;
    const s = await probeServices(true, f); expect(s.gotenberg.up).toBe(true); expect(s.stirling.up).toBe(false); expect(s.stirling.detail).toMatch(/not running/); expect(s.languagetool.up).toBe(false); expect(s.languagetool.detail).toMatch(/not reachable/);
    const lt = await probeServices(true, (async (u: string) => (u.includes('languagetool') ? json([{ name: 'English' }]) : json({ status: 'UP' }))) as unknown as typeof fetch); expect(Object.values(lt).every((x) => x.up)).toBe(true);
  });
  it('sends the right requests and insists on a real PDF back', async () => {
    const seen: { url: string; fields: string[] }[] = []; const good = await pdf();
    const f = (async (u: string, init: any) => { seen.push({ url: u, fields: [...(init.body as FormData).keys()] }); return new Response(good as unknown as BodyInit, { status: 200, headers: { 'content-type': 'application/pdf' } }); }) as unknown as typeof fetch;
    expect((await convertToPdf(new Blob(['x']), 'letter.docx', f)).length).toBeGreaterThan(100); expect((await compressPdf(good, 99, f)).length).toBeGreaterThan(100); await ocrPdfOnServer(good, f);
    expect(seen[0]).toEqual({ url: '/svc/gotenberg/forms/libreoffice/convert', fields: ['files'] }); expect(seen[1].url).toBe('/svc/stirling/api/v1/misc/compress-pdf'); expect(seen[1].fields).toEqual(['fileInput', 'optimizeLevel']); expect(seen[2].fields).toEqual(['fileInput', 'languages', 'ocrType', 'ocrRenderType', 'sidecar']);
    const bad = (async () => new Response('oops', { status: 200 })) as unknown as typeof fetch; await expect(convertToPdf(new Blob(['x']), 'a.docx', bad)).rejects.toThrow(/did not return a PDF/);
    const err = (async () => new Response('', { status: 413 })) as unknown as typeof fetch; await expect(compressPdf(good, 5, err)).rejects.toThrow(/too large/);
  });
  it('maps LanguageTool matches to offsets, text and suggestions', async () => {
    const f = (async (_u: string, init: any) => { expect(String(init.body)).toContain('language=en-US'); return json({ matches: [{ message: 'Possible spelling mistake', shortMessage: 'Spelling', offset: 4, length: 6, rule: { id: 'MORFOLOGIK', category: { name: 'Typos' } }, replacements: [{ value: 'denied' }, { value: 'denial' }], context: { text: 'The deniel was wrong' } }] }); }) as unknown as typeof fetch;
    const m = await checkGrammar('The deniel was wrong', f); expect(m[0]).toMatchObject({ offset: 4, length: 6, text: 'deniel', category: 'Typos', replacements: ['denied', 'denial'] });
  });
});
