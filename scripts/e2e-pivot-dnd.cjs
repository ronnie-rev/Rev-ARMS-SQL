// Drags whole chips (not only a grip) between wells and reorders inside a well; prints the resulting well contents.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1000 } }); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await p.goto(process.env.URL || 'http://localhost:4173/'); await p.waitForTimeout(1200); await p.getByText('Alex Morgan', { exact: true }).first().click(); await p.waitForTimeout(2500);
  await p.goto((process.env.URL || 'http://localhost:4173') + '/pivot'); await p.waitForTimeout(1500);
  const drag = async (from, to, dy = 4) => { const a = await from.boundingBox(), t = await to.boundingBox(); await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await p.mouse.down(); await p.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2 + 8, { steps: 3 }); await p.mouse.move(t.x + t.width / 2, t.y + dy, { steps: 14 }); await p.mouse.up(); await p.waitForTimeout(350); };
  const wells = async () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('aside')].pop().querySelectorAll(':scope > div.rounded-xl')).constructor === Object ? [...[...document.querySelectorAll('aside')].pop().querySelectorAll(':scope > div.rounded-xl')].map((d) => d.innerText.replace(/\n+/g, ' | ')) : []);
  console.log('start      ', JSON.stringify(await wells()));
  const chip = (scope, t) => p.locator('aside').nth(scope).locator('span.truncate', { hasText: t }).first().locator('xpath=..');
  const label = (t) => chip(1, new RegExp('^' + t + '$'));
  const rows = chip(2, /^Payer$/);
  await drag(label('Client'), rows, -4);           // Client dropped ABOVE Payer in Rows
  console.log('client→rows ', JSON.stringify(await wells()), JSON.stringify(await p.evaluate(() => window.__dnd)));
  await drag(label('Visit type'), chip(2, /^Aging bucket$/), 20);   // into Columns after bucket
  console.log('visit→cols  ', JSON.stringify(await wells()));
  const vals = chip(2, /^Claims \(distinct\)$/); const first = chip(2, /^Outstanding AR/);
  await drag(vals, first, -6);                      // reorder values: Claims before AR
  console.log('values reord', JSON.stringify(await wells()), JSON.stringify(await p.evaluate(() => window.__dnd)));
  
  console.log('errors', errs); await b.close();
})();
