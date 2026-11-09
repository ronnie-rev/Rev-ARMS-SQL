// End-to-end: appeal builder auto-picks a letter from the denial code, saves/tracks an appeal level, uploads a payer PDF form that auto-maps its fields,
// and the underpayment detector flags a short-paid claim.
const { chromium } = require('playwright'); const URL = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  let bad = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  await p.goto(URL + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav'); await p.evaluate(() => __arms.getState().login(__arms.getState().profiles.find((x) => x.role === 'sr_mgmt').id)); await p.waitForTimeout(800);
  const cid = await p.evaluate(async () => { const s = __arms.getState(); const c = s.claims.find((x) => !x.closed_at && x.payer); await s.patchClaims([c.id], { denial_codes: 'CO-29', pms_status: 'Denied', denial_date: new Date().toISOString().slice(0, 10) }); return c.id; });
  await p.evaluate((id) => __arms.getState().openClaim(id), cid); await p.waitForSelector('text=Denial workup'); ok(true, 'denial workup panel shows for a denied claim');
  ok(await p.locator('text=Timely filing denial (CO-29)').count() > 0, 'code-tied checklist (CO-29) is shown');
  await p.getByRole('button', { name: /Appeal \/ letter/ }).click(); await p.waitForSelector('.ProseMirror'); const txt = await p.locator('.ProseMirror').innerText();
  ok(/timely|untimely|filing/i.test(txt), 'letter matched from the library for a timely-filing denial'); ok(await p.locator('text=Smart library').count() > 0, 'smart library controls present'); ok(/Sincerely/.test(txt) && /RE:/.test(txt), 'letter has addressee, RE line and signature'); ok(!/\{\{\w+/.test(txt), 'no raw merge tokens left');
  await p.getByRole('button', { name: /Save draft/ }).click(); await p.waitForTimeout(600);
  const a1 = await p.evaluate((id) => __arms.getState().appeals.filter((a) => a.claim_id === id).map((a) => [a.level, a.status]), cid); ok(a1.length === 1 && a1[0][0] === 1, 'appeal L1 saved ' + JSON.stringify(a1));
  await p.keyboard.press('Escape');
  // payer form upload (admin)
  await p.goto(URL + '/admin?tab=aforms'); await p.waitForTimeout(1200); await p.locator('input[type=file]').setInputFiles('/tmp/e2e/form.pdf'); await p.waitForTimeout(2500);
  const pf = await p.evaluate(() => __arms.getState().payerForms.map((f) => f.field_map.fields)); ok(pf.length === 1 && pf[0].PatientName === '{patient}' && pf[0]['Claim Number'] === '{claim}' && pf[0]['Amount Disputed'] === '{balance}', 'form fields auto-mapped ' + JSON.stringify(pf));
  // underpayment
  const u = await p.evaluate(async () => { const s = __arms.getState(); const c = s.claims.find((x) => !x.closed_at && x.payer && x.id); await s.patchClaims([c.id], { expected_amt: 200, expected_src: 'fee_schedule', paid_amt: 120, allowed_amt: 120 }); return c.claim_no; }); await p.waitForTimeout(2000);
  await p.goto(URL + '/underpay'); await p.waitForTimeout(1200); ok(await p.locator(`text=${u}`).count() > 0, 'underpaid claim listed on /underpay');
  await p.goto(URL + '/appeals'); await p.waitForSelector('text=Open appeals'); ok(true, 'appeals tracker loads');
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); process.exit(bad ? 1 : 0);
})();
