// OCR is FROZEN at the reviewed release. This script fails if the OCR packages or the self-hosted OCR files change without a deliberate, reviewed update.
//   node scripts/ocr-lock.cjs            verify (used by `npm run deps:review` and CI)
//   node scripts/ocr-lock.cjs --update   re-record the lock after you have re-reviewed licenses, advisories and docs/OCR_SECURITY.md
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const root = path.resolve(__dirname, '..'); const lockFile = path.join(root, 'docs', 'ocr-lock.json');
const PKGS = ['tesseract.js', 'tesseract.js-core', '@tesseract.js-data/eng'];
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function current() {
  const pj = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); const packages = {};
  for (const n of PKGS) { const inst = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', n, 'package.json'), 'utf8')); packages[n] = { declared: pj.dependencies[n], installed: inst.version, license: inst.license }; }
  const files = {}; const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : (files[path.relative(path.join(root, 'public', 'ocr'), path.join(d, e.name)).replace(/\\/g, '/')] = sha(path.join(d, e.name)))));
  walk(path.join(root, 'public', 'ocr')); return { frozenAt: new Date().toISOString().slice(0, 10), note: 'OCR is frozen. Do not upgrade without re-running the review in docs/OCR_SECURITY.md.', packages, sha256: files };
}
const cur = current();
if (process.argv.includes('--update')) { fs.writeFileSync(lockFile, JSON.stringify(cur, null, 2) + '\n'); console.log('OCR lock updated:', Object.entries(cur.packages).map(([n, p]) => `${n}@${p.installed}`).join(', ')); process.exit(0); }
const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8')); const problems = [];
for (const n of PKGS) { const a = lock.packages[n], b = cur.packages[n]; if (!a || a.installed !== b.installed || a.declared !== b.declared || a.license !== b.license) problems.push(`${n}: locked ${a?.installed} (${a?.license}) but found ${b.installed} (${b.license}), declared "${b.declared}"`); if (!/^\d+\.\d+\.\d+$/.test(String(b.declared))) problems.push(`${n}: version must be pinned exactly (found "${b.declared}")`); }
for (const [f, h] of Object.entries(lock.sha256)) if (cur.sha256[f] !== h) problems.push(`OCR file changed or missing: ${f}`);
for (const f of Object.keys(cur.sha256)) if (!lock.sha256[f]) problems.push(`Unexpected new OCR file: ${f}`);
if (problems.length) { console.error('OCR lock FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`OCR lock OK (${Object.values(lock.packages).map((p) => p.installed).join(' / ')}, ${Object.keys(lock.sha256).length} files verified)`);
