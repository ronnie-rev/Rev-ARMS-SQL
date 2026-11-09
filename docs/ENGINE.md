# ARMS — Rules & Logic Specification

How ARMS decides what a claim *is*, how weekly aging files overwrite data instead of duplicating it, what every rule, check and log does, and what to do when something looks wrong. The numbered sections describe behaviour implemented in `src/lib/engine/*` and covered by `tests/*` (89 automated tests). The catalogues in §14 are generated from the code.

---

## 1. Principles

1. **One real-world charge = one record, forever.** A claim keeps its internal ID (`claims.id`) for life. PMS claim numbers, fingerprints and aliases are only *ways to find it*.
2. **The aging file owns money & PMS facts; ARMS owns workflow.** Balance, payer, billed amount, dates and PMS status come from the file. Status, root cause, end action, owner, priority, follow-up, notes and touch history are never overwritten by an import.
3. **Nothing is silently destroyed.** Anything that closes, links, merges or skips a claim is logged per row, with a before-image, and can be undone (newest import first).
4. **Ask before doing something big.** Guardrails stop mass closes, stale files, duplicate files, wrong mappings and wild balance swings until a human acknowledges.
5. **Idempotent.** Importing the same data twice changes nothing. Running a rule or check twice changes nothing the second time.
6. **Explainable.** Every score lists its factors; every recommendation cites sample sizes; every rule run records what it matched.

## 2. Claim identity

### 2.1 Keys stored on every claim

| Field | Meaning |
|---|---|
| `claim_no` | The PMS number exactly as last seen (display value). |
| `claim_key` | Canonical form used for matching (§2.2), plus a line suffix in line-level mode. |
| `aliases[]` | Earlier / merged canonical keys that still map to this claim. |
| `fingerprint` | Hash of *patient + DOS + CPT set + billed amount* — the same charge regardless of number. |
| `first_batch` / `last_batch` / `as_of` / `missing_count` | Provenance: which file created it, which touched it last, its as-of date, consecutive files it was absent from. |

### 2.2 Claim-number normalisation

`CLM-00123`, `clm 123`, `00123`, `123.0`, `123` (a number) and `CLM/00123` collapse to the same key: upper-case, strip configured prefixes, drop everything that is not A–Z/0–9, drop `.0` tails, strip leading zeros from numeric ids. **Excel scientific notation (`1.23457E+11`) is never trusted** — the digits are already lost; the row is treated as having no claim number and a warning explains how to re-export the column as text.

### 2.3 Match cascade (strongest → weakest)

For each file row, after duplicates inside the file are collapsed (§2.5):

