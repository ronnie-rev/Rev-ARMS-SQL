# ClaimsIQ — feature ideas & data sources to choose from

Pick by number. Effort: S ≈ days, M ≈ 1–2 weeks, L ≈ a month+. Everything below respects the current design (config-driven, PHI-light, Supabase RLS).

## A. Recover more money (highest ROI)
| # | Idea | Why it matters | Effort |
|---|---|---|---|
| A1 | **Denial-to-appeal generator** — pick a claim, auto-fill the right letter from CARC/RARC + payer + policy citation, track appeal level and deadline | Appeals are where aged A/R is won; today letters are manual | M |
| A2 | **Underpayment detector** — compare paid vs. contracted/fee-schedule allowable (Medicare PFS as a baseline, client contract rates as an upload) | Finds money that is never flagged as a denial | M |
| A3 | **Payer behaviour scorecards** — denial rate, days-to-pay, appeal win rate and top CARCs per payer × CPT, with trend alerts ("Aetna started denying 99214-25") | Turns the data you already hold into payer negotiation ammo | M |
| A4 | **Next-best-action v2** — learn from your own outcomes which end action resolved which CARC/payer combo; show win-rate on the claim | You already log touches + recoveries; make it predictive | M |
| A5 | **Timely-filing & appeal-window radar** — countdown board with auto-escalation and weekly "expiring in 30 days" digest to clients | Unrecoverable write-offs are pure loss | S |
| A6 | **Patient-balance workflow** — statements, payment plans, text/email reminders (via provider like Twilio/SendGrid) | Closes the loop after insurance | L |

## B. Work faster (productivity)
| # | Idea | Effort |
|---|---|---|
| B1 | **One-click work sessions** — claim queue with keyboard shortcuts, auto-next, templates, timer; show "$ at stake per minute" | S |
| B2 | **Smart worklist ordering** — expected-value score = balance × win-probability ÷ effort, adjustable by TL | M |
| B3 | **Bulk actions with preview/undo** — change owner/status/follow-up for a filtered set with dry-run and one-click rollback | S |
| B4 | **Payer call log & IVR cheat-sheet** — per-payer phone tree, hold-time stats, rep notes, reference # search | S |
| B5 | **Browser extension / PMS deep links** — jump from ClaimsIQ to the claim in eCW/Tebra/athena and paste the note back | L |
| B6 | **Email-to-claim** — forward a payer letter/EOB, attach to the matching claim automatically | M |

## C. Quality & reliability
| # | Idea | Effort |
|---|---|---|
| C1 | **Server-side aggregation (views/RPC)** — dashboards/pivot read results, not rows; unlocks 100k+ claims | L |
| C2 | **Scheduled jobs on Supabase** (pg_cron / Edge Functions): daily checks, report sends, snapshots, reminders without an open browser | M |
| C3 | **Audit trail v2** — immutable change history per claim/field with "who/when/before/after", exportable | M |
| C4 | **SSO & MFA** (Google/Microsoft/SAML via Supabase), session policies, IP allow-list | M |
| C5 | **Backups & disaster recovery runbook** — nightly export to client-owned storage, restore test in CI | S |
| C6 | **Observability** — error reporting (Sentry), slow-query dashboard, uptime check, import failure alerts | S |
| C7 | **QA calibration & coaching plans** — trend per criterion per analyst, auto-assigned coaching tasks, external-QA partner portal (role already added) | M |

## D. Clients & reporting
| # | Idea | Effort |
|---|---|---|
| D1 | **Client portal v2** — live A/R, approvals inbox, document upload, monthly PDF/QBR pack with branding | M |
| D2 | **Executive dashboard** — days in A/R, % >90, net collection, denial rate by root cause, forecast vs. goal | M |
| D3 | **Contract/SLA tracker** — per-client targets (e.g. >90 days < 20%) with RAG status and breach alerts | S |
| D4 | **Benchmarking** — compare client KPIs against MGMA-style ranges you configure | S |

