-- ARMS schema. Run once in Supabase → SQL Editor (or `supabase db push`).
-- Everything configurable (buckets, RCA, end actions, statuses, payers, custom fields)
-- lives in config_options so the Admin panel changes the app live with no redeploy.

create extension if not exists "pgcrypto";

-- ───────────── People ─────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  emp_code text,
  role text not null default 'specialist' check (role in ('admin','supervisor','specialist','auditor','viewer')),
  supervisor_id uuid references public.profiles(id) on delete set null,
  daily_target int not null default 40,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.my_role() returns text language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() and active $$;

-- first user to sign up becomes admin; everyone after is a specialist until promoted
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          case when (select count(*) from public.profiles) = 0 then 'admin' else 'specialist' end);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ───────────── Clients / providers ─────────────
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text,
  pms text not null default 'Standard',
  color text not null default '#6366f1',
  supervisor_id uuid references public.profiles(id) on delete set null,
  aging_basis text not null default 'dos' check (aging_basis in ('dos','billed')),
  tf_days int,                       -- default timely-filing window
  rca_allowed text[],                -- null = all root-cause categories (client-specific RCA lists)
  active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  type text not null default 'Main Surgeon'
);

-- ───────────── Headless config ─────────────
create table if not exists public.config_options (
  id uuid primary key default gen_random_uuid(),
  category text not null,            -- rca | rca_detail | end_action | end_sub | mode | status | bucket | payer | field | priority
  value text not null,
  parent text,                       -- rca_detail→rca value, end_sub→end_action value
  label text,
  color text,
  sort int not null default 0,
  active boolean not null default true,
  meta jsonb not null default '{}'::jsonb,
  unique (category, parent, value)
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);

-- ───────────── Claims ─────────────
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  claim_no text not null,
  account_id text,
  patient_name text,
  dos date,
  last_billed date,
  payer text,
  provider text,
  provider_type text,
  cpt text,
  billed_amt numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  pms_status text,
  denial_codes text,
  status text not null default 'New',
  rca text, rca_detail text,
  end_action text, end_sub text, mode text,
  assigned_to uuid references public.profiles(id) on delete set null,
  priority text not null default 'Normal',
  next_fu date,
  touch_count int not null default 0,
  last_touched_at timestamptz,
  custom jsonb not null default '{}'::jsonb,
  first_batch uuid, last_batch uuid,
  closed_at timestamptz, closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, claim_no)
);
create index if not exists claims_client_idx on public.claims (client_id) where closed_at is null;
create index if not exists claims_assigned_idx on public.claims (assigned_to) where closed_at is null;
create index if not exists claims_nextfu_idx on public.claims (next_fu);

