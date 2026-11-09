// Copies the OCR engine into public/ocr so the browser never has to reach a CDN (HIPAA: no document data, worker code or language files fetched from third parties).
// Runs automatically before `npm run build` and `npm run dev`. Sources are the exact, pinned npm releases (see package.json).
const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..'); const out = path.join(root, 'public', 'ocr');
const nm = (...p) => path.join(root, 'node_modules', ...p);
const files = [
  [nm('tesseract.js', 'dist', 'worker.min.js'), path.join(out, 'worker.min.js')],
  [nm('tesseract.js', 'dist', 'worker.min.js.LICENSE.txt'), path.join(out, 'worker.min.js.LICENSE.txt')],
  // every build the library may pick for this browser (plain, SIMD, relaxed-SIMD × LSTM / legacy); each is a single self-contained .wasm.js file
  ...fs.readdirSync(nm('tesseract.js-core')).filter((f) => /^tesseract-core.*\.wasm\.js$/.test(f)).map((f) => [nm('tesseract.js-core', f), path.join(out, 'core', f)]),
  [nm('tesseract.js-core', 'LICENSE'), path.join(out, 'core', 'LICENSE')],
  [nm('@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'), path.join(out, 'lang', 'eng.traineddata.gz')],
];
let n = 0;
for (const [src, dst] of files) {
  if (!fs.existsSync(src)) { console.error('OCR asset missing (run npm install):', src); process.exit(1); }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size) { fs.copyFileSync(src, dst); n++; }
}
console.log(`OCR assets ready in public/ocr (${n} copied, ${files.length} total)`);
