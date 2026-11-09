// ClaimsIQ's integration with the local document services, against a MOCK (scripts/mock-services.cjs). Starts its own preview server with SVC_TARGET set.
const { chromium } = require('playwright'); const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawn } = require('child_process'); const { PDFDocument } = require('pdf-lib');
const mock = require('./mock-services.cjs'); const PORT = 4177;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const m = await mock.start(8089); const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, SVC_TARGET: 'http://127.0.0.1:8089' }, stdio: 'ignore' }); await wait(5000);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-')); const URL_ = `http://localhost:${PORT}`; const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1700, height: 1200 }, acceptDownloads: true }); const p = await ctx.newPage(); let bad = 0; const errs = [];
  const ok = (c, msg) => { console.log(c ? 'PASS' : 'FAIL', msg); if (!c) bad++; }; p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  try {
    await p.goto(URL_ + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav');
    await p.goto(URL_ + '/admin?tab=docservices'); await p.waitForTimeout(1500); ok(await p.locator('text=running').count() >= 3, 'Admin: all three services shown as running'); ok(await p.locator('text=/gotenberg\\/gotenberg:8\\.38\\.1/').count() > 0, 'Admin: locked version is displayed');

    // legacy .doc through Gotenberg into Document OCR
    const doc = path.join(tmp, 'old-letter.doc'); fs.writeFileSync(doc, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3, 4]));
    await p.goto(URL_ + '/ocr'); await p.waitForTimeout(800); await p.locator('input[type=file]').first().setInputFiles(doc); await p.waitForTimeout(2500);
    ok(await p.locator('text=/converted locally/').count() > 0, 'OCR: legacy .doc converted by the local service'); ok(await p.locator('text=/Denial letter/').count() > 0 && await p.locator('text=CO-50').count() > 0, 'OCR: converted document read and classified');

    // Studio: open an Office file as PDF, server compress and server OCR
    await p.goto(URL_ + '/studio'); await p.waitForTimeout(800); await p.locator('input[type=file]').first().setInputFiles(doc); await p.waitForSelector('canvas', { timeout: 20000 }); ok(true, 'Studio: .doc opened as a PDF via the local service');
    await p.getByRole('button', { name: /^protect$/i }).click(); await p.waitForTimeout(600); ok(await p.locator('text=Local server tools').count() > 0, 'Studio: server tools appear when Stirling-PDF is running');
    const before = m.calls.length; await p.getByRole('button', { name: 'Compress (server)' }).click(); await p.waitForTimeout(2500); ok(m.calls.slice(before).some((c) => /compress-pdf/.test(c)), 'Studio: compress sent to the local service');
    await p.locator('.seg button', { hasText: /^ocr$/i }).click(); await p.getByRole('button', { name: /OCR on server/ }).click(); await p.waitForTimeout(2500); ok(m.calls.some((c) => /ocr-pdf/.test(c)), 'Studio: server OCR sent to the local service');
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.getByRole('button', { name: 'Download' }).click()]); const f = path.join(tmp, 'out.pdf'); await dl.saveAs(f); ok((await PDFDocument.load(fs.readFileSync(f))).getPageCount() >= 1, 'Studio: result downloads as a valid PDF');

    // Word: grammar + exact PDF
    await p.getByText('Word editor', { exact: true }).click(); await p.getByRole('button', { name: 'Blank' }).click(); await p.locator('.ProseMirror').click(); await p.keyboard.type('Please review teh denial today.');
    await p.getByRole('button', { name: /Spelling & grammar/ }).click(); await p.waitForTimeout(1200); ok(await p.locator('text=Possible spelling mistake').count() > 0, 'Word: spelling suggestion shown');
    await p.locator('button:has-text("the")').last().click(); await p.waitForTimeout(1500); ok((await p.locator('.ProseMirror').innerText()).includes('Please review the denial today.'), 'Word: suggestion applied in the document');
    const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.getByRole('button', { name: 'PDF (exact layout)' }).click()]); const f2 = path.join(tmp, 'exact.pdf'); await dl2.saveAs(f2); ok(fs.readFileSync(f2).slice(0, 5).toString() === '%PDF-', 'Word: exact-layout PDF produced by the local service');
  } catch (e) { console.log('FAIL exception', e.message.slice(0, 300)); bad++; }
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); srv.kill('SIGTERM'); m.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
})();
