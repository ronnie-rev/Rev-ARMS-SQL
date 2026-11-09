# ARMS — Accounts Receivable Management System

Single-deploy, config-driven AR platform. React + TypeScript + Supabase (Postgres, Auth, Realtime) on Netlify.
Every dropdown, bucket, status, root cause, end action, payer rule, custom field and import template is **data**, edited live in **Admin** — no redeploy.

## What it does
- **Import aging** from any PMS: preloaded templates (eCW, Tebra, Office Ally, ModMed, Nextech, AdvancedMD, athenahealth) + a standard template. Auto-detects the PMS from headers, fuzzy-maps columns, previews new/updated/dropped claims and balance movement, then commits. Notes, owners, statuses and history carry forward across re-imports. Safeguard against partial files closing a whole inventory.
- **Production tracker, built in**: each saved touch = one tracker row (Root Cause › Detail, End Action › Sub-category, Mode, Comment, Next F/U, Multi-touch, Error-check validation, Age/Aging). Export back to the exact Excel tracker column order, and backfill history by importing the old “Log” sheet.
- **Supervisor allocation**: bulk assign from the worklist, smart allocate (balance count / dollars / round-robin by client, bucket, payer, min $), saved rules, reassign-on-leave.
- **Aging buckets** (configurable, eCW/ModMed-style tiles + bucket × status matrix), payer × bucket heatmap, timely-filing countdown, “work next” score.
- **Dashboards**: command center, per-client detail, productivity vs daily target, QA audit queue (sampling, pass/fail, remarks).
- **Roles**: Admin, AR Supervisor, AR Specialist, QA Auditor, Viewer (enforced by Postgres RLS).

## Client portal
Admin → Users & roles → *Invite*: enter the client contact's email, role **Client** and their practice. When they sign up with that email they land in a read-only portal (overview, claims, messages, printable monthly report) scoped to their practice. Isolation is enforced by Postgres row-level security — clients cannot read other practices, staff identities, work logs or audit data, and only see notes a specialist explicitly *shares*. Clients can send questions / document notices / escalations; staff reply from **Client Requests**.

## Smart analytics (explainable, no black boxes)
- **Collectability & expected recovery** per claim: age curve × root-cause weight (editable) × payer resolution rate × timely-filing × touch history; every score lists its factors.
- **Next best action**: learned from your own resolved claims (payer + root cause → end action success rate, with sample sizes).
- **Payer intelligence**, cash forecast (editable timing curve), dollars-at-risk by root cause, AR trend from import snapshots, auto-generated insights (TF cliffs, cold high-value claims, root-cause spikes, QA drift, workload imbalance, backlog days).
- **Natural-language search** (Ctrl/⌘ K): "aetna over 180 days unassigned", "timely filing", "coding denials $2k".
- Statistics are frequency-based and improve as outcomes accumulate; they are decision support, not guarantees.

## Digital production flow (replaces the Excel tracker)
**My Day** → **Work Mode** (priority queue, one claim at a time, auto-advance, ⌘/Ctrl+Enter to save) → touch form with live validation, snippets, call-reference capture, time spent, and "apply to similar claims". Tracker-format export and legacy Log import remain for continuity.

## Run locally (Demo Mode — no setup)
```
npm install
npm run dev
```
Without Supabase keys the app runs on seeded demo data stored in your browser; pick a persona on the login screen.

## Go live: Supabase + Netlify
1. **Supabase** → new project → SQL Editor → run, in order, `supabase/migrations/0001_init.sql`, `0002_portal_intel.sql`, `0003_engine.sql`, `0004_control.sql`, `0005_config_unique_fix.sql`, `0006_user_items.sql`, `0007_client_access.sql`, `0008_claim_snapshots.sql` (all idempotent; verified on Postgres 16).
2. Authentication → Providers → Email (disable “Confirm email” for internal tools if you prefer).
3. **Netlify** → Add site from this repo (build settings come from `netlify.toml`). Add env vars  
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Supabase → Settings → API; use the *anon* key only).
4. Open the site and create the first account — **the first user becomes Admin** and the default taxonomy (from your production template) and PMS templates are seeded automatically.
5. Admin → Users: set roles, emp codes, supervisors, daily targets. Admin → Clients: add practices, supervisors, providers, per-client RCA lists.

