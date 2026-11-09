# Self-hosted production runbook (open-source Supabase on your own server)

**Status of this kit:** written and syntax-checked, with the secret generator and `.env` editing logic unit-tested; it has **not yet been run against a real server or Docker daemon** (none was available while writing it). Run the whole procedure first on a throw-away staging server with fake data, fix anything that differs for your pinned Supabase version, and only then build production. Treat the first run as the test.

## 0. What you are building
```
 staff browsers ──HTTPS──▶ Caddy (80/443, automatic certificates)
                              ├─ https://DOMAIN       → static app files (dist/)         — no PHI
                              └─ https://api.DOMAIN   → ONLY /rest/v1 /auth/v1 /realtime/v1
                                                         └▶ Supabase gateway (127.0.0.1:8000)
                                                              ├ Auth (sign-in, invites, password reset)
                                                              ├ PostgREST (API + row-level security)
                                                              ├ Realtime (live updates)
                                                              └ PostgreSQL  (127.0.0.1 only, encrypted volume)
 nightly: pg_dump ▶ age-encrypt ▶ /srv/backups ▶ (optional) off-server copy
```
Studio (the admin dashboard), the database port and every other Supabase endpoint are **never** exposed to the internet; use an SSH tunnel when you need Studio.

## 1. Before you start — decisions and paperwork
- [ ] **Server:** Linux VPS or dedicated machine, Ubuntu 22.04/24.04 LTS, ≥ 4 vCPU, ≥ 8 GB RAM, ≥ 100 GB SSD (self-hosted Supabase runs a dozen containers; size up for large clients). Not shared hosting.
- [ ] **Provider + BAA:** ask in writing whether the provider signs a HIPAA BAA for *that exact product* (AWS, Azure and Google Cloud do for eligible services; many budget VPS providers, and possibly Hostinger, do not — I could not verify). If they will not sign, either choose one that does or keep PHI off it. File the signed BAA.
- [ ] **Domain** with DNS access: `DOMAIN` (app) and `api.DOMAIN` (API) both pointing at the server's IP.
- [ ] **Email (SMTP)** provider for invites and password resets (those emails contain no PHI, so a BAA is not required for that purpose).
- [ ] **Backups:** generate an `age` key pair **on your own computer** (not the server): `age-keygen -o claimsiq-backup-key.txt` → keep that file offline in two places; put only the printed *public* key (`age1…`) in `claimsiq.env`.
- [ ] **A named person** responsible for patching, backups and this runbook (HIPAA 164.308(a)(2)).
- [ ] Each client practice has signed a BAA with your company; workforce HIPAA training done.

## 2. Prepare the server (≈ 15 min)
```
ssh root@SERVER                       # first login; add your SSH public key to ~/.ssh/authorized_keys BEFORE continuing
git clone <your repo> /opt/claimsiq/repo && cd /opt/claimsiq/repo
sudo bash deploy/selfhost/00-prepare-server.sh
```
This applies updates, turns on automatic security patches, key-only SSH, a firewall (22/80/443 only), fail2ban, time sync, and installs Docker. It also checks for disk encryption (next section).

## 3. Encryption at rest (required before real data)
Pick **one** and file the evidence:
- **A — Provider-managed volume encryption (simplest, recommended):** enable it when creating the server/volume (AWS EBS encryption, Azure disk encryption, Google CMEK/default encryption). Save the provider's written statement + a screenshot of the setting + the key-management description. Survives reboots with no manual step.
- **B — LUKS on a data disk (you hold the key):**
  ```
  sudo cryptsetup luksFormat /dev/sdb              # empty data disk — DESTROYS its contents
  sudo cryptsetup open /dev/sdb claimsiq-data && sudo mkfs.ext4 /dev/mapper/claimsiq-data
  sudo mkdir -p /srv && sudo mount /dev/mapper/claimsiq-data /srv
  echo '{"data-root":"/srv/docker"}' | sudo tee /etc/docker/daemon.json && sudo systemctl restart docker
  sudo mkdir -p /srv/backups/claimsiq && sudo chmod 700 /srv/backups
  ```
  After every reboot someone must run `cryptsetup open` + `mount` + `systemctl start docker` (a deliberate trade-off: the key is not stored on the machine). Keep the LUKS passphrase in a password manager and a sealed offline copy.
Backups are separately encrypted with `age`, so a stolen backup file is unreadable without your offline private key.

## 4. Install Supabase (≈ 20 min)
```
sudo mkdir -p /opt/claimsiq && sudo cp deploy/selfhost/claimsiq.env.example /opt/claimsiq/claimsiq.env && sudo nano /opt/claimsiq/claimsiq.env
#   set DOMAIN, ADMIN_EMAIL, SUPABASE_REF (an upstream release tag you have tested), BACKUP_*, SMTP_*
sudo bash deploy/selfhost/10-install-supabase.sh
```
It downloads upstream `docker/` at your pinned ref, **replaces every default secret** (the upstream example ships public demo keys that would let anyone bypass row-level security), points URLs at your domain, binds all published ports to 127.0.0.1, and starts the stack. It prints the Studio login and the public `ANON_KEY` — copy both into your password manager. **Back up `/opt/claimsiq/supabase/.env`** (it holds `JWT_SECRET`; losing it signs everyone out and invalidates the API keys).

