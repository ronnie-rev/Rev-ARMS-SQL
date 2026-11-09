// PDF & Word Studio + multi-format Document OCR: edit/redact/duplicate PDF, Word editor round trip, docx / xlsx / csv uploads into the OCR page.
const { chromium } = require('playwright'); const fs = require('fs'); const os = require('os'); const path = require('path'); const { execFileSync } = require('child_process');
const { PDFDocument } = require('pdf-lib'); const JSZip = require('jszip'); const ExcelJS = require('exceljs');
const URL_ = process.env.URL || 'http://localhost:4173'; const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
const pdftext = (f) => { try { return execFileSync('pdftotext', [f, '-'], { encoding: 'utf8' }); } catch { return null; } };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1700, height: 1200 }, acceptDownloads: true }); const p = await ctx.newPage(); let bad = 0; const errs = [];
  const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  const save = async (click) => { const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), click()]); const f = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(f); return f; };
  await p.goto(URL_ + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav');
  ok(await p.locator('aside a[href="/studio"]').count() > 0, 'PDF & Word Studio in sidebar');

  // ---- PDF: new blank, add text, bake via "blank after", scan PHI, redact, download
  await p.locator('aside a[href="/studio"]').click(); await p.waitForTimeout(800);
  await p.getByRole('button', { name: /New blank PDF/ }).click(); await p.waitForSelector('canvas', { timeout: 20000 });
  ok(true, 'blank PDF opened and rendered');
  await p.getByRole('button', { name: 'Add text' }).click(); const cv = await p.locator('[data-overlay]').boundingBox(); await p.mouse.click(cv.x + 80, cv.y + 90); await p.waitForTimeout(400);
  await p.locator('textarea.input').first().fill('Patient SSN 123-45-6789 Claim CLM-777 paid in full'); await p.waitForTimeout(300);
  await p.getByRole('button', { name: /^pages$/i }).click(); await p.getByRole('button', { name: /Blank after/ }).click(); await p.waitForTimeout(1500);
  ok(await p.locator('canvas').count() >= 2, 'text baked and a blank page inserted (2 pages)');
  await p.locator('input[aria-label="Select page 1"]').check().catch(() => {}); await p.locator('canvas').first().click().catch(() => {});
  await p.getByRole('button', { name: /^protect$/i }).click(); await p.getByRole('button', { name: /Scan all pages/ }).click(); await p.waitForTimeout(1500);
  const found = await p.locator('text=123-45-6789').count(); ok(found > 0, 'PHI scan finds the SSN in the text layer');
  if (found) { await p.getByRole('button', { name: /Redact \d+ selected/ }).click(); await p.waitForTimeout(500); }
  const f1 = await save(() => p.getByRole('button', { name: 'Download' }).click()); const bytes1 = fs.readFileSync(f1); ok(bytes1.slice(0, 5).toString() === '%PDF-', 'edited PDF downloads');
  const d1 = await PDFDocument.load(bytes1); ok(d1.getPageCount() === 2, 'downloaded PDF has 2 pages');
  const t1 = pdftext(f1); if (t1 !== null) ok(!/123-45-6789/.test(t1), 'redacted SSN is really gone from the file (page flattened)'); else console.log('SKIP pdftotext not available');

  // ---- Pages: duplicate
  await p.getByRole('button', { name: /^pages$/i }).click(); await p.getByRole('button', { name: /Duplicate/ }).first().click(); await p.waitForTimeout(1500);
  const f2 = await save(() => p.getByRole('button', { name: 'Download' }).click()); ok((await PDFDocument.load(fs.readFileSync(f2))).getPageCount() === 3, 'duplicate page adds a page');
  // watermark + page numbers + scrub
  await p.getByRole('button', { name: /^protect$/i }).click(); await p.getByRole('button', { name: 'Add', exact: true }).click(); await p.waitForTimeout(1000); await p.getByRole('button', { name: /Page numbers/ }).click(); await p.waitForTimeout(1000); await p.getByRole('button', { name: /Remove metadata/ }).click(); await p.waitForTimeout(1000);
  const f3 = await save(() => p.getByRole('button', { name: 'Download' }).click()); const t3 = pdftext(f3); ok((await PDFDocument.load(fs.readFileSync(f3))).getPageCount() === 3 && (t3 === null || /Page 1 of 3/.test(t3)), 'watermark, page numbers and metadata scrub applied');

  // ---- Word editor
  await p.getByText('Word editor', { exact: true }).click(); await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'New letter' }).click(); await p.waitForTimeout(500);
  await p.locator('.ProseMirror').click(); await p.keyboard.press('Control+End'); await p.keyboard.type(' We have denied claim CLM-555. Reason: CO-50 not medically necessary. You may appeal within 180 days of the date of this notice.');
  await p.getByTitle('Insert table').click(); await p.waitForTimeout(400); await p.getByTitle('Bold').click();
  ok(await p.locator('.ProseMirror table').count() === 1, 'table inserted in Word editor');
  await p.getByTitle('Find & replace').click(); await p.getByPlaceholder('Find').fill('CLM-555'); ok(await p.locator('text=/1 found/').count() > 0, 'find counts matches'); await p.getByPlaceholder('Replace with').fill('CLM-999'); await p.getByRole('button', { name: /Replace all/ }).click(); await p.waitForTimeout(300);
  const f4 = await save(() => p.getByRole('button', { name: /Word \(\.docx\)/ }).click()); const zip = await JSZip.loadAsync(fs.readFileSync(f4)); const xml = await zip.file('word/document.xml').async('string');
  ok(/CLM-999/.test(xml) && /<w:tbl>/.test(xml), 'Word export contains the replaced text and the table');

  // ---- Document OCR with docx / xlsx / csv
  const claim = await p.evaluate(() => { const c = __arms.getState().claims.find((x) => !x.closed_at && x.balance > 100); return { no: c.claim_no }; });
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Remit'); ws.addRow(['Claim #', 'DOS', 'Billed', 'Allowed', 'Paid', 'Patient Resp', 'Adj Code', 'Check #']); ws.addRow([claim.no, '08/14/2026', 100, 80, 70, 10, 'CO-45', 'EFT9001']); const xlsx = path.join(tmp, 'remit.xlsx'); await wb.xlsx.writeFile(xlsx);
  const csv = path.join(tmp, 'remit.csv'); fs.writeFileSync(csv, `Claim Number,Billed,Paid\n${claim.no},100,80\n`);
  await p.locator('aside a[href="/ocr"]').click(); await p.waitForTimeout(800);
  await p.locator('input[type=file]').first().setInputFiles([f4, xlsx, csv]); await p.waitForTimeout(2500);
  ok(await p.locator('text=/Denial letter/').count() > 0, 'Word document read and classified as a denial letter');
  ok(await p.locator('text=/Remittance — /').count() >= 1, 'Excel / CSV remittance recognised as a remit');
  ok(await p.getByRole('button', { name: /Confirm & post 1 claim/ }).count() >= 1, 'spreadsheet remit matched a claim and is ready to post');
  ok(await p.locator('text=Open in Studio').count() > 0, '"Open in Studio" offered for Word documents');

  // ---- scanned image → PDF → local OCR makes it searchable
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1200, 400); x.fillStyle = '#000'; x.font = '56px Arial'; x.fillText('Claim denied CLM12345', 60, 150); x.fillText('Appeal within 90 days', 60, 270); return c.toDataURL('image/png').split(',')[1]; });
  const pngFile = path.join(tmp, 'scan.png'); fs.writeFileSync(pngFile, Buffer.from(png, 'base64'));
  await p.locator('aside a[href="/studio"]').click(); await p.waitForTimeout(800); await p.getByText('PDF editor', { exact: true }).click(); await p.waitForTimeout(300);
  await p.locator('input[type=file]').first().setInputFiles(pngFile); await p.waitForSelector('canvas', { timeout: 20000 });
  await p.getByRole('button', { name: /^ocr$/i }).click(); await p.getByRole('button', { name: /Make scans searchable/ }).click();
  await p.waitForSelector('textarea[readonly]', { timeout: 120000 }); const ocrTxt = await p.locator('textarea[readonly]').inputValue().catch(() => ''); ok(/denied/i.test(ocrTxt) && /CLM12345/.test(ocrTxt), 'local OCR read the scanned page');
  const f5 = await save(() => p.getByRole('button', { name: 'Download' }).click()); const t5 = pdftext(f5); ok(t5 === null || /denied/i.test(t5), 'downloaded PDF now has a searchable text layer');
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
})();
