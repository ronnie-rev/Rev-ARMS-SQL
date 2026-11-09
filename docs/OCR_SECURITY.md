# Browser-side OCR — security & compliance record

Feature: **Tools → Work a call / letter → Denial letter reader** (scans and photos of payer letters/EOBs → text → claim facts).
Engine: tesseract.js 7.0.0 + tesseract.js-core 7.0.0 (WebAssembly) + English model, **self-hosted** from `/ocr/*` on the ClaimsIQ origin.
This document is evidence for your HIPAA risk analysis. It states what the code enforces (and how to re-verify) and what only your organisation can do.

## 0. OCR is FROZEN
Decision (2026-11-05): the OCR stack stays on the reviewed release — tesseract.js 7.0.0, tesseract.js-core 7.0.0, English model 1.0.0 — with no enhancements planned. `docs/ocr-lock.json` records the exact versions, licenses and SHA-256 of all 10 self-hosted OCR files. `npm run ocr:lock` (part of `npm run deps:review` and the monthly CI workflow) fails if any of them changes. To change OCR in future: upgrade deliberately, redo §1–2, run `npm run ocr:lock:update`, and update `docs/RISK_ANALYSIS_OCR.md`.

## 1. Library governance
| Check | Status | Evidence / how to re-verify |
|---|---|---|
| License is Apache-2.0 in the exact installed release | ✅ | `tesseract.js@7.0.0` and `tesseract.js-core@7.0.0` read `Apache-2.0` from their installed `package.json`; `npm run licenses` regenerates the inventory. English model package `@tesseract.js-data/eng@1.0.0` declares **MIT** on npm; the underlying `tessdata_best` model is published by the Tesseract project under Apache-2.0 — both permissive, notices retained. |
| Version pinned | ✅ | `package.json` uses exact versions (no `^`/`~`) for `tesseract.js`, `tesseract.js-core`, `@tesseract.js-data/eng`, `exceljs`, `minisearch`. `package-lock.json` pins the tree. `tesseract.js@7` requires `core ^7` — keep them in step. |
| Copyright notices retained | ✅ | Unmodified files are copied byte-for-byte, with `LICENSE` / `worker.min.js.LICENSE.txt` alongside in `/ocr`. Per-package copyright lines are in `docs/THIRD_PARTY_LICENSES.md`. |
| Apache-2.0 text included in third-party licenses | ✅ | `public/third-party-licenses.txt` (served at `/third-party-licenses.txt`, linked as **Open-source notices** on the Legal pages) opens with the Apache-2.0 text, then every production package's license text. |
| Complete dependency/license inventory | ✅ | `docs/THIRD_PARTY_LICENSES.md` — 307 production packages, 11 license types (see the file for the live count). `npm run licenses:check` fails on GPL/AGPL/LGPL/SSPL/unknown unless justified in `scripts/licenses.cjs` (no exceptions at present; `jszip` is dual MIT/GPL and is used under its MIT option. The earlier unlicensed `buffers` package was removed by pinning `unzipper@0.12.5` via `overrides`.). |
| Modifications documented | ✅ | None. If library code is ever modified, record it in `docs/THIRD_PARTY_LICENSES.md` and keep the original notices. |
| Periodic vulnerability + license review | ✅ | `.github/workflows/dependency-review.yml` runs monthly and on every dependency change: `npm audit --audit-level=high` + license check + OCR-asset check. **Owner action:** someone must watch that workflow's failures. `npm audit --omit=dev` currently reports 0 vulnerabilities (react-router upgraded to 7.18.5). |

