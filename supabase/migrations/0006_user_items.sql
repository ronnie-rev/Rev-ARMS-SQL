-- 0006: per-user & shared staff data (saved report/pivot views, outreach log, CAPA log, academy progress) + multi-client assignment.
-- app_settings is admin-write only, so anything staff create must NOT live there. Idempotent; run after 0005.
alter table public.profiles add column if not exists client_ids uuid[] not null default '{}';

create table if not exists public.user_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                         -- report_preset | pivot_view | outreach | capa | academy
  owner_id uuid references public.profiles(id) on delete cascade default auth.uid(),
  client_id uuid references public.clients(id) on delete set null,
  name text,
  shared boolean not null default false,       -- visible to all staff
  body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_items_kind_idx on public.user_items (kind, owner_id);
alter table public.user_items enable row level security;
drop policy if exists "user_items_read" on public.user_items;
drop policy if exists "user_items_write" on public.user_items;
create policy "user_items_read" on public.user_items for select to authenticated
  using (public.is_staff() and (owner_id = auth.uid() or shared or public.my_role() = 'admin'));
create policy "user_items_write" on public.user_items for all to authenticated
  using (public.is_staff() and (owner_id = auth.uid() or public.my_role() = 'admin'))
  with check (public.is_staff() and (owner_id = auth.uid() or public.my_role() = 'admin'));
do $$ begin alter publication supabase_realtime add table public.user_items; exception when others then null; end $$;
