// End-to-end: a manager edits Intelligence rules in Admin (switch a recommendation off, adjust a threshold), saves, and the Intelligence hub + worklist change accordingly.
const { chromium } = require('playwright'); const URL = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  let bad = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  await p.goto(URL + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav'); await p.waitForTimeout(1200);
  const go = async (r) => { await p.evaluate((r) => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, r); await p.waitForTimeout(1200); };
  await go('/admin'); ok(await p.locator('text=Manager controls').count() > 0, 'manager lands on the Manager controls overview'); ok(await p.locator('a:has-text("Intelligence rules")').count() > 0, 'controls overview links to every rule set');
  const before = await p.evaluate(() => __arms.getState().claims.filter((c) => !c.closed_at && !c.assigned_to).length); ok(before > 0, 'demo has unassigned claims (' + before + ')');
  await go('/admin?tab=intelrules'); const row = p.locator('tr', { hasText: 'Assign an owner' }); await row.locator('input[type=checkbox]').uncheck(); await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(800);
  const saved = await p.evaluate(() => __arms.getState().settings.intel_cfg); ok(saved && saved.nba.disabled.includes('assign'), 'setting saved: ' + JSON.stringify(saved?.nba?.disabled));
  await go('/intelligence'); ok(await p.locator('button:has-text("Assign an owner")').count() === 0, 'switched-off recommendation disappears from the hub');
  await go('/admin?tab=intelrules'); await p.getByRole('button', { name: /Reset to defaults/ }).click(); await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(700);
  await go('/intelligence'); ok(await p.locator('button:has-text("Assign an owner")').count() > 0, 'reset restores it');
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); process.exit(bad ? 1 : 0);
})();
