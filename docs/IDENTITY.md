# Claim identity, missing claims & resolution — scenarios and how each is handled

## Identifiers
| Id | Scope | Rule |
|---|---|---|
| **Claim UID** `RR-<CLIENT>-<YY>-<7-digit seq>-<check>` e.g. `RR-CPS-26-0001234-K` | Global, permanent | Issued once at creation, sequential **per client**, never changes (re-number, merge, reopen, re-import). Check character catches typos. Reserved atomically in Postgres (`alloc_claim_uids`); a database trigger makes it immutable and a unique index makes duplicates impossible. |
| Claim # (from the PMS) | Per client | Normalised key; unique **per client** (`claims_client_key_uidx`). Two practices can both have claim `1000234` — they never meet. |
| Encounter / visit # | Per client | Stored and searchable; groups claims of one visit. Not required to be unique (one encounter can have a primary and a secondary claim). |
| Aliases | Per claim | Old numbers after the PMS re-numbers a claim, so earlier files still map. |

## Scenarios
| # | Scenario | What happens | Tested |
|---|---|---|---|
| 1 | Different clients use the same claim # / encounter # | Matching only looks inside the client being imported; DB keys are `(client_id, key)`; UIDs carry the client tag | `missing.test.ts`, `identity.sql` |
| 2 | The PMS **recycles** a claim # for a different patient *and* DOS | Not merged. Created as a separate claim `C123~2`, flagged "Claim # reused"; later files match each variant to the right claim | `missing.test.ts` |
| 3 | DOS or name corrected for the same patient | Still the same claim (only both-differ counts as reuse) | `missing.test.ts` |
| 4 | M1 has 1000 claims, M2 has 900 of them + 300 new | The 300 are created; the **100 absent claims stay open** and enter **Control → Missing from file** with a badge and a supervisor notification. Nothing is closed by absence alone | `missing.test.ts`, `e2e-missing.cjs` |
| 5 | A supervisor/manager/TL/SME decides | **Paid** (amount), **Written off** (reason required; limit for TL/SME, manager above), **To patient**, **Duplicate**, **Voided**, **Transferred**, or **Restore** (export was incomplete). Splits allowed (paid + adjusted + patient). Each decision records: resolved date, end action + sub-category, note, who decided, recoveries credited to whoever last worked it, a work-log entry (so QA can sample write-offs), an activity entry and an audit-log entry | `missing.test.ts`, `e2e-missing.cjs` |
| 6 | A missing claim shows up again in a later file | Removed from the queue automatically ("Back on the aging file") | `missing.test.ts` |
| 7 | A claim resolved as paid/written-off **reappears with a balance** | Reopened with a flag; the earlier decision's recovery credits are reversed so productivity is not inflated | store + `e2e-missing.cjs` (manual reopen) |
| 8 | Two supervisors resolve the same claim | Second one is skipped ("Already closed"); the database also refuses a conflicting `resolved_by` | unit + `identity.sql` |
| 9 | Someone tries to sign a decision as another user, edit a UID, or delete a closed claim | Refused by database triggers (only Sr. Management may delete closed claims) | `identity.sql` |
| 10 | Partial export (e.g. only 2 of 5 payers) | Tick **This file covers → only selected payers** on the import screen: other payers' claims are never treated as missing. Without it, a file missing >40 % of open claims is **blocked** by the mass-drop guardrail | unit |
| 11 | Undo (roll back) an import that queued claims for review | Restores them — except claims a supervisor already decided, which keep their decision | store |
| 12 | Review queue ignored | Check "Missing from file — decision overdue" (default 7 days) flags them in Exceptions | unit |
| 13 | Old files, same file twice, wrong columns, dd/mm dates, duplicate rows, re-numbered claims, generated IDs | Existing guardrails (stale/same-file block, date-order detection, aggregate/dedupe, fingerprint match) — unchanged | `engine.test.ts` |

## Closed claims keep their history
**Work → Closed & resolved** lists every closed claim (filter by date, client, resolution, basis, decider; export CSV). Open any row: the drawer shows the closing banner (date, resolution, end action, who, note), the full **Activity** timeline (imports, missing-from-file, decision), **Touch history**, **Notes**. A lead/manager can **Reopen** with a reason (restores the original balance, reverses that decision's recoveries).

## Scale
`tests/scale_engine.test.ts`: 60,000 existing × 60,000-row file (5,000 new, 5,000 missing) reconciles in ≈4 s; UID backfill of 60,000 claims ≈0.5 s in the browser, ≈7 s in Postgres (migration 0013). The claim drawer enriches one claim, not the inventory.

## Settings
Admin → Import rules → **When a claim is missing from a snapshot** (review ⟷ legacy auto-close) and **Act after N missing files**; Admin → Workspace → **Write-off limit** for team leads/SMEs. Permission `resolve_missing` (all leads, managers, Sr. Mgmt).
