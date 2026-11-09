// Full-app audit: every route × every demo role. Flags page errors, console errors, failed requests, blank pages,
// horizontal overflow, leaked "undefined / NaN / [object Object] / Invalid Date" text, unlabeled buttons and broken images.
// Writes docs/audit-results.json. Usage: node scripts/e2e-audit.cjs   (needs vite preview on :4173)
const { chromium } = require('playwright'); const fs = require('fs');
const URL = process.env.URL || 'http://localhost:4173'; const SIZE = process.env.SEED || '';
const STAFF = ['/', '/account', '/help', '/me', '/worklist', '/aging', '/requests', '/outreach', '/clients', '/payers', '/knowledge', '/library', '/insights', '/productivity', '/pivot', '/reports', '/allocation', '/import', '/imports', '/era', '/exceptions', '/rules', '/missing', '/faxes', '/huddle', '/edi', '/health', '/bulk', '/radar', '/intelligence', '/tools', '/appeals', '/underpay', '/scorecards', '/unresolved', '/closed', '/qa', '/qa?tab=trends', '/qa?tab=queue', '/qa?tab=reviews', '/qa?tab=disputes', '/qa?tab=calibration', '/qa?tab=mine', '/qa?tab=settings', '/audit-log', '/admin', '/knowledge?tab=rcm', '/knowledge?tab=academy', '/knowledge?tab=scenarios', '/knowledge?tab=playbooks', '/knowledge?tab=directory', '/knowledge?tab=deadlines', '/knowledge?tab=rca'];
const ADMIN_TABS = ['doctor', 'audit', 'stages', 'import', 'permissions', 'security', 'carc', 'articles', 'resources', 'playbooks', 'letters', 'outcomes', 'backup', 'users', 'access', 'snippets', 'clients', 'buckets', 'statuses', 'lifecycle', 'rca', 'actions', 'lists', 'payers', 'fields', 'templates', 'workspace', 'limits', 'reimb', 'aforms', 'scorerules', 'bulkrules', 'prirules'].map((t) => '/admin?tab=' + t);
const CONTROL = ['/allocation', '/import', '/imports', '/era', '/exceptions', '/rules', '/missing', '/bulk', '/audit-log'];
const PROD = ['/', '/account', '/help', '/me', '/worklist', '/aging', '/radar', '/intelligence', '/tools', '/appeals', '/underpay', '/scorecards', '/unresolved', '/closed', '/qa', '/productivity', '/knowledge', '/pivot', '/reports'];
const LEAD_ROUTES = STAFF.filter((r) => !r.startsWith('/admin'));
// role → [sign-in name, routes to crawl, routes that must be blocked, expected sidebar sections present, sections that must be absent]
const ROLES = {
  'Sr. Management': ['Alex Morgan', [...STAFF, ...ADMIN_TABS], [], ['Quality', 'Control', 'Admin'], []],
  Admin: ['Jordan Blake', [...CONTROL, '/', '/qa', '/worklist', '/knowledge', '/admin?tab=users', '/admin?tab=clients', '/admin?tab=buckets', '/admin?tab=backup', '/admin?tab=doctor'], [], ['Quality', 'Control', 'Admin'], []],
  Manager: ['Priya Nair', [...STAFF.filter((r) => !r.startsWith('/admin')), '/admin?tab=clients', '/admin?tab=playbooks', '/admin?tab=letters', '/admin?tab=payers', '/admin?tab=controls', '/admin?tab=recrules', '/admin?tab=intelrules', '/admin?tab=golive', '/admin?tab=limits', '/admin?tab=reimb', '/admin?tab=aforms', '/admin?tab=scorerules', '/admin?tab=bulkrules', '/admin?tab=prirules', '/admin?tab=doctor'], [], ['Quality', 'Control', 'Admin'], []],
  'Team Lead (QA & Production)': ['Rajat Mehta', LEAD_ROUTES, ['/admin'], ['Quality', 'Control'], ['Admin']],
  'Team Lead (QA)': ['Dana Whitfield', LEAD_ROUTES.filter((r) => r !== '/me'), ['/admin'], ['Quality', 'Control'], ['Admin']],
  'SME (Production + QA)': ['Neha Kapoor', LEAD_ROUTES, ['/admin'], ['Quality', 'Control'], ['Admin']],
  'SME (QA)': ['Karan Shah', LEAD_ROUTES.filter((r) => r !== '/me'), ['/admin'], ['Quality', 'Control'], ['Admin']],
  'QA Analyst (External)': ['Lena Fischer', ['/qa', '/qa?tab=queue', '/qa?tab=reviews', '/qa?tab=calibration', '/worklist', '/knowledge'], [...CONTROL, '/admin'], ['Quality'], ['Control', 'Admin']],
  'User (Production + QA)': ['Arjun Patel', [...PROD, '/qa?tab=mine', '/qa?tab=queue'], [...CONTROL, '/admin'], ['Quality'], ['Control', 'Admin']],
  'User (Production)': ['Sana Iqbal', [...PROD, '/qa?tab=mine'], [...CONTROL, '/admin'], ['Quality'], ['Control', 'Admin']],
  Client: ['Practice Manager (Dr. Ramineni)', ['/portal', '/portal/claims', '/portal/report', '/requests', '/account', '/help'], ['/worklist', '/admin', '/qa', '/pivot', ...CONTROL], [], ['Control', 'Admin', 'Quality']],
};
const BAD_TEXT = /\b(undefined|NaN|\[object Object\]|Invalid Date|null)\b/;
(async () => {
  const b = await chromium.launch(); const findings = []; let pages = 0;
  for (const [role, [who, routes, deny, present, absent]] of Object.entries(ROLES)) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); if (SIZE) await ctx.addInitScript((z) => localStorage.setItem('arms:seedsize', z), SIZE); const p = await ctx.newPage(); let cur = '';
    const add = (kind, msg) => findings.push({ role, route: cur, kind, msg: String(msg).slice(0, 220) });
    p.on('pageerror', (e) => add('pageerror', e)); p.on('console', (m) => m.type() === 'error' && !/favicon|fonts\.g/.test(m.text()) && add('console', m.text())); p.on('requestfailed', (r) => !/fonts\.g|googleapis|gstatic/.test(r.url()) && add('request', r.url()));
    await p.goto(URL + '/'); await p.getByText(who, { exact: true }).first().click().catch(() => add('login', 'cannot sign in as ' + who)); await p.waitForSelector('aside nav, main', { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(1500);
    for (const r of routes) {
      cur = r; pages++; await p.goto(URL + r); await p.waitForTimeout(700);
      const res = await p.evaluate((badSrc) => {
        const bad = new RegExp(badSrc); const main = document.querySelector('main') || document.body; const out = []; const t = main.innerText || '';
        if (t.trim().length < 40) out.push(['blank', 'page body nearly empty (' + t.trim().length + ' chars)']);
        const m = t.match(bad); if (m) { const i = t.search(bad); out.push(['bad-text', `"${m[0]}" near: ${t.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ')}`]); }
        const iso = t.match(/\b\d{4}-\d{2}-\d{2}\b/); if (iso) out.push(['date-format', `ISO date "${iso[0]}" shown instead of MM/DD/YYYY`]);
        if (document.documentElement.scrollWidth > innerWidth + 4) out.push(['overflow', `page scrolls horizontally (${document.documentElement.scrollWidth}px > ${innerWidth}px)`]);
        const unl = [...main.querySelectorAll('button')].filter((x) => !(x.textContent || '').trim() && !x.getAttribute('aria-label') && !x.getAttribute('title')); if (unl.length) out.push(['a11y', `${unl.length} icon-only button(s) without label/title`]);
        const img = [...document.images].filter((x) => x.complete && x.naturalWidth === 0); if (img.length) out.push(['image', `${img.length} broken image(s)`]);
        const unlInp = [...main.querySelectorAll('input:not([type=hidden]):not([type=checkbox]),select,textarea')].filter((x) => !x.getAttribute('aria-label') && !x.getAttribute('placeholder') && !x.getAttribute('title') && !x.id && !x.closest('label') && !x.closest('.field')); if (unlInp.length > 3) out.push(['a11y', `${unlInp.length} form controls without label/placeholder`]);
        return out;
      }, BAD_TEXT.source); res.forEach(([k, m]) => add(k, m));
    }
    // sidebar sections: present / absent
    cur = '(sidebar)'; await p.goto(URL + '/'); await p.waitForTimeout(500); const side = (await p.locator('aside').first().innerText()).toUpperCase();
    for (const sec of present) if (!side.includes(sec.toUpperCase())) add('access', `${role}: sidebar is missing the ${sec} section`);
    for (const sec of absent) if (side.includes(sec.toUpperCase())) add('access', `${role}: sidebar shows the ${sec} section but should not`);
    for (const r of deny) { cur = r + ' (should be blocked)'; await p.goto(URL + r); await p.waitForTimeout(600); const body = await p.locator('main').first().innerText().catch(() => ''); const url = p.url().replace(URL, ''); const blocked = !url.startsWith(r) || /don.t have access|permission/i.test(body); if (!blocked) add('access', `${role} reached ${r} with content (${body.length} chars)`); }
    await ctx.close();
  }
  await b.close(); const sev = { pageerror: 'critical', blank: 'critical', login: 'critical', console: 'high', request: 'high', 'bad-text': 'medium', 'date-format': 'medium', access: 'critical', overflow: 'medium', image: 'medium', a11y: 'low' };
  const out = findings.map((f) => ({ ...f, severity: sev[f.kind] || 'low' })); fs.mkdirSync('docs', { recursive: true }); fs.writeFileSync('docs/audit-results.json', JSON.stringify({ at: new Date().toISOString(), pages, findings: out }, null, 1));
  const by = {}; out.forEach((f) => { const k = `${f.severity}|${f.kind}|${f.msg}|${f.route}`; by[k] = by[k] || f; }); const uniq = Object.values(by);
  console.log(`pages visited: ${pages}; findings: ${out.length}; unique: ${uniq.length}`); const cnt = {}; out.forEach((f) => (cnt[f.severity] = (cnt[f.severity] || 0) + 1)); console.log(cnt);
  uniq.sort((a, c) => ['critical', 'high', 'medium', 'low'].indexOf(a.severity) - ['critical', 'high', 'medium', 'low'].indexOf(c.severity)).slice(0, 60).forEach((f) => console.log(`[${f.severity}] ${f.role} ${f.route} ${f.kind}: ${f.msg}`));
  process.exitCode = out.some((f) => f.severity === 'critical' || f.severity === 'high') ? 1 : 0;
})();
