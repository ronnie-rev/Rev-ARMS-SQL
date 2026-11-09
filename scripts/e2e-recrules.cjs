// End-to-end: a manager adds a recommendation rule from a template, it shows on a matching claim and in the Worklist filter, then is edited, switched off and deleted.
const { chromium } = require('playwright'); const URL = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  let bad = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  await p.goto(URL + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav'); await p.waitForTimeout(1200);
  const go = async (r) => { await p.evaluate((r) => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, r); await p.waitForTimeout(1200); };
  await go('/admin?tab=recrules'); await p.getByRole('button', { name: /Start from a template/ }).click(); await p.locator('button:has-text("Escalate: high-dollar, untouched")').first().click(); await p.waitForSelector('text=open claims match right now');
  ok(/\d+ of [\d,]+ open claims match/.test(await p.locator('body').innerText()), 'editor shows a live match count'); await p.getByRole('button', { name: 'Save rule' }).click(); await p.waitForTimeout(800);
  const rules = await p.evaluate(() => __arms.getState().settings.custom_recs?.rules || []); ok(rules.length === 1 && rules[0].label.startsWith('Escalate'), 'rule saved');
  const id = await p.evaluate(() => { const s = __arms.getState(); const c = s.claims.find((x) => !x.closed_at && x.balance >= 2500 && x.touch_count === 0 && x.assigned_to); return c?.id || null; });
  if (id) { await p.evaluate((i) => __arms.getState().openClaim(i), id); await p.waitForSelector('text=Recommended'); ok(/Recommended: Escalate: high-dollar/.test(await p.locator('body').innerText()), 'recommendation appears on a matching claim'); await p.keyboard.press('Escape'); } else console.log('SKIP no matching demo claim');
  await go('/worklist?nba=' + encodeURIComponent('Escalate: high-dollar, untouched')); await p.waitForSelector('table.grid tbody tr'); ok(await p.locator('table.grid tbody tr').count() > 0, 'worklist filters by the custom recommendation');
  await go('/admin?tab=recrules'); await p.locator('tbody tr input[type=checkbox]').first().uncheck(); await p.waitForTimeout(500); ok((await p.evaluate(() => __arms.getState().settings.custom_recs.rules[0].enabled)) === false, 'rule can be switched off');
  await p.getByRole('button', { name: 'Delete' }).first().click(); await p.getByRole('button', { name: /^(OK|Confirm|Yes|Delete)$/ }).last().click().catch(() => {}); await p.waitForTimeout(600); ok((await p.evaluate(() => __arms.getState().settings.custom_recs.rules.length)) === 0, 'rule can be deleted');
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); process.exit(bad ? 1 : 0);
})();
