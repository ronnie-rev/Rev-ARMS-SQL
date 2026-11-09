// Clicks every "Add"/"New"/"+" button on every Admin tab and checks that something was created (DOM grows or a row appears) without an error toast.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1000 } }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  const base = process.env.URL || 'http://localhost:4173';
  await p.goto(base + '/'); await p.waitForTimeout(1200); await p.getByText('Alex Morgan', { exact: true }).first().click(); await p.waitForTimeout(2500);
  const tabs = ['users', 'clients', 'payers', 'buckets', 'stages', 'lifecycle', 'statuses', 'rca', 'actions', 'lists', 'fields', 'templates', 'carc', 'articles', 'playbooks', 'outcomes', 'snippets', 'letters', 'resources', 'access'];
  let bad = 0;
  for (const t of tabs) {
    await p.goto(base + '/admin?tab=' + t); await p.waitForTimeout(600);
    const btns = p.locator('main button').filter({ hasText: /^\s*(Add|New|Bulk add|Add status|Add client user|Customize lifecycle)\b/ });
    const n = await btns.count(); if (!n) { console.log(t.padEnd(10), 'no add button'); continue; }
    for (let i = 0; i < Math.min(n, 3); i++) {
      const label = (await btns.nth(i).innerText()).trim(); if (/Bulk/.test(label)) continue;
      const before = await p.locator('main').innerText(); const beforeCount = await p.locator('main input, main select, main textarea').count();
      p.once('dialog', (d) => d.accept('QA1'));
      await btns.nth(i).click({ timeout: 4000 }).catch(() => {}); await p.waitForTimeout(500);
      const toast = await p.locator('.fixed.bottom-4 >> text=/already exists|required|invalid|must be|cannot|empty/i').count();
      const after = await p.locator('main').innerText(); const afterCount = await p.locator('main input, main select, main textarea').count();
      const changed = after !== before || afterCount !== beforeCount || (await p.locator('.fixed').count()) > 0;
      if (!changed || toast) { bad++; console.log('FAIL', t, JSON.stringify(label), changed ? 'validation toast' : 'nothing happened'); } else console.log('ok  ', t.padEnd(10), JSON.stringify(label));
      if ((await p.locator('.fixed').count()) > 0) await p.keyboard.press('Escape');
    }
  }
  console.log('failures:', bad, 'errors:', errs.slice(0, 4)); await b.close();
})();
