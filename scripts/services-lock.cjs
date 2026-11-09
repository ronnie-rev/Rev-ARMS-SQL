#!/usr/bin/env node
// Verifies the local document-services kit is exactly what was reviewed, and (with --live) that the services answer.
//   node scripts/services-lock.cjs            static checks: compose pins == versions.lock.json, proxy allow-list == lock, services stay offline, web-server config forwards /svc/
//   node scripts/services-lock.cjs --live     also calls the health endpoints through http://127.0.0.1:8088 (or SVC_URL)
const fs = require('fs'); const path = require('path'); const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..'); const dir = path.join(root, 'deploy', 'services'); const read = (f) => fs.readFileSync(f, 'utf8');
const lock = JSON.parse(read(path.join(dir, 'versions.lock.json'))); const compose = read(path.join(dir, 'docker-compose.yml')); const proxy = read(path.join(dir, 'proxy.conf'));
const bad = []; const ok = (c, m) => { if (!c) bad.push(m); console.log(c ? 'ok  ' : 'FAIL', m); };

for (const [id, s] of Object.entries(lock.services)) {
  const want = `${s.image}:${s.tag}@${s.digest}`; ok(compose.includes(`image: ${want}`), `${id}: compose pins ${s.image}:${s.tag} by digest`);
  ok(/^sha256:[0-9a-f]{64}$/.test(s.digest), `${id}: digest is a full sha256`);
}
const images = [...compose.matchAll(/image:\s*(\S+)/g)].map((m) => m[1]); ok(images.length === Object.keys(lock.services).length && images.every((i) => i.includes('@sha256:')), 'every image in compose is pinned by digest and listed in the lock');
const ports = [...compose.matchAll(/ports:\s*\[(.*?)\]/g)].map((m) => m[1]); ok(ports.length === 1 && /127\.0\.0\.1:8088:80/.test(ports[0]), 'only one published port, bound to 127.0.0.1');
ok(/internal:\s*\n\s*internal:\s*true/.test(compose), 'services run on an internal (no-internet) network');
const allowed = new Set(Object.values(lock.services).flatMap((s) => s.paths || [])); const inProxy = new Set([...proxy.matchAll(/location\s*=\s*(\S+)/g)].map((m) => m[1]));
ok([...allowed].every((p) => inProxy.has(p)) && [...inProxy].every((p) => allowed.has(p)), `proxy allow-list matches the lock (${inProxy.size} paths)`); ok(/location \/ \{ return 404; \}/.test(proxy), 'proxy denies everything else');
for (const f of ['deploy/nginx.conf', 'deploy/Caddyfile']) ok(/\/svc\//.test(read(path.join(root, f))), `${f} forwards /svc/ to the local proxy`);
ok(/SYSTEM_ENABLEANALYTICS:\s*"false"/.test(compose), 'Stirling analytics are off');
const dc = spawnSync('docker', ['compose', '-f', path.join(dir, 'docker-compose.yml'), 'config', '-q'], { encoding: 'utf8' }); if (dc.error || dc.status === null) console.log('skip docker compose config (docker not available)'); else ok(dc.status === 0, 'docker compose config validates' + (dc.status ? ': ' + dc.stderr.trim().slice(0, 160) : ''));

(async () => {
  if (process.argv.includes('--live')) {
    const base = (process.env.SVC_URL || 'http://127.0.0.1:8088').replace(/\/$/, '');
    for (const [name, p, test] of [['gotenberg', '/gotenberg/health', (j) => /up/i.test(j.status || '')], ['stirling', '/stirling/api/v1/info/status', (j) => /up/i.test(j.status || '')], ['languagetool', '/languagetool/v2/languages', (j) => Array.isArray(j) && j.length > 0]]) {
      try { const r = await fetch(base + p, { signal: AbortSignal.timeout(8000) }); const j = await r.json(); ok(r.ok && test(j), `${name} answers at ${p}`); } catch (e) { ok(false, `${name} did not answer at ${p} (${e.message})`); }
    }
  }
  if (bad.length) { console.error(`\n${bad.length} problem(s). The kit differs from the reviewed lock — fix it or update versions.lock.json after review.`); process.exit(1); }
  console.log('\nServices lock OK (' + Object.entries(lock.services).map(([k, s]) => `${k} ${s.tag}`).join(', ') + ')');
})();
