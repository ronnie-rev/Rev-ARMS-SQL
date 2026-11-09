# RevAtlas LMS → ARMS integration

Source: `RevAtlas_Advanced_ERP_LMS_v6` (staff-training workbook). Extracted from the running page (so runtime additions are included) into `src/lib/kb/*.json` (≈380 KB, lazy-loaded; nothing loads until you open the Knowledge hub or a denied claim).

| LMS content | Size | Where it lives in ARMS |
|---|---|---|
| Denial / status scenarios with decision flow, causes, exceptions, "ask the payer" | 178 | **Knowledge hub → Denial scenarios**; **Denial guide** inside every claim that carries CARC/RARC codes |
| CARC / RARC / adjustment groups / 277CA edits / rejections | 196 / 74 / 5 / 5 / 36 | Knowledge hub → Code decoder (links to scenarios) |
| Denial triage tree | 10 nodes | Knowledge hub → Triage |
| Appeal ladders, payer playbooks, top issues per payer | 6 / 10 / 9 | Playbooks & appeals |
| Appeal letter templates (fill-in) | 9 | Playbooks → Appeal letters |
| Call opener + branch question sets | 9 + 6 | Playbooks → Call guide |
| Bulk-issue patterns, prevention, trends | 20 / 10 / 17 | Playbooks |
| Cross-team routing (12 teams, 20 rules) | | Shown on each scenario as "Route: Coding → AR" |
| Payer directory, 6 state profiles, TFL/AFL presets | 8 / 6 / 9 | Payer directory (one click **Load into ARMS payers** → phone, portal, payer ID, timely-filing days) and Deadlines calculator |
| 5-Why, fishbone library, CAPA template | | Root cause & CAPA — shared action log (`user_items`) |
| Academy modules, quiz, decision-lab cases, concepts, how-to guides, code reference | 10 / 66 / 6 / 67 / 14 / 16 | Academy (progress stored per user in the browser) |
| Contact-mode evidence fields (call ref, portal ref, fax/email, batch ID) | 6 modes | Touch form: label and requirement follow the mode; end-action modes IVR / Fax-Email / Clearinghouse added |

**Not imported on purpose:** the LMS's own local-storage progress/notes and its in-page tools (days-in-AR, payment validator) — ARMS already computes those from real claims. The X12/NUCC atlas (`x12.json`, 74 KB) is stored but not surfaced yet.

**Caveats**
- Content is training guidance. Items the source marks "verify" (payer phone numbers, filing limits) must be confirmed against current payer manuals.
- Existing databases keep their current mode list; add IVR / Fax-Email / Clearinghouse under Admin → Modes (new installs get them).
- Migration `0006` is required: staff-created saved views, outreach log and CAPA actions previously tried to write to `app_settings`, which is admin-only under RLS. They now use `user_items` (own or shared-with-staff).
