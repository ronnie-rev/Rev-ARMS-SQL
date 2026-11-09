# Hosting ClaimsIQ on your own domain (Hostinger or similar)

Netlify is the **development/preview** host. The production app is a static website (the `dist/` folder) plus a backend (database + sign-in). This page covers the website; see `docs/BACKEND_OPTIONS.md` for the backend.

## 1. What goes where
| Piece | Dev (now) | Production |
|---|---|---|
| Web app (HTML/JS/CSS/OCR files) | Netlify | Any web host that can serve static files over HTTPS (Hostinger, nginx, Caddy, S3+CDN…) |
| Security headers (HTTPS-only, CSP) | `netlify.toml` | `public/.htaccess` (Apache/LiteSpeed — Hostinger), `deploy/nginx.conf`, or `deploy/Caddyfile` — **identical policy, enforced by a test** |
| Database + sign-in | Supabase | See BACKEND_OPTIONS.md |
| Fax, inbound email, scheduled report emails (`netlify/functions/*`) | Netlify Functions | **Do not run on static hosting.** Keep them switched off until you run a small Node service for them (all four are currently disabled/placeholders) |

## 2. Deploy steps (static host)
1. On your computer: `npm ci`, then set the backend address and build:
   `VITE_SUPABASE_URL=https://api.YOUR-DOMAIN VITE_SUPABASE_ANON_KEY=… npm run build`
   (the build also copies the self-hosted OCR engine into `dist/ocr`).
2. Upload **everything inside `dist/`** (including the hidden `.htaccess`) to the site root (`public_html` on Hostinger). On Hostinger's file manager turn on "show hidden files" so `.htaccess` is not skipped.
3. Point the domain at the host and enable the free SSL certificate; force HTTPS.
4. Open the site and check headers: browser dev tools → Network → the page request → Response headers must include `Strict-Transport-Security` and `Content-Security-Policy`. Or run `curl -sI https://YOUR-DOMAIN | grep -i -E "strict|content-security"`.
5. **Update the policy for your backend address.** The policy's `connect-src` currently allows `https://*.supabase.co`. If your API lives at `https://api.YOUR-DOMAIN`, add it (and its `wss://` form for live updates) in **all four files** (`netlify.toml`, `public/.htaccess`, `deploy/nginx.conf`, `deploy/Caddyfile`) — `npm test` fails if they drift apart.
6. Every release: rebuild and re-upload `dist/`. Browsers always fetch `index.html` fresh (no-cache), so users get the new version on reload.

## 3. Things that differ from Netlify
- **Single-page routing:** the `.htaccess`/nginx/Caddy files send unknown paths to `index.html`; without them, reloading `/worklist` gives a 404.
- **WebAssembly type:** the OCR engine needs `.wasm` served with the right type — included in the config files.
- **Shared hosting limits:** shared plans cannot run Docker, a database server or Node services. A **VPS** can. If you want to self-host the backend (BACKEND_OPTIONS.md), you need a VPS or your own server, not shared hosting.
- **HIPAA:** the static host serves only public files (no PHI). Still choose a host whose terms you have read, and keep access to the upload account (FTP/SSH/hPanel) behind MFA — whoever can upload can change what staff browsers run.

## 4. Pre-launch checklist
- [ ] HTTPS everywhere, HSTS header visible
- [ ] CSP header visible; no console "Refused to…" errors on login, Tools (OCR), a PDF export
- [ ] Reload a deep link (`/worklist`) works
- [ ] `/third-party-licenses.txt` opens
- [ ] Hosting account MFA on; FTP disabled in favour of SFTP/hPanel if possible
- [ ] Netlify site paused or password-protected so a second copy of the app is not public
