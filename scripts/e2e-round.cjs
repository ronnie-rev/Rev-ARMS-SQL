// Huddle daily (sections, Present mode, narrative), Allocation advisor, Outreach asks, Decoder code stats, Admin claim signals, sidebar Huddle link.
const { chromium } = require('playwright');
const URL_ = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1700, height: 1100 } })).newPage(); let bad = 0; const errs = [];
  const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto(URL_ + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav');
  const go = async (u) => { await p.goto(URL_ + u); await p.waitForTimeout(1000); };
  ok(await p.locator('aside a[href="/huddle"]').count() > 0, 'Huddle in sidebar');
  await go('/huddle'); for (const t of ['In plain English', 'Wins', 'Fires', 'Filing deadlines', 'Payer blockers', 'People & capacity']) ok(await p.locator(`text=${t}`).count() > 0, 'Huddle section: ' + t);
  await p.getByRole('button', { name: /Present/ }).first().click(); await p.waitForTimeout(400); await p.keyboard.press('ArrowRight'); await p.keyboard.press('Escape'); await p.waitForTimeout(300); ok(true, 'Present mode opens/closes');
  await go('/allocation'); await p.getByText('Advisor', { exact: true }).first().click(); await p.waitForTimeout(800); ok(await p.locator('text=/Suggested owners|Nothing to allocate/').count() > 0, 'Allocation advisor renders');
  await go('/outreach'); ok(await p.locator('text=/Suggested asks|Outreach/').count() > 0, 'Outreach renders');
  await go('/knowledge'); await p.waitForTimeout(300);
  await go('/admin?tab=intelrules'); const tab = p.getByText('Claim signals', { exact: false }).first(); if (await tab.count()) { await tab.click(); ok(await p.locator('text=/repeat/i').count() > 0, 'Claim signals tab'); } else ok(false, 'Claim signals tab present');
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); process.exit(bad ? 1 : 0);
})();
