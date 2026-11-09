# Roles & access

| Role | Works claims | QA review | Control (allocation, inventory, rules) | Admin section |
|---|:-:|:-:|:-:|---|
| **Sr. Management** | ✓ | ✓ + settings | ✓ | **Everything**, incl. permission matrix, users, security, deleting claims |
| **Admin** | – | – | ✓ | System setup: configuration, users (not Sr. Mgmt/Admin accounts), clients, import rules/templates, backup. No claim work, QA, PHI or money views, no permission matrix |
| **Manager** | ✓ | ✓ + settings | ✓ | Limited: clients & providers, knowledge content (playbooks, letters, articles, codes, payers, resources), Setup doctor. No taxonomy/config, users, security, permissions |
| **Team Lead (QA & Production)** | ✓ | ✓ + settings | ✓ | – |
| **Team Lead (QA)** | – | ✓ + settings | ✓ | – |
| **SME (Production + QA)** | ✓ | ✓ | ✓ | – |
| **SME (QA)** | – | ✓ | ✓ | – |
| **User (Production + QA)** | ✓ | ✓ (never their own work) | – | – |
| **User (Production)** | ✓ | – | – | – |
| **QA Analyst (External)** | – | ✓ review only | – | – |
| Viewer | – | – | – | – (read-only) |
| Client | portal only (view-only) | – | – | – |

**Risk tiers.** Highest risk = changing the permission matrix, creating Sr. Management/Admin accounts, deleting claims → Sr. Management only. Configuration that changes system behaviour (taxonomy, buckets, security, import rules) → Sr. Management and Admin. Operational and content work → Managers and below. Admin cannot promote anyone to Sr. Management/Admin (UI and database trigger), and cannot touch those accounts.

**External QA (placeholder).** QA tables, scorecards, reports and the `QA Analyst (External)` role are live so an outsourced QA department can be switched on later: set *QA team model* in QA settings and create their logins. Today QA runs internally. (Their data access is staff-wide at the database level; scope it per client before onboarding a third party.)

**Sections.** *Quality* (QA Center, QA settings) is a main section for every staff role; what is inside depends on the role. *Control* and *Admin* are **not shown and not reachable** (menu, command palette, URL) unless the role has the `access_control` / `access_admin` capability.

## How access is enforced (three layers)
1. **Capabilities** (`src/lib/engine/permissions.ts`) — one switch per action, plus `access_control` and `access_admin` for the two sections. Defaults per role live in `DEFAULT_PERMS`; Admin → Permissions edits them live (with an at-a-glance table, per-role reset, and lock-out protection: Sr. Management and Admin can never lose Admin access, user management or configuration; Sr. Management always keeps the permission matrix).
2. **Menu and routes** (`src/components/Layout.tsx`, `src/App.tsx`) — every section/item names the capability it needs; every route is wrapped in a guard that shows a "no access" page instead of the content.
3. **Database** (`supabase/migrations/0011_roles.sql`) — Row-Level Security maps each role to a coarse class (`admin` for Manager/Sr. Mgmt, `supervisor` for Team Leads and SMEs, `specialist` for Users). Configuration tables are writable only by the `admin` class, so a UI toggle can never widen real access. QA review writes need a QA-capable role and are refused on the reviewer's own work.

## Changing roles
- Add or rename a role: `src/lib/roles.ts` (`ROLE_META`, `ROLE_ORDER`), defaults in `permissions.ts`, the role list in migration `0011` (CHECK constraint + `my_role()` mapping), then `tests/roles.test.ts` tells you if an invariant broke.
- Change what a role may do without code: Admin → Permissions.
- Existing data: roles saved by older versions are mapped automatically (admin→Sr. Mgmt, supervisor→Team Lead (QA & Production), specialist→User (Production), auditor→SME (QA)); migration 0011 does the same in Postgres. Review them in Admin → Users.
- Demo sign-ins: Alex Morgan (Sr. Mgmt), Jordan Blake (Admin), Lena Fischer (QA External), Priya Nair (Manager), Rajat Mehta (TL QA & Prod), Dana Whitfield (TL QA), Neha Kapoor (SME Prod+QA), Karan Shah (SME QA), Arjun Patel (User Prod+QA), Sana Iqbal / Vikram Rao / Meera Das (User Prod).
