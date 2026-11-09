// A tiny stand-in for the local document services, used ONLY by scripts/e2e-services.cjs to test ClaimsIQ's integration without Docker.
// It speaks the same paths as deploy/services/proxy.conf but returns canned results — it proves the app's wiring, NOT the real Gotenberg / Stirling-PDF / LanguageTool.
const http = require('http'); const { PDFDocument, StandardFonts } = require('pdf-lib');
async function pdfWith(lines) { const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica); const p = d.addPage([612, 792]); lines.forEach((l, i) => p.drawText(l, { x: 50, y: 720 - i * 20, size: 12, font: f })); return Buffer.from(await d.save()); }
function start(port = 8089) {
  const calls = [];
  const srv = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks); calls.push(req.method + ' ' + req.url);
    const json = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); }; const pdf = async (lines) => { res.writeHead(200, { 'content-type': 'application/pdf' }); res.end(await pdfWith(lines)); };
    if (req.url === '/gotenberg/health') return json({ status: 'up' });
    if (req.url === '/stirling/api/v1/info/status') return json({ status: 'UP' });
    if (req.url === '/languagetool/v2/languages') return json([{ name: 'English (US)', code: 'en', longCode: 'en-US' }]);
    if (req.url === '/gotenberg/forms/libreoffice/convert') return pdf(['Aetna', 'Letter date: 10/20/2026', 'Claim #: LEGACY-DOC-1', 'We have denied this claim. CO-50 not medically necessary.', 'You may appeal within 90 days of the date of this notice.']);
    if (req.url === '/stirling/api/v1/misc/compress-pdf') return pdf(['Compressed by the server']);
    if (req.url === '/stirling/api/v1/misc/ocr-pdf') return pdf(['OCR by the server: claim denied CLM-SRV-1']);
    if (req.url === '/languagetool/v2/check') { const text = new URLSearchParams(body.toString()).get('text') || ''; const matches = []; const re = /\bteh\b/g; let m; while ((m = re.exec(text))) matches.push({ message: 'Possible spelling mistake found.', shortMessage: 'Spelling mistake', offset: m.index, length: 3, rule: { id: 'MORFOLOGIK_RULE_EN_US', category: { name: 'Possible Typo' } }, replacements: [{ value: 'the' }], context: { text, offset: m.index, length: 3 } }); return json({ matches }); }
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => resolve({ close: () => srv.close(), calls, port })));
}
module.exports = { start };
if (require.main === module) start(Number(process.argv[2] || 8089)).then((s) => console.log('mock document services on', s.port));
