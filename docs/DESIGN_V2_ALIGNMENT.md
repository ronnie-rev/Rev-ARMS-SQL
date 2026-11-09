# ARMS Functional Design v2 — alignment

Source: `ARMS_Functional_Design_v2.zip` (Functional & Data Architecture, Taxonomy & Status Registry, Pivot Analytics & Market Benchmark, RCA / End-action / status CSVs).
Legend: ✅ built · 🟡 partly / approximated · ⏳ not built (reason given).

## 1 · Principles & data architecture
| Spec | Status | Where / note |
|---|---|---|
| Claim-level canonical grain, aliases, lineage | ✅ | `engine/match.ts`, `reconcile.ts` (aliases, fingerprint, row log, before-image undo) |
| Native lifecycle separate from PMS status, bucket, RCA, end action | ✅ | `engine/lifecycle.ts` — 18 codes, stored in `claim.custom.lifecycle`, derived when unset |
| Guarded transitions (DEN→APL, PAY→CLS, CLS→REO, WOF approval…) | ✅ | `checkTransition`; the claim drawer opens a modal asking for the missing reason/method/due/amount/evidence |
| No write-back to PMS | ✅ | ARMS never writes to a PMS |
| Mandatory Visit Type (9 values, Unknown → triage) | ✅ | Import column + CPT inference (`engine/visit.ts`); Unknown ⇒ `VAL` lifecycle + triage list; Admin → Import rules "block approval on Unknown" |
| Multi-role providers (main/assistant surgeon) | 🟡 | Stored as `custom.roles[]` (import columns *Main Surgeon* / *Assistant Surgeon*, editable in drawer). No separate provider-role table or NPI yet |
| Encounter grouping, never merge ambiguous claims | ✅ | `encounterKey` = client+account+DOS; drawer lists "same encounter" claims |
| Import result vocabulary (CREATE / UPDATE / UNCHANGED / POSSIBLE MATCH / CONFLICT / MISSING) | 🟡 | Preview tiles now use this wording. CONFLICT is surfaced as guardrail/row issues rather than its own state |
| Duplicate file hash, snapshot idempotency, rollback by batch | ✅ | Existing engine |
| Recoveries only from matched payment evidence | ✅ | 835 import posts verified payments (basis `era835`); aging-based recoveries are labelled “inferred” and de-duplicated against them |
| Immutable UUIDv7 + human `AR-<tenant>-<seq>` code | ⏳ | UUID v4 today; display code is the PMS claim no. |
| Multi-tenant isolation in RLS | ✅ | Client logins are RLS-scoped (`my_client()`); org-level tenancy is single-org by design |
| Effective-dated mappings, draft→publish catalog CMS | 🟡 | Admin edits are live, validated and audited; lifecycle statuses are now editable (Admin → Lifecycle). Versioned publish/rollback not built |
| Assignment history | 🟡 | Activity timeline records every reassignment; no dedicated interval table |
| Snooze with reason / pause clock | ✅ | `custom.snooze_until/reason`; snoozed claims leave the worklist; "Wake" button |

## 2 · Taxonomy
| Spec | Status | Note |
|---|---|---|
| 57 RCA pairs | ✅ | All present in `taxonomy.ts` (verified programmatically) |
| 29 End-action pairs | ✅ | Existing "Updated End actions" labels kept; the 8 values only in the v2 CSV were added (credits spreadsheet, NDC/CLIA denials, Purchase Orders – Summit, POP referral, letter to patient, requested EOB/remit, adjustments root cause) |
| 14 work-bucket families | ✅ | `engine/families.ts`; Dashboard card, Aging → Queues tiles, Worklist filter, pivot field |
| Tags `NAMESPACE:VALUE`, auto-tags, no PHI | ✅ | `autoTags`, `isValidTag`; shown in drawer, filterable (`?tag=`) |
| Dependent RCA/End-action dropdowns | ✅ | Existing |

## 3 · Pivot & reporting
| Spec | Status | Note |
|---|---|---|
| Three-pane studio, four wells, drag + keyboard + click-to-add | ✅ | `/pivot` (dnd-kit pointer + keyboard sensors; hover buttons R/C/F as non-drag fallback) |
| Matrix / stacked bar / line / table toggle, subtotals, grand totals, drill-through, cross-filter | ✅ | |
| Governed metric registry (ratios per cell, distinct counts) | ✅ | `engine/pivot.ts` — no free-form formulas |
| Undo / redo / reset, saved versioned views, CSV/XLSX/PDF export | ✅ | Views in `app_settings.pivot_views` |
| Datasets | 🟡 | Claims, Work events, Recoveries, **Snapshot history ✅** (migration 0008). Denial episodes, Claim lines, Posting facts, Assignments ⏳ — need line-level / episode storage |
| Compare two snapshots / as-of | ✅ | Pivot “Compare two snapshots” + Δ columns; “compare latest two snapshots” works in the NL builder |
| AI report request, schema-constrained, no SQL | ✅ | Deterministic local parser (`pivot_nl.ts`) → config → validated compiler. No LLM call, nothing leaves the browser |
| KPI definitions | 🟡 | Open AR, 90+ %, touches/claim, denial % (denominator = claims in cell), SLA ⏳ (clock semantics need a decision) |
| Bridge (opening + new ± adj − payments = ending) | ✅ | Reports → A/R movement bridge, with an explicit unexplained-residual line |

## 4 · Differentiation roadmap
P0 integrity ✅ (previous rounds + lifecycle/visit) · P1 operator efficiency ✅ playbooks, note builder, bulk, QA, follow-ups · P1 reporting ✅ pivot, saved views · P2 intelligence ✅ explainable next-best-action · P2 integrations (835/277CA) ⏳ — next logical build.

## Deployment note
Everything new lives in existing JSON columns (`claims.custom`, `app_settings`) so **no new SQL migration is required** for this round.
