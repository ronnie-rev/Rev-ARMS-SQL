-- 0004: notifications, skills, client approvals, extra RLS. Idempotent; run after 0003.
alter table public.profiles add column if not exists skills text[] not null default '{}';

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,   -- null = everyone staff
  role text,                                                        -- optional role targeting
  title text not null, body text, link text, severity text not null default 'info',
  read_by uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists "read_notifications" on public.notifications;
create policy "read_notifications" on public.notifications for select to authenticated using (
  public.is_staff() and (user_id is null or user_id = auth.uid()) and (role is null or role = public.my_role()));
drop policy if exists "write_notifications" on public.notifications;
create policy "write_notifications" on public.notifications for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- client approvals (e.g. write-off / adjustment approval by the practice)
alter table public.client_requests drop constraint if exists client_requests_kind_check;
alter table public.client_requests add constraint client_requests_kind_check check (kind in ('question','documents','escalation','info','approval'));
alter table public.client_requests add column if not exists amount numeric(12,2);
alter table public.client_requests add column if not exists decision text;   -- approved | denied
drop policy if exists "client_update_requests" on public.client_requests;
create policy "client_update_requests" on public.client_requests for update to authenticated
  using (client_id = public.my_client() and kind = 'approval' and status = 'open') with check (client_id = public.my_client());
-- staff-created approval requests (clients can only insert non-approval kinds)
drop policy if exists "client_insert_requests" on public.client_requests;
create policy "client_insert_requests" on public.client_requests for insert to authenticated
  with check (client_id = public.my_client() and status = 'open' and kind <> 'approval');

alter table public.allocation_rules drop constraint if exists allocation_rules_strategy_check;
alter table public.allocation_rules add constraint allocation_rules_strategy_check check (strategy in ('balanced','round_robin','by_balance','skills'));
