# ClaimsIQ — audit report

Build under test: `main` (see commit in the sidebar footer). Audited 2026-10-29 against the small demo data set **and** the 5,300-open-claim stress set.
Legend: 🔴 critical · 🟠 high · 🟡 medium · ⚪ low · ✅ fixed and re-verified

## Method
| Layer | How | Where |
|---|---|---|
| Types / build | `tsc --noEmit` + production build | `npm run build` |
| Unit / engine | 198 tests: identity, lifecycle, pivot, ERA, bridge, QA scoring/sampling/performance, seed integrity, DB paging, **every report runs on seed data** | `npx vitest run` |
| Database | All 10 migrations on PG 16, applied twice (idempotent); all 25 tables have RLS; RLS scripts for client access and QA guard; `EXPLAIN` on 60k claims | `supabase/` |
| Full-app crawl | 123 page loads × 5 roles (Admin, Supervisor, Specialist, QA Reviewer, Client) incl. every Admin tab and QA tab; checks page errors, console errors, failed requests, blank pages, overflow, `undefined/NaN/[object Object]`, ISO dates, broken images, unlabeled controls, **route access by role** | `node scripts/e2e-audit.cjs` |
| Workflows | Navigation (sidebar, sub-bar, breadcrumbs, back), pivot drag-and-drop, every Admin "Add" button, Admin console audit (34 checks), QA flow end to end (sample → keyboard review → critical fail → analyst acknowledge → settings validation) | `scripts/e2e-*.cjs` |
| Scale | 5,300 open claims / 10k touches: every route renders < 650 ms, zero errors | `scripts/e2e-scale.cjs`, `docs/SCALE.md` |

