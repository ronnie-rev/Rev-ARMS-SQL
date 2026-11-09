# ClaimsIQ — testing-ready checklist

## 1. Before anyone logs in (once)
1. Supabase → SQL editor → run **0018**, **0019** then **0020** (all idempotent; 0020 lets managers save Client SOPs). 0019 adds: `fax_log`, `feedback`, provider NPI, and `claims.updated_by/rev` (who changed a claim last).
2. Netlify → Environment variables (only if you will fax): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` + your provider's keys (Admin → Fax setup lists exactly which). Redeploy.
3. Admin → Go-live checklist: all green. Admin → Clients: add letterhead (name, address, fax, NPI, logo) for every client you will appeal for.
4. Admin → Appeal library → Setup import: load your Appeal Forge backup (payers' appeal addresses/faxes, letterheads, providers/NPIs).

## 2. Several people at once — how it behaves
- Every write goes through one tracked path: header shows **Saving… → Saved**, retries network blips twice, and turns red **Not saved** if the server refused (repeat the change). Closing the tab while saving prompts a warning.
- Live updates: other users' changes appear without refresh. If a teammate updates the claim you have open, you get a toast naming them.
- Last write wins per field set (claims carry `rev` / `updated_by` for audit). Two people editing the *same* claim in the same second can overwrite each other's field — rare, and the activity log records both.
- Rule/limit/library settings: history is kept for recommendation rules (Rule Lab → History → Restore).

## 3. PHI
Workspace is PHI-free by default (Admin → Import settings → "Patient name / DOB"): names in a file are discarded at import, identity uses account / encounter / DOS / CPT / amount, letters show labelled fill-ins. Switch to "Store patient name" only after BAAs/tenant isolation exist. Never paste PHI into notes or feedback.

## 4. Smoke test for the first client day
Import file with no patient/DOB → claims get unique IDs, re-import creates no duplicates · open a denied claim → Claim 360 (record auth #, payer ICN) · Appeal → pick denial → fill the highlighted blanks → PDF/Word · Fax (use provider test mode first) → Faxes page shows delivery · Intelligence → "What your data says" · Admin → Tester feedback inbox.

## 5. Known limits (honest list)
- Fax: needs a provider account + BAA; payloads capped at ~4 MB (≈40 pages). Delivery status for Documo/SRFax is "queued" until their webhook is wired (Phaxio callback is built in).
- Scanned denial letters are not OCR'd (text PDFs and pasted text only).
- NPI registry lookup and batch appeal ZIPs are not built yet.
- Concurrent edits are last-write-wins (see §2).

## 6. Added after first review
- **Client SOPs** (Admin → Client SOPs): rules by client / payer / CPT (exact, `110*`, `97110-97140`) / provider / denial code / min balance. Show as a banner on every matching claim and in Claim 360. "Paste a document" drafts rules from an email/SOP for a manager to review.
- **Line-level → claim-level import**: lines sharing a claim # roll up (balances added, CPT/denial codes merged); exact duplicate lines dropped; one claim # under two payers is split, never summed; blank claim # falls back to the encounter #, then a generated ID. The review screen shows "How this file was converted" with a balance reconciliation — do not commit if it reports a mismatch.
- **Huddle & client review** (sidebar): daily huddle for the team lead; per-client period review that prints to PDF / exports CSV.
- **Email-to-claim**: function `inbound-email` + Admin → Email-to-claim (setup later). Needs `INBOUND_EMAIL_SECRET`.
- **Fax**: Send fax is a placeholder until Admin → Fax setup is enabled.

## 7. Access & tenants (migration 0022)
- Staff can be limited to specific clients: Admin → Staff & roles → *Client access* → "Only assigned clients". Enforced by the database (RESTRICTIVE row-level policies on claims, notes, activity, work log, appeals, recoveries, faxes, etc.), not just hidden in the UI. A user cannot widen their own access.
- Admin → Access audit lists risky roles/permissions, people with no clients, stranded claims, uncovered clients and portal users.
- Client health and Huddle need the "See recoveries & $" permission; CSV buttons need "Export data".
- Server-side functions (fax, email-to-claim) use the service role and bypass these policies by design; they never read data for a user.

## 8. Self-hosted production
Run `docs/SELFHOST_RUNBOOK.md` end-to-end on a staging server first. Migration **0023** (invite-only sign-up) must also be applied to any Supabase Cloud project — without it, anyone with the public key could register as a staff user.