## 5. Create the database structure and the first admin
```
sudo bash deploy/selfhost/20-apply-migrations.sh      # applies migrations 0001–0023, then prints the migration check — every row must be true
sudo bash deploy/selfhost/30-create-first-admin.sh    # first account = Sr. Management; choose a 14+ character password
```
Migration **0023** is critical: it makes sign-up impossible for anyone who was not invited (without it, any email could register with a staff role). Run it on your Supabase Cloud dev project too.

## 6. HTTPS in front, and the app
1. `sudo apt install caddy`; build `/etc/caddy/Caddyfile` from `deploy/Caddyfile` (app site) **plus** `deploy/selfhost/Caddyfile.api` (API site); replace `YOUR-DOMAIN`; `systemctl reload caddy`.
2. On your computer, point the security policy at your API and build:
   ```
   node scripts/set-api-host.cjs api.YOUR-DOMAIN            # edits netlify.toml, .htaccess, nginx.conf, Caddyfile together
   VITE_SUPABASE_URL=https://api.YOUR-DOMAIN VITE_SUPABASE_ANON_KEY=<ANON_KEY> npm run build
   rsync -a --delete dist/ deploy@SERVER:/var/www/claimsiq/dist/
   ```
3. Open `https://DOMAIN`, sign in, enable MFA (Account), then invite colleagues in Admin → Staff & roles.

## 7. Backups and the restore drill
```
age-keygen -o claimsiq-backup-key.txt            # on YOUR computer; public key goes into claimsiq.env as BACKUP_AGE_RECIPIENT
sudo crontab -e   →   15 2 * * *  /opt/claimsiq/repo/deploy/selfhost/40-backup.sh >> /var/log/claimsiq-backup.log 2>&1
sudo bash deploy/selfhost/40-backup.sh           # run once now
AGE_IDENTITY=/tmp/claimsiq-backup-key.txt sudo -E bash deploy/selfhost/41-restore-test.sh   # then delete the key file from the server
```
Do the restore drill **before go-live and every quarter**; record date, file and operator (this is your contingency-plan evidence). Also copy backups off the server (`BACKUP_RCLONE_REMOTE`); if you treat backups as PHI, that storage needs a BAA too.

## 8. Verify the controls
```
sudo bash deploy/selfhost/50-verify.sh
```
Checks: only 22/80/443 listen publicly · HSTS and CSP present · HTTP redirects to HTTPS · the public key cannot read claims · uninvited sign-up rejected · row-level security on every table · internal API paths hidden · automatic updates on · a backup < 48 h old. Fix every FAIL; file the output with your risk analysis. Re-run after each upgrade.

## 9. Operating it
| Task | How often | How |
|---|---|---|
| OS security patches | automatic; reboot window monthly | `unattended-upgrades`; `needrestart`; check `/var/run/reboot-required` |
| Supabase upgrade | quarterly or on a security advisory | back up → copy production `.env` to staging → bump `SUPABASE_REF` there → `docker compose pull && up -d` → run `50-verify.sh` and the app’s e2e checks → repeat in production in a maintenance window |
| Backup + restore drill | nightly / quarterly | §7 |
| Access review | quarterly | Admin → Access audit; remove leavers; confirm MFA |
| Audit-log retention | continuous | the in-app audit log lives in the database; backups keep ≥ 6 years of monthly copies — adjust `BACKUP_KEEP_MONTHLY` (72) if you rely on this for the 6-year rule |
| Disk space / health | weekly | `df -h /srv`, `docker compose ps`, `docker compose logs --tail 50 db` |
| Dependency + license review | monthly | GitHub workflow `Dependency review` |

**Disaster recovery (server lost):** new server → §2–4 with the *same* `.env` (from your encrypted `.env` backup) → `pg_restore` the latest dump into the new database → DNS → run `50-verify.sh`. Practise it once on staging; write down how long it took — that is your recovery-time figure.

## 10. HIPAA control map (what this kit provides vs. what you must do)
| Safeguard | Provided by this kit | Still yours |
|---|---|---|
| Access control (164.312(a)) | Role + client-scoped row-level security; invite-only sign-up (0023); MFA available; audit of access | Quarterly reviews; unique user per person; offboarding within a day |
| Audit controls (164.312(b)) | In-app audit log + claim activity | Review it; retain 6 years |
| Integrity (164.312(c)) | Database constraints, revision/“who changed it” triggers, encrypted checksummed backups | Restore drills |
| Transmission security (164.312(e)) | HTTPS-only, HSTS, CSP, API paths allow-listed | Keep certificates renewing (Caddy automatic) |
| Encryption at rest (addressable) | §3 | Evidence on file; key custody |
| Contingency plan (164.308(a)(7)) | Backups, restore test, DR steps | Written plan, tested, owner named |
| Workforce / BAA (164.308, 164.502(e)) | — | Training, sanctions policy, BAAs with clients and the infrastructure provider |
| Risk analysis (164.308(a)(1)) | `docs/RISK_ANALYSIS_OCR.md` as a template | Master register; add the server, backups, SMTP and DNS as assets |

## 11. Known unknowns (verify on the staging run)
- Upstream changes its Docker files over time (newer releases replaced the Kong gateway with Envoy in some versions). `SUPABASE_REF` pins what you tested; if the gateway port or container names differ, adjust `KONG_HTTP_PORT`/`Caddyfile.api`/`50-verify.sh` accordingly.
- The port-binding `sed` in `10-install-supabase.sh` covers the usual `- ${VAR}:PORT` lines; `50-verify.sh` check 1 proves the result — do not skip it.
- Realtime and auth settings names in `.env` can differ by version; the script only edits keys that exist and warns otherwise.
