// Serves ./dist exactly like Netlify does (SPA fallback + the security headers from netlify.toml) so CSP/HSTS-sensitive features can be tested locally.
//   node scripts/serve-dist.cjs [port]
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..', 'dist'); const port = Number(process.argv[2] || 4180);
const toml = fs.readFileSync(path.resolve(__dirname, '..', 'netlify.toml'), 'utf8');
const block = toml.split('[[headers]]').find((b) => /for = "\/\*"/.test(b)) || '';
const headers = {}; for (const m of block.matchAll(/^\s+([A-Za-z-]+) = "(.*)"\s*$/gm)) if (m[1] !== 'for') headers[m[1]] = m[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
  res.writeHead(200, { ...headers, 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log(`serving dist on http://localhost:${port} with ${Object.keys(headers).length} security headers`));
