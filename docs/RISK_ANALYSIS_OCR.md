# HIPAA Security Rule risk analysis — entry: Browser-side OCR (Denial letter reader)

*Prepared as a draft from the system design and test evidence. It must be reviewed, adjusted for your organisation's facts, and signed by your Security Official before it counts as your risk analysis (45 CFR 164.308(a)(1)(ii)(A)–(B)).*

## 1. How to use this document (if you have never done one)
1. A "risk analysis" is a written record that you looked at where ePHI lives, what could go wrong, how likely/serious it is, and what you did about it. Regulators ask for it first after any incident.
2. Keep **one master risk register** (a spreadsheet or document) for the whole company. This file is the OCR entry: copy §4 (the table) into the master register and keep §2–3 attached as supporting detail.
3. Have your **Security Official** (the person named responsible for HIPAA security — for a small company, an owner or manager) read it, correct anything that is not true for your setup, then sign §7.
4. Repeat it **at least yearly**, and whenever the feature changes (e.g. the OCR library is upgraded, a new vendor is added, or the hosting changes).
5. Keep the signed copy and the evidence files (`docs/OCR_SECURITY.md`, `docs/ocr-lock.json`, `docs/THIRD_PARTY_LICENSES.md`, test output from `scripts/e2e-ocr.cjs`) for **6 years**.

## 2. Scope and assumptions
- **Feature:** staff upload a scan/photo/PDF of a payer letter or EOB; text is recognised **inside the user's browser** and shown on screen; staff may save extracted *claim facts* (codes, dates, amounts, reference numbers) as a note on a claim.
- **ePHI involved:** the scanned document may contain patient names, member IDs, dates of service, claim and account numbers, and diagnosis/procedure codes. Treat every such document as ePHI. **This analysis does not assume the system is "HIPAA-free"** — claim numbers combined with dates of service and payer are identifiers.
- **Systems:** staff workstations (browser), the application web host (static files only), the database (claim notes, audit log). The document itself is **never uploaded or stored** by the application.
- **OCR software:** Tesseract.js 7.0.0, Tesseract.js-core 7.0.0, English model 1.0.0 — Apache-2.0 / MIT — self-hosted, unmodified, frozen (see `docs/ocr-lock.json`).
- **Out of scope here:** fax and inbound-email features (disabled; analyse separately before enabling).

## 3. ePHI data flow
| Stage | Where ePHI exists | Safeguards in place |
|---|---|---|
| Received | User's local file on their device | Managed-device policy (organisational) |
| Loaded | Memory of one browser tab | No upload; HTTPS-only; Content-Security-Policy restricts all outside hosts |
| Processed | Background worker in the same tab (WebAssembly) | Engine hosted on the same domain; no network calls; no logging; no browser caching |
| Displayed | Tools page, one user | Role + client-assignment access control; text wiped on Clear / 10 idle minutes / leaving the page |
| Maintained | **Not retained.** Optional: extracted facts saved as a claim note in the database | Database encryption in transit and at rest; row-level security; audit trail |
| Transmitted | Only the optional note, to the database | TLS; business associate agreement with the database host |
| Disposed | Browser memory released; canvases zeroed; worker terminated | Defined cleanup policy |

## 4. Risk register entries
Scoring: Likelihood (L) and Impact (I) 1 (very low) – 5 (very high); Risk = L × I. 1–6 Low · 8–12 Medium · 15–25 High. "Residual" is after the controls listed.

