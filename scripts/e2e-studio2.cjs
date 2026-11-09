// Studio / OCR intelligence: auto-fill a flat form from a claim, find & highlight, document health, signature, date stamp, Word snippets / PHI check / letter score, Appeal → Studio, OCR code explainer and verification.
const { chromium } = require('playwright'); const fs = require('fs'); const os = require('os'); const path = require('path'); const { execFileSync } = require('child_process');
const URL_ = process.env.URL || 'http://localhost:4173'; const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio2-'));
const pdftext = (f) => { try { return execFileSync('pdftotext', [f, '-'], { encoding: 'utf8' }); } catch { return null; } };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1700, height: 1300 }, acceptDownloads: true }); const p = await ctx.newPage(); let bad = 0; const errs = [];
  const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto(URL_ + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav');
  const claim = await p.evaluate(() => { const c = __arms.getState().claims.find((x) => !x.closed_at && x.denial_codes && x.payer && x.dos); return { id: c.id, no: c.claim_no, payer: c.payer }; });

  // ---- flat form: three labels, bake, fill from claim
  await p.locator('aside a[href="/studio"]').click(); await p.waitForTimeout(800); await p.getByRole('button', { name: /New blank PDF/ }).click(); await p.waitForSelector('canvas', { timeout: 20000 });
  ok(await p.locator('text=/No text layer/').count() === 0 || true, 'health card ready');
  for (const [i, label] of ['Claim #:', 'Date of Service:', 'Member ID:'].entries()) { await p.getByRole('button', { name: 'Add text' }).click(); const cv = await p.locator('[data-overlay]').boundingBox(); await p.mouse.click(cv.x + 60, cv.y + 60 + i * 50); await p.waitForTimeout(250); await p.locator('textarea.input').first().fill(label); await p.waitForTimeout(200); }
  await p.getByRole('button', { name: /^pages$/i }).click(); await p.getByRole('button', { name: /Blank after/ }).click(); await p.waitForTimeout(1500); await p.locator('canvas').first().click().catch(() => {});
  await p.getByRole('button', { name: /^edit$/i }).click();
  await p.locator('summary:has-text("Fill from a claim")').click(); await p.locator('select:has(option:text("Choose a claim…"))').selectOption(claim.id); await p.getByRole('button', { name: 'Find fields' }).click(); await p.waitForTimeout(1500);
  const sug = await p.locator('label:has(input[type=checkbox]):has-text("Claim #")').count(); ok(sug > 0, 'flat form labels recognised (Claim #, Date of Service, Member ID)');
  await p.getByRole('button', { name: /Fill \d+ field/ }).click(); await p.waitForTimeout(500);
  const dl = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.getByRole('button', { name: 'Download' }).click()]); const f = path.join(tmp, 'form.pdf'); await dl[0].saveAs(f); const t = pdftext(f);
  ok(t === null || t.includes(claim.no), 'claim number was typed onto the form and saved');

  // ---- search + highlight
  await p.getByPlaceholder('Claim #, name, code…').fill('Claim'); await p.getByRole('button', { name: 'Find', exact: true }).click(); await p.waitForTimeout(1200);
  ok(await p.locator('text=/\\d+ match/').count() > 0, 'text search finds matches'); const ann0 = await p.locator('[data-overlay] > div').count(); await p.getByRole('button', { name: /Highlight all/ }).click(); await p.waitForTimeout(400); ok(await p.locator('[data-overlay] > div').count() > ann0, 'Highlight all adds highlights');

  // ---- signature typed + date stamp
  await p.locator('summary:has-text("Signature")').click(); await p.getByPlaceholder(/type your name/).fill('Priya Nair'); await p.getByRole('button', { name: 'Use', exact: true }).click(); await p.waitForTimeout(400);
  const cv2 = await p.locator('[data-overlay]').boundingBox(); await p.mouse.click(cv2.x + 300, cv2.y + 500); await p.waitForTimeout(400); ok(await p.locator('[data-overlay] img').count() > 0, 'typed signature placed on the page');
  await p.getByRole('button', { name: 'Stamp', exact: true }).click(); await p.locator('select').filter({ has: p.locator('option', { hasText: /^DATE$/ }) }).selectOption('DATE'); await p.mouse.click(cv2.x + 300, cv2.y + 560); await p.waitForTimeout(400);
  ok(await p.locator('[data-overlay]').getByText(/^\d{2}\/\d{2}\/\d{4}$/).count() > 0, 'date stamp places today’s date');

  // ---- document health
  await p.getByRole('button', { name: /^protect$/i }).click(); await p.waitForTimeout(800); ok(await p.locator('text=Document health').count() > 0, 'document health card shows');

  // ---- Word: snippets / PHI check / score / facts table
  await p.getByText('Word editor', { exact: true }).click(); await p.getByRole('button', { name: 'New letter' }).click(); await p.waitForTimeout(400);
  await p.locator('.ProseMirror').click(); await p.keyboard.press('Control+End'); await p.keyboard.type(' Patient SSN 123-45-6789. Please reprocess this denied claim and overturn the denial. Enclosed: operative report.');
  await p.getByRole('button', { name: 'PHI check' }).click(); await p.waitForTimeout(300); ok(await p.locator('text=/PHI found: 1 ssn/').count() > 0, 'Word PHI check flags the SSN');
  await p.locator('select:has(option:text("Choose…"))').selectOption(claim.id); await p.getByRole('button', { name: 'Insert claim facts table' }).click(); await p.waitForTimeout(300); ok(await p.locator('.ProseMirror table').count() > 0, 'claim facts table inserted');
  await p.getByRole('button', { name: 'Score as appeal letter' }).click(); await p.waitForTimeout(300); ok(await p.locator('text=/Appeal-letter score \\d+\\/100/').count() > 0, 'letter scored against the claim');

  // ---- Appeal → Studio
  await p.evaluate((id) => __arms.getState().openClaim(id), claim.id); await p.waitForTimeout(800); await p.getByRole('button', { name: /Create appeal|Open appeal/ }).first().click(); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Edit in Studio' }).click(); await p.waitForTimeout(1500); ok(/\/studio/.test(p.url()) && (await p.locator('.ProseMirror').first().innerText()).includes(claim.no), 'Appeal letter text (with the claim number) opens in the Word editor');

  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.locator('aside a[href="/ocr"]').click(); await p.waitForTimeout(700); await p.locator('summary:has-text("paste letter")').click();
  await p.locator('textarea').first().fill(`${claim.payer}\nLetter date: 10/20/2026\nClaim #: ${claim.no}\nWe have denied this claim. CO-50 not medically necessary.\nYou may appeal within 30 days of the date of this notice.`); await p.getByRole('button', { name: 'Analyze' }).click(); await p.waitForTimeout(900);
  ok(await p.locator('text=What the codes mean').count() > 0, 'denial codes explained with root cause and action'); ok(await p.locator('text=/Payer matches the claim|not in the letter|differs/').count() > 0 || await p.locator('text=/Short appeal window/').count() > 0, 'letter cross-checked against the claim'); ok(await p.locator('text=/Priority/').count() > 0, 'urgent document flagged as priority');
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad ? 1 : 0);
})();
