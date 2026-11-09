-- 0022: tenant / client restriction for STAFF. profiles.client_scope = 'assigned' limits a staff user to the practices in profiles.client_ids;
-- 'all' (default) keeps today's behaviour. Enforced in the database with RESTRICTIVE policies, so every existing permissive policy still has to pass AND this one does.
-- Idempotent; run after 0021. Service-role functions (fax, email intake) bypass RLS by design.
alter table public.profiles add column if not exists client_scope text not null default 'all';
alter table public.profiles drop constraint if exists profiles_client_scope_check;
alter table public.profiles add constraint profiles_client_scope_check check (client_scope in ('all','assigned'));

create or replace function public.can_see_client(cid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when cid is null then true
    else coalesce((select case
        when p.role = 'client' then cid = any(public.my_clients())
        when p.client_scope = 'assigned' then cid = any(coalesce(p.client_ids, '{}'::uuid[]))
        else true end
      from public.profiles p where p.id = auth.uid() and p.active), false)
  end $$;

-- a user must never widen their own scope
create or replace function public.profiles_scope_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and new.id = auth.uid() and (new.client_scope is distinct from old.client_scope or new.client_ids is distinct from old.client_ids) and coalesce(public.my_role_exact(), '') not in ('sr_mgmt') then
    raise exception 'You cannot change your own client access';
  end if;
  return new;
end $$;
drop trigger if exists profiles_scope_guard on public.profiles;
create trigger profiles_scope_guard before update on public.profiles for each row execute function public.profiles_scope_guard();

do $$
declare t text;
begin
  -- tables that carry client_id directly
  foreach t in array array['claims','clients','providers','import_batches','client_requests','recoveries','work_log','claim_snapshots','qa_reviews','payer_limits','fee_schedules','appeals','bulk_ops','fax_log','payer_alerts','import_log'] loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='client_id') then
      execute format('drop policy if exists "scope_%1$s" on public.%1$I', t);
      execute format('create policy "scope_%1$s" on public.%1$I as restrictive for all to authenticated using (public.can_see_client(client_id)) with check (public.can_see_client(client_id))', t);
    elsif t = 'clients' then
      execute 'drop policy if exists "scope_clients" on public.clients';
      execute 'create policy "scope_clients" on public.clients as restrictive for select to authenticated using (public.can_see_client(id))';
    end if;
  end loop;
  -- tables reached through a claim
  foreach t in array array['claim_notes','claim_activity'] loop
    execute format('drop policy if exists "scope_%1$s" on public.%1$I', t);
    execute format('create policy "scope_%1$s" on public.%1$I as restrictive for all to authenticated using (exists (select 1 from public.claims c where c.id = claim_id and public.can_see_client(c.client_id))) with check (exists (select 1 from public.claims c where c.id = claim_id and public.can_see_client(c.client_id)))', t);
  end loop;
end $$;