| ID | Threat / vulnerability | Existing controls | L | I | Risk | Residual | Further action | Owner | Due |
|---|---|---|---|---|---|---|---|---|---|
| OCR-1 | Document or text sent to a third-party OCR service or CDN | OCR engine self-hosted; CSP `default-src 'self'`; automated test fails on any outside request | 1 | 5 | 5 Low | Low | Re-run `scripts/e2e-ocr.cjs` after any build-config change | Dev lead | Each release |
| OCR-2 | Recognised text leaks into console, logs, analytics or error reports | No OCR logger attached; no analytics/telemetry in the app; test asserts no text in console | 1 | 4 | 4 Low | Low | Do not add error-reporting SDKs without a BAA and a PHI scrubber | Dev lead | Ongoing |
| OCR-3 | PHI remains on a shared or unattended workstation (screen, memory, downloads) | Text wiped on Clear / 10 idle min / navigation; nothing in local/session storage, IndexedDB or cache | 3 | 4 | 12 Med | Med | Workforce policy: managed devices, screen lock ≤ 5 min, full-disk encryption, no shared logins; browser download folder cleanup | Security Official | Before go-live |
| OCR-4 | Unauthorised user runs OCR or reads results | Requires "Work claims" permission; role + client restriction (RLS); audit entries per run | 2 | 4 | 8 Med | Low | Quarterly access review (Admin → Access audit) | Security Official | Quarterly |
| OCR-5 | Man-in-the-middle / downgrade of the connection | HTTPS-only; HSTS 2 years; CSP `upgrade-insecure-requests` | 1 | 4 | 4 Low | Low | Confirm HSTS/CSP are present on the **production** host (see `docs/HOSTING.md`) | Dev lead | Go-live |
| OCR-6 | Extracted facts saved to a claim note contain more PHI than needed | Only codes/dates/amounts/reference numbers are saved — never raw text or file name; user must verify and click Save | 2 | 3 | 6 Low | Low | Staff training: save facts only; do not paste letters into notes | Ops manager | Onboarding |
| OCR-7 | Database host not covered by a BAA / data not encrypted at rest | Defined in §5 | 3 | 5 | 15 High | **High until closed** | Sign BAA with database/hosting provider **before real client data**; document encryption at rest (`docs/BACKEND_OPTIONS.md`) | Security Official | Before go-live |
| OCR-8 | Vulnerability or malicious change in the OCR library or its dependencies | Versions pinned and **frozen** with file hashes (`npm run ocr:lock`); monthly dependency + license workflow; no modifications | 2 | 4 | 8 Med | Low | Treat any advisory against Tesseract.js as an incident: review, then update lock deliberately | Dev lead | Monthly |
| OCR-9 | Malformed/hostile PDF or image crashes or exploits the browser | Size limit 25 MB, 15 pages; runs in a sandboxed worker/WASM; pdf.js maintained upstream | 2 | 3 | 6 Low | Low | Keep browsers auto-updating | IT | Ongoing |
| OCR-10 | OCR misreads a code/date/amount and a wrong action is taken | UI labels results "recognised by OCR — verify against the original"; nothing is applied automatically | 3 | 3 | 9 Med | Med | Staff must check against the original before relying on it; do not use OCR output as the sole basis for write-offs | Ops manager | Onboarding |
| OCR-11 | No audit trail of who read what | `ocr` and `ocr_apply` audit entries (user, time, pages, characters, claim) — no file name or text | 1 | 3 | 3 Low | Low | Retain audit log ≥ 6 years (database backup policy) | Security Official | Go-live |

## 5. Dependencies on other safeguards (must be true for this entry to hold)
- [ ] **BAA** signed with the database host/provider and with your hosting provider **if PHI can reach it**. (For the OCR feature alone only the optional claim note reaches the database; the web host serves static files.)
- [ ] **Encryption at rest** verified for the database and its backups, evidence filed.
- [ ] **Each client practice** has signed a BAA with your company.
- [ ] Workforce HIPAA training completed and documented; sanctions policy exists.
- [ ] Incident / breach response procedure exists and names who to call.
- [ ] Contingency plan: backups tested by actually restoring them.

## 6. Residual risk statement
With the controls above, residual risk for the OCR feature is **Low**, except OCR-7 (database host agreements/encryption) which is **High until the §5 items are closed**. Real client data must not be loaded until OCR-7 is Low.

## 7. Review and sign-off
| Role | Name | Signature | Date |
|---|---|---|---|
| Security Official | | | |
| Privacy Official | | | |
| Prepared by (draft) | Engineering | — | 2026-11-05 |

Next review due: **12 months from sign-off**, or sooner on: OCR library change, hosting/database change, new vendor, security incident.
