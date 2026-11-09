import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { docxToHtml } from '../src/lib/docx/docxhtml';
import { htmlToDocx, imgSize, parseHtml } from '../src/lib/docx/htmlToDocx';
import { emlToText, htmlToPlain, kindOf, parseCsv, rtfToText } from '../src/lib/docread';
import { parseRemitSheet } from '../src/lib/engine/eobtext';
import { applyAnnots, deletePages, duplicatePage, extractPages, findPhi, insertBlank, mergePdfs, movePage, newBlank, numberPages, pageInfo, parseRanges, rotatePages, safeText, scrubMetadata, splitRanges, viewToPage, watermark, type Annot } from '../src/lib/pdf/pdfedit';

const buf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

describe('Word round trip', () => {
  it('keeps headings, bold, lists, tables and alignment through HTML → docx → HTML', async () => {
    const html = '<h2>Appeal</h2><p style="text-align:center"><strong>Claim</strong> <em>CLM-1</em> &amp; more</p><ul><li>First</li><li>Second</li></ul><ol><li>One</li><li>Two</li></ol><table><tbody><tr><th>CPT</th><th>Paid</th></tr><tr><td>99214</td><td>$80.00</td></tr></tbody></table>';
    const back = await docxToHtml(await buf(await htmlToDocx(html)));
    expect(back.text).toContain('Appeal'); expect(back.text).toContain('Claim CLM-1 & more'); expect(back.text).toContain('99214\t$80.00'); expect(back.tables).toBe(1);
    expect(back.html).toContain('<strong>Claim</strong>'); expect(back.html).toContain('<em>CLM-1</em>'); expect(back.html).toMatch(/<ul><li>First<\/li><li>Second<\/li><\/ul>/); expect(back.html).toMatch(/<ol><li>One<\/li><li>Two<\/li><\/ol>/); expect(back.html).toContain('text-align:center'); expect(back.html).toMatch(/<h[2-4]/);
  });
  it('embeds and reads pictures; rejects non-docx files clearly', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='; const html = `<p>Logo <img src="data:image/png;base64,${png}"></p>`;
    const back = await docxToHtml(await buf(await htmlToDocx(html))); expect(back.images).toBe(1); expect(back.html).toContain('data:image/png;base64'); expect(imgSize(Uint8Array.from(atob(png), (c) => c.charCodeAt(0)))).toMatchObject({ w: 1, h: 1, type: 'png' });
    await expect(docxToHtml(new TextEncoder().encode('not a zip'))).rejects.toThrow();
    expect(parseHtml('<p>a<br>b</p>')[0].kids.length).toBe(3);
  });
});

describe('universal reader helpers', () => {
  it('classifies files and parses CSV / RTF / HTML / e-mail', () => {
    expect(kindOf('x.PDF')).toBe('pdf'); expect(kindOf('a.docx')).toBe('docx'); expect(kindOf('a.xlsx')).toBe('xlsx'); expect(kindOf('a.doc')).toBe('legacy'); expect(kindOf('a.835')).toBe('text'); expect(kindOf('scan.JPG')).toBe('image'); expect(kindOf('a.zip')).toBe('unknown');
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]); expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(rtfToText('{\\rtf1\\ansi Hello \\b world\\b0\\par Claim \\u8212? done}')).toContain('Hello world'); expect(htmlToPlain('<p>Claim&nbsp;1</p><script>x()</script><p>Denied</p>')).toBe('Claim 1\nDenied');
    expect(emlToText('From: a@b.com\nSubject: Denial\n\nClaim CLM-1 denied.')).toContain('Subject: Denial');
  });
  it('parses a remittance exported to Excel / CSV', () => {
    const rows = [['Aetna Remittance'], ['Claim #', 'DOS', 'Billed', 'Allowed', 'Paid', 'Patient Resp', 'Adj Code', 'Check #'], ['CLM-1001', '08/14/2026', '1000', '640', '512', '128', 'CO-45', 'EFT555'], ['CLM-1002', '08/20/2026', '450', '0', '0', '0', 'CO-50', 'EFT555']];
    const e = parseRemitSheet(rows)!; expect(e.claims.length).toBe(2); expect(e.claims[0].paid).toBe(512); expect(e.claims[0].patientResp).toBe(128); expect(e.claims[0].dos).toBe('2026-08-14'); expect(e.claims[1].denied).toBe(true); expect(e.trace).toBe('EFT555'); expect(e.amount).toBe(512); expect(parseRemitSheet([['name', 'age'], ['a', '1']])).toBeNull();
  });
});

