// End-to-end: deadline radar renders, escalation flags a claim approaching its payer's timely-filing limit, Admin → Filing limits loads.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  let bad = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  await p.goto(URL + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav'); await p.evaluate(() => __arms.getState().login(__arms.getState().profiles.find((x) => x.role === 'sys_admin').id)); await p.waitForTimeout(500); await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => { const s = __arms.getState(); const c = s.claims.find((x) => !x.closed_at && x.payer); const dos = new Date(Date.now() - 170 * 864e5).toISOString().slice(0, 10);
    await s.save('payer_limits', [{ id: crypto.randomUUID(), payer: c.payer, client_id: null, plan_type: null, tfl_days: 180, afl_days: 180, ccfl_days: 180, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: 'e2e', notes: null, verified_on: null, active: true }]);
    await s.patchClaims([c.id], { dos, last_billed: null, pms_status: 'Unbilled' }); const out = await __arms.getState().runRadar(); const n = __arms.getState().claims.find((x) => x.id === c.id); return { out, flags: n.flags, radar: n.custom?.radar }; });
  ok(r.out.escalated >= 1 && r.radar && r.flags.includes('deadline_risk'), 'escalation flagged the near-TFL claim ' + JSON.stringify(r));
  await p.goto(URL + '/radar'); await p.waitForSelector('text=Countdown board'); ok(await p.locator('table tbody tr').count() > 0, 'radar lists claims');
  await p.evaluate(() => history.pushState({}, '', '/admin?tab=limits') || dispatchEvent(new PopStateEvent('popstate'))); await p.waitForTimeout(1500);  await p.waitForSelector('text=/Filing limits/'); ok(await p.locator('table tbody tr').count() >= 5, 'limits matrix shows starter payers');
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); process.exit(bad ? 1 : 0);
})();
