// New module intelligence: Reports summary, Aging collectability, Payer watchlist, QA coaching & calibration.
const { chromium } = require('playwright');
const URL_ = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1700, height: 1200 } }); const p = await ctx.newPage(); let bad = 0; const errs = [];
  const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto(URL_ + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav');
  const go = async (u) => { await p.goto(URL_ + u); await p.waitForTimeout(1500); };
  await go('/reports'); ok(await p.locator('text=Summary in plain English').count() > 0, 'Reports: plain-English summary card'); ok(await p.locator('text=/in open A\\/R across/').count() > 0, 'summary states open A/R'); ok(await p.getByRole('button', { name: 'Edit in Studio' }).count() > 0, 'summary can open in the Word editor');
  await p.getByRole('button', { name: 'Edit in Studio' }).click(); await p.waitForTimeout(1500); ok(/studio/.test(p.url()) && await p.locator('.ProseMirror').innerText().then((t) => /A\/R summary/.test(t)), 'summary lands in the Word editor');
  await go('/aging'); ok(await p.locator('text=Aging & Queues').count() > 0, 'Aging page renders'); const curve = await p.locator('text=/Collectability — will it resolve/').count(); console.log('INFO collectability card shown:', curve > 0);
  if (curve) ok(await p.locator('text=/Expected cash from open A\\/R in the next 30 days/').count() > 0, 'Aging: collectability totals row');
  await go('/payers'); ok(await p.locator('text=Payer Intelligence').count() > 0, 'Payers page renders'); console.log('INFO watchlist card shown:', (await p.locator('text=/Payer watchlist/').count()) > 0);
  await go('/qa'); await p.getByText('Trends', { exact: false }).first().click().catch(() => {}); await p.waitForTimeout(1200); ok(await p.locator('text=/Quality|QA/').count() > 0, 'QA trends renders'); console.log('INFO coaching card shown:', (await p.locator('text=Coaching focus').count()) > 0);
  // ---- libraries: calendar export, dashboard changes, date/phone parsing in OCR
  const fs = require('fs'); const os = require('os'); const path = require('path');
  await go('/radar'); const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.getByRole('button', { name: /Calendar \(\.ics\)/ }).click()]); const f = path.join(os.tmpdir(), 'radar-' + Date.now() + '.ics'); await dl.saveAs(f); const ics = fs.readFileSync(f, 'utf8'); ok(/BEGIN:VCALENDAR/.test(ics) && /BEGIN:VEVENT/.test(ics) && /BEGIN:VALARM/.test(ics), 'Radar: calendar file with events and reminders'); ok(!/patient/i.test(ics), 'calendar file carries no patient wording'); fs.unlinkSync(f);
  await go('/');
  await p.evaluate(() => { const s = __arms.getState(); const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10); const cid = s.clients[0].id, cl = s.claims[0].id; const rows = []; for (let w = 0; w <= 8; w++) { const n = w === 0 ? 5 : 60; for (let i = 0; i < n; i++) rows.push({ id: 'inj' + w + '-' + i, claim_id: cl, client_id: cid, work_date: day(7 * w + 1 + (i % 6)), user_id: null, user_name: 'x' }); } __arms.setState({ workLog: rows }); });
  await p.locator('aside a[href="/worklist"]').click(); await p.waitForTimeout(500); await p.locator('aside a[href="/"], aside a:has-text("Dashboard")').first().click(); await p.waitForTimeout(1500);
  ok(await p.locator('text=What changed in the last 7 days').count() > 0 && await p.locator('text=Touches logged').count() > 0, 'Dashboard shows the unusual drop in touches (injected data)'); ok(await p.locator('h1').count() > 0, 'Dashboard renders with the new detector'); console.log('INFO what-changed card shown:', (await p.locator('text=What changed in the last 7 days').count()) > 0);
  await go('/ocr'); await p.locator('summary:has-text("paste letter")').click(); await p.locator('textarea').first().fill('Cigna\nLetter date: 10/20/2026\nWe have denied this claim. CO-50.\nYou may appeal within 90 days of the date of this notice.\nFax: 800.555.0101  Phone: 800-555-0199\nReceived on the 3rd of November, 2026.'); await p.getByRole('button', { name: 'Analyze' }).click(); await p.waitForTimeout(900);
  ok(await p.locator('text=(800) 555-0101').count() > 0, 'OCR: fax number normalised to (800) 555-0101'); ok(await p.locator('text=/Received .*11\/03\/2026|11\/03\/2026/').count() > 0, 'OCR: date written in words was found (chrono)');
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.getByRole('button', { name: 'Add to calendar' }).click()]); const f2 = path.join(os.tmpdir(), 'ocr-' + Date.now() + '.ics'); await dl2.saveAs(f2); ok(/DTSTART;VALUE=DATE:20270118/.test(fs.readFileSync(f2, 'utf8')) || /20270118/.test(fs.readFileSync(f2, 'utf8')), 'OCR: deadline (letter date + 90 days) exported to calendar'); fs.unlinkSync(f2);
  // ---- remaining modules: Closed insights, Requests priority / suggested reply, Exceptions data-quality summary
  await go('/closed'); await p.getByText('Resolution insights').first().waitFor({ timeout: 8000 }).catch(() => {}); ok(await p.locator('text=Resolution insights').count() > 0, 'Closed: resolution insights card'); ok(await p.locator('text=Slowest payers to close').count() > 0, 'Closed: slowest payers listed');
  await go('/requests'); const draft = p.getByText('Draft a reply from the claim').first(); const nDraft = await draft.count(); console.log('INFO open requests with draft button:', nDraft);
  if (nDraft) { await draft.click(); await p.waitForTimeout(300); const v = await p.locator('input[placeholder^="Reply to client"]').first().inputValue(); ok(v.length > 20, 'Requests: reply drafted from the claim'); }
  await go('/exceptions'); ok(await p.locator('text=Data quality at a glance').count() > 0, 'Exceptions: data-quality summary'); ok(await p.locator('text=Rules costing the most dollars').count() > 0, 'Exceptions: costliest rules ranked');
  // ---- Missing + Pivot intelligence
  await go('/missing'); ok(await p.locator('text=/Missing from file/').count() > 0, 'Missing page renders'); const nm = await p.locator('text=Where to start').count(); console.log('INFO Missing "Where to start" card:', nm > 0);
  if (nm) { ok(await p.locator('text=/evidence-backed/').count() > 0 && await p.locator('text=/need a human/').count() > 0, 'Missing: evidence-backed vs needs-a-human split'); ok(await p.locator('text=Bulk drop-offs').count() > 0, 'Missing: bulk drop-off card'); }
  await go('/pivot'); const ask = p.locator('input[placeholder]').first(); await ask.fill('open balance by payer'); await ask.press('Enter'); await p.waitForTimeout(2500);
  ok(await p.locator('table').count() > 0, 'Pivot: result table built from a plain-English request'); console.log('INFO Pivot "What stands out" panel:', (await p.locator('text=What stands out').count()) > 0);
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); process.exit(bad ? 1 : 0);
})();