1. **Key** — canonical key equals an existing claim's key.
2. **Alias** — equals an alias (old number, or a merged claim's number).
3. **Fingerprint** — key unknown, but exactly one *unclaimed* existing claim has the same patient + DOS + CPT + billed amount. The PMS re-numbered the claim (typical after a corrected claim / frequency-code 7). Behaviour follows **Identity policy**:
   - `auto` *(default)* — link; adopt the new number as `claim_no`, push the old key to `aliases`, flag `rekeyed`, **keep all history**.
   - `ask` — shown on the review screen with the candidate pre-selected; unresolved rows import as new.
   - `strict` — never link; create a new claim.
4. **Loose** — same patient + DOS but a different charge: *never* auto-linked. Policy `ask` lists it; otherwise the new claim is created and flagged `possible_duplicate`.
5. **New** — no match.

Safety rules inside the cascade:
- Direct matches (key/alias) are resolved **first**, so a fingerprint can never steal a claim another row legitimately owns.
- If several rows share a fingerprint (identical charges), or several existing claims do, nothing is auto-linked — the rows are flagged/asked instead.
- A row with **no claim number** (generated ID) may link to an existing claim by fingerprint, but it **never overwrites that claim's real number**.

### 2.4 Missing claim numbers

Policy `generate` *(default)*: `GEN-<8 chars of fingerprint>` — stable week to week, so the same charge matches itself next time even if its balance changed. Policy `skip`: the row is rejected (`NO_IDENTITY`). A row with neither a number nor enough data (patient + DOS) to fingerprint is always rejected.

### 2.5 Same key on several rows in one file

| Situation | Result |
|---|---|
| Identical rows (same balance, billed, DOS, payer, CPT, patient) | Extras dropped (`DUPLICATE_ROW`), counted, logged. |
| Different values, `duplicates=aggregate` *(default)* | Treated as **charge lines of one claim**: balances and billed amounts add up, CPTs are unioned, earliest DOS kept, one `AGGREGATED_LINES` log row. |
| `first` / `last` | Keep that row, drop the rest (logged). |
| `skip` | All rows with that key are rejected (`DUP_KEY_CONFLICT`). |

### 2.6 Granularity

`claim` *(default)*: one row = one claim. `line`: the PMS report has one row per charge line; the identity key is `claim#` + line number (or CPT). Repeated identical keys get a `~2`, `~3` suffix (legitimate repeated lines). Choose per client (Import → “Save as client default”).

### 2.7 Merging duplicates by hand

Exceptions → Duplicates lists open claims sharing a fingerprint. **Merge** keeps one record, moves notes / touches / activity / recoveries, adds the merged claim's keys to `aliases` (so future files still match), sums touch counts, clears `possible_duplicate`, and audits the action.

## 3. Reading a file

1. **Sheet choice** (xlsx): a sheet named Log/Aging/Claims, otherwise the largest.
2. **Header row**: the row (within the first 15) with the most non-numeric text cells.
3. **Skipped rows**: blank rows; summary/footer rows (`Grand total`, `Subtotal`, `Page 3`, `Printed…`); repeated header rows from page breaks.
4. **Dates**: ISO, `mm/dd/yyyy`, `dd/mm/yyyy`, `yyyymmdd`, `14-Mar-26`, `Mar 14, 2026`, Excel serials. The order (mdy vs dmy) is **detected from the whole column** (a `25/03/2026` proves dmy); if undecidable it assumes mdy and says so; always overridable.
5. **Money**: `$1,234.50`, `(45.00)`, `12.50-`, `100 CR`, unicode minus, European `1.234,56`; `N/A`/`#N/A`/blank → not numeric.
6. **Payer names** are canonicalised to the payer directory: exact → alias → noise-stripped form (`Aetna Inc`, `BCBS of Texas`) → unique prefix. Unknown names are listed with a one-click “alias to / add as new payer”.

### 3.1 Row validation catalogue

| Code | Severity | Effect |
|---|---|---|
| `TOTAL_ROW`, `HEADER_REPEAT` | info | skipped |
| `NO_BALANCE` | error | skipped |
| `DOS_FUTURE`, `DOS_ANCIENT` (< 1990) | error | skipped |
| `NO_IDENTITY` | error | skipped |
| `BAD_DATE` | warn | row kept, date blank (counts toward the “unreadable dates” guardrail) |
| `SCI_NOTATION` | warn | id treated as missing |
| `SHORT_ID` (< 4 chars) | warn | kept |
| `BILLED_BEFORE_DOS`, `BAL_GT_BILLED` | warn | kept; flagged |
| `NO_PAYER` | warn | imported as “Unknown” |
| `NO_DATES` | warn | kept; cannot be aged |
| `GENERATED_ID`, `AGGREGATED_LINES` | info | logged |
| `ZERO_BALANCE_NEW` | info | skipped (nothing to collect) |

## 4. Reconciliation (what an import does to existing data)

### 4.1 Field ownership

| Field | Default policy | Behaviour |
|---|---|---|
| `balance`, `billed_amt`, `payer`, `pms_status`, `denial_codes`, `last_billed`, `cpt`, `provider` | **file** | File value wins when present. Empty file cells never blank an existing value. A payer change raises `payer_changed`. |
| `dos`, `patient_name`, `account_id`, `provider_type` | **fill** | Only fills blanks. A *different* DOS keeps ours and raises `dos_conflict`. |
| status, RCA, end action, mode, owner, priority, follow-up date, touches, notes, custom fields set by staff | **never** | Imports cannot touch them. (Custom fields mapped from the file are merged in.) |

All policies are editable (Admin → Import rules) and overridable per client.

### 4.2 Lifecycle outcomes per claim

| Situation | Outcome |
|---|---|
| In file, matches, nothing changed | `unchanged` — only `last_batch`, `as_of`, `missing_count=0` refreshed. Not logged row-by-row. |
| In file, values changed | `UPDATED`; balance movements add an activity entry (“Balance decreased $x”). |
| In file, claim was closed | `REOPENED`: closed fields cleared, `reopened` flag, a terminal status resets to *In Progress* (if worked) or *New*. History kept. |
| In file with a new PMS number | `REKEYED` (§2.3). |
| In file with **zero balance** | Existing open claim → closed (“Zero balance in aging file”); brand-new → skipped. Policy `zeroBalance=keep` disables this. |
| In file with **negative balance** | Kept and flagged `credit_balance` (policy `flag`), kept silently, or skipped. |
| **Absent** from a full snapshot | `missing_count += 1`. Once it reaches **Close after N missing files** (default 1) the claim closes: `closed_at` set, reason “Dropped off aging report”, resolution `unknown` until confirmed. Before that it stays open with `missing_once`. |
| Absent from a **partial export** (“merge” mode) | Untouched. Nothing ever closes in merge mode. |

Imports are **idempotent**: re-importing the same file produces zero changes (tested).

### 4.3 What "closed" means

`closed_at` ≠ workflow status. Closed claims leave worklists and totals but keep full history. They reopen automatically if they reappear. The *resolution* (`paid` / `adjusted` / `patient` / `unknown`) is inferred from the last worked state (adjustment/patient end actions) and can be confirmed on the claim or in the recovery ledger — an aging file alone cannot distinguish cash from a write-off, and ARMS says so instead of guessing.

## 5. Guardrails (pre-commit safety)

Computed on the *plan* before anything is written. “Block” items need an explicit acknowledgement; “hard” blocks cannot be overridden.

| Id | Level | Fires when (defaults) |
|---|---|---|
| `NO_VALID_ROWS` | block, **hard** | every row was rejected |
| `INVALID_ROWS` | block | > 20 % of rows rejected (wrong mapping / sheet) |
| `BAD_DATES` | block | > 10 % of dates unreadable (format/order) |
| `NO_AS_OF` | block (configurable) | no as-of date supplied |
| `STALE_FILE` | block (configurable) | as-of date older than the last committed import |
| `SAME_DAY` | info | another file with the same as-of date exists |
| `SAME_FILE` | block (configurable) | identical SHA-256 content hash already imported |
| `MASS_DROP` | block | snapshot would close > 40 % of ≥10 open claims |
| `TOTAL_SWING` | block | file total differs from open AR by > ±25 % |
| `IDENTITY_ASK` | warn | rows need a link/new decision |
| `REKEY_STORM` | warn | > 25 % of ≥20 matches were by fingerprint (probably the wrong “claim number” column) |
| `GENERATED_IDS` | warn | > 10 % of rows had no claim number |
| `BALANCE_UP` | warn | > 20 % of ≥20 matched balances increased |
| `UNKNOWN_PAYERS` | info | payer names not in the directory |
| `DUP_KEYS` | warn | rows skipped by the `skip` duplicate policy |

All thresholds live in Admin → Import rules; per-client overrides in the import screen.

## 6. Logs & audit trail

| Log | Where | Contains | Retention |
|---|---|---|---|
| **Import batch** | `import_batches` | file, template, as-of, mode, counts, total, settings snapshot, guardrails + which were acknowledged, status (`committed` / `rolled_back` / `failed`), PHI-free bucket/payer snapshot | permanent |
| **Row log** | `import_log` | one row per non-trivial outcome: row #, action (`CREATED UPDATED REOPENED REKEYED CLOSED MISSING SKIPPED DEDUPED AGGREGATED FLAGGED`), code, severity, message, **before-image** | with the batch |
| **Claim activity** | `claim_activity` | human-readable timeline per claim (balance moves, reopen, re-key, close, rule effects, merges, approvals) | permanent |
| **Touch log** | `work_log` | every touch (the production tracker): user, RCA, end action, comment, time spent, call ref, QA result | permanent |
| **Rule runs** | `rule_runs` | which rule, trigger, matched vs changed, sample claims, dry-run flag, batch | permanent |
| **Recovery ledger** | `recoveries` | amount, type, credited user, basis (last touch / split / unattributed) | permanent |
| **System audit log** | `audit_log` | config changes, user/role changes, imports, rollbacks, rule/check runs, exports, merges, deletes; optionally every claim *view* (PHI access) | permanent; append-only |

### 6.1 Undo (rollback)

Allowed for the **newest committed import of a client**, by users with “Undo imports”.
- *Created* claims are deleted — unless they have since been touched or noted, in which case they are kept, closed, and marked `rolled_back`.
- *Updated / re-keyed / reopened / closed / missing* claims get their before-image of file-owned fields back (status is restored only for close/reopen).
- Claims merely touched by the batch (unchanged) get their provenance pointer reset.
- The batch's recoveries are removed; the batch is marked `rolled_back`; the action is audited.
- A failed import is marked `failed`; Undo restores whatever was written.

## 7. Recovery attribution

When a file reduces or closes a balance, the reduction is a **recovery event** (`amount = old − new`, or the full balance for a close).
1. Collect the claim's touches up to the file's as-of date.
2. Keep those inside the **attribution window** (default 45 days).
3. **Last-touch** *(default)*: the most recent toucher gets 100 %. **Split-equal**: shared equally between distinct touchers (rounded so the shares sum exactly).
4. No touch in the window → `unattributed`.
5. **Type**: `adjustment` if the claim's status is *Adjusted* or the last end action was an adjustment; `patient` if billed-to-patient / patient-responsibility; otherwise `unknown` (shown as “unconfirmed”) until someone sets paid / adjusted / patient.

Dollar attribution is only visible to roles with “See recoveries”.

## 8. Quality checks (claim-accounting & workflow logic)

Each check is a pure function with a message, a configurable severity and thresholds (Rules & Checks → Quality checks). **Sync flags to claims** (button, daily automation, and after each import) writes a managed `chk:<id>` flag per violation and clears it when fixed, so rules, worklists and lanes can all use them. A claim can be *ignored* for one check (`ign:<id>` flag) — e.g. a legitimate repeat charge. The full catalogue is in §14.

Beyond single-claim checks, the **Exceptions workbench** adds: duplicate-charge clusters with one-click merge, managed import flags with explanations and bulk clear, and payer-name hygiene.

## 9. Automation rules

A rule = **trigger** + **scope** + **conditions** (ALL / ANY) + **actions** (+ optional *stop*).

- **Triggers**: *after each import* (claims touched by that file), *when a touch is saved* (that claim), *daily* (all open claims; runs on the first supervisor/admin sign-in each day, after the check sync), *manual* (run-now / dry-run).
- **Evaluation**: rules run in `sort` order. A rule with **no conditions never fires**. A rule with `stop` ends processing for the claims it matched. Closed claims are never evaluated.
- **Actions**: set priority · set status · assign to a pool (balance-load or round-robin, counting existing load; owned claims are skipped unless “reassign”) · follow-up in N days · add/remove flag · add note · notify (owner / supervisor / admins / everyone → in-app bell) · **auto-code root cause from denial codes** (only when RCA is empty and confidence ≥ 70 %) · close (adjust).
- **Idempotent**: an action that would not change the claim is not an effect, so a second run reports `changed = 0`.
- **Dry-run** shows matched/changed counts and sample claims without writing. Every real run logs to `rule_runs` and to each claim's activity (“Rule X: priority → Critical”).
- **Rules are not limited to imports**: they use accounting facts (balance, billed, credit, TF days left), workflow facts (touches, days since touch, follow-up overdue), denial families, collectability, and check flags.

## 10. Analytics

### 10.1 Collectability (probability a claim is recovered) — heuristic, transparent

`p = ageCurve(age) × rootCauseWeight × payerFactor × timelyFilingFactor × paidPartlyFactor × touchFactor`, clamped to 2–97 %.
- `ageCurve`: 90 % at day 0 → 85 % @30 → 75 % @60 → 62 % @90 → 50 % @120 → 42 % @150 → 34 % @180 → 22 % @270 → 14 % @365 → 7 % @540 (linear between anchors).
- `rootCauseWeight`: per category, editable (e.g. Claim in Process 1.25, Authorization 0.7, Timely Filing 0.2).
- `payerFactor` = payer's historical resolution rate ÷ overall rate (shrunk toward the overall rate with 8 pseudo-claims), clamped 0.7–1.35.
- TF passed ×0.3 · partly paid ×1.1 · ≥6 touches unresolved ×0.8 · fresh (<45 d, untouched) ×1.05.
Expected recovery = `p × balance`. Every claim shows the factor list.

### 10.2 Next-best-action
For a chosen root-cause detail, ranks end actions by *historical success rate* = (resolved claims that received the action + 1) ÷ (claims that received it + 2), scoped payer → root-cause detail → category, requiring a minimum sample (default 3, editable). A "success" is a claim that closed, reached a closing status or had its balance reduced.

### 10.3 Pattern miner
Payer × root-cause concentration (lift ≥ 1.8, share ≥ 20 %, n ≥ 8); payer × denial family; CPT denial-rate outliers (≥ 1.6× average); **systemic issues** (same payer + CPT + denial family ≥ 5 times); provider denial outliers (≥ 15 points above the practice); weekly root-cause surges (z ≥ 2 vs the previous 6 weeks); slow payers (median days-to-resolve ≥ 1.5× overall); payer AR growth between snapshots (≥ 15 % and ≥ $5k).

### 10.4 Forecast, roll-forward, health
- Cash forecast: Σ expected recovery split by an editable 0-30/31-60/61-90 curve (default 35/35/30).
- Roll-forward: ages every open claim by 30/60/90 days with collectability decay — "the cost of inaction".
- Client health (0–100): aging mix 35 · timely-filing exposure 15 · work coverage 20 · ownership 10 · AR momentum 20.

### 10.5 Denial-code intelligence
A built-in dictionary of ~28 common CARC codes (paraphrased; editable in Admin → Denial codes) maps codes → likely root cause, first move and appeal tip. Used for suggestions on the claim, the *root cause contradicts the denial code* check, auto-coding rules, and pattern mining.

## 11. Notes & QA

- **Note builder**: contact method + outcome template + facts → a clean sentence (`[[ optional ]]` segments disappear when their variable is empty). Templates are editable. *Tidy* expands abbreviations (pt, ins, f/u, TF, auth, COB, MR…) with a word-level diff to accept/reject. Voice dictation uses the browser's built-in speech recognition (nothing is sent to ARMS).
- **Note quality (0–100)**: detail 15 · reference # 20 (calls) · rep named 15 (calls) · outcome stated 20 · next step 15 · follow-up date 10 · specifics 5.
- **Auto-QA risk (0–100)** pre-screens every pending touch so auditors see the riskiest first: very short note +30 · call without reference +20 · "paid" in the note but an appeal action +20 · "denied" but root cause "in process" +15 · adjusting a claim the note says is processing +25 · root cause conflicts with the denial code +25 · adjustment on ≥ $500 +20 · call under 20 s +10 · no follow-up +10.

## 12. Permissions

Fine-grained capabilities per role (matrix in Admin → Permissions). They control menus, buttons, data visibility and PHI masking. **They sit on top of — and can never widen — the database's Row-Level Security**, which independently guarantees: clients read only their own practice's claims, shared notes, batches, recoveries and requests; staff identities, work logs, audit and rules are staff-only; only managers write config.

## 13. Reports

Client and internal digests are generated by one pure function used for in-app preview, download, and the scheduled sender. **Emails are PHI-free**: aggregates, payer names and counts only — no patient names, no claim numbers. Schedules fire once per period at/after the configured UTC hour (weekly by weekday, monthly by day with month-end clamping). Failures are caught per schedule and written to the audit log.

## 14. Catalogues (generated from code)

### Quality checks

| Check | Group | Default severity | Thresholds (defaults) | What it catches |
|---|---|---|---|---|
| `bal_gt_billed` — Balance exceeds billed amount | Accounting | med | — | A balance higher than the charge usually means a posting or import error. |
| `credit_balance` — Credit (negative) balance | Accounting | med | — | Overpayment or misposted payment — needs a refund/transfer decision. |
| `zero_open` — Open claim with zero balance | Accounting | low | — | Nothing left to collect; should close on the next snapshot. |
| `billed_zero` — Zero billed amount with a balance | Accounting | med | — | Charge missing from the export; balance cannot be validated. |
| `tiny_balance` — Tiny balance — adjustment candidate | Accounting | low | Balance below ($): 25 | Chasing this costs more than it recovers. |
| `dos_after_billed` — Billed before date of service | Accounting | med | — | Impossible sequence — one of the dates is wrong. |
| `balance_up_worked` — Balance rose after we worked it | Accounting | med | — | Often a reversed payment, takeback or rebill — verify before more effort. |
| `old_unworked` — Old claim never worked | Accounting | high | Older than (days): 90 | Aged inventory with zero touches is the fastest way to lose money. |
| `tf_passed_open` — Timely-filing window passed — no appeal in progress | Accounting | high | — | Without proof of timely filing this is likely unrecoverable; decide appeal vs adjust. |
| `tf_imminent_unowned` — Timely filing within 30 days and unassigned | Accounting | high | — | Nobody owns a claim about to expire. |
| `terminal_lingering` — Closing action taken but balance still on the aging | Workflow | med | Still open after (days): 14 | Adjusted / billed-to-patient claims should leave the PMS aging soon. |
| `fu_missing` — Worked claim without a follow-up date | Workflow | med | — | No follow-up = claim falls off everyone’s radar. |
| `fu_on_closed` — Follow-up date on a closed-out claim | Workflow | low | — | Stale follow-up creates false work. |
| `status_action_mismatch` — Status does not match last end action | Workflow | low | — | Status was edited manually or an end action was reconfigured. |
| `new_but_touched` — Status still “New” after being worked | Workflow | low | — | Status was not advanced. |
| `stuck_new` — Stuck in “New” | Workflow | med | Days in New: 21 | Claim has sat unstarted for too long. |
| `loop_same_action` — Same action repeated without progress | Workflow | high | Repeats: 3 | Doing the same thing three times and expecting a different result — change approach or escalate. |
| `many_touches` — Excessive touches | Workflow | med | Touches ≥: 6 | High effort, no result: candidate for escalation or adjustment. |
| `owner_inactive` — Owner is inactive or missing | Workflow | high | — | Claim is assigned to someone who can no longer work it. |
| `unowned_old` — Unassigned for too long | Workflow | med | Days unassigned: 14 | Unowned claims age silently. |
| `appeal_stale` — Appeal with no activity | Workflow | med | Quiet for (days): 45 | Appeals have deadlines and need status checks. |
| `submitted_stale` — Resubmitted claim not followed up | Workflow | med | Quiet for (days): 35 | Corrected claims should be checked after the payer’s processing window. |
| `carc_rca_mismatch` — Root cause contradicts the denial code | Coding & denials | med | — | The remit says one thing, the coded root cause another — one is wrong (hurts analytics and QA). |
| `carc_unknown` — Denial code not in the dictionary | Coding & denials | low | — | Add it in Admin → Denial codes so it can drive suggestions and analytics. |
| `denied_no_codes` — PMS says denied but no denial code | Coding & denials | low | — | Without codes the root cause is guesswork. |
| `cpt_format` — CPT/HCPCS format looks wrong | Coding & denials | low | — | Five digits, or a letter plus four digits, optional modifier. |
| `dup_charge` — Same charge exists on another open claim | Identity | high | — | Same patient, DOS, CPT and amount under a different number — likely duplicate. |
| `payer_unknown` — Payer missing | Data quality | med | — | Cannot apply payer rules, timely filing or contacts. |
| `no_dos` — No date of service | Data quality | med | — | Claim cannot be aged. |
| `patient_blank` — Patient name missing | Data quality | low | — | Hard to identify and to fingerprint for duplicates. |

### Rule fields

| Field | Type | Notes |
|---|---|---|
| `balance` | number | Balance ($) |
| `billed_amt` | number | Billed ($) |
| `age` | number | Age (days) |
| `bucket` | text | Aging bucket |
| `tf_left` | number | Timely-filing days left — negative = passed |
| `days_since_touch` | number | Days since last touch — 999 if never touched |
| `touch_count` | number | Touch count |
| `payer` | text | Payer |
| `client` | text | Client |
| `status` | text | Status |
| `priority` | text | Priority |
| `rca` | text | Root cause category |
| `rca_detail` | text | Root cause detail |
| `end_action` | text | End action |
| `pms_status` | text | PMS status |
| `denial_codes` | text | Denial codes |
| `cpt` | text | CPT |
| `provider` | text | Provider |
| `owner` | text | Owner (user id) — empty = unassigned |
| `flag` | text | Has flag — includes quality-check flags like chk:loop_same_action |
| `denial_family` | text | Denial family — e.g. Timely filing, Authorization, Bundling |
| `collectability` | number | Collectability (%) |
| `days_open` | number | Days since first seen |
| `check_count` | number | Quality-check flags |
| `is_new` | bool | New in this import |
| `is_reopened` | bool | Reopened |
| `fu_overdue` | bool | Follow-up overdue |

### Built-in rule templates

| Template | Runs | When | Then |
|---|---|---|---|
| Timely filing ≤ 30 days → Critical | import | tf_left lte 30 all tf_left gt 0 | priority=Critical, flag=tf_risk |
| Small balance (< $25) → flag for adjustment review | import | balance lt 25 all balance gt 0 | flag=small_balance, priority=Low |
| Credit balance → refund review | import | balance lt 0 | flag=refund_review, priority=High |
| Reopened claim → High priority | import | is_reopened is_true  | priority=High, next_fu_in=1 |
| High value (> $5k) & unassigned → assign to seniors | import | balance gt 5000 all owner is_empty  | assign, priority=High |
| Cold high-value claims → escalate | daily | days_since_touch gte 14 all balance gte 1500 | flag=gone_cold, priority=High |
| Auto-code root cause from denial codes | import | rca is_empty  all denial_codes not_empty  | suggest_rca |
| Systemic loop (same action 3×) → notify supervisor | daily | flag contains chk:loop_same_action | notify=Claim stuck in an action loop, priority=High |
| Denial family: Timely filing → escalate | import | denial_family contains Timely filing | priority=Critical, flag=tf_denial, notify=Timely-filing denial received |
| Low collectability & old → flag for write-off review | daily | collectability lt 15 all age gt 270 | flag=writeoff_review, priority=Low |
| Follow-up overdue 7+ days → Escalated status | daily | fu_overdue is_true  all days_since_touch gte 7 | status=Escalated |

### Managed import flags

| Flag | Meaning |
|---|---|
| `balance_up` | Balance increased — Balance went up since the last file — rebill, reversed payment, or data error. |
| `credit_balance` | Credit balance — Negative balance: overpayment / refund review. |
| `reopened` | Reopened — Was closed, reappeared on the aging report. |
| `missing_once` | Missing from last file — Absent from the latest file; will close if it stays absent. |
| `payer_changed` | Payer changed — Payer differs from the previous file (often a primary→secondary shift). |
| `dos_conflict` | DOS conflict — File date of service differs from the stored one; stored value kept. |
| `possible_duplicate` | Possible duplicate — Same patient, DOS and charge as another claim under a different number. |
| `rekeyed` | Claim # changed — PMS issued a new claim number; history was carried over. |
| `generated_id` | Generated ID — No claim number in file — ARMS generated a stable ID from patient/DOS/CPT/amount. |
| `bal_gt_billed` | Balance > billed — Balance exceeds the billed amount. |

### Default permissions

| Capability | admin | supervisor | specialist | auditor | viewer | client |
|---|---|---|---|---|---|---|
| Work claims (touches, notes) | ✔ | ✔ | ✔ | · | · | · |
| Take unassigned claims | ✔ | ✔ | ✔ | · | · | · |
| Assign / reassign claims | ✔ | ✔ | · | · | · | · |
| Bulk edit claims | ✔ | ✔ | · | · | · | · |
| Close / adjust claims | ✔ | ✔ | · | · | · | · |
| Merge duplicate claims | ✔ | ✔ | · | · | · | · |
| Delete claims | ✔ | · | · | · | · | · |
| Import aging files | ✔ | ✔ | · | · | · | · |
| Undo imports | ✔ | ✔ | · | · | · | · |
| Export data (CSV) | ✔ | ✔ | ✔ | ✔ | · | · |
| See patient names | ✔ | ✔ | ✔ | ✔ | ✔ | · |
| See recoveries & $ attribution | ✔ | ✔ | · | ✔ | · | · |
| View audit log | ✔ | ✔ | · | · | · | · |
| Run rules & checks | ✔ | ✔ | · | · | · | · |
| Create / edit rules | ✔ | ✔ | · | · | · | · |
| Manage report schedules | ✔ | ✔ | · | · | · | · |
| QA-audit touches | ✔ | ✔ | · | ✔ | · | · |
| Request client approvals | ✔ | ✔ | · | · | · | · |
| Manage users & invites | ✔ | · | · | · | · | · |
| Manage clients & providers | ✔ | ✔ | · | · | · | · |
| Edit configuration | ✔ | · | · | · | · | · |
| Edit this permission matrix | ✔ | · | · | · | · | · |

### Default import settings

```json
{
  "granularity": "claim",
  "identity": "auto",
  "missingKey": "generate",
  "duplicates": "aggregate",
  "closeAfterMisses": 1,
  "zeroBalance": "close",
  "negativeBalance": "flag",
  "maxDropPct": 40,
  "maxTotalDeltaPct": 25,
  "maxInvalidPct": 20,
  "maxBadDatePct": 10,
  "requireAsOf": true,
  "blockStale": true,
  "blockSameFile": true,
  "dateOrder": "auto",
  "overwrite": {
    "balance": "file",
    "billed_amt": "file",
    "payer": "file",
    "pms_status": "file",
    "denial_codes": "file",
    "last_billed": "file",
    "cpt": "file",
    "provider": "file",
    "provider_type": "fill",
    "dos": "fill",
    "patient_name": "fill",
    "account_id": "fill"
  },
  "attributionWindowDays": 45,
  "attributionMode": "last_touch",
  "stripPrefix": [],
  "autoAliasPayers": true
}
```

---

## 15. Edge-case playbook

| You see… | Why | Do this |
|---|---|---|
| “MASS_DROP — N open claims would close” | The file is partial or the wrong client/report. | Switch to **Partial export** (merge). If it really is a full snapshot, tick the acknowledgement. |
| “STALE_FILE” | You uploaded last week's report after this week's. | Don't — or untick “block stale” and acknowledge if you truly need it. |
| “SAME_FILE” | Identical content already imported. | Nothing to do. |
| “REKEY_STORM” | Claim numbers changed for many rows. | You probably mapped *encounter/visit ID* as the claim number. Remap and re-analyse. |
| Many “possible duplicate” flags | Same patient/DOS/charge under different numbers. | Exceptions → Duplicates: merge, or mark “not duplicates”. |
| “BAD_DATES” | dd/mm vs mm/dd, or the wrong column mapped as DOS. | Set Date format explicitly on the review screen. |
| Claim numbers like `1.23E+11` | Excel converted a long id to a number. | Re-export that column as text (or let ARMS generate IDs). |
| A balance went **up** | Reversed payment, takeback, rebill or posting error. | Exceptions → Import flags → “Balance increased”; the touch history shows what we did last. |
| A claim closed but wasn't paid | A write-off drops off the aging too. | Confirm the resolution on the claim; the ledger separates unconfirmed from paid/adjusted. |
| Wrong import went through | — | Import history → **Undo** (newest import per client). |
| A rule did something unexpected | — | Rules → Run log shows matches; each claim's activity names the rule; disable the rule and Undo individual effects by editing the claim. |

## 16. Weekly operating procedure

1. Export the full aging from the PMS (include claim #, patient, DOS, payer, balance, billed, CPT; *line #* if line-level).
2. Import → pick the client → drop the file → confirm the detected template and as-of date → **Analyse**.
3. Read the **Safety checks**; resolve payer names and identity questions; acknowledge only what you understand.
4. **Import now** (rules and checks run automatically).
5. Review **Exceptions** (high severity first) and **Allocation** for new/unowned claims.
6. Check **Import history** if anything looked off; use **Undo** within the same day if needed.
