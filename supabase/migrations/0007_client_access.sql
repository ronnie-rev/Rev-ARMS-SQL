-- 0007: client users scoped to one OR MANY practices, with per-user view-only permissions. Idempotent; run after 0006.
alter table public.profiles add column if not exists portal jsonb not null default '{}'::jsonb;   -- {show_patient,can_message,can_download,can_approve}
alter table public.invites  add column if not exists client_ids uuid[] not null default '{}';
alter table public.invites  add column if not exists portal jsonb not null default '{}'::jsonb;

create or replace function public.my_clients() returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x), '{}'::uuid[]) from (
    select client_id as x from public.profiles where id = auth.uid() and active and role = 'client' and client_id is not null
    union
    select unnest(client_ids) from public.profiles where id = auth.uid() and active and role = 'client'
  ) t where x is not null $$;
create or replace function public.my_client() returns uuid language sql stable security definer set search_path = public as $$
  select (public.my_clients())[1] $$;
create or replace function public.my_portal_can(perm text, dflt boolean default false) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (portal ->> perm)::boolean from public.profiles where id = auth.uid() and active and role = 'client'), dflt) $$;

drop policy if exists "read_clients" on public.clients;
create policy "read_clients" on public.clients for select to authenticated using (public.is_staff() or id = any(public.my_clients()));
drop policy if exists "read_providers" on public.providers;
create policy "read_providers" on public.providers for select to authenticated using (public.is_staff() or client_id = any(public.my_clients()));
drop policy if exists "read_claims" on public.claims;
create policy "read_claims" on public.claims for select to authenticated using (public.is_staff() or client_id = any(public.my_clients()));
drop policy if exists "read_claim_notes" on public.claim_notes;
create policy "read_claim_notes" on public.claim_notes for select to authenticated using (
  public.is_staff() or (client_visible and exists (select 1 from public.claims c where c.id = claim_id and c.client_id = any(public.my_clients()))));
drop policy if exists "read_import_batches" on public.import_batches;
create policy "read_import_batches" on public.import_batches for select to authenticated using (public.is_staff() or client_id = any(public.my_clients()));
drop policy if exists "read_client_requests" on public.client_requests;
create policy "read_client_requests" on public.client_requests for select to authenticated using (public.is_staff() or client_id = any(public.my_clients()));
drop policy if exists "read_recoveries" on public.recoveries;
create policy "read_recoveries" on public.recoveries for select to authenticated using (public.is_staff() or client_id = any(public.my_clients()));

-- clients may message only if their account allows it; approvals only if allowed
drop policy if exists "client_insert_requests" on public.client_requests;
create policy "client_insert_requests" on public.client_requests for insert to authenticated
  with check (client_id = any(public.my_clients()) and status = 'open' and kind <> 'approval' and public.my_portal_can('can_message', true));
drop policy if exists "client_update_requests" on public.client_requests;
create policy "client_update_requests" on public.client_requests for update to authenticated
  using (client_id = any(public.my_clients()) and kind = 'approval' and status = 'open' and public.my_portal_can('can_approve', true))
  with check (client_id = any(public.my_clients()));

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  select * into inv from public.invites where lower(email) = lower(new.email);
  insert into public.profiles (id, email, full_name, role, client_id, client_ids, portal)
  values (new.id, new.email,
          coalesce(inv.full_name, new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          case when inv.email is not null then inv.role
               when (select count(*) from public.profiles) = 0 then 'admin' else 'specialist' end,
          inv.client_id, coalesce(inv.client_ids, '{}'), coalesce(inv.portal, '{}'::jsonb));
  if inv.email is not null then delete from public.invites where email = inv.email; end if;
  return new;
end $$;
