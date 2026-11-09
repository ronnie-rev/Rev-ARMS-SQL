// Hyperlink audit: for every role and page, click Home / logo / header links, then visit every distinct internal link found on the page
// and verify it lands on real content; external links must open safely (target=_blank + rel=noopener). Writes docs/links-results.json.
const { chromium } = require('playwright'); const fs = require('fs');
const URL = process.env.URL || 'http://localhost:4173';
const ROLES = { Admin: ['Alex Morgan', '/'], Supervisor: ['Priya Nair', '/'], Specialist: ['Sana Iqbal', '/me'], 'QA Reviewer': ['Dana Whitfield', '/'], Client: ['Practice Manager (Dr. Ramineni)', '/portal'] };
const PAGES = { staff: ['/', '/me', '/worklist', '/aging', '/requests', '/outreach', '/clients', '/payers', '/knowledge', '/library', '/insights', '/productivity', '/pivot', '/reports', '/allocation', '/import', '/imports', '/era', '/exceptions', '/rules', '/qa', '/audit-log', '/admin', '/knowledge?tab=rcm', '/knowledge?tab=directory'], client: ['/portal', '/portal/claims', '/portal/report', '/requests'] };
(async () => {
  const b = await chromium.launch(); const bad = []; let checked = 0; const seen = new Set();
  for (const [role, [who, home]] of Object.entries(ROLES)) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); let cur = ''; const fail = (kind, msg) => bad.push({ role, page: cur, kind, msg });
    p.on('pageerror', (e) => fail('pageerror', String(e).slice(0, 160)));
    await p.goto(URL + '/'); await p.getByText(who, { exact: true }).first().click(); await p.waitForTimeout(1500);
    const pages = role === 'Client' ? PAGES.client : PAGES.staff; const hrefs = new Map();
    for (const pg of pages) {
      cur = pg; await p.goto(URL + pg); await p.waitForTimeout(500);
      // Home breadcrumb + logo + Back/Forward
      const crumb = p.getByRole('link', { name: 'Home', exact: true }); checked++;
      if (await crumb.count()) { await crumb.first().click(); await p.waitForTimeout(350); const path = p.url().replace(URL, ''); if (path !== home) fail('home', `Home breadcrumb went to ${path} (expected ${home})`); else if ((await p.locator('main').first().innerText()).trim().length < 40) fail('home', 'Home page blank'); } else if (pg !== home) fail('home', 'no Home breadcrumb link at 1440px');
      await p.goto(URL + pg); await p.waitForTimeout(300);
      for (const a of await p.locator('a[href]').evaluateAll((els) => els.map((e) => ({ href: e.getAttribute('href'), target: e.target, rel: e.rel, text: (e.innerText || e.getAttribute('aria-label') || e.title || '').trim().slice(0, 40) })))) {
        if (!a.href || a.href === '#' || a.href.startsWith('javascript')) { fail('dead-link', `href="${a.href}" text="${a.text}"`); continue; }
        if (/^https?:|^mailto:|^tel:/.test(a.href)) { if (/^https?:/.test(a.href) && !(a.target === '_blank' && /noopener/.test(a.rel))) fail('external', `${a.href} lacks target=_blank rel=noopener`); continue; }
        if (!hrefs.has(a.href)) hrefs.set(a.href, pg);
      }
    }
    for (const [h, from] of hrefs) {
      cur = `${h}  (linked from ${from})`; checked++; const k = role + h; if (seen.has(k)) continue; seen.add(k);
      await p.goto(URL + h); await p.waitForTimeout(450); const path = p.url().replace(URL, ''); const txt = (await p.locator('main').first().innerText().catch(() => '')).trim();
      if (txt.length < 40) fail('broken-link', `${h} → blank page`); else if (/page not found|404/i.test(txt.slice(0, 200))) fail('broken-link', `${h} → 404`);
      void path;
    }
    await ctx.close();
  }
  await b.close(); fs.writeFileSync('docs/links-results.json', JSON.stringify({ at: new Date().toISOString(), checked, bad }, null, 1));
  console.log(`link checks: ${checked}; problems: ${bad.length}`); bad.slice(0, 40).forEach((x) => console.log(`[${x.kind}] ${x.role} ${x.page}: ${x.msg}`)); process.exitCode = bad.length ? 1 : 0;
})();
