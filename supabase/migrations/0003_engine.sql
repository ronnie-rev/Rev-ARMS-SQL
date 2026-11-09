-- 0003: identity & reconciliation engine, automation rules, audit/import logs, recoveries, report schedules. Idempotent; run after 0002.

-- ───────── claim identity ─────────
alter table public.claims add column if not exists claim_key text;             -- normalised PMS identifier (+ line discriminator)
alter table public.claims add column if not exists aliases text[] not null default '{}';  -- previous / merged identifiers that still map here
alter table public.claims add column if not exists fingerprint text;           -- hash(patient|dos|cpt|billed) for re-key detection
alter table public.claims add column if not exists flags text[] not null default '{}';    -- data-quality / rule flags
alter table public.claims add column if not exists missing_count int not null default 0;  -- consecutive snapshots the claim was absent
alter table public.claims add column if not exists resolution text;            -- paid | adjusted | patient | merged | rolled_back | unknown
alter table public.claims add column if not exists as_of date;                 -- as-of date of the last file that touched it
create index if not exists claims_key_idx on public.claims (client_id, claim_key);
create index if not exists claims_fp_idx on public.claims (client_id, fingerprint);

alter table public.import_batches add column if not exists status text not null default 'committed';
alter table public.import_batches add column if not exists as_of date;
alter table public.import_batches add column if not exists file_hash text;
alter table public.import_batches add column if not exists rolled_back_at timestamptz;
alter table public.import_batches add column if not exists rules jsonb not null default '{}'::jsonb;   -- settings snapshot used
alter table public.import_batches add column if not exists guardrails jsonb not null default '[]'::jsonb;

-- ───────── row-level import log (supports undo) ─────────
create table if not exists public.import_log (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  row_no int, claim_id uuid, claim_key text,
  action text not null,        -- CREATED UPDATED REOPENED REKEYED CLOSED MISSING SKIPPED AGGREGATED DEDUPED FLAGGED
  code text, severity text not null default 'info',
  message text, before jsonb, after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists import_log_batch_idx on public.import_log (batch_id, action);

-- ───────── system audit log (who did what; PHI access) ─────────
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid, actor_name text, actor_role text,
  kind text not null, entity text, entity_id text,
  summary text not null, meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_time_idx on public.audit_log (created_at desc);

-- ───────── automation rules + run log ─────────
create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text,
  enabled boolean not null default true,
  trigger text not null default 'import' check (trigger in ('import','touch','daily','manual')),
  client_id uuid references public.clients(id) on delete cascade,
  match text not null default 'all' check (match in ('all','any')),
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  stop boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.rule_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid, rule_name text, trigger text, dry_run boolean not null default false,
  matched int not null default 0, changed int not null default 0,
  actor_name text, batch_id uuid, sample jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ───────── recoveries ledger (attribution of balance reductions) ─────────
create table if not exists public.recoveries (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid references public.claims(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  batch_id uuid references public.import_batches(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  user_name text,
  amount numeric(12,2) not null,
  type text not null default 'unknown' check (type in ('payment','adjustment','patient','unknown')),
  basis text not null default 'last_touch',         -- last_touch | split | unattributed
  share numeric(5,4) not null default 1,
  touch_id uuid, window_days int,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists recoveries_client_idx on public.recoveries (client_id, occurred_on);

-- ───────── scheduled reports ─────────
create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid references public.clients(id) on delete cascade,   -- null = internal all-clients digest
  audience text not null default 'client' check (audience in ('client','internal')),
  cadence text not null default 'weekly' check (cadence in ('weekly','monthly')),
  day int not null default 1,            -- weekly: 0=Sun..6=Sat ; monthly: day of month
  hour_utc int not null default 13,
  recipients text[] not null default '{}',
  active boolean not null default true,
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ───────── RLS ─────────
do $$ declare t text; begin
  foreach t in array array['import_log','audit_log','automation_rules','rule_runs','recoveries','report_schedules']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

drop policy if exists "read_import_log" on public.import_log;
create policy "read_import_log" on public.import_log for select to authenticated using (public.is_staff());
drop policy if exists "write_import_log" on public.import_log;
create policy "write_import_log" on public.import_log for all to authenticated using (public.my_role() in ('admin','supervisor')) with check (public.my_role() in ('admin','supervisor'));

drop policy if exists "read_audit_log" on public.audit_log;
create policy "read_audit_log" on public.audit_log for select to authenticated using (public.my_role() in ('admin','supervisor'));
drop policy if exists "insert_audit_log" on public.audit_log;
create policy "insert_audit_log" on public.audit_log for insert to authenticated with check (actor_id = auth.uid());

drop policy if exists "read_rules" on public.automation_rules;
create policy "read_rules" on public.automation_rules for select to authenticated using (public.is_staff());
drop policy if exists "write_rules" on public.automation_rules;
create policy "write_rules" on public.automation_rules for all to authenticated using (public.my_role() in ('admin','supervisor')) with check (public.my_role() in ('admin','supervisor'));
drop policy if exists "read_rule_runs" on public.rule_runs;
create policy "read_rule_runs" on public.rule_runs for select to authenticated using (public.is_staff());
drop policy if exists "write_rule_runs" on public.rule_runs;
create policy "write_rule_runs" on public.rule_runs for insert to authenticated with check (public.my_role() in ('admin','supervisor','specialist'));

drop policy if exists "read_recoveries" on public.recoveries;
create policy "read_recoveries" on public.recoveries for select to authenticated using (public.is_staff() or client_id = public.my_client());
drop policy if exists "write_recoveries" on public.recoveries;
create policy "write_recoveries" on public.recoveries for all to authenticated using (public.my_role() in ('admin','supervisor')) with check (public.my_role() in ('admin','supervisor'));

drop policy if exists "read_schedules" on public.report_schedules;
create policy "read_schedules" on public.report_schedules for select to authenticated using (public.my_role() in ('admin','supervisor'));
drop policy if exists "write_schedules" on public.report_schedules;
create policy "write_schedules" on public.report_schedules for all to authenticated using (public.my_role() in ('admin','supervisor')) with check (public.my_role() in ('admin','supervisor'));

-- claims/work writers (specialists) may also flag; keep existing policies. Allow specialists to work claims they import? No: imports stay manager-only (enforced in UI + import_log/batches policies).
