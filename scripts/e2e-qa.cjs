// QA end-to-end: auditor samples → reviews with keyboard → fails a critical criterion → analyst acknowledges → admin changes settings.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
  await p.goto(URL + '/'); await p.getByText('Dana Whitfield').first().click(); await p.waitForSelector('aside nav'); await p.waitForTimeout(1500);
  await p.goto(URL + '/qa?tab=queue'); await p.waitForTimeout(800);
  const before = await p.evaluate(() => __arms.getState().qaReviews.filter((r) => r.status === 'queued').length);
  await p.getByRole('button', { name: /Generate sample/ }).first().click(); await p.getByRole('button', { name: 'Generate', exact: true }).click(); await p.waitForTimeout(1200);
  const after = await p.evaluate(() => __arms.getState().qaReviews.filter((r) => r.status === 'queued').length); ok(after > before, `sample generated (${before} → ${after})`);
  await p.getByRole('button', { name: /^Review$|Resume/ }).first().click(); await p.waitForTimeout(800);
  for (let i = 0; i < 7; i++) await p.keyboard.press('p'); await p.keyboard.press('f'); await p.waitForTimeout(200);
  ok(await p.getByPlaceholder(/What went wrong/).count() === 1, 'fail opens the error form');
  await p.getByPlaceholder(/What went wrong/).fill('Adjustment posted without approval'); await p.getByRole('button', { name: /Submit review/ }).click(); await p.waitForTimeout(800);
  const done = await p.evaluate(() => __arms.getState().qaReviews.filter((r) => r.result === 'critical' && r.status === 'completed').length); ok(done >= 1, 'critical review stored');
  const analyst = await p.evaluate(() => { const s = __arms.getState(); const r = s.qaReviews.filter((x) => x.status === 'completed').sort((a, c) => c.updated_at.localeCompare(a.updated_at))[0]; return s.profiles.find((x) => x.id === r.analyst_id).full_name; });
  await p.evaluate(() => __arms.getState().logout()); await p.waitForTimeout(500); await p.getByText(analyst).first().click(); await p.waitForSelector('aside nav'); await p.waitForTimeout(800);
  await p.goto(URL + '/qa'); await p.waitForTimeout(800); ok(await p.getByRole('button', { name: /Acknowledge/ }).count() > 0, `${analyst} sees reviews to acknowledge`);
  ok(await p.getByRole('tab', { name: 'Settings' }).count() === 0, 'analyst has no Settings tab');
  await p.getByRole('button', { name: /Acknowledge/ }).first().click(); await p.waitForTimeout(500);
  await p.evaluate(() => __arms.getState().logout()); await p.waitForTimeout(500); await p.getByText('Alex Morgan').first().click(); await p.waitForSelector('aside nav'); await p.waitForTimeout(800);
  await p.goto(URL + '/qa?tab=settings'); await p.waitForTimeout(800); const n = p.locator('input[type=number]').first(); await n.fill('12'); await p.getByRole('button', { name: /Save settings/ }).click(); await p.waitForTimeout(500);
  ok(await p.evaluate(() => __arms.getState().qaConfig.sample_rate_pct) === 12, 'sample rate saved from Settings');
  await p.getByRole('tab', { name: 'Scorecard' }).click(); const w = p.locator('main input[type=number]').nth(1); await w.fill('30'); await p.getByRole('button', { name: /Save settings/ }).click(); await p.waitForTimeout(400);
  ok(await p.evaluate(() => __arms.getState().qaConfig.forms[0].version) === 1, 'invalid weights (≠100) are rejected');
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close();
})();
