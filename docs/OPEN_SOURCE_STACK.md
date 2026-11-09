# Open-source stack

Everything below is on a permissive licence (MIT / Apache-2.0 / ISC / BSD) unless marked. The exact installed versions and licences are in `docs/THIRD_PARTY_LICENSES.md` (regenerate with `npm run licenses`; `npm run licenses:check` fails the build on a copyleft or unlicensed package). OCR is version-locked (`docs/ocr-lock.json`, `node scripts/ocr-lock.cjs`).

## 1. Built in and working today

| Project (GitHub) | Licence | What it does here |
|---|---|---|
| [naptha/tesseract.js](https://github.com/naptha/tesseract.js) | Apache-2.0 | In-browser OCR (self-hosted worker, WASM core and English model — no CDN, no public OCR API). **Frozen at 7.0.0.** |
| [mozilla/pdf.js](https://github.com/mozilla/pdf.js) | Apache-2.0 | Renders and reads PDFs (Studio, Document OCR, appeal forms) |
| [Hopding/pdf-lib](https://github.com/Hopding/pdf-lib) | MIT | PDF editing: annotations, redaction, merge/split, watermark, page/Bates numbers, form fill |
| [parallax/jsPDF](https://github.com/parallax/jsPDF) + autotable | MIT | Letter and table PDF export |
| [dolanmiu/docx](https://github.com/dolanmiu/docx) | MIT | Writes Word files (appeal letters, Word editor export with tables and pictures) |
| [Stuk/jszip](https://github.com/Stuk/jszip) | MIT / GPL-3 (used under MIT) | Reads `.docx` internals so Word files can be opened and OCR'd |
| [exceljs/exceljs](https://github.com/exceljs/exceljs) | MIT | Reads `.xlsx` remittances; Excel export |
| [mholt/PapaParse](https://github.com/mholt/PapaParse) | MIT | CSV import/export |
| [ueberdosis/tiptap](https://github.com/ueberdosis/tiptap) | MIT | Rich-text letter editor and the Word editor (tables, images, links) |
| [lucaong/minisearch](https://github.com/lucaong/minisearch) | MIT | Fast typo-tolerant claim search |
| [pacocoursey/cmdk](https://github.com/pacocoursey/cmdk) | MIT | Quick-find command palette |
| [TanStack/table](https://github.com/TanStack/table), [TanStack/virtual](https://github.com/TanStack/virtual) | MIT | Data tables; windowed rendering of large worklists |
| [recharts/recharts](https://github.com/recharts/recharts), [chartjs/Chart.js](https://github.com/chartjs/Chart.js) | MIT | Charts |
| [date-fns/date-fns](https://github.com/date-fns/date-fns) | MIT | Date maths and time zones |
| [colinhacks/zod](https://github.com/colinhacks/zod), [gvergnaud/ts-pattern](https://github.com/gvergnaud/ts-pattern) | MIT | Validation; exhaustive matching |
| [pmndrs/zustand](https://github.com/pmndrs/zustand) | MIT | App state |
| [google/diff-match-patch](https://github.com/google/diff-match-patch) | Apache-2.0 | Letter version compare |
| **[wanasit/chrono](https://github.com/wanasit/chrono)** (chrono-node) | MIT | **New:** finds dates written in words in payer letters ("the 20th of October, 2026") that fixed patterns miss |
| **[catamphetamine/libphonenumber-js](https://gitlab.com/catamphetamine/libphonenumber-js)** | MIT | **New:** validates and formats payer phone / fax numbers (Document OCR, appeal quality check before faxing) |
| **[adamgibbons/ics](https://github.com/adamgibbons/ics)** | ISC | **New:** calendar files (.ics) with 7-day and 1-day reminders for filing / appeal deadlines (Radar, Appeals, Document OCR). Titles carry claim numbers only — no PHI |
| **[simple-statistics/simple-statistics](https://github.com/simple-statistics/simple-statistics)** | ISC | **New:** the Dashboard "What changed in the last 7 days" detector (z-scores against the previous 8 weeks) |

## 2. Local document services (wired in, version-locked, offline)

These three run **on your own server** from `deploy/services/` and are used by the app only through the same-origin `/svc/` path. Without them every feature still works in the browser; the app detects them and switches the extra features on. Status is shown in **Admin → Document services**.

| Project | Locked version | Licence | What it adds in ClaimsIQ |
|---|---|---|---|
| [gotenberg/gotenberg](https://github.com/gotenberg/gotenberg) | 8.38.1 | MIT | Word / Excel / PowerPoint → PDF with the real layout, including old `.doc` `.xls` `.ppt` files that the browser cannot read (Document OCR, PDF Studio, Word editor "PDF (exact layout)") |
| [Stirling-Tools/Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF) | 2.11.0 | MIT (core) | Server-side OCR with no page limit and PDF compression (PDF Studio) |
| [languagetool-org/languagetool](https://github.com/languagetool-org/languagetool) via [Erikvl87/docker-languagetool](https://github.com/Erikvl87/docker-languagetool) | 6.8 | LGPL-2.1 | Spelling and grammar checks with one-click fixes in the Word editor |
| [nginx/nginx](https://github.com/nginx/nginx) | 1.30.5-alpine | BSD-2 | Allow-list proxy: the only published port, on 127.0.0.1 |

How it is kept safe and local:

* **Locked.** Images are pinned by tag *and* digest in `deploy/services/docker-compose.yml`; `deploy/services/versions.lock.json` is the record. `npm run services:lock` fails if the compose file, the proxy allow-list or the web-server config drift from it (it also runs inside `npm run deps:review`). `npm run services:live` additionally checks that the services answer.
* **Offline.** The services sit on an internal Docker network with no internet route. Analytics are off. Only the proxy listens, bound to `127.0.0.1:8088`, and it forwards just the seven endpoints the app uses — the Stirling-PDF web UI is never exposed.
* **Upgrades.** Change tag + digest in both files, run `npm run services:lock`, then re-test Studio and Document OCR. The app's integration is covered by `scripts/e2e-services.cjs`, which runs against a **mock** (`scripts/mock-services.cjs`); it proves the wiring, not the real containers — run the real stack once (`docker compose up -d`, then `npm run services:live`) before relying on it.
* **Not verified here:** the Stirling-PDF API paths follow the project's documented v1 REST endpoints; confirm them against the pinned 2.11.0 image on first start.

## 2b. Other self-hosted systems that could pair with ClaimsIQ (not bundled)

Listed with the licence facts that matter for a healthcare business. None is wired in or tested here.

| Project | Licence (check before deploying) | Why it could help | Caution |
|---|---|---|---|
| [apache/superset](https://github.com/apache/superset) | Apache-2.0 | Ad-hoc dashboards on the Postgres database | Needs a read-only DB role and row-level scoping for client restrictions |
| [paperless-ngx/paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) | GPL-3.0 | Long-term document archive with OCR | Separate service; do not link its code into the app |
| [documenso/documenso](https://github.com/documenso/documenso) | AGPL-3.0 | E-signatures | AGPL: run unmodified |
| [metabase/metabase](https://github.com/metabase/metabase) | AGPL-3.0 (open edition) | Business-user reporting | Row-level security needs the paid edition |
| [n8n-io/n8n](https://github.com/n8n-io/n8n) | Sustainable Use Licence (not OSI open source) | Workflow automation | Licence restricts commercial resale |

## 3. Candidates for a later round (npm libraries, permissive)

* `@zxing/browser` (Apache-2.0) — read barcodes / QR codes on scanned payer letters and fax cover sheets. **Deferred by request:** low value for EOB / remit work; it will be added together with a future feature that needs it.
* `dompurify` (Apache-2.0 / MPL-2.0) — extra HTML sanitising if untrusted HTML ever needs rich preview.
* `fuse.js` (Apache-2.0) — only if a fuzzy name search is wanted beyond MiniSearch.

## Policy

* Add a library only if it is permissive, actively maintained, runs in the browser without a CDN, and `npm audit --omit=dev` stays clean.
* After any dependency change run `npm run licenses`, `npm run deps:review`, the unit tests and the browser scripts in `scripts/e2e-*.cjs`.
* A monthly workflow (`.github/workflows`) re-runs the dependency and licence review.
