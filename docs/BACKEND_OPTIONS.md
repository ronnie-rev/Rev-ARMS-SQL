# Backend options for commercial go-live (Supabase vs SQL Server Express vs self-hosted)

*Assessment, not a sales pitch. Vendor limits below are from memory of public documentation and must be re-verified before you commit.*

## 1. What Supabase does for this project today
| Capability | How ClaimsIQ uses it | Size of the dependency |
|---|---|---|
| PostgreSQL database | 37 tables, 22 migrations (~1,200 lines of SQL) | Core |
| **Row-level security** | 80 policies enforce roles, client portal isolation, staff client restriction (`can_see_client`), manager-only settings | Core to the security model |
| 31 SQL functions/triggers | role helpers, claim summary (`claim_summary`), unique ID allocation (`alloc_claim_uids`), revision/“who changed it” trigger, guards against privilege escalation | Core |
| **Auth** (users, passwords, invites, password reset, JWT sessions) | login, invite, reset, session; `handle_new_user` trigger creates the profile | Core |
| Auto-generated REST API (PostgREST) | every table read/write goes through it, filtered by RLS using the user's JWT | Core — the browser talks to it directly |
| Realtime | live updates between users | Nice-to-have (can fall back to polling) |
| Platform | backups, PITR, TLS, encryption at rest, patching, dashboards | Operational |

The app talks to the database through one 99-line adapter (`src/lib/db/supabase.ts`) behind a `DB` interface, so the *front end* is replaceable; the *server side* (auth + API + security rules) is what Supabase supplies.

## 2. Option A — SQL Server Express
**Feasible, but it is a re-platforming project, not a configuration task.** Nothing in Supabase's feature set comes with it.

What SQL Server Express gives: a relational database with row-level security (T-SQL security policies), backups, TLS, Always Encrypted. Free.

Known limits (verify): ~10 GB per database, ~1 GB RAM for the engine, 1 socket / 4 cores, no SQL Agent (scheduled jobs need Windows Task Scheduler), and **no Transparent Data Encryption** — encryption at rest would be BitLocker on the volume (plus encrypted backups handled outside SQL Server). No built-in high availability.

What we would have to build and then security-test:
| Needed | Why | Rough effort |
|---|---|---|
| A backend API service (Node or .NET) replacing PostgREST: every table read/write, filters, ordering, upserts, RPCs | The browser must not connect to SQL Server directly | 1–2 weeks |
| Authentication: password hashing, sessions/JWT, invites, password reset email, optional MFA, lockout, role changes | Replaces Supabase Auth | 1–2 weeks |
| Re-implement the 80 RLS rules in T-SQL (or in the API layer) and re-prove them with tests | The access model (clients, restricted staff, managers) is the heart of the product | 1–2 weeks |
| Port 31 functions/triggers and 22 migrations from PostgreSQL to T-SQL; rewrite the idempotent migration runner | Different dialect (jsonb, arrays, `gen_random_uuid`, triggers) | 1–2 weeks |
| Realtime replacement (SignalR/WebSocket or polling) | live updates | 2–4 days |
| Move the four serverless functions (fax, inbound email, reports) onto the API service | They currently run on Netlify | 3–5 days |
| Backups, restore drills, monitoring, patching, audit-log retention | Supabase does this for you | ongoing ops |
| Full regression + penetration-style testing | A new auth + access layer is new attack surface | 1–2 weeks |
**Estimate: roughly 6–10 weeks of development and testing**, then permanent responsibility for patching and operations. Each piece is doable; the risk is subtle access-control bugs in a layer that protects PHI. I do not recommend this unless you have a hard requirement to use SQL Server.

## 3. Option B — Self-host the open-source Supabase stack (recommended if Supabase Cloud pricing is the blocker)
Supabase is open source and officially supports self-hosting (Docker Compose: PostgreSQL, Auth, PostgREST, Realtime, Kong gateway, Studio). The application, all 22 migrations, all 80 policies and the tests work **unchanged**. You pay only for the server, and you are not paying the managed-HIPAA premium.

You take over (this is the real cost):
- A **VPS or dedicated server** (not shared hosting) with disk encryption (LUKS/BitLocker), a firewall allowing only 443 (and SSH from your IP), automatic OS security updates.
- TLS certificates (Caddy or certbot), reverse proxy, secrets management (JWT secret, service key — never in the browser bundle).
- **Backups**: nightly encrypted dumps + WAL archiving, stored off the server, and a quarterly *restore test*.
- Monitoring/alerts, log retention ≥ 6 years for the audit log, patching Postgres/containers.
- A **BAA with the infrastructure provider**: major clouds (AWS, Azure, Google Cloud) sign BAAs; many budget VPS hosts do not. Ask Hostinger (or any candidate) in writing whether they sign a BAA for the exact product (VPS) you will use — I could not verify this.
- Your own HIPAA documentation: risk analysis, contingency plan, access reviews (templates exist in `docs/`).

Effort for me: a deployment kit (compose file, hardening checklist, backup/restore scripts, runbook) — about 2–4 days; you or an administrator then run it on the server. I cannot reach your server from here.

## 4. Option C — Keep Supabase Cloud
Least work and least operational risk; you pay the HIPAA add-on and plan premium. Reasonable for the first client if the revenue covers it, with Option B as the later cost-saver.

## 5. "Is SQL Express as secure on our server?"
Security is about configuration and operations, not the product name. SQL Express can be secured well, but on a single server you must also provide: patching, network isolation, encrypted storage and backups, tested restores, intrusion detection/logging, physical security, and a contingency plan if that one machine fails. HIPAA requires all of those whichever database you choose. A single self-managed server is also a single point of failure for every client's AR data.

## 6. Recommendation
1. **Now (dev, synthetic data only):** stay on Supabase free/Netlify. No PHI.
2. **First real client:** either Option C for speed, or Option B once the server, BAA and backups are ready. Do not load real client data into any environment without a signed BAA covering that environment and verified encryption at rest.
3. **Avoid Option A** unless SQL Server is mandatory.

## 7. Decision I need from you
Choose **A**, **B** or **C**. If **B**, tell me the target provider/OS (Linux VPS recommended) and I will build the deployment kit and runbook.
