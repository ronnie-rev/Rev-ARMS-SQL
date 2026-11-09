// Rebuilt Knowledge hub (Find / Denials / How-to / Reference), legacy deep links, and the merged sidebar sections.
const { chromium } = require('playwright');
const URL_ = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1700, height: 1200 } })).newPage(); let bad = 0; const errs = [];
  const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p.goto(URL_ + '/'); await p.getByText('Priya Nair', { exact: true }).first().click(); await p.waitForSelector('aside nav');
  const go = async (u) => { await p.goto(URL_ + u); await p.waitForTimeout(1300); };

  // ---- structure
  await go('/knowledge'); const tabs = await p.locator('[role=tab], .seg button, button').filter({ hasText: /^(Find|Denials|How-to|Reference)$/ }).count(); ok(tabs >= 4, 'four tabs: Find, Denials, How-to, Reference');
  ok(await p.getByText('Academy', { exact: true }).count() === 0 && await p.getByText('Triage', { exact: true }).count() === 0 && await p.getByText('Root cause & CAPA').count() === 0, 'the old academy / triage / CAPA tabs are gone');

  // ---- Find: code lookup → guide
  const box = p.getByLabel('Search the knowledge base'); await box.fill('co50'); await p.waitForTimeout(500);
  ok(await p.locator('text=CARC 50').count() > 0 && await p.locator('text=Usually means').count() > 0 && await p.locator('text=First move').count() > 0, 'typing a code shows meaning, cause and first move');
  ok(await p.locator('text=Your results with this code').count() > 0, 'code card shows your own results');
  await p.getByRole('button', { name: /Open the step-by-step denial guide/ }).click(); await p.waitForTimeout(900); ok(await p.locator('text=Recommended action').count() > 0 && /tab=denials/.test(p.url()), 'code card opens the denial guide');
  // ---- Find: natural language
  await go('/knowledge'); await p.getByLabel('Search the knowledge base').fill('how do I read an ERA'); await p.waitForTimeout(500); ok(await p.locator('text=Reading an ERA (835)').count() > 0, 'plain-English question finds the ERA guide');
  await p.locator('button:has-text("Reading an ERA (835)")').first().click(); await p.waitForTimeout(800); ok(await p.locator('text=Steps').count() > 0 && await p.locator('text=Check before you finish').count() > 0, 'guide shows steps and a checklist');
  // ---- Denials
  await go('/knowledge?tab=denials'); await p.getByRole('button', { name: 'Timely filing', exact: true }).click(); await p.waitForTimeout(600); ok(await p.locator('text=/Timely filing/').count() > 1, 'symptom chip filters the denial list');
  await p.getByRole('button', { name: 'Many claims, same issue' }).click(); await p.waitForTimeout(400); ok(await p.locator('text=How you spot it').count() > 0, 'bulk-pattern guides available');
  // ---- How-to: call script
  await go('/knowledge?tab=howto&item=t:call'); await p.locator('select').first().selectOption({ index: 3 }); await p.waitForTimeout(400); ok(await p.locator('text=Open the call').count() > 0 && await p.locator('text=Close the call').count() > 0, 'call script builder renders opening, questions and close');
  await go('/knowledge?tab=howto&item=t:sops'); ok(await p.locator('text=Client rules').count() > 0, 'client SOPs live under How-to');
  // ---- Reference
  await go('/knowledge?tab=reference&sec=deadlines'); ok(await p.locator('text=Your filing & appeal limits').count() > 0 && await p.locator('text=Original Medicare').count() > 0, 'Reference → deadlines: your limits + standard appeal ladders');
  await go('/knowledge?tab=reference&sec=payers'); ok(await p.locator('text=/Payer directory|Policy finder/').count() > 0, 'Reference → payers: your payer directory and policy finder (the old Library)');
  await go('/knowledge?tab=reference&sec=tables&table=Place%20of%20Service'); ok(await p.locator('td:has-text("Telehealth")').count() > 0, 'Reference → code tables');
  await go('/knowledge?tab=reference&sec=codes'); await p.locator('input[placeholder^="Filter by code"]').fill('necessity'); await p.waitForTimeout(400); await p.locator('tbody tr').first().click(); await p.waitForTimeout(700); ok(/tab=find/.test(p.url()) && await p.locator('text=CARC').count() > 0, 'clicking a code row opens its card');

  // ---- legacy links still land somewhere sensible
  await go('/knowledge?tab=scenarios&code=CO-50'); ok(await p.locator('text=Recommended action').count() > 0, 'old "scenarios" link opens the denial guide');
  await go('/knowledge?tab=academy'); ok(await p.locator('text=Work a claim').count() > 0, 'old "academy" link lands on How-to');
  await go('/library'); ok(await p.locator('h1, h2').count() > 0, '/library still opens');

  // ---- merged sidebar
  await go('/'); const side = await p.locator('aside nav').innerText(); ok(/Knowledge/.test(side) && !/\bLibrary\b/.test(side) && !/Payer scorecards/.test(side) && !/Client Outreach/.test(side) && !/X12 viewer/.test(side) && !/Faxes/.test(side), 'sidebar: Library, scorecards, outreach, X12 viewer and Faxes merged into their hubs');
  await go('/payers'); await p.getByRole('tab', { name: 'Scorecards & alerts' }).click(); await p.waitForTimeout(900); ok(/\/scorecards/.test(p.url()), 'Payers hub switches to scorecards');
  await go('/requests'); ok(await p.getByRole('tab', { name: 'Outreach to clients' }).count() > 0, 'Client comms hub bar on Requests');
  await go('/appeals'); await p.getByRole('tab', { name: 'Faxes sent' }).click(); await p.waitForTimeout(700); ok(/\/faxes/.test(p.url()), 'Appeals hub switches to faxes');
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); process.exit(bad ? 1 : 0);
})();
