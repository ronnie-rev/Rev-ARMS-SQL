const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 200)));
  await p.goto('http://localhost:4173/'); await p.waitForTimeout(1200); await p.getByText('Alex Morgan', { exact: true }).first().click(); await p.waitForTimeout(2500);
  await p.goto('http://localhost:4173/admin?tab=audit'); await p.waitForTimeout(1200);
  await p.getByRole('button', { name: /Run all/ }).click();
  await p.waitForFunction(() => /\d+ passed/.test(document.body.innerText) && !document.body.innerText.includes('Running…') && !/Cleaning up|Running \d+ checks|Creating dummy/.test(document.body.innerText), null, { timeout: 120000 });
  await p.waitForTimeout(800);
  const txt = await p.evaluate(() => document.body.innerText);
  const m = txt.match(/(\d+) passed\s*(\d+) failed\s*(\d+) skipped/); console.log('summary:', m && m.slice(1).join('/'));
  const fails = await p.evaluate(() => [...document.querySelectorAll('.text-red-500')].map((e) => e.closest('div.px-5')?.innerText.replace(/\n/g, ' | ')).filter(Boolean));
  console.log('FAILS:\n' + fails.join('\n'));
  await p.screenshot({ path: '/tmp/claude-0/shots/audit.png', fullPage: true }); console.log('errors', errs.slice(0, 5)); await b.close();
})();
