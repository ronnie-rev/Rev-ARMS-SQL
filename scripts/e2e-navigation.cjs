// Clicks every sidebar link, every sub-bar pill and the breadcrumb links; fails if the URL doesn't change or the page is blank.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }); const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await p.goto(process.env.URL || 'http://localhost:4173/'); await p.waitForTimeout(1200); await p.getByText('Alex Morgan', { exact: true }).first().click(); await p.waitForTimeout(2500);
  const links = await p.locator('aside nav a.nav-item').evaluateAll((els) => els.map((e) => ({ href: e.getAttribute('href'), text: e.innerText.trim() })));
  let bad = 0;
  for (const l of links) { await p.goto('http://localhost:4173/worklist'); await p.waitForTimeout(250); await p.locator(`aside nav a.nav-item[href="${l.href}"]`).first().click(); await p.waitForTimeout(500); const ok = (p.url().replace('http://localhost:4173', '') === l.href) && (await p.locator('main').first().innerText()).length > 80; if (!ok) { bad++; console.log('FAIL sidebar', l.text, l.href, '→', p.url()); } }
  console.log('sidebar links tested:', links.length, 'failed:', bad);
  await p.goto('http://localhost:4173/worklist'); await p.waitForTimeout(600);
  const pills = await p.locator('div.overflow-x-auto.border-b a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  let pb = 0; for (const h of pills) { await p.locator(`a[href="${h}"]`).last().click(); await p.waitForTimeout(400); if (p.url().replace('http://localhost:4173', '') !== h) { pb++; console.log('FAIL pill', h, p.url()); } }
  console.log('sub-bar pills tested:', pills.length, 'failed:', pb);
  await p.goto('http://localhost:4173/aging'); await p.waitForTimeout(500); await p.getByRole('link', { name: 'Home', exact: true }).click(); await p.waitForTimeout(500); console.log('home button →', p.url());
  await p.getByRole('button', { name: 'Back', exact: true }).click(); await p.waitForTimeout(400); console.log('back →', p.url());
  await p.getByRole('link', { name: /Knowledge/ }).first().click(); await p.waitForTimeout(800); console.log('knowledge button →', p.url());
  console.log('errors', errs.slice(0, 4), 'build stamp:', (await p.locator('aside').innerText()).match(/build [^\n]+/)?.[0]); await b.close();
})();
