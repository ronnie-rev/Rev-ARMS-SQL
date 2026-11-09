-- 0010: indexes for 50k+ claim workloads (measured with EXPLAIN on 60k claims / 120k touches). Idempotent; run after 0009.
-- Open-claim lists are always scoped by client; most filters are payer / status / owner / follow-up / flag.
create index if not exists claims_open_payer_idx   on public.claims (client_id, payer)          where closed_at is null;
create index if not exists claims_open_status_idx  on public.claims (client_id, status)         where closed_at is null;
create index if not exists claims_open_dos_idx     on public.claims (client_id, dos)            where closed_at is null;
create index if not exists claims_owner_fu_idx     on public.claims (assigned_to, next_fu)      where closed_at is null;
create index if not exists claims_closed_idx       on public.claims (client_id, closed_at)      where closed_at is not null;
create index if not exists claims_flags_gin        on public.claims using gin (flags);
create index if not exists claims_updated_idx      on public.claims (updated_at desc);
-- Touch history is read per claim, per user/day and per client/day (productivity, QA sampling, reports).
create index if not exists work_log_claim_created_idx on public.work_log (claim_id, created_at desc);
create index if not exists work_log_client_date_idx   on public.work_log (client_id, work_date);
create index if not exists work_log_pending_audit_idx on public.work_log (work_date) where audit_status = 'pending';
create index if not exists claim_notes_claim_idx      on public.claim_notes (claim_id, created_at desc);
create index if not exists recoveries_claim_idx       on public.recoveries (claim_id);
create index if not exists recoveries_user_idx        on public.recoveries (user_id, occurred_on);
create index if not exists notifications_user_idx     on public.notifications (user_id, created_at desc);
analyze public.claims; analyze public.work_log; analyze public.claim_notes;
