// Boots the app on the 5,000+ claim stress dataset and times every major page; fails on page errors or slow renders.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('arms:seedsize')) localStorage.setItem('arms:seedsize', 'large'); } catch {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text().slice(0, 160)));
  const t0 = Date.now(); await p.goto(URL + '/'); await p.waitForSelector('text=Alex Morgan', { timeout: 120000 }); console.log('seed+boot ms', Date.now() - t0);
  await p.getByText('Alex Morgan').first().click(); await p.waitForSelector('aside nav', { timeout: 120000 }); console.log('login+load ms', Date.now() - t0);
  const stats = await p.evaluate(() => { const s = window.__arms?.getState?.(); return s ? { claims: s.claims.length, open: s.claims.filter((c) => !c.closed_at).length, touches: s.workLog.length, flagged: s.claims.filter((c) => (c.flags || []).some((f) => f.startsWith('chk:'))).length, qa: s.qaReviews.length } : null; });
  console.log('store', stats);
  const pages = ['/', '/worklist', '/aging', '/insights', '/closed', '/requests', '/productivity', '/pivot', '/qa', '/exceptions', '/reports', '/payers', '/clients', '/allocation', '/work'];
  let slow = 0;
  for (const u of pages) { const t = Date.now(); await p.evaluate((u) => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, u); await p.waitForTimeout(150); await p.waitForFunction(() => document.querySelector('main')?.innerText.length > 60, null, { timeout: 30000 }).catch(() => {}); const ms = Date.now() - t; if (ms > 4000) slow++; console.log(u.padEnd(14), ms + 'ms'); }
  console.log('slow pages (>4s):', slow, 'errors:', errs.slice(0, 5)); await p.screenshot({ path: process.env.SHOT || '/tmp/scale.png' }); await b.close(); process.exit(errs.length || slow ? 1 : 0);
})();
