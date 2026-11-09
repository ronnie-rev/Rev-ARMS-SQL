// One-off: extract the content libraries from an Appeal Forge HTML file into JSON for ClaimsIQ.
// usage: node scripts/extract-forge.cjs <appeal-forge.html> <outDir>
const fs = require('fs'), vm = require('vm'); const [src, out] = process.argv.slice(2);
const html = fs.readFileSync(src, 'utf8').split('\n'); const start = html.findIndex((l, i) => i > 20000 && l.startsWith('/* ============================= SEED DATA'));
const L = html.slice(start, start + 35).join('\n'); const ctx = {}; vm.createContext(ctx); vm.runInContext(L.replace(/\bconst\b/g, 'var').replace(/\blet\b/g, 'var'), ctx);
fs.mkdirSync(out, { recursive: true });
const content = { v: ctx.SEED_VERSION, chargeGroups: ctx.CHARGE_GROUPS, cptMeta: ctx.CPT_META, codeTemplates: ctx.CODE_TEMPLATES, archetypes: ctx.ARCHETYPES, scenarios: ctx.SEED_SCENARIOS.filter((s) => s.templateBody).map(({ id, chargeGroup, cptCodes, denialCategory, denialDetail, providerRole, payerId, archetype, archetypeName, templateBody, frequency }) => ({ id, chargeGroup, cptCodes, denialCategory, denialDetail, providerRole, payerId, archetype, archetypeName, templateBody, frequency })), cptRationale: ctx.SEED_CPT_RATIONALE, denialRationale: ctx.SEED_DENIAL_RATIONALE, denialCategories: ctx.DENIAL_CATEGORIES, appealLevels: ctx.APPEAL_LEVELS };
fs.writeFileSync(out + '/forge-content.json', JSON.stringify(content));
const setup = { payers: ctx.SEED_PAYERS, providers: ctx.SEED_PROVIDERS, senders: ctx.SEED_SENDERS, clients: ctx.SEED_CLIENTS.map(({ logo, ...c }) => ({ ...c, hasLogo: !!logo })) };
fs.writeFileSync(out + '/forge-setup.json', JSON.stringify(setup));
console.log('content', (fs.statSync(out + '/forge-content.json').size / 1024) | 0, 'KB; scenarios', content.scenarios.length, 'setup', (fs.statSync(out + '/forge-setup.json').size / 1024) | 0, 'KB');
