-- 0019: fax log, in-app feedback for the test phase, provider NPI, and per-row "who changed it" on claims. Idempotent; run after 0018.
alter table public.providers add column if not exists npi text;
alter table public.providers add column if not exists credentials text;

create table if not exists public.fax_log (
  id uuid primary key default gen_random_uuid(),
  appeal_id uuid references public.appeals(id) on delete set null, claim_id uuid references public.claims(id) on delete set null, client_id uuid references public.clients(id) on delete set null,
  to_number text not null, subject text, pages int not null default 1, provider text not null, provider_id text,
  status text not null default 'queued' check (status in ('queued','sent','failed','test')), error text,
  sent_by uuid references public.profiles(id) on delete set null, sent_by_name text, created_at timestamptz not null default now(), delivered_at timestamptz
);
create index if not exists fax_log_claim_idx on public.fax_log (claim_id, created_at desc);
create index if not exists fax_log_provider_idx on public.fax_log (provider, provider_id);
alter table public.fax_log enable row level security;
drop policy if exists "staff_read_fax_log" on public.fax_log;
create policy "staff_read_fax_log" on public.fax_log for select to authenticated using (public.is_staff());
-- no insert/update policy: only the server-side function (service role) writes to the log

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete set null, user_name text, route text, build text,
  kind text not null default 'bug' check (kind in ('bug','idea','question')), body text not null check (length(body) between 3 and 4000), status text not null default 'new' check (status in ('new','seen','done')),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "feedback_insert" on public.feedback; create policy "feedback_insert" on public.feedback for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "feedback_read" on public.feedback; create policy "feedback_read" on public.feedback for select to authenticated using (user_id = auth.uid() or public.my_role() = 'admin');
drop policy if exists "feedback_admin_update" on public.feedback; create policy "feedback_admin_update" on public.feedback for update to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- who last changed a claim, and a revision counter (lets the app tell you "Neha updated this claim")
alter table public.claims add column if not exists updated_by uuid;
alter table public.claims add column if not exists rev int not null default 1;
create or replace function public.claims_bump() returns trigger language plpgsql as $$
begin
  new.rev := coalesce(old.rev, 1) + 1; if auth.uid() is not null then new.updated_by := auth.uid(); end if; return new;
end $$;
drop trigger if exists claims_bump on public.claims;
create trigger claims_bump before update on public.claims for each row execute function public.claims_bump();
