// Point the Content-Security-Policy at your production API host in ALL four places at once (netlify.toml, public/.htaccess, deploy/nginx.conf, deploy/Caddyfile).
//   node scripts/set-api-host.cjs api.example.com            replaces the Supabase Cloud wildcard with your API host (production)
//   node scripts/set-api-host.cjs api.example.com --keep     adds your host and keeps *.supabase.co (during migration)
// tests/hosting.test.ts then confirms the files still agree.
const fs = require('fs'); const path = require('path'); const root = path.resolve(__dirname, '..');
const host = (process.argv[2] || '').replace(/^https?:\/\//, '').replace(/\/.*$/, ''); const keep = process.argv.includes('--keep');
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) { console.error('usage: node scripts/set-api-host.cjs api.your-domain.com [--keep]'); process.exit(1); }
const WILD = 'https://*.supabase.co wss://*.supabase.co'; const mine = `https://${host} wss://${host}`;
for (const f of ['netlify.toml', 'public/.htaccess', 'deploy/nginx.conf', 'deploy/Caddyfile']) {
  const p = path.join(root, f); let s = fs.readFileSync(p, 'utf8'); const before = s;
  if (s.includes(mine)) { console.log('already set  ', f); continue; }
  if (s.includes(WILD)) s = s.replace(WILD, keep ? `${WILD} ${mine}` : mine);
  else { console.error(`!! ${f}: expected connect-src fragment not found (already customised?) — edit by hand`); process.exitCode = 1; continue; }
  fs.writeFileSync(p, s); console.log('updated      ', f, s !== before ? '' : '(no change)');
}
