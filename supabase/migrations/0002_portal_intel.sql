-- 0002: client portal (RLS-scoped), requests, invites, call/time capture, snapshots. Idempotent; run after 0001.

-- ───────── columns ─────────
alter table public.profiles add column if not exists client_id uuid references public.clients(id) on delete set null;
-- (re-runnable: once later migrations have introduced newer roles, this early constraint must not be re-imposed)
do $$ begin
  if not exists (select 1 from public.profiles where role not in ('admin','supervisor','specialist','auditor','viewer','client')) then
    alter table public.profiles drop constraint if exists profiles_role_check;
    alter table public.profiles add constraint profiles_role_check check (role in ('admin','supervisor','specialist','auditor','viewer','client'));
  end if;
end $$;
alter table public.claim_notes add column if not exists client_visible boolean not null default false;
alter table public.work_log add column if not exists time_spent_sec int;
alter table public.work_log add column if not exists call_ref text;
alter table public.work_log add column if not exists contact_name text;
alter table public.work_log add column if not exists ack_at timestamptz;          -- specialist acknowledged QA feedback
alter table public.import_batches add column if not exists summary jsonb not null default '{}'::jsonb; -- bucket/payer snapshot for trends (PHI-free)

-- ───────── client requests (portal → team) ─────────
create table if not exists public.client_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  claim_id uuid references public.claims(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text,
  kind text not null default 'question' check (kind in ('question','documents','escalation','info')),
  body text not null,
  status text not null default 'open' check (status in ('open','answered','closed')),
  response text, responded_by uuid references public.profiles(id) on delete set null, responded_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.client_requests enable row level security;

-- invites: admin pre-authorises an email; the signup trigger applies role + client
create table if not exists public.invites (
  email text primary key,
  role text not null default 'client',
  client_id uuid references public.clients(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);
alter table public.invites enable row level security;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  select * into inv from public.invites where lower(email) = lower(new.email);
  insert into public.profiles (id, email, full_name, role, client_id)
  values (new.id, new.email,
          coalesce(inv.full_name, new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          case when inv.email is not null then inv.role
               when (select count(*) from public.profiles) = 0 then 'admin' else 'specialist' end,
          inv.client_id);
  if inv.email is not null then delete from public.invites where email = inv.email; end if;
  return new;
end $$;

create or replace function public.my_client() returns uuid language sql stable security definer set search_path = public as
$$ select client_id from public.profiles where id = auth.uid() and active and role = 'client' $$;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role in ('admin','supervisor','specialist','auditor','viewer') from public.profiles where id = auth.uid() and active), false) $$;

-- ───────── rewrite read policies: staff see everything, clients only their own practice ─────────
do $$ declare t text; begin
  foreach t in array array['profiles','clients','providers','claims','work_log','claim_notes','claim_activity','import_templates','import_batches','allocation_rules','client_requests','invites']
  loop execute format('drop policy if exists "read_%1$s" on public.%1$I', t); end loop;
end $$;

create policy "read_profiles" on public.profiles for select to authenticated using (public.is_staff() or id = auth.uid());
create policy "read_clients" on public.clients for select to authenticated using (public.is_staff() or id = public.my_client());
create policy "read_providers" on public.providers for select to authenticated using (public.is_staff() or client_id = public.my_client());
create policy "read_claims" on public.claims for select to authenticated using (public.is_staff() or client_id = public.my_client());
create policy "read_work_log" on public.work_log for select to authenticated using (public.is_staff());
create policy "read_claim_notes" on public.claim_notes for select to authenticated using (
  public.is_staff() or (client_visible and exists (select 1 from public.claims c where c.id = claim_id and c.client_id = public.my_client())));
create policy "read_claim_activity" on public.claim_activity for select to authenticated using (public.is_staff());
create policy "read_import_templates" on public.import_templates for select to authenticated using (public.is_staff());
create policy "read_import_batches" on public.import_batches for select to authenticated using (public.is_staff() or client_id = public.my_client());
create policy "read_allocation_rules" on public.allocation_rules for select to authenticated using (public.is_staff());
create policy "read_client_requests" on public.client_requests for select to authenticated using (public.is_staff() or client_id = public.my_client());

-- client may raise requests for their own practice only; staff manage all
drop policy if exists "client_insert_requests" on public.client_requests;
create policy "client_insert_requests" on public.client_requests for insert to authenticated
  with check (client_id = public.my_client() and status = 'open');
drop policy if exists "staff_write_requests" on public.client_requests;
create policy "staff_write_requests" on public.client_requests for all to authenticated
  using (public.my_role() in ('admin','supervisor','specialist')) with check (public.my_role() in ('admin','supervisor','specialist'));
drop policy if exists "admin_write_invites" on public.invites;
create policy "admin_write_invites" on public.invites for all to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy "read_invites" on public.invites for select to authenticated using (public.my_role() = 'admin');

-- clients are read-only on everything else (existing write policies already exclude role 'client')
do $$ begin
  begin alter publication supabase_realtime add table public.client_requests; exception when others then null; end;
end $$;
