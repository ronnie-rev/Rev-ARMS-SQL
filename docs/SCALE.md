# ARMS — scale & readiness review

Measured on this repository's own code. Re-run any of it: `npx vitest run`, `node scripts/e2e-scale.cjs` (needs `npm run build && npx vite preview --port 4173`).

## Verdict
**Ready** for a billing company running roughly **5–10 practices / up to ~25,000 open claims** in one workspace (the 5,000-claim stress set loads in ~1.6 s warm and every page renders in < 650 ms).
**Not yet ready** for 100k+ open claims in one workspace. The app loads claims, touches and activity into the browser, so memory grows linearly (~100 MB heap at 7.4k claims / 10k touches / 23k activity rows). The next steps are listed at the bottom — they are architecture changes, not tuning.

## What was verified
| Area | Check | Result |
|---|---|---|
| DB | All 10 migrations apply cleanly and idempotently on PG 16 (re-run safe) | ✔ |
| DB | RLS for client access and QA guard (`supabase/tests/*.sql`) | ✔ |
| DB | 60k claims / 120k touches / 120k activity rows, `EXPLAIN ANALYZE` as an `authenticated` staff user (RLS on) | below |
| API | `list()` paging against a PostgREST-style fake: every row exactly once, retry on transient errors | ✔ `tests/dbpaging.test.ts` |
| UI | 5,000+ claim stress data set: boot, every major route, zero page errors | ✔ `scripts/e2e-scale.cjs` |
| UI | Navigation, pivot drag-and-drop, admin "Add" buttons, console audit (34 checks), QA flow | ✔ `scripts/e2e-*.cjs` |

### Query plans (60k claims, RLS on)
| Query | Before 0010 | After 0010 |
|---|---|---|
| Deep page `offset 50000 limit 1000` | 217–253 ms (scans 51k rows) | **5.9 ms** with keyset paging (`id > last`) — now used by `db.list()` |
| Open claims, client + payer, top 100 by balance | 9.5 ms | 3.5 ms (`claims_open_payer_idx`) |
| Touches by client + 30 days | 33 ms | 25 ms (`work_log_client_date_idx`) |
| Touches by claim | 0.16 ms | 0.18 ms (already indexed) |
| Flag count over 40 % of rows | seq scan 278 ms | planner still seq-scans (low selectivity — correct); GIN helps selective flags |

### Browser, 5,300 open claims (7,420 incl. closed history), 10k touches, 23k activity, 900 QA reviews
- Seed generation 1.9 s; first load incl. quality-check sync (4.5k flags written) 6.8 s; **warm reload from IndexedDB 1.6 s**.
- Routes: dashboard 0.3 s, worklist 0.55 s, exceptions 0.64 s, pivot 0.33 s, QA 0.18 s.
- Heap ≈ 100 MB after login, 163 MB after opening Pivot.

## What changed for scale
- **Migration `0010_scale_indexes.sql`**: open-claim indexes by payer / status / DOS, owner + follow-up, closed lookups, GIN on flags, touch history by claim and client/day, notes, recoveries, notifications.
- **`db.list()` (Supabase)**: keyset paging instead of offset; big tables (`claims`, `work_log`, `claim_activity`, `claim_notes`, `claim_snapshots`, `import_log`, `recoveries`, `audit_log`, `qa_reviews`) are read as 16 uuid-prefix partitions, 6 in parallel, with exponential-backoff retry.
- **Local demo store** moved from `localStorage` (≈5 MB cap) to **IndexedDB**, with one-time migration of old data and a flush on page hide.
- **Stress data set**: Admin → Backup → *Load stress dataset* (5 clients, 5,300 open claims, every aging bucket, 5+ lifecycle statuses, flagged top issues, touches over ~120 days, notes, activity, recoveries, snapshots, QA reviews in every status). *Load small demo* switches back.

## Next steps when you outgrow it (in order)
1. Load **activity, notes and snapshots on demand** (per claim / per period) instead of at sign-in — the biggest memory item.
2. Server-side aggregates (SQL views / RPC) for dashboards, pivot and reports so the browser receives results, not rows.
3. Virtualise the worklist/pivot grids and window Realtime subscriptions to the open client scope.
4. Partition `work_log` and `claim_activity` by month if either passes ~5M rows; archive closed claims older than 2 years.
5. Move scheduled work (reports, checks, rules) to Supabase Edge Functions / pg_cron so it no longer depends on an open browser tab.
