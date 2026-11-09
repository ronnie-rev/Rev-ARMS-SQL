# Central rules: filing limits, reimbursement, appeals, scorecards, priority, bulk, scale

Everything below is configured centrally (Admin console, capability **Payer & filing rules** — Managers, Admin and Sr. Management by default) and
applies to every screen. Engines are pure TypeScript under `src/lib/engine/` with unit tests in `tests/`.

| Area | Setup (Admin tab) | Engine | Screens |
|---|---|---|---|
| Timely / appeal / corrected-claim limits (TFL · AFL · CCFL) | Filing limits | `limits.ts` | Deadline radar `/radar`, claim drawer, weekly client digest |
| Expected reimbursement | Reimbursement (fee schedules, payer %, client GCR) | `reimb.ts` | Worklist + claim "Expected" column |
| Underpayments | Reimbursement (thresholds) | `underpay.ts` | `/underpay` |
| Appeals + payer forms | Letters, Appeal forms | `appeal.ts`, `src/lib/pdf/*` | Claim → Appeal / letter, `/appeals` |
| Payer scorecards | Scorecard rules | `scorecard.ts` | `/scorecards` |
| Smart priority | Smart priority (+ Allocation → Priority boost) | `priority.ts` | Worklist, Work Mode |
| Bulk actions | Bulk actions | `bulk.ts` | Worklist → Bulk actions…, `/bulk` |
| Never-forget sweep | — | `sweep.ts` | `/unresolved`, daily notification |
| Denial workup checklists | Playbooks (tie to denial codes; `!` = required) | `checklist.ts` | Claim → Denial workup |
| QA error weights / scoring | QA → Settings → Scoring model, Error types & weights | `qascore.ts`, `qatrack.ts` | QA → Quality trends |

## Filing limits
One matrix of payer rows (optionally per client and plan type) with a TFL, AFL and CCFL in days and the date each clock starts from
(DOS, last billed, or denial date). Most specific wins per field: **client+payer → payer → payer directory → client default → central default**.
Imports capture `denial_date`, so the appeal clock starts from the real denial date; when absent it is estimated and marked "~".
The escalation job (daily, after import, or "Run escalation now") flags `deadline_risk`/`deadline_expired`, raises priority, logs activity
and notifies owner → supervisor → manager as the deadline approaches. It is idempotent per claim/limit/stage.
The *starter pack* holds public guidance only — **verify every payer against its contract**.

## Expected reimbursement & underpayments
Per client: method (auto, schedule only, payer %, or GCR) with a standard GCR % and optional flat % per payer. Fee schedules hold CPT(+modifier)
allowed amounts (CSV upload, lazy-loaded). ERA posting records `paid_amt`, `allowed_amt`, `patient_resp` and `denial_date`. A paid claim whose
payment + patient responsibility is below the expected amount (and above the dollar/% thresholds) is listed on `/underpay`; repeat offenders by
payer × CPT are surfaced as *systemic*. A manual expected value is never overwritten.

## Appeals
"Appeal / letter" on a claim opens the builder: the letter is ranked from the denial code (explicit **Denial codes** on the letter template first,
then built-in code families), payer and level; variables fill from the claim (`{paid} {expected} {variance} {deadline} {level} …`). The rich-text
editor (TipTap) is loaded on demand; **Letter PDF** renders the edited letter with jsPDF. Official payer PDFs are uploaded in Admin → Appeal forms:
fillable (AcroForm) fields are auto-mapped to variables by name (pdf-lib); flat PDFs get draggable text boxes drawn over a pdf.js preview.
Levels are tracked per claim (first → second → external), with status, deadline (AFL), tracking number and outcome/recovery.

## Scorecards
Denial rate, median days to pay, appeal win rate and paid % of billed per payer and per payer × CPT; recent window vs baseline. Alerts
(`payer_alerts`, one per payer/CPT/kind/month) fire when thresholds in *Scorecard rules* are crossed and are never raised on small samples.

## Smart priority
Score = deadline criticality (from the limits engine) + dollars at stake (capped at expected reimbursement) + age + overdue follow-up +
staleness + allocation-rule boost. Hover the score in the worklist to see why. Weights are in Admin → Smart priority.

## Bulk actions
Dry-run preview (what changes, what is skipped and why), reason required above a threshold, protected flags, per-action permissions, and undo
for N hours — undo only reverts fields that still hold the bulk value; anything edited since is left alone and reported.

