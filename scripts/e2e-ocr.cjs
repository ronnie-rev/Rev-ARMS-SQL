// End-to-end proof of the OCR PHI controls. Run:  npm run build && node scripts/serve-dist.cjs 4180 &  node scripts/e2e-ocr.cjs
// Verifies: scan → local OCR works, ZERO third-party requests while processing, no recognised text in the console, CSP violations absent,
// the audit log records the run without file name or text, and the text is wiped on Clear.
const { chromium } = require('playwright'); const { PDFDocument } = require('pdf-lib'); const fs = require('fs'); const path = require('path'); const os = require('os');
const URL_ = process.env.URL || 'http://localhost:4180'; const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } }); const p = await ctx.newPage(); let bad = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  const reqs = []; const logs = []; p.on('request', (r) => reqs.push(r.url())); p.on('console', (m) => logs.push(m.type() + ': ' + m.text())); p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await p.goto(URL_ + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav');
  // make a "scanned" letter: text drawn on a canvas (pure pixels), wrapped in a PDF with no text layer
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 500; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1200, 500); x.fillStyle = '#000'; x.font = '40px Arial'; ['Aetna Claim Number: ZX99887766', 'Denial reason CO-50 and N115', 'You must file an appeal within 180 days.', 'Billed: $1250.00 Paid: $0.00'].forEach((t, i) => x.fillText(t, 40, 90 + i * 90)); return c.toDataURL('image/png').split(',')[1]; });
  const pngPath = path.join(tmp, 'scan.png'); fs.writeFileSync(pngPath, Buffer.from(png, 'base64'));
  const pdf = await PDFDocument.create(); const img = await pdf.embedPng(Buffer.from(png, 'base64')); const pg = pdf.addPage([612, 255]); pg.drawImage(img, { x: 0, y: 0, width: 612, height: 255 }); const pdfPath = path.join(tmp, 'scan.pdf'); fs.writeFileSync(pdfPath, await pdf.save());
  await p.goto(URL_ + '/tools'); await p.waitForTimeout(800); await p.getByText('Work a call / letter').click();
  const before = reqs.length;
  for (const [label, file] of [['scanned PDF', pdfPath], ['PNG image', pngPath]]) {
    await p.locator('input[type=file][accept*="pdf"]').first().setInputFiles(file); await p.waitForSelector('text=Read with local OCR', { timeout: 20000 }); ok(true, `${label}: recognised as a scan, offers local OCR`);
    await p.getByRole('button', { name: /Read with local OCR/ }).click(); await p.waitForSelector('text=CO-50', { timeout: 120000 }); ok(true, `${label}: OCR extracted denial code CO-50 locally`);
    ok(await p.locator('text=180 days').count() > 0, `${label}: appeal window found`);
    await p.waitForTimeout(1500); await p.getByRole('button', { name: 'Clear' }).click(); ok((await p.locator('textarea').first().inputValue()) === '', `${label}: text wiped on Clear`);
  }
  const during = reqs.slice(before).filter((u) => !u.startsWith('data:') && !u.startsWith('blob:')); const origin = new globalThis.URL(URL_).origin;
  const foreign = during.filter((u) => !u.startsWith(origin)); ok(foreign.length === 0, 'no third-party request while processing documents' + (foreign.length ? ': ' + foreign.slice(0, 3).join(', ') : ''));
  ok(during.some((u) => u.includes('/ocr/worker.min.js')) && during.some((u) => u.includes('/ocr/core/')) && during.some((u) => u.includes('/ocr/lang/eng.traineddata.gz')), 'worker, core and language data all loaded from this origin');
  const leaked = logs.filter((l) => /ZX99887766|CO-50|N115|1250/.test(l)); ok(leaked.length === 0, 'no recognised text in the browser console' + (leaked.length ? ': ' + leaked[0] : ''));
  const csp = logs.filter((l) => /Content Security Policy|Refused to/i.test(l) && !/fonts\.(googleapis|gstatic)/.test(l)); ok(csp.length === 0, 'no CSP violations' + (csp.length ? ': ' + csp[0].slice(0, 200) : ''));
  await p.goto(URL_ + '/audit-log'); await p.waitForTimeout(1200); const body = await p.locator('body').innerText(); const n = (body.match(/OCR extraction run/g) || []).length; if (n < 2) console.log(body.split('\n').filter((l) => /OCR/.test(l)).slice(0, 6).join(' // '));
  ok(n >= 2, `audit log shows ${n} OCR extraction entries`); ok(!/scan\.(pdf|png)/i.test(body) && !/ZX99887766/.test(body), 'audit log shows no file name and no document text');
  const store = await p.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)])); ok(!/ZX99887766|CO-50/.test(store), 'nothing recognised was written to local/session storage');
  fs.rmSync(tmp, { recursive: true, force: true }); await b.close(); console.log(bad ? `${bad} FAILED` : 'all OCR controls verified'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
