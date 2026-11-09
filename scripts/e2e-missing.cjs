// End-to-end: import file M1 (40 claims) then M2 (32 of them + 8 new) through the real Import screen; the 8 absent claims must wait in
// "Missing from file", a supervisor resolves them (paid / written off / restore), and the closed claim keeps its full history.
const { chromium } = require('playwright'); const fs = require('fs');
const URL = process.env.URL || 'http://localhost:4173';
const csv = (rows) => ['Claim Number,Patient Name,Date of Service,Payer,CPT,Billed Amt,Balance,Encounter #', ...rows.map((r) => r.join(','))].join('\n');
const row = (n, bal = 250) => [`MX${1000 + n}`, `"PATIENT${n}, TEST"`, '04/10/2026', 'Aetna', '99213', bal, bal, `ENC-${n}`];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  let bad = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  const m1 = csv(Array.from({ length: 40 }, (_, i) => row(i))); const m2 = csv([...Array.from({ length: 32 }, (_, i) => row(i)), ...Array.from({ length: 8 }, (_, i) => row(500 + i))]);
  fs.writeFileSync('/tmp/e2e/m1.csv', m1); fs.writeFileSync('/tmp/e2e/m2.csv', m2);
  await p.goto(URL + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav'); await p.waitForTimeout(1500);
  // a fresh practice so the numbers are exact
  const cid = await p.evaluate(async () => { const id = crypto.randomUUID(); await __arms.getState().save('clients', [{ id, name: 'Scenario Clinic', code: 'SCN', pms: 'Standard', color: '#10b981', supervisor_id: null, aging_basis: 'dos', tf_days: 365, rca_allowed: null, active: true, settings: {} }]); return id; }); await p.waitForTimeout(1200);
  const importFile = async (f, label) => {
    await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await p.waitForTimeout(500); await p.goto(URL + '/import'); await p.waitForTimeout(1500); await p.locator('select').first().selectOption(cid);
    await p.locator('input[type=file]').first().setInputFiles(f); await p.waitForSelector('text=Analyse file', { timeout: 20000 });
    await p.getByRole('button', { name: /Analyse file/ }).click(); await p.waitForTimeout(1200);
    const acks = p.locator('main input[type=checkbox]'); const n = await acks.count(); for (let i = 0; i < n; i++) { if (!(await acks.nth(i).isChecked())) await acks.nth(i).check().catch(() => {}); }
    const btn = p.getByRole('button', { name: /Import|Commit|Approve/ }).filter({ hasNotText: /Analyse|history/i }).last(); await btn.click(); await p.waitForSelector('text=/Import complete|imported|new ·/i', { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(1500); console.log('   imported', label);
  };
  await importFile('/tmp/e2e/m1.csv', 'M1');
  const s1 = await p.evaluate((cid) => { const s = __arms.getState(); const l = s.claims.filter((c) => c.client_id === cid); return { n: l.length, uids: new Set(l.map((c) => c.claim_uid)).size, withUid: l.filter((c) => /^RR-SCN-\d{2}-\d{7}-[0-9A-Z]$/.test(c.claim_uid || '')).length, enc: l.filter((c) => c.encounter_no).length }; }, cid);
  ok(s1.n === 40 && s1.uids === 40 && s1.withUid === 40, `M1: 40 claims, each with a unique permanent UID ${JSON.stringify(s1)}`); ok(s1.enc === 40, 'encounter # captured on every claim');
  await importFile('/tmp/e2e/m2.csv', 'M2');
  const s2 = await p.evaluate((cid) => { const s = __arms.getState(); const l = s.claims.filter((c) => c.client_id === cid); return { n: l.length, open: l.filter((c) => !c.closed_at).length, review: l.filter((c) => !c.closed_at && c.flags.includes('missing_review')).length, closed: l.filter((c) => c.closed_at).length, uids: new Set(l.map((c) => c.claim_uid)).size }; }, cid);
  ok(s2.n === 48 && s2.review === 8 && s2.closed === 0 && s2.uids === 48, `M2: 8 new, 8 absent → review queue, nothing closed silently ${JSON.stringify(s2)}`);
  await p.waitForTimeout(1500); await p.reload(); await p.waitForSelector('aside nav', { timeout: 30000 }); await p.waitForTimeout(1500);
  const s2b = await p.evaluate((cid) => { const l = __arms.getState().claims.filter((c) => c.client_id === cid); return { n: l.length, review: l.filter((c) => !c.closed_at && c.flags.includes('missing_review')).length, uids: new Set(l.map((c) => c.claim_uid)).size }; }, cid); ok(s2b.n === 48 && s2b.review === 8 && s2b.uids === 48, `everything survives a reload (saved to the database) ${JSON.stringify(s2b)}`);
  await p.goto(URL + '/missing'); await p.waitForTimeout(900); await p.getByPlaceholder(/Claim #/).fill('MX10'); await p.waitForTimeout(300);
  const rows = await p.locator('main tbody tr').count(); ok(rows >= 8, `Missing page lists the absent claims (${rows} rows with MX10 filter)`);
  // resolve one as paid via the dialog
  await p.getByRole('button', { name: 'Decide…' }).first().click(); await p.waitForTimeout(500); await p.getByRole('radio').first().check(); await p.locator('textarea').fill('EFT 99231 confirmed'); await p.getByRole('button', { name: /Confirm & close/ }).click(); await p.waitForTimeout(1200);
  // bulk write-off needs a reason; then restore two
  await p.locator('main tbody input[type=checkbox]').nth(0).check(); await p.locator('main tbody input[type=checkbox]').nth(1).check(); await p.getByRole('button', { name: /Write off/ }).click(); await p.waitForTimeout(400);
  ok(await p.getByRole('button', { name: /Confirm & close/ }).isDisabled(), 'write-off is blocked until a reason is entered'); await p.locator('textarea').fill('Timely filing exceeded — approved by client'); await p.getByRole('button', { name: /Confirm & close/ }).click(); await p.waitForTimeout(1200);
  await p.locator('main tbody input[type=checkbox]').nth(0).check(); await p.getByRole('button', { name: /Restore/ }).first().click(); await p.waitForTimeout(300); await p.locator('button.btn-primary', { hasText: 'Restore' }).click(); await p.waitForTimeout(1000);
  const s3 = await p.evaluate((cid) => { const s = __arms.getState(); const l = s.claims.filter((c) => c.client_id === cid); const closed = l.filter((c) => c.closed_at); return { review: l.filter((c) => !c.closed_at && c.flags.includes('missing_review')).length, closed: closed.length, paid: closed.filter((c) => c.resolution === 'paid').length, adj: closed.filter((c) => c.resolution === 'adjusted').length, byOk: closed.every((c) => c.resolved_by && c.resolved_at), recov: s.recoveries.filter((r) => r.client_id === cid && /^review_/.test(r.basis)).length, touches: s.workLog.filter((w) => w.client_id === cid && w.mode === 'Review').length }; }, cid);
  ok(s3.closed === 3 && s3.paid === 1 && s3.adj === 2 && s3.byOk && s3.review === 4, `decisions recorded: 1 paid, 2 written off, 1 restored (leaves the queue), 4 still waiting ${JSON.stringify(s3)}`); ok(s3.recov >= 3 && s3.touches === 3, `recoveries (${s3.recov}) and work-log entries (${s3.touches}) written for each closed claim`);
  // closed page + history
  await p.goto(URL + '/closed'); await p.waitForTimeout(900); await p.getByPlaceholder(/Claim #/).fill('MX10'); await p.waitForTimeout(400); const crows = await p.locator('main tbody tr').count(); ok(crows === 3, `Closed & resolved shows the 3 closed claims (${crows})`);
  await p.locator('main tbody tr').first().click(); await p.waitForTimeout(900); const drawer = await p.locator('[role=dialog], aside').last().innerText().catch(() => ''); ok(/Closed \d\d\/\d\d\/\d{4}/.test(await p.locator('body').innerText()), 'claim drawer shows the closed banner'); await p.getByRole('tab', { name: /Activity/ }).first().click().catch(() => {}); await p.waitForTimeout(500);
  const body = await p.locator('body').innerText(); ok(/Resolved on \d\d\/\d\d\/\d{4}/.test(body) && /Absent from the aging file/.test(body), 'full timeline: import, missing-from-file and the resolution are all recorded');
  // reopen reverses the recovery
  p.once('dialog', (d) => d.accept('Payer reversed the payment')); await p.getByRole('button', { name: 'Reopen' }).click(); await p.waitForTimeout(1200);
  const s4 = await p.evaluate((cid) => { const s = __arms.getState(); const l = s.claims.filter((c) => c.client_id === cid); return { closed: l.filter((c) => c.closed_at).length, back: l.filter((c) => !c.closed_at && c.flags.includes('reopened')).length, bal: l.filter((c) => c.flags.includes('reopened')).map((c) => c.balance) }; }, cid);
  ok(s4.closed === 2 && s4.back === 1 && s4.bal[0] > 0, `reopen restores the open balance ${JSON.stringify(s4)}`);
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); console.log(bad ? `FAILURES: ${bad}` : 'ALL PASS'); process.exitCode = bad ? 1 : 0;
})();