## Findings (first full run → status)
| # | Sev | Area | Finding | Status |
|---|---|---|---|---|
| 1 | 🔴 | Access control | A Specialist could open **Allocation** and **Rules** by URL (menu hid them, routes did not check permission) | ✅ Route guard added for Allocation, Rules, Exceptions, Import, Import history, ERA, Audit log, Work Mode; shows a "no access" page |
| 2 | 🔴 | Access control | QA Reviewer could open **Allocation** by URL | ✅ same guard |
| 3 | 🟡 | Dates | Productivity recovery ledger showed ISO `2026-10-05` | ✅ MM/DD/YYYY |
| 4 | 🟡 | Dates | Pivot "as of" showed ISO date | ✅ |
| 5 | 🟡 | Dates | Work Mode claim story embedded ISO dates (DOS and later sentences) | ✅ all dates in the story rewritten to MM/DD/YYYY |
| 6 | ⚪ | Accessibility | ~1,000 icon-only buttons (move/delete/add) and ~400 inputs across Admin, Worklist, Productivity, Pivot had no accessible name | ✅ `A11yFix` names them from icon / label / column header; re-crawl shows 0 |
| 7 | 🟡 | Test harness | Admin "Add" check false-failed once playbooks grew (matched page text instead of toasts) | ✅ script now reads toasts only |
| 8 | 🔴 | Demo data | Small demo crashed on start after the 5-client coverage change (indexes for clients that don't exist) | ✅ fixed, covered by a seed test |
| 9 | 🟠 | Scale | Offset paging made deep `list()` reads degrade (250 ms at 50k rows, linear) | ✅ keyset + parallel partitions, 6 ms |

| 10 | 🟠 | Data | **Admin → Denial codes and Knowledge articles looked empty**: the built-in dictionary and articles lived in code, so the editable lists had no rows | ✅ 197 denial codes and 13 articles are now real, editable rows (one-time top-up for existing workspaces; reference-only codes never drive RCA suggestions) |
| 11 | 🟡 | Admin | "Custom field → select" type was offered in the editor but rejected by validation | ✅ validation accepts select |
| 12 | 🟡 | Import / Admin | No downloadable samples for upload screens and Admin lists | ✅ **Sample / Export / Import CSV** on every Admin list (codes, articles, payers, resources, playbooks, letters, outcomes, snippets, buckets, statuses, lists, fields, stages, users, clients, root causes, end actions), JSON sample/export/import for Rules, CSV for Allocation rules, sample files on Aging, Work-log and ERA 835 screens, sample config for Restore. Round-trip tested (`scripts/e2e-samples.cjs`) |
| 13 | 🟡 | Navigation | Home link is hidden below 1024 px (breadcrumb collapses); logo always went to the first menu item | ✅ Home icon always visible; logo and Home go to the role's home page |
| 14 | ⚪ | Links | External links without `noopener` (payer directory) | ✅ every external link opens in a new tab with `noopener noreferrer` |

Hyperlink audit (`node scripts/e2e-links.cjs`): 248 links/Home/logo clicks across 5 roles, 0 problems.

| 15 | 🟠 | Roles | Only 4 coarse roles; Control/Admin visibility depended on a few role names | ✅ 8 business roles with capability-based sections (`access_control`, `access_admin`), route guards on every Control/Admin page, DB mapping in migration 0011, role-matrix tests. Per-role crawl (9 roles, 274 page loads) checks sidebar sections present/absent and that blocked URLs are blocked: 0 findings. See `docs/ROLES.md` |

| 16 | 🟠 | Roles | Manager and Sr. Management were identical; no system-admin role; admins could promote themselves | ✅ Risk tiers: Sr. Mgmt (all), Admin (system setup, no PHI/QA/claims, cannot touch Sr. Mgmt/Admin accounts, no permission matrix), Manager (operations + limited Admin: clients, content). Per-tab Admin capabilities, UI + database guards (migration 0012, `supabase/tests/roles_rls.sql`), External QA placeholder role. Crawl: 11 roles, 294 page loads, 0 findings |

| 17 | 🟠 | Imports | A claim absent from the next aging file was **closed silently** as "paid/adjusted" — no way to tell paid from written off from an incomplete export | ✅ Missing-from-file review queue (Control), supervisor/manager/TL/SME decisions with date, end action, note, recoveries and work-log entry; closed claims keep full history (Closed & resolved page); see `docs/IDENTITY.md` |
| 18 | 🟠 | Identity | Same claim # reused by the PMS for a different patient would merge into the old claim; no permanent human-readable id; encounter # not captured | ✅ Reuse detection (separate claim, flagged), permanent per-client UIDs with check character (app + Postgres, immutable, atomic allocation), encounter # captured |
| 19 | 🟡 | Engine | While refactoring the commit step the update/unchanged claim saves were dropped; unit tests passed but the console audit caught it | ✅ restored; new plan-completeness test and an e2e check that everything survives a reload |

Final crawl result: **0 findings** on both data sets (123 pages each). Re-run any time; output goes to `docs/audit-results.json`.

## Known limitations (not defects)
- **Browser holds all claims in memory** — comfortable to ~25k open claims; see `docs/SCALE.md` for the path beyond.
- **Demo mode** stores data in this browser only (IndexedDB). Clearing site data resets it. Production uses Supabase (apply migrations 0001–0010).
- Supabase-mode flows (auth, realtime) were verified at the database/RLS level and with the paging layer under a fake client, **not** against a live Supabase project from this environment.
- Scheduled report sending and the daily automation run only when the app is open; Edge Functions / `pg_cron` are the recommended next step.
- Hover help is inferred from labels; unusual numbers fall back to a generic description (add `data-tip` to override).
- Admin content (SOPs, playbooks, letters, KPI benchmarks) is expert-style guidance authored for this build — review with your compliance lead before using as policy.

## Demo script (≈10 minutes)
1. Sign in as **Alex Morgan (Admin)** → Dashboard → Admin → Backup → *Load stress dataset* for 5 clients / 5,300 claims.
2. Worklist → open a claim → record a touch, Defer with the calendar, note, Knowledge panel.
3. Allocation (drag claims onto people), Pivot Studio (drag fields, compare snapshots), Reports (filters + date ranges, export).
4. **QA Center** as **Dana Whitfield (QA Reviewer)**: Overview → Review queue → review with P/F/N keys → Calibration → Settings (sample rate, KPIs, weights).
5. As **Sana Iqbal (Specialist)**: My Day shows QA feedback → acknowledge or dispute.
6. As the **client user**: portal view-only, messages.
7. Knowledge hub → RCM playbook, search, hover any number for 2 s for help.