describe('PDF engine', () => {
  it('maps view coordinates onto rotated pages', () => {
    expect(viewToPage(0, 600, 800, 10, 20)).toEqual([10, 780]); expect(viewToPage(90, 600, 800, 800, 0)).toEqual([0, 800]); expect(viewToPage(180, 600, 800, 0, 0)).toEqual([600, 0]); expect(viewToPage(270, 600, 800, 0, 600)).toEqual([0, 800]);
  });
  it('page operations: rotate, delete, move, duplicate, insert, extract, merge, split', async () => {
    let b = await newBlank(3); expect((await pageInfo(b)).pages).toBe(3);
    b = await rotatePages(b, [0], 90); expect((await pageInfo(b)).sizes[0].rot).toBe(90);
    b = await duplicatePage(b, 1); expect((await pageInfo(b)).pages).toBe(4); b = await insertBlank(b, 2); expect((await pageInfo(b)).pages).toBe(5);
    b = await movePage(b, 0, 4); expect((await pageInfo(b)).sizes[4].rot).toBe(90);
    b = await deletePages(b, [0, 1]); expect((await pageInfo(b)).pages).toBe(3); await expect(deletePages(b, [0, 1, 2])).rejects.toThrow();
    expect((await pageInfo(await extractPages(b, [0, 2]))).pages).toBe(2); expect((await pageInfo(await mergePdfs([b, await newBlank(2, 'a4')]))).pages).toBe(5);
    expect(parseRanges('1-2, 5, 4-', 6)).toEqual([[0, 1], [4], [3, 4, 5]]); expect(parseRanges('9', 3)).toEqual([]); expect((await splitRanges(await newBlank(6), '1-2,5-')).length).toBe(2);
  });
  it('burns in text, highlights, whiteout, redaction, drawing, stamps, checks and images without failing', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    let b = await rotatePages(await newBlank(2), [1], 90);
    const an: Annot[] = [
      { id: '1', page: 0, kind: 'text', x: 50, y: 60, text: 'Paid “in full” — ✓ 你好\nsecond line wraps nicely when narrow', size: 12, color: '#112233', font: 'Times', bold: true, w: 200 },
      { id: '2', page: 0, kind: 'rect', x: 40, y: 100, w: 120, h: 16, mode: 'highlight' }, { id: '3', page: 0, kind: 'rect', x: 40, y: 130, w: 50, h: 12, mode: 'whiteout' }, { id: '4', page: 0, kind: 'rect', x: 40, y: 160, w: 80, h: 12, mode: 'redact' },
      { id: '5', page: 0, kind: 'draw', pts: [[10, 10], [40, 30], [80, 20]], color: '#ff0000', width: 2 }, { id: '6', page: 0, kind: 'stamp', x: 300, y: 50, text: 'received', color: '#dc2626', size: 14 }, { id: '7', page: 0, kind: 'check', x: 300, y: 120, size: 14, color: '#16a34a' }, { id: '8', page: 1, kind: 'image', x: 20, y: 20, w: 50, h: 50, dataUrl: png }, { id: '9', page: 1, kind: 'text', x: 30, y: 100, text: 'rotated page', size: 11, color: '#000000', font: 'Courier' },
    ];
    const jpg = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='), (c) => c.charCodeAt(0)); let rasterCalls = 0;
    const flat = await applyAnnots(b, an, { rasterize: async () => { rasterCalls++; return { jpeg: jpg, w: 612, h: 792 }; } }); expect(rasterCalls).toBe(1); expect((await pageInfo(flat)).pages).toBe(2);
    const plain = await applyAnnots(b, an); expect((await pageInfo(plain)).pages).toBe(2); expect(await applyAnnots(b, [])).toBe(b);
  });
  it('numbers pages / Bates, watermarks, scrubs metadata and keeps fonts safe', async () => {
    let b = await newBlank(3); b = await numberPages(b, { template: 'Page {n} of {N}', pos: 'br' }); b = await numberPages(b, { template: '{bates}', prefix: 'ACME-', digits: 5, pos: 'bl', start: 100 }); b = await watermark(b, { text: 'DRAFT' }); b = await scrubMetadata(b);
    const d = await PDFDocument.load(b, { updateMetadata: false }); expect(d.getPageCount()).toBe(3); expect(d.getTitle() || '').toBe(''); expect(d.getProducer()).toBe('ClaimsIQ');
    const f = await (await PDFDocument.create()).embedFont('Helvetica' as any); expect(safeText(f, 'a“b”—c你')).toBe('a“b”—c?');
  });
  it('finds PHI in text runs, including label / value pairs split across runs', () => {
    const it = (str: string, x = 10, y = 10, w = str.length * 5) => ({ str, x, y, w, h: 10 });
    const hits = findPhi([it('SSN 123-45-6789'), it('Call (301) 555-0142 or jane@x.org'), it('DOB:', 10, 40), it('04/12/1980', 40, 40), it('Member ID: W123456789'), it('Account', 10, 70), it('ACC-10442', 60, 70), it('Total 100.00')]);
    const kinds = hits.map((h) => h.kind).sort(); expect(kinds).toEqual(['account', 'dob', 'email', 'member', 'phone', 'ssn']); expect(hits.find((h) => h.kind === 'ssn')!.text).toBe('123-45-6789'); expect(hits.find((h) => h.kind === 'member')!.text).toBe('W123456789');
  });
});