## Notes & limits
- PMS header aliases are best-effort starting points (exports vary by report/version) — tune them in Admin → Import Templates or save your own mapping from the import screen.
- The client loads the open inventory into memory (paged from Supabase) for instant filtering; comfortable into the low hundreds of thousands of claims. Beyond that, move aggregates to SQL views/RPC.
- Never put the Supabase `service_role` key in Netlify env vars for this app.
- PHI: demo data is synthetic. Admin → Workspace can mask patient names. For a PHI-enabled host: sign BAAs, enable backups/PITR, SSO/MFA, restrict signups (disable public sign-up and use invites only), and review RLS before loading real data.
- Claim data is PHI: enable Supabase backups/PITR, sign the BAA with Supabase & Netlify as required for your compliance posture, and restrict user creation.


## Reconciliation, rules & control (see `docs/ENGINE.md`)
- **Identity engine**: weekly aging files overwrite instead of duplicating — normalised claim keys, aliases, fingerprint re-key detection, generated IDs, line/claim granularity, duplicate handling, payer-name canonicalisation, as-of / stale / same-file / mass-drop / swing guardrails, row-level import log and one-click **undo**.
- **Rules & checks**: 30 claim-accounting & workflow checks (flags + Exceptions workbench), an automation rule builder (import / touch / daily triggers, dry-run, run log, notifications, auto-coding from denial codes), pattern mining.
- **Recoveries ledger** with last-touch or split attribution; **scheduled reports** (Netlify function `send-reports`, PHI-free emails via Resend).
- **Tools**: note builder + quality meter + dictation, denial playbooks, letter generator, payer portal/policy links + knowledge library, Kanban board, smart lanes, roll-forward, client approvals, work-mode.
- **Admin control**: permission matrix, security (idle timeout, view logging, watermark), setup doctor, in-browser engine self-test, config export/restore.

### Scheduled reports
Set Netlify env vars (server-side only): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `REPORT_FROM` (optional `REPORTS_DRY_RUN=1`, `REPORTS_SECRET`). The function runs hourly; schedules are managed in **Reports**.

### Tests
`npm test` runs 89 automated tests (engine, reports function with mocked services).


## Client access, 835 import, snapshots (latest)
- **Client logins** (Admin → Client access): one person can be given several practices, view-only; per person you switch *patient names*, *messaging*, *approvals* and *CSV download*. **Preview portal** shows exactly what they see. Enforced in Postgres by RLS (`my_clients()`, migration 0007); `supabase/tests/rls_client_access.sql` proves it on a scratch database.
- **ERA / 835** (Control → ERA / 835): parse a remit in the browser, match through the identity rules, post verified payments (recoveries, basis `era835`), denial codes and lifecycle. Idempotent per trace + claim; the next aging import will not count the same cash twice.
- **Snapshots**: every import now records one row per claim (`claim_snapshots`, migration 0008) → Pivot “Snapshot history” (compare two as-of dates, Δ columns) and the **A/R movement bridge** report.
- **Console audit** (Admin → Console audit, or `node scripts/e2e-console-audit.cjs` against `vite preview`): creates dummy data and checks 34 admin capabilities end-to-end.

## QA Center, knowledge and scale (latest)
- **QA Center** (`/qa`, Control hub): sample → review → score → coach → resolve. Review queue with risk/new-hire/forced/random sampling, scorecard review screen (keyboard: P/F/N, ↑↓), auto-checks, error categories, live score, disputes and acknowledgements, calibration, analyst view ("My quality"), KPI overview and criterion heat-map. **QA settings** (capability `manage_qa`: Admin and QA Reviewer by default) manage sample rate, new-hire rate, forced actions, KPI targets, scorecard weights (must total 100), error categories and the composite performance mix. Apply `supabase/migrations/0009_qa.sql` and `0010_scale_indexes.sql`.
- Users gained **hire date** and **QA lead** (Admin → Users) — used for new-hire sampling and dispute resolution.
- **Knowledge hub**: new *RCM playbook* (SOPs, checklists, KPI benchmarks vs your live numbers, escalation ladders) editable under Admin → Knowledge articles; global search; no LMS-style progress tracking. 30 new playbooks (every root-cause detail now has one), more snippets and letters; starter content tops itself up once per version for admins.
- **Scale**: see `docs/SCALE.md` for measurements and an honest readiness verdict.

## Audit
See `docs/AUDIT.md` (findings, status, method, demo script). Re-run the crawl with `npm run build && npx vite preview --port 4173` then `node scripts/e2e-audit.cjs`.

## Roles
Eight business roles (User, User+QA, SMEs, Team Leads, Manager, Sr. Management). See `docs/ROLES.md` — apply `supabase/migrations/0011_roles.sql` on Supabase.

## Identity, missing claims & resolution
Permanent claim UIDs, per-client uniqueness, a supervisor review queue for claims that drop off an aging file, closed-claim history. See `docs/IDENTITY.md`; apply `supabase/migrations/0013_claim_identity_resolution.sql`.
