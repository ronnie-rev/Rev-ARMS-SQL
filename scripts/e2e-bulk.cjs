// End-to-end: worklist bulk action with preview → apply → undo from Bulk history; smart priority column; scorecards + admin rule tabs render.
const { chromium } = require('playwright'); const URL = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  let bad = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  await p.goto(URL + '/worklist'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav'); await p.waitForTimeout(1200);
  await p.goto(URL + '/worklist'); await p.waitForSelector('table.grid tbody tr'); await p.waitForTimeout(800);
  ok(await p.locator('th:has-text("Priority")').count() > 0, 'Priority column present');
  const first = await p.evaluate(() => __arms.getState().claims.filter((c) => !c.closed_at).slice(0, 0).length);
  await p.locator('table.grid tbody tr input[type=checkbox]').nth(0).check(); await p.locator('table.grid tbody tr input[type=checkbox]').nth(1).check(); await p.locator('table.grid tbody tr input[type=checkbox]').nth(2).check();
  await p.getByRole('button', { name: /Bulk actions/ }).click(); await p.waitForSelector('text=Preview');
  await p.locator('label:has-text("Action") select').selectOption('priority'); await p.waitForTimeout(300);
  await p.locator('label:has-text("Value") select').selectOption('Low'); await p.waitForTimeout(400);
  ok(/will change/.test(await p.locator('body').innerText()), 'preview shows what will change');
  await p.getByRole('button', { name: /^Apply to/ }).click(); await p.waitForTimeout(1200);
  const ops = await p.evaluate(() => __arms.getState().bulkOps.map((o) => [o.changed_count, o.status])); ok(ops.length === 1 && ops[0][0] >= 1, 'bulk op recorded ' + JSON.stringify(ops));
  const crit = await p.evaluate(() => __arms.getState().claims.filter((c) => c.priority === 'Low').length);
  await p.evaluate(() => history.pushState({}, '', '/bulk') || dispatchEvent(new PopStateEvent('popstate'))); await p.waitForSelector('text=Bulk history'); await p.getByRole('button', { name: /Undo/ }).first().click(); await p.getByRole('button', { name: /^(OK|Confirm|Yes|Undo)$/ }).last().click().catch(() => {}); await p.waitForTimeout(1200);
  const after = await p.evaluate(() => ({ crit: __arms.getState().claims.filter((c) => c.priority === 'Low').length, st: __arms.getState().bulkOps[0].status })); ok(after.st === 'undone' && after.crit < crit, `undo reverted the change (${crit} → ${after.crit}, ${after.st})`);
  for (const r of ['/scorecards', '/admin?tab=bulkrules', '/admin?tab=prirules', '/admin?tab=scorerules', '/admin?tab=reimb', '/appeals', '/underpay', '/radar']) { await p.evaluate((r) => history.pushState({}, '', r) || dispatchEvent(new PopStateEvent('popstate')), r); await p.waitForTimeout(500); ok((await p.locator('main').innerText()).length > 80, 'renders ' + r); }
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); process.exit(bad ? 1 : 0);
})();
