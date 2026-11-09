// Document OCR page + courtesy appeal: sidebar entry, paste a denial letter, classification, extraction, claim match, courtesy letter opens, letterhead layout.
const { chromium } = require('playwright');
const URL_ = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1600, height: 1100 } })).newPage(); let bad = 0; const errs = [];
  const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto(URL_ + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav');
  ok(await p.locator('aside a[href="/ocr"]').count() > 0, 'Document OCR in sidebar');
  const no = await p.evaluate(() => __arms.getState().claims.find((c) => c.denial_codes && !c.closed_at).claim_no);
  await p.locator('aside a[href="/ocr"]').click(); await p.waitForTimeout(800);
  ok(await p.locator('text=/Drop up to 10 documents/').count() > 0, 'OCR page renders drop zone');
  await p.locator('summary:has-text("paste letter")').click();
  await p.locator('textarea').first().fill(`Cigna\nClaim #: ${no}\nWe have denied this claim. Reason: CO-97 payment included in another service.\nYou may appeal within 180 days of receipt of this notice.\nFax: (800) 555-0101\nPlease submit the operative report.`);
  await p.getByRole('button', { name: 'Analyze' }).click(); await p.waitForTimeout(700);
  ok(await p.locator('text=/Denial letter/').count() > 0, 'classified as denial letter');
  ok(await p.locator('text=CO-97').count() > 0, 'extracted CARC code');
  ok(await p.locator('text=/180 days/').count() > 0, 'extracted appeal deadline');
  ok(await p.locator(`text=${no}`).count() > 0, 'matched the claim by number');
  await p.getByRole('button', { name: 'Courtesy review' }).first().click(); await p.waitForTimeout(1500);
  ok(await p.locator('text=/Courtesy \\/ good-faith review/').count() > 0, 'courtesy letter builder opens in courtesy mode');
  ok(await p.locator('text=/waive, limit or substitute/').count() > 0, 'courtesy letter reserves appeal rights');
  ok(await p.locator('text=Situation').count() > 0, 'courtesy situation selector present');

  await p.keyboard.press('Escape'); await p.waitForTimeout(500); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  // ---- confirm & apply: denial letter updates the claim, duplicate is detected, 835 posts payment
  const letter = `Cigna\nLetter date: 10/20/2026\nClaim #: ${no}\nWe have denied this claim. Reason: CO-97 payment included in another service.\nYou may appeal within 180 days of the date of this notice.`;
  await p.getByRole('button', { name: 'Clear everything' }).click(); await p.waitForTimeout(300);
  await p.locator('textarea').first().fill(letter); await p.getByRole('button', { name: 'Analyze' }).click(); await p.waitForTimeout(700);
  ok(await p.locator('text=/Proposed updates/').count() > 0, 'proposed updates listed'); ok(await p.locator('text=Appeal deadline').count() > 0, 'appeal deadline proposed');
  const before = await p.evaluate((n) => { const c = __arms.getState().claims.find((x) => x.claim_no === n); return { codes: c.denial_codes, notes: __arms.getState().notes.length }; }, no);
  await p.getByRole('button', { name: /Confirm & apply \d+ update/ }).click(); await p.waitForTimeout(1200);
  const after = await p.evaluate((n) => { const c = __arms.getState().claims.find((x) => x.claim_no === n); return { codes: c.denial_codes, deadline: c.custom?.appeal_deadline, hashes: (c.custom?.ocr_hashes || []).length, notes: __arms.getState().notes.length }; }, no);
  ok(/CO-97/.test(after.codes || ''), 'denial code written to the claim'); ok(after.deadline === '2027-04-18', 'appeal deadline recorded (letter date + 180 days)'); ok(after.hashes === 1 && after.notes > before.notes, 'note added and document fingerprint stored');
  await p.getByRole('button', { name: 'Clear everything' }).click(); await p.waitForTimeout(300); await p.locator('textarea').first().fill(letter); await p.getByRole('button', { name: 'Analyze' }).click(); await p.waitForTimeout(700);
  ok(await p.locator('text=/already filed/').count() > 0, 'duplicate document is flagged');
  // 835
  const claim = await p.evaluate(() => { const c = __arms.getState().claims.find((x) => !x.closed_at && x.balance > 100); return { no: c.claim_no, bal: c.balance, paid: c.paid_amt || 0 }; });
  const isa = 'ISA*00*          *00*          *ZZ*PAYER          *ZZ*PRACTICE       *261005*1200*^*00501*000000001*0*P*:~'; ok(isa.length === 106, 'fixture ISA is 106 chars');
  const x835 = [isa, 'GS*HP*PAYER*PRACTICE*20261005*1200*1*X*005010X221A1~', 'ST*835*0001~', 'BPR*I*80.00*C*ACH*CCP*01*999999999*DA*123456*1512345678**01*999988880*DA*98765*20261005~', 'TRN*1*EFT7001*1512345678~', 'N1*PR*AETNA~', 'N1*PE*CLINIC*XX*1234567893~', `CLP*${claim.no}*1*100.00*80.00*0.00*12*ICN9001*11~`, 'CAS*CO*45*20.00~', 'SE*9*0001~', 'GE*1*1~', 'IEA*1*000000001~'].join('');
  await p.getByRole('button', { name: 'Clear everything' }).click(); await p.waitForTimeout(300); await p.locator('textarea').first().fill(x835); await p.getByRole('button', { name: 'Analyze' }).click(); await p.waitForTimeout(900);
  ok(await p.locator('text=835 remittance').count() > 0, '835 recognised'); ok(await p.locator('text=/Remittance — /').count() > 0, 'remittance plan shown');
  const postBtn = p.getByRole('button', { name: /Confirm & post 1 claim/ }); ok(await postBtn.count() > 0, 'matched claim ready to post'); await postBtn.click(); await p.waitForTimeout(1500);
  ok(await p.evaluate((n) => { const c = __arms.getState().claims.find((x) => x.claim_no === n); return c.custom?.era?.trace === 'EFT7001'; }, claim.no), '835 payment posted to the claim');
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); process.exit(bad ? 1 : 0);
})();
