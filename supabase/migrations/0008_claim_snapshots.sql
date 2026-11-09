-- 0008: one row per claim per aging snapshot (import batch). Enables as-of comparison, AR bridge and trend pivots. Idempotent; run after 0007.
create table if not exists public.claim_snapshots (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  claim_id uuid not null references public.claims(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  as_of date not null,
  balance numeric(12,2) not null default 0,
  billed_amt numeric(12,2) not null default 0,
  payer text,
  provider text,
  age_days int,
  bucket text,
  created_at timestamptz not null default now()
);
create index if not exists claim_snapshots_client_asof_idx on public.claim_snapshots (client_id, as_of);
create index if not exists claim_snapshots_claim_idx on public.claim_snapshots (claim_id, as_of);
create index if not exists claim_snapshots_batch_idx on public.claim_snapshots (batch_id);
alter table public.claim_snapshots enable row level security;
drop policy if exists "read_claim_snapshots" on public.claim_snapshots;
create policy "read_claim_snapshots" on public.claim_snapshots for select to authenticated using (public.is_staff());
drop policy if exists "write_claim_snapshots" on public.claim_snapshots;
create policy "write_claim_snapshots" on public.claim_snapshots for all to authenticated
  using (public.my_role() in ('admin','supervisor')) with check (public.my_role() in ('admin','supervisor'));
