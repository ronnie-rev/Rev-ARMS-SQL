-- 0009: QA module — scorecard reviews, sampling configuration, coaching & disputes. Idempotent; run after 0008.
alter table public.profiles add column if not exists hire_date date;                       -- drives new-hire sampling rate
alter table public.profiles add column if not exists qa_lead boolean not null default false; -- QA leads resolve disputes & run calibration

create table if not exists public.qa_config (
  id text primary key default 'main',
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.qa_reviews (
  id uuid primary key default gen_random_uuid(),
  work_log_id uuid not null references public.work_log(id) on delete cascade,
  claim_id uuid references public.claims(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  analyst_id uuid references public.profiles(id) on delete set null,
  reviewer_id uuid references public.profiles(id) on delete set null,
  form_id text,
  form_version int not null default 1,
  status text not null default 'queued' check (status in ('queued','in_review','completed','acknowledged','disputed','resolved')),
  sample_source text not null default 'random',      -- random | risk | new_hire | critical | targeted | manual | calibration
  risk int,
  answers jsonb not null default '{}'::jsonb,         -- {criterionId: pass|fail|na}
  errors jsonb not null default '[]'::jsonb,          -- [{criterion, category, severity, note}]
  score numeric(5,2),
  result text check (result in ('pass','fail','critical')),
  comments text,
  coaching text,
  is_calibration boolean not null default false,
  calibration_group uuid,
  analyst_ack_at timestamptz,
  dispute_note text,
  dispute_outcome text check (dispute_outcome in ('upheld','overturned')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  review_seconds int,
  queued_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists qa_reviews_analyst_idx on public.qa_reviews (analyst_id, status);
create index if not exists qa_reviews_reviewer_idx on public.qa_reviews (reviewer_id, status);
create index if not exists qa_reviews_touch_idx on public.qa_reviews (work_log_id);
create index if not exists qa_reviews_client_idx on public.qa_reviews (client_id, reviewed_at);

alter table public.qa_config enable row level security;
alter table public.qa_reviews enable row level security;
drop policy if exists "read_qa_config" on public.qa_config;
create policy "read_qa_config" on public.qa_config for select to authenticated using (public.is_staff());
drop policy if exists "write_qa_config" on public.qa_config;
create policy "write_qa_config" on public.qa_config for all to authenticated using (public.my_role() in ('admin','auditor')) with check (public.my_role() in ('admin','auditor'));

drop policy if exists "read_qa_reviews" on public.qa_reviews;
create policy "read_qa_reviews" on public.qa_reviews for select to authenticated
  using (public.my_role() in ('admin','supervisor','auditor','viewer') or analyst_id = auth.uid());
drop policy if exists "write_qa_reviews" on public.qa_reviews;
create policy "write_qa_reviews" on public.qa_reviews for all to authenticated
  using (public.my_role() in ('admin','supervisor','auditor')) with check (public.my_role() in ('admin','supervisor','auditor'));
drop policy if exists "analyst_respond_qa" on public.qa_reviews;
create policy "analyst_respond_qa" on public.qa_reviews for update to authenticated
  using (analyst_id = auth.uid()) with check (analyst_id = auth.uid());

-- An analyst may only acknowledge or dispute their own review; scores, errors and comments are immutable to them.
create or replace function public.qa_reviews_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() = 'specialist' then
    if new.analyst_id is distinct from old.analyst_id or new.reviewer_id is distinct from old.reviewer_id or new.score is distinct from old.score or new.result is distinct from old.result
       or new.answers is distinct from old.answers or new.errors is distinct from old.errors or new.comments is distinct from old.comments or new.coaching is distinct from old.coaching
       or new.work_log_id is distinct from old.work_log_id or new.dispute_outcome is distinct from old.dispute_outcome or new.resolved_by is distinct from old.resolved_by then
      raise exception 'Analysts may only acknowledge or dispute a QA review';
    end if;
    if new.status not in ('acknowledged','disputed') or old.status not in ('completed','acknowledged','disputed') then raise exception 'Invalid QA status change'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists qa_reviews_guard on public.qa_reviews;
create trigger qa_reviews_guard before update on public.qa_reviews for each row execute function public.qa_reviews_guard();
do $$ begin alter publication supabase_realtime add table public.qa_reviews; exception when others then null; end $$;
