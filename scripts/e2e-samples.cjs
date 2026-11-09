// Sample / export / import round-trip on every Admin list and upload screen; also checks Denial codes & Knowledge articles are populated.
const { chromium } = require('playwright'); const fs = require('fs');
const URL = process.env.URL || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  let bad = 0; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };
  await p.goto(URL + '/'); await p.getByText('Alex Morgan', { exact: true }).first().click(); await p.waitForSelector('aside nav'); await p.waitForTimeout(4000);
  const st = await p.evaluate(() => { const c = __arms.getState().config; const n = (k) => c.filter((o) => o.category === k).length; return { carc: n('carc'), kb: n('kb_article'), playbook: n('playbook'), letter: n('letter') }; });
  ok(st.carc > 150, `denial codes populated (${st.carc})`); ok(st.kb >= 10, `knowledge articles populated (${st.kb})`); ok(st.playbook >= 57 && st.letter >= 13, `playbooks ${st.playbook}, letters ${st.letter}`);
  const dl = async (name) => { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.getByRole('button', { name, exact: true }).first().click()]); const f = '/tmp/dl-' + Date.now() + '-' + d.suggestedFilename(); await d.saveAs(f); return { f, text: fs.readFileSync(f, 'utf8'), name: d.suggestedFilename() }; };
  const tabs = ['carc', 'articles', 'resources', 'playbooks', 'letters', 'outcomes', 'snippets', 'buckets', 'statuses', 'lists', 'fields', 'stages', 'payers', 'users', 'clients', 'rca', 'actions'];
  for (const t of tabs) {
    await p.goto(URL + '/admin?tab=' + t); await p.waitForTimeout(700);
    try {
      const s = await dl('Sample'); const header = s.text.split('\n')[0]; ok(s.text.split('\n').length >= 2 && header.length > 3, `${t}: sample downloads (${s.name}) header: ${header.slice(0, 60)}`);
      const e = await dl('Export'); const rows = e.text.trim().split('\n').length - 1; 
      await p.locator('input[type=file][accept*=csv]').first().setInputFiles(e.f); await p.waitForTimeout(900);
      const toastTxt = (await p.locator('.fixed.bottom-4').allInnerTexts()).join(' | '); ok(/Imported/.test(toastTxt) && !/Missing column|failed/i.test(toastTxt), `${t}: re-import of ${rows} exported rows → ${toastTxt.slice(0, 90)}`);
      // and the sample itself imports cleanly (new rows)
      await p.locator('input[type=file][accept*=csv]').first().setInputFiles(s.f); await p.waitForTimeout(900); const t2 = (await p.locator('.fixed.bottom-4').allInnerTexts()).join(' | '); ok(/Imported/.test(t2), `${t}: sample file imports → ${t2.slice(0, 90)}`);
    } catch (e) { ok(false, `${t}: ${String(e).slice(0, 120)}`); }
  }
  await p.goto(URL + '/rules'); await p.waitForTimeout(800);
  try { const s = await dl('Sample'); const j = JSON.parse(s.text); ok(Array.isArray(j.rules) && j.rules.length > 0, 'rules: sample JSON valid'); const e = await dl('Export'); await p.locator('input[type=file][accept*=json]').first().setInputFiles(e.f); await p.waitForTimeout(900); ok(/Imported/.test((await p.locator('.fixed.bottom-4').allInnerTexts()).join(' ')), 'rules: export re-imports'); } catch (e) { ok(false, 'rules: ' + String(e).slice(0, 120)); }
  await p.goto(URL + '/allocation?tab=smart'); await p.waitForTimeout(800);
  try { await p.getByRole('tab', { name: /Smart/ }).click().catch(() => {}); const s = await dl('Sample'); ok(/name,client,payers/.test(s.text), 'allocation rules: sample CSV'); } catch (e) { ok(false, 'allocation: ' + String(e).slice(0, 100)); }
  for (const [u, label] of [['/import', /Download sample file/], ['/import#worklog', /Download sample file/], ['/era', /Download sample 835/]]) { await p.goto(URL + u.split('#')[0]); await p.waitForTimeout(800); if (u.includes('#worklog')) { await p.getByRole('tab', { name: /Legacy production tracker/ }).click(); await p.waitForTimeout(500); } const btn = p.getByRole('button', { name: label }).first(); if (!(await btn.count())) { const tabs = await p.getByRole('tab').allInnerTexts(); const wl = p.getByRole('tab', { name: /work/i }).first(); if (u.includes('worklog') && await wl.count()) await wl.click(); await p.waitForTimeout(400); } try { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 6000 }), p.getByRole('button', { name: label }).first().click()]); const f = '/tmp/dl-' + Date.now(); await d.saveAs(f); const txt = fs.readFileSync(f, 'utf8'); ok(txt.length > 50, `${u}: ${d.suggestedFilename()} (${txt.length} bytes)`); } catch (e) { ok(false, `${u}: no sample download (${String(e).slice(0, 80)})`); } }
  await p.goto(URL + '/admin?tab=backup'); await p.waitForTimeout(700); try { const s = await dl('Sample file'); ok(JSON.parse(s.text).format === 'arms-config', 'backup: sample config JSON'); } catch (e) { ok(false, 'backup sample ' + String(e).slice(0, 80)); }
  const have = await p.evaluate(() => { const s = __arms.getState(); return { field: s.config.some((o) => o.category === 'field' && o.value === 'Visit location'), client: s.clients.some((c) => c.name === 'Example Orthopedics'), payer: s.config.some((o) => o.category === 'payer' && o.value === 'Aetna'), article: s.config.some((o) => o.category === 'kb_article' && o.value === 'Weekly denial review meeting'), rca: s.config.some((o) => o.category === 'rca_detail' && o.value === 'Missing/Invalid Modifier' && o.parent === 'Coding') }; });
  ok(Object.values(have).every(Boolean), 'sample rows really landed in the store ' + JSON.stringify(have));
  ok(errs.length === 0, 'no page errors ' + errs.join('|')); await b.close(); console.log(bad ? `FAILURES: ${bad}` : 'ALL PASS'); process.exitCode = bad ? 1 : 0;
})();
