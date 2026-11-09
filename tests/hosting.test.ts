import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
const read = (f: string) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const pick = (s: string, re: RegExp) => re.exec(s)?.[1];
describe('security headers are identical on every host (Netlify, Apache/LiteSpeed, nginx, Caddy)', () => {
  const toml = read('netlify.toml');
  const want = { csp: pick(toml, /Content-Security-Policy = "(.*)"/)!, hsts: pick(toml, /Strict-Transport-Security = "(.*)"/)!, perm: pick(toml, /Permissions-Policy = "(.*)"/)! };
  it('netlify.toml defines them', () => { expect(want.csp).toContain("default-src 'self'"); expect(want.hsts).toContain('max-age='); });
  for (const f of ['public/.htaccess', 'deploy/nginx.conf', 'deploy/Caddyfile']) it(`${f} matches netlify.toml`, () => { const s = read(f); expect(s).toContain(want.csp); expect(s).toContain(want.hsts); expect(s).toContain(want.perm); expect(s).toMatch(/X-Frame-Options/); });
});
