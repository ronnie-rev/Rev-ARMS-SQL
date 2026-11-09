-- 0014: central rules — filing limits (TFL / AFL / CCFL), expected reimbursement + fee schedules, appeals + payer forms, bulk-operation undo log,
-- payer behaviour alerts. Idempotent; run after 0013.
alter table public.claims add column if not exists expected_amt numeric(12,2);
alter table public.claims add column if not exists expected_src text;          -- fee_schedule | payer_pct | gcr | manual
alter table public.claims add column if not exists paid_amt numeric(12,2);     -- payer payment on the claim (file column or 835)
alter table public.claims add column if not exists allowed_amt numeric(12,2);
alter table public.claims add column if not exists patient_resp numeric(12,2);
alter table public.claims add column if not exists denial_date date;           -- starts the appeal / corrected-claim clock
create index if not exists claims_denial_idx on public.claims (client_id, denial_date) where closed_at is null and denial_date is not null;
create index if not exists claims_paid_idx on public.claims (client_id) where paid_amt is not null and closed_at is null;

-- ── central filing limits: TFL timely filing · AFL appeal filing · CCFL corrected-claim filing. A row applies to a payer (optionally one client / plan type).
create table if not exists public.payer_limits (
  id uuid primary key default gen_random_uuid(),
  payer text not null, client_id uuid references public.clients(id) on delete cascade, plan_type text,
  tfl_days int, afl_days int, ccfl_days int,
  tfl_basis text not null default 'dos' check (tfl_basis in ('dos','last_billed')),
  afl_basis text not null default 'denial' check (afl_basis in ('denial','last_billed','dos')),
  ccfl_basis text not null default 'denial' check (ccfl_basis in ('denial','last_billed','dos')),
  source text, notes text, verified_on date, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists payer_limits_uidx on public.payer_limits (lower(payer), coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(lower(plan_type), ''));

-- ── fee schedules (contract allowables / custom / Medicare-based); rates are loaded on demand
create table if not exists public.fee_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null, client_id uuid references public.clients(id) on delete cascade, payer text,   -- null client = all clients, null payer = all payers
  kind text not null default 'contract' check (kind in ('contract','custom','medicare_pct')),
  pct numeric(7,3),                                   -- medicare_pct: % of the base rates; contract/custom: optional uplift
  effective_from date, effective_to date, active boolean not null default true, notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.fee_rates (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.fee_schedules(id) on delete cascade,
  cpt text not null, modifier text not null default '', amount numeric(12,2) not null, unique (schedule_id, cpt, modifier)
);
create index if not exists fee_rates_cpt_idx on public.fee_rates (schedule_id, cpt);

-- ── appeals (any level / type) and payer forms
create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade, client_id uuid not null references public.clients(id) on delete cascade,
  level int not null default 1, kind text not null default 'appeal' check (kind in ('appeal','reconsideration','corrected_claim','underpayment_dispute','external_review')),
  status text not null default 'draft' check (status in ('draft','ready','sent','pending','won','partial','lost','withdrawn')),
  payer text, template text, form_id uuid, due_on date, filed_on date, decided_on date, method text, tracking_no text,
  amount_disputed numeric(12,2), amount_recovered numeric(12,2), reason text, outcome_note text,
  letter jsonb not null default '{}'::jsonb, form_values jsonb not null default '{}'::jsonb, attachments jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists appeals_claim_idx on public.appeals (claim_id, level);
create index if not exists appeals_client_status_idx on public.appeals (client_id, status);
create index if not exists appeals_due_idx on public.appeals (due_on) where status in ('draft','ready','sent','pending');
create table if not exists public.payer_forms (
  id uuid primary key default gen_random_uuid(),
  name text not null, payer text, client_id uuid references public.clients(id) on delete cascade, kind text not null default 'appeal',
  mode text not null default 'acroform' check (mode in ('acroform','overlay')), field_map jsonb not null default '{}'::jsonb, pages int, bytes int, active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.payer_form_files (form_id uuid primary key references public.payer_forms(id) on delete cascade, data_b64 text not null);

-- ── bulk operations with undo
create table if not exists public.bulk_ops (
  id uuid primary key default gen_random_uuid(), label text not null, action jsonb not null default '{}'::jsonb, filter_desc text,
  actor_id uuid references public.profiles(id) on delete set null, actor_name text, claim_count int not null default 0, changed_count int not null default 0,
  status text not null default 'applied' check (status in ('applied','undone','partly_undone')), undo_until timestamptz,
  undone_at timestamptz, undone_by uuid references public.profiles(id) on delete set null, undone_count int, created_at timestamptz not null default now()
);
create table if not exists public.bulk_op_rows (
  id uuid primary key default gen_random_uuid(), op_id uuid not null references public.bulk_ops(id) on delete cascade, claim_id uuid not null,
  before jsonb not null default '{}'::jsonb, after jsonb not null default '{}'::jsonb
);
create index if not exists bulk_op_rows_op_idx on public.bulk_op_rows (op_id);

-- ── payer behaviour alerts
create table if not exists public.payer_alerts (
  id uuid primary key default gen_random_uuid(), payer text not null, client_id uuid references public.clients(id) on delete cascade, cpt text,
  kind text not null, metric text, prev_value numeric, curr_value numeric, n int, detail jsonb not null default '{}'::jsonb, dedupe_key text not null,
  status text not null default 'new' check (status in ('new','ack','dismissed')), detected_on date not null default current_date, created_at timestamptz not null default now()
);
create unique index if not exists payer_alerts_key_uidx on public.payer_alerts (dedupe_key);

-- ── RLS: staff read; setup roles write configuration; leads/producers write work records
do $$ declare t text; begin
  foreach t in array array['payer_limits','fee_schedules','fee_rates','appeals','payer_forms','payer_form_files','bulk_ops','bulk_op_rows','payer_alerts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff_read_%1$s" on public.%1$I', t);
    execute format('create policy "staff_read_%1$s" on public.%1$I for select to authenticated using (public.is_staff())', t);
  end loop;
  foreach t in array array['payer_limits','fee_schedules','fee_rates','payer_forms','payer_form_files'] loop
    execute format('drop policy if exists "setup_write_%1$s" on public.%1$I', t);
    execute format('create policy "setup_write_%1$s" on public.%1$I for all to authenticated using (public.is_setup_role()) with check (public.is_setup_role())', t);
  end loop;
  foreach t in array array['bulk_ops','bulk_op_rows','payer_alerts'] loop
    execute format('drop policy if exists "lead_write_%1$s" on public.%1$I', t);
    execute format('create policy "lead_write_%1$s" on public.%1$I for all to authenticated using (public.my_role() in (''admin'',''supervisor'')) with check (public.my_role() in (''admin'',''supervisor''))', t);
  end loop;
end $$;
drop policy if exists "work_write_appeals" on public.appeals;
create policy "work_write_appeals" on public.appeals for all to authenticated using (public.my_role() in ('admin','supervisor','specialist')) with check (public.my_role() in ('admin','supervisor','specialist'));
do $$ begin alter publication supabase_realtime add table public.appeals; exception when others then null; end $$;