## E. Data & integrations (see sources below)
| # | Idea | Effort |
|---|---|---|
| E1 | **NPI lookup/validation** on providers and claims (taxonomy mismatch check) | S |
| E2 | **ICD-10 / HCPCS code autocomplete + validity checks** on notes and corrected claims | S |
| E3 | **NCCI bundling check** before sending a corrected claim ("97 bundled — modifier 59 allowed?") | M |
| E4 | **LCD/NCD policy finder** inside the appeal screen (Medicare) | M |
| E5 | **Medicare fee-schedule benchmark** for underpayment (A2) | M |
| E6 | **Payer contract rates from Transparency-in-Coverage files** for large commercial payers (research use) | L |
| E7 | **Clearinghouse / eligibility API** (270/271, 276/277 claim status, 835 auto-fetch) via a vendor | L |

## Open / public data and APIs worth integrating
Verified by search on 2026-10-29; **licences and endpoints marked “check” must be confirmed on the publisher’s page before building.**

| Source | What you get | Cost / access | Notes |
|---|---|---|---|
| [NPPES NPI Registry API](https://npiregistry.cms.hhs.gov/) (CMS) | Provider name, NPI, taxonomy, address, status | Free, no key, JSON (v2.1) | Does **not** prove licensure or payer enrollment. Great for E1 and taxonomy-mismatch denials |
| [CMS HCPCS quarterly files](https://www.cms.gov/medicare/coding/hcpcsreleasecodesets/hcpcs-quarterly-update) | Level II codes, quarterly | Free download | Load into a table, refresh quarterly (E2) |
| [CMS ICD-10-CM / PCS files](https://www.cms.gov/medicare/coding-billing/icd-10-codes) | Annual code descriptions | Free download | Check the FY2026/27 ZIP on the page |
| [NLM Clinical Tables API](https://clinicaltables.nlm.nih.gov/) | ICD-10-CM search/autocomplete | Free, no key (check terms) | Quick win for E2 without hosting the code set |
| [CMS NCCI edits](https://cms.gov/Medicare/Coding/NationalCorrectCodInitEd/NCCI-Coding-Edits.html) | Procedure-to-procedure bundling pairs + modifier indicators | Free, quarterly files | For E3. Medicare rules—commercial payers vary |
| [CMS Medicare Coverage Database](https://www.cms.gov/Outreach-and-Education/MLN/Educational-Tools/MLN901347-How-to-MCD/mcd/mcd/chapter_6_downloads/) | LCD/NCD/articles (CSV or API) | Free but requires accepting the AMA/ADA/NUBC licence; API licence token (check) | E4. Don’t redistribute CPT text |
| CMS Physician Fee Schedule (RVU) files | Medicare allowables by CPT/locality | Free download on cms.gov (check exact page) | E5 baseline |
| [CMS data.cms.gov](https://data.cms.gov/public-provider-enrollment) (PECOS public enrollment) | Medicare enrolled providers/specialties, quarterly | Free; API access (check docs) | Enrollment sanity checks for “provider not enrolled” denials |
| [CMS Price-Transparency schemas](https://github.com/CMSgov/price-transparency-guide) | JSON schema for payer in-network/allowed-amount files | Free (open repo) | Payer files are huge; start with a few payers (E6) |
| [X12 / WPC code lists](https://x12.org/codes) | Official CARC / RARC | **Licensed**; copyrighted, not free to redistribute | Keep paraphrased meanings (as now); link users to the official list |
| CMS remark-code site (cmsremarkcodes.info, check) | RARC updates via MLN Matters | Free reading | Use for refresh notes, not redistribution |
| X12 parsers | Open-source libs are mostly Ruby/Python and GPL/LGPL — **avoid GPL in a closed product** | — | Our built-in 835 parser covers the need; for 837 use a vendor API |

**Not free but worth pricing:** clearinghouse + eligibility/claim-status APIs (Availity, Change Healthcare/Optum, Stedi, Office Ally) for E7 — they also return 835s automatically.

## Suggested first sprint (best value / lowest risk)
A5 radar → E1 NPI check → E2 code autocomplete → B3 bulk undo → C2 scheduled jobs → A3 payer scorecards. About 4–5 weeks, no new vendor contracts.
