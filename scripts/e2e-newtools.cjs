// Regression check for: payer trends (Radar), root-cause drift (Scorecards), staffing forecast (Productivity), virtualized Worklist, Quick find (cmdk), EDI viewer, PDF/Excel exports, letter compare.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path'); const os = require('os');
const URL_ = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1700, height: 1100 }, acceptDownloads: true }); const p = await ctx.newPage(); let bad = 0; const errs = [];
  const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200))); p.on('console', (m) => m.type() === 'error' && !/Failed to load|ERR_|fonts\./.test(m.text()) && errs.push(m.text().slice(0, 200)));
  await p.goto(URL_ + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav');
  const go = async (u) => { await p.goto(URL_ + u); await p.waitForTimeout(900); };
  // Radar → payer trends (Chart.js lazy)
  await go('/radar'); await p.getByText('Payer trends', { exact: false }).first().click(); await p.waitForTimeout(900); ok(await p.locator('text=Weekly denials').count() > 0 && await p.locator('canvas').count() > 0, 'Radar: payer trends tab renders a Chart.js chart');
  // Scorecards → drift
  await go('/scorecards'); await p.getByText('Root-cause drift', { exact: true }).click(); await p.waitForTimeout(900); ok(await p.locator('text=reason mix').count() > 0 || await p.locator('text=Biggest shifts by payer').count() > 0, 'Scorecards: root-cause drift tab renders');
  // Productivity → forecast
  await go('/productivity'); await p.getByText('Staffing forecast', { exact: true }).click(); await p.waitForTimeout(900); ok(await p.locator('text=Next 8 weeks').count() > 0 && await p.locator('canvas').count() > 0, 'Productivity: staffing forecast renders with chart');
  const before = await p.locator('text=/short by up to|capacity holds/').first().innerText(); await p.locator('input[type=range]').last().fill('8'); await p.waitForTimeout(500); const after = await p.locator('text=/short by up to|capacity holds/').first().innerText(); ok(before !== after || /holds/.test(after), `forecast reacts to "add people" (${before} → ${after})`);
  // Worklist: virtualized 500/page + PDF export + keyboard
  await go('/worklist'); await p.waitForSelector('table.grid tbody tr'); await p.locator('select[title^="Rows per page"]').selectOption('500'); await p.waitForTimeout(900);
  const n = await p.locator('table.grid tbody tr').count(); ok(n > 5 && n < 120, `Worklist virtualization renders a window of rows (${n} in DOM for up to 500)`);
  await p.locator('div.panel.overflow-auto').first().evaluate((el) => { el.scrollTop = 6000; }); await p.waitForTimeout(500); ok(await p.locator('table.grid tbody tr').count() > 5, 'Worklist still shows rows after scrolling');
  const [d1] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.getByRole('button', { name: 'PDF', exact: true }).first().click()]); const pdf = fs.readFileSync(await d1.path()); ok(pdf.slice(0, 5).toString() === '%PDF-' && pdf.length > 3000, `Worklist PDF export (${pdf.length} bytes)`);
  // Quick find (cmdk) with keyboard
  await go('/'); await p.keyboard.press('Control+k'); await p.waitForTimeout(400); const no = await p.evaluate(() => __arms.getState().claims[7].claim_no); await p.locator('input[placeholder^="Try:"]').fill(no.replace('-', '')); await p.waitForTimeout(500); ok(await p.locator('[cmdk-item]').count() > 0, 'Quick find lists results (cmdk)');
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(800); ok(await p.locator('text=Work claim').count() > 0, 'Quick find: arrow keys + Enter open the claim');
  // EDI viewer
  await go('/edi'); const isa = 'ISA*00*          *00*          *ZZ*PAYERID        *ZZ*PRACTICE       *260310*1200*^*00501*000000001*0*P*:~';
  const edi = [isa, 'GS*HP*P*PR*20260310*1200*1*X*005010X221A1~', 'ST*835*0001~', 'BPR*I*300.00*C*ACH*CCP*01*999999999*DA*123456*1234567890**01*888888888*DA*654321*20260312~', 'TRN*1*EFT12345*1234567890~', 'N1*PR*ACME HEALTH~', 'N1*PE*TEST PRACTICE*XX*1234567893~', 'CLP*CL-1001*1*500.00*300.00*0.00*12*ICN778899~', 'NM1*QC*1*DOE*JANE~', 'CAS*CO*45*200.00~', 'CLP*CL-1002*4*200.00*0.00*0.00*12*ICN778900~', 'CAS*CO*50*200.00~', 'SE*10*0001~', 'GE*1*1~', 'IEA*1*000000001~'].join('\n');
  const tmp = path.join(os.tmpdir(), 'sample.835'); fs.writeFileSync(tmp, edi); await p.locator('input[type=file]').setInputFiles(tmp); await p.waitForTimeout(700);
  ok(await p.locator('text=ACME HEALTH').count() > 0 && await p.locator('text=Denied').count() > 0, 'EDI viewer reads an 835 (payer + denied claim)');
  fs.rmSync(tmp, { force: true });
  // Reports quick packs PDF + Excel
  await go('/reports'); const [d2] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.getByRole('button', { name: 'Pack PDF' }).click()]); const pdf2 = fs.readFileSync(await d2.path()); ok(pdf2.slice(0, 5).toString() === '%PDF-', 'Client pack PDF export');
  // Letter compare (diff-match-patch)
  await go('/'); const cid = await p.evaluate(async () => { const st = __arms.getState(); const c = st.claims.find((x) => !x.closed_at && x.payer); await st.patchClaims([c.id], { denial_codes: 'CO-50' }); return c.id; }); await p.evaluate((i) => __arms.getState().openClaim(i), cid); await p.waitForSelector('text=Denial workup');
  await p.getByRole('button', { name: /Appeal \/ letter/ }).click(); await p.waitForSelector('.ProseMirror'); await p.locator('.ProseMirror').click(); await p.keyboard.press('Control+End'); await p.keyboard.type(' EXTRA SENTENCE ADDED BY STAFF.'); await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'See changes' }).click(); await p.waitForSelector('text=What changed in this letter'); ok(await p.locator('text=EXTRA SENTENCE ADDED BY STAFF').count() > 0 && await p.locator('.bg-green-500\\/25').count() > 0, 'Appeal: "See changes" shows the staff edit highlighted (diff-match-patch)');
  console.log('console/page errors:', errs.length ? errs.slice(0, 3) : 'none'); if (errs.length) bad++;
  await b.close(); console.log(bad ? `${bad} FAILED` : 'all new-tool checks passed'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
