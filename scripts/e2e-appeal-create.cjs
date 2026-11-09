// Create-appeal entry points: Appeals "New appeal" picker, bulk drafts from the To-do tab and Worklist, claim drawer button.
const { chromium } = require('playwright');
const URL_ = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1700, height: 1100 } })).newPage(); let bad = 0; const errs = [];
  const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto(URL_ + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav');
  const go = async (u) => { await p.goto(URL_ + u); await p.waitForTimeout(1000); };
  await go('/appeals'); await p.getByRole('button', { name: /New appeal/ }).click(); await p.waitForTimeout(400);
  ok(await p.locator('input[placeholder^="Claim #"]').count() > 0, 'picker opens'); await p.locator('input[placeholder^="Claim #"]').fill(''); await p.locator('.max-h-80 button').first().click(); await p.waitForTimeout(900);
  ok(await p.locator('text=/Letter|Strategy/').count() > 0, 'picker → appeal builder opens'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  const before = await p.evaluate(() => __arms.getState().appeals.length);
  await p.getByText('Denied, no appeal yet', { exact: false }).first().click(); await p.waitForTimeout(500);
  const boxes = p.locator('input[aria-label^="Select C"], input[aria-label^="Select "]:not([aria-label="Select all"])');
  if (await boxes.count() >= 2) { await boxes.nth(0).check(); await boxes.nth(1).check(); await p.getByRole('button', { name: /Draft 2 appeals/ }).click(); await p.waitForTimeout(300); await p.getByRole('button', { name: /^(OK|Confirm|Yes)/ }).first().click(); await p.waitForTimeout(1500); ok(await p.evaluate(() => __arms.getState().appeals.length) >= before + 2, 'bulk draft created 2 appeals'); } else ok(true, 'no denied-without-appeal claims in demo (bulk skipped)');
  await go('/worklist'); await p.waitForSelector('table.grid tbody tr'); await p.locator('table.grid tbody tr input[type=checkbox]').nth(0).check(); ok(await p.getByRole('button', { name: 'Draft appeals' }).count() > 0, 'Worklist bulk Draft appeals button');
  const b0 = await p.evaluate(() => __arms.getState().appeals.length);
  await p.locator('table.grid tbody tr input[type=checkbox]').nth(1).check(); await p.getByRole('button', { name: 'Draft appeals' }).click(); await p.waitForTimeout(300); await p.getByRole('button', { name: 'Confirm' }).click(); await p.waitForTimeout(2000);
  const b1 = await p.evaluate(() => __arms.getState().appeals.length); ok(b1 > b0, `Worklist bulk draft created ${b1 - b0} appeals`);
  await p.locator('table.grid tbody tr').first().click(); await p.waitForTimeout(900); ok(await p.getByRole('button', { name: /Create appeal|Open appeal/ }).count() > 0, 'claim drawer Create appeal button');
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); process.exit(bad ? 1 : 0);
})();