## 2. Data-handling controls (what the code enforces)
| Control | Status | Implementation / proof |
|---|---|---|
| No patient documents sent to public OCR APIs | ✅ | OCR runs in a Web Worker in the user's tab. Test `scripts/e2e-ocr.cjs` records every network request while a scan is processed and fails on any request outside the app's origin. |
| No external CDN for worker, WASM or language data | ✅ | `src/lib/ocr.ts` sets `workerPath`, `corePath`, `langPath` to `/ocr/...` on this origin (`workerBlobURL:false`, `cacheMethod:'none'`). `scripts/sync-ocr-assets.cjs` copies the files from the pinned packages at build time. CSP (below) blocks anything else. |
| No PHI in the console | ✅ | No Tesseract logger/error handler is attached; the app never logs extracted text. Test asserts the recognised strings never appear in console output. |
| No PHI in analytics/telemetry | ✅ | The app has no analytics or telemetry SDK. Audit entries for OCR carry only page count and character count — **no file name** (names often contain patient names) and **no text**. |
| HTTPS enforced | ✅ | `netlify.toml`: `Strict-Transport-Security` (2 years, includeSubDomains), CSP `upgrade-insecure-requests`; `ocrPaths()` refuses to run on a non-HTTPS origin (localhost excepted for development). |
| Third-party loading blocked | ✅ | CSP `default-src 'self'`; `connect-src` limited to this origin, Supabase, and NLM Clinical Tables (code lookup, no PHI); `worker-src 'self' blob:`; `object-src 'none'`; `frame-ancestors 'none'`. The only external style/font host allowed is Google Fonts (typeface only; no document data). Verified by the e2e test running against `scripts/serve-dist.cjs`, which serves `dist/` with the exact headers from `netlify.toml`. |
| Role + client assignment | ✅ | OCR needs the *Work claims* permission. Matching only considers claims the user can see (database row-level security + staff client restriction, migration 0022). Saving facts to a claim needs *Work claims*. |
| Uploaded documents encrypted in transit/at rest | ✅ (by design) / ⚠ (extracted facts) | The document is never uploaded or stored: it exists only in browser memory, so there is no copy to encrypt at rest. If a user chooses **Save facts as note**, only extracted codes/dates/amounts/reference numbers (not the raw text) are written to the claim in Supabase — encrypted in transit (TLS) and at rest by your Supabase project. |
| Temporary data & cache cleanup | ✅ | Defined policy: (1) page canvases are zeroed after each page; (2) the OCR worker is terminated when a job ends or fails; (3) the extracted text is wiped on **Clear**, after **10 idle minutes**, and when the user leaves the page (component unmount / page unload); (4) nothing is written to `localStorage`, `sessionStorage`, IndexedDB or the Cache API (`cacheMethod:'none'`; asserted in the e2e test). The browser may still keep the PDF in its own download/temp folder if the user downloaded it first — that is outside the app. |
| OCR and record changes auditable | ✅ | `audit_log` entries: `ocr` ("OCR extraction run — N pages, N characters, processed in the browser") and `ocr_apply` ("Letter facts saved as a note on claim X", with the field types saved). Claim notes themselves are also recorded in the claim activity trail. Visible in Control → Audit log. |

## 3. What only your organisation can do (not satisfiable by code)
- [ ] **BAAs** in place with every service that stores or transmits ePHI for ClaimsIQ: Supabase (database/auth/storage — requires a plan that offers a BAA), Netlify (hosting/functions — check whether your plan covers PHI; with browser-only OCR no document reaches Netlify), your fax provider, email/inbound-email provider, and Google if you rely on Fonts from a PHI-adjacent page (no PHI is sent, but IP addresses are).
- [ ] Confirm **encryption at rest** is enabled and documented for your Supabase project, and who holds the keys.
- [ ] Add this feature to your **HIPAA Security Rule risk analysis** (45 CFR 164.308(a)(1)(ii)(A)): see §4.
- [ ] Workforce policy: scanned letters may contain PHI; staff must use the reader only on approved, managed devices (full-disk encryption, screen lock, no shared accounts).
- [ ] Assign an owner for the monthly dependency review and for upgrading `tesseract.js` / `tesseract.js-core` together.
- [ ] Minimum necessary: the workspace is PHI-free by default (patient name/DOB are discarded at import). Scans of payer letters can still contain patient identifiers; only extracted claim facts are saved.

## 4. ePHI flow for the risk analysis (OCR feature)
| Stage | Where ePHI exists | Safeguard |
|---|---|---|
| Received | User's local file (their device) | Managed device policy (org) |
| Loaded | Browser memory of one tab | No upload; HTTPS-only origin; CSP |
| Processed | Web Worker in the same tab (WASM) | Self-hosted engine; no network calls; no logging |
| Displayed | On screen in the Tools page | Role + client-scoped access; clears on idle/leave |
| Maintained | **Not maintained.** Optionally, extracted facts → claim note | Supabase TLS + at-rest encryption; RLS; audit trail |
| Transmitted | Only the optional note (TLS) to Supabase | BAA with Supabase (org) |
| Disposed | Memory released at Clear/idle/unload | Defined cleanup policy (§2) |

## 5. Re-verification
```
npm run build
node scripts/serve-dist.cjs 4180 &
node scripts/e2e-ocr.cjs          # scan → OCR; no 3rd-party requests; no console/storage leaks; audit entries without names/text
npm run deps:review               # advisories + license policy
npm run licenses                  # refresh docs/THIRD_PARTY_LICENSES.md and public/third-party-licenses.txt
```