-- Production-tracker replacement: one row per touch.
create table if not exists public.work_log (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  user_name text, emp_code text, supervisor_name text,
  work_date date not null default current_date,
  comment text,
  rca text, rca_detail text, end_action text, end_sub text, mode text,
  balance numeric(12,2), age_days int, bucket text,
  next_fu date, multi_touch boolean not null default false,
  audit_status text not null default 'pending' check (audit_status in ('pending','pass','fail','na')),
  audit_remarks text, audit_by uuid references public.profiles(id) on delete set null, audited_at timestamptz,
  legacy boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists work_log_date_idx on public.work_log (work_date);
create index if not exists work_log_claim_idx on public.work_log (claim_id);
create index if not exists work_log_user_idx on public.work_log (user_id, work_date);

create table if not exists public.claim_notes (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.claim_activity (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  kind text not null,                -- import | assign | status | field | balance | note | touch | audit | close | reopen
  summary text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_claim_idx on public.claim_activity (claim_id, created_at desc);

-- ───────────── Import + allocation ─────────────
create table if not exists public.import_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  pms text not null default 'Custom',
  kind text not null default 'aging' check (kind in ('aging','worklog')),
  builtin boolean not null default false,
  mapping jsonb not null default '{}'::jsonb,   -- { target_field: [header aliases] }
  options jsonb not null default '{}'::jsonb,   -- { dateFormat, headerRow, ... }
  created_at timestamptz not null default now()
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  template_name text, file_name text, mode text,
  total_rows int, new_rows int, updated_rows int, dropped_rows int, skipped_rows int,
  total_balance numeric(14,2),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.allocation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid references public.clients(id) on delete cascade,
  criteria jsonb not null default '{}'::jsonb,  -- { payers:[], buckets:[], minBalance, statuses:[] }
  assignees uuid[] not null default '{}',
  strategy text not null default 'balanced' check (strategy in ('balanced','round_robin','by_balance')),
  active boolean not null default true,
  sort int not null default 0
);

-- ───────────── Row level security ─────────────
do $$ declare t text; begin
  foreach t in array array['profiles','clients','providers','config_options','app_settings','claims','work_log','claim_notes','claim_activity','import_templates','import_batches','allocation_rules']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "read_%1$s" on public.%1$I', t);
    execute format('create policy "read_%1$s" on public.%1$I for select to authenticated using (true)', t);
  end loop;
end $$;

-- admin-only config
do $$ declare t text; begin
  foreach t in array array['config_options','app_settings','import_templates']
  loop
    execute format('drop policy if exists "admin_write_%1$s" on public.%1$I', t);
    execute format('create policy "admin_write_%1$s" on public.%1$I for all to authenticated using (public.my_role() in (''admin'')) with check (public.my_role() in (''admin''))', t);
  end loop;
end $$;

drop policy if exists "mgr_write_clients" on public.clients;
create policy "mgr_write_clients" on public.clients for all to authenticated
  using (public.my_role() in ('admin','supervisor')) with check (public.my_role() in ('admin','supervisor'));
drop policy if exists "mgr_write_providers" on public.providers;
create policy "mgr_write_providers" on public.providers for all to authenticated
  using (public.my_role() in ('admin','supervisor')) with check (public.my_role() in ('admin','supervisor'));
drop policy if exists "mgr_write_alloc" on public.allocation_rules;
create policy "mgr_write_alloc" on public.allocation_rules for all to authenticated
  using (public.my_role() in ('admin','supervisor')) with check (public.my_role() in ('admin','supervisor'));
drop policy if exists "mgr_write_batches" on public.import_batches;
create policy "mgr_write_batches" on public.import_batches for all to authenticated
  using (public.my_role() in ('admin','supervisor')) with check (public.my_role() in ('admin','supervisor'));

drop policy if exists "admin_write_profiles" on public.profiles;
create policy "admin_write_profiles" on public.profiles for update to authenticated
  using (public.my_role() = 'admin' or id = auth.uid()) with check (public.my_role() = 'admin' or (id = auth.uid() and role = (select role from public.profiles where id = auth.uid())));
drop policy if exists "admin_insert_profiles" on public.profiles;
create policy "admin_insert_profiles" on public.profiles for insert to authenticated with check (public.my_role() = 'admin');

-- claims & collaboration: any non-viewer can work; importing/deleting is manager-only in the UI
do $$ declare t text; begin
  foreach t in array array['claims','work_log','claim_notes','claim_activity']
  loop
    execute format('drop policy if exists "work_write_%1$s" on public.%1$I', t);
    execute format('create policy "work_write_%1$s" on public.%1$I for all to authenticated using (public.my_role() in (''admin'',''supervisor'',''specialist'',''auditor'')) with check (public.my_role() in (''admin'',''supervisor'',''specialist'',''auditor''))', t);
  end loop;
end $$;

-- Realtime for live collaboration
do $$ begin
  begin alter publication supabase_realtime add table public.claims; exception when others then null; end;
  begin alter publication supabase_realtime add table public.work_log; exception when others then null; end;
  begin alter publication supabase_realtime add table public.claim_notes; exception when others then null; end;
  begin alter publication supabase_realtime add table public.config_options; exception when others then null; end;
end $$;