## Scale (> 25,000 open claims)
Migration `0016` adds `claim_summary(...)` (SECURITY INVOKER, so RLS applies). At sign-in the app asks the server for totals; above the
threshold (`localStorage arms:scale:threshold`, default 25,000) it loads only the selected clients' claims, shows a banner, and the Dashboard
shows whole-workspace totals from the server. `tests/summary_parity.test.ts` proves the SQL and the browser engine agree (needs local Postgres;
skips otherwise).

## Migrations
`0014` central rules tables · `0015` managers may edit payer-rule settings · `0016` server summary. All idempotent; run in order after `0013`.

## Open-source building blocks
pdf-lib (form fill), pdf.js (page preview), TipTap (rich text), jsPDF (letter PDF), Fuse.js (fuzzy), PapaParse (CSV), Recharts, dnd-kit.
No open-source medical-billing QA scoring engine exists; QA scoring is built in (`qascore.ts`) on standard weighted-scorecard practice.

## Intelligence layer (`src/lib/engine/intelligence.ts`)
- **Next best action** per claim, with reasons, urgency (0–100), dollars in play and confidence. Rules in priority order: missing-from-file → overdue appeal → expired filing (write-off review) → correctable denial (corrected claim) → appeal → underpayment dispute → patient balance → payer slow vs its own pay-time norm → no owner → no follow-up → stale. Shown in the claim drawer ("Recommended"), in the Worklist (→ chip + "Next step" filter) and on `/intelligence`.
- **Cash forecast**: probability-weighted expected recovery placed into weeks using each payer's median days-to-pay (denied claims wait longer).
- **Team capacity**: weekly demand (claims needing a touch) vs capacity (daily target × 5), with suggested moves you can apply.
- **Signals**: balance swings between imports, unowned inventory, follow-up backlog, duplicate surge, old-AR share, idle staff.
- **Tools** (`/tools`): filing-deadline, underpayment, appeal ROI, patient responsibility, contractual write-off, days in A/R, collection rates, expected-from-GCR.
All rules are deterministic and unit-tested (`tests/intelligence.test.ts`, `tests/tools.test.ts`); nothing is a black box.

## Manager controls (Admin → Manager controls)
**All controls** lists every rule managers can change, what it controls, and whether it has been customised. **Intelligence rules** edits every threshold behind next-best-action (switch each recommendation on/off, adjust its urgency ±30), the cash forecast, team capacity, signals, the unresolved tracker and the calculators, with a preview of how many claims change category before saving. Needs migration `0018` so managers can save it on Supabase.

## Recommendation rules (Admin → Recommendation rules)
Managers build “if a claim looks like this, recommend that” rules without code: pick conditions (any claim field, including **custom claim fields** and the new fields paid / allowed / expected / patient responsibility, days since billed or denied, days until a payer-promised payment, credit balance), choose what to recommend, colour, urgency (higher wins over built-in rules), the reason text and an optional one-click action (follow-up in N days, assign to me, start appeal / corrected claim / dispute, add a flag, set a status, open a page). The editor shows how many open claims match **before** saving. 13 starter templates cover: high-dollar untouched, unbilled near filing deadline, small-balance write-off review, stuck after many touches, eligibility / duplicate / bundling / authorization / credentialing denials, no response 60+ days, promised payment overdue, secondary billing, credit balances. Rules export/import as JSON to share between environments. Needs migration `0018` (setting key `custom_recs`).

## Added from an RCM review
- **Credit balances / refunds**: built-in recommendation and a sweep category (refund deadlines are the compliance risk).
- **Payer-promised payment date** on the claim (and an overdue recommendation + sweep category).
- **Payer follow-up cadence**: “follow up” uses the payer's own follow-up days from the directory.
- **Appeal packet checklist** per submission (letter, EOB, claim copy, records, proof of timely filing, auth) with “n/m ready”.
- **Denial prevention** (Payer scorecards → Prevention): denied dollars grouped by the front-end / coding / charge-capture / enrollment control that would have stopped them, with the providers, CPTs and payers behind them — feedback for the practice.
- **Not built (recommended next)**: maker-checker approval for internal adjustments above a dollar limit; secondary-payer/COB as a first-class field; payer-portal / clearinghouse status checks; client-facing denial-prevention report delivery.
