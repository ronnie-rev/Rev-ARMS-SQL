-- 0012: risk tiers between Sr. Management, Admin and Manager, plus the External QA placeholder role. Idempotent; run after 0011.
--   sr_mgmt   everything
--   sys_admin system setup: configuration, users (not sr_mgmt/sys_admin accounts), clients, imports, rules. No permission matrix, no claim work/QA.
--   manager   operations (supervisor class) + clients/providers + knowledge content; NOT taxonomy/config, users, security or the permission matrix
--   qa_ext    placeholder for an outsourced QA department: reviews only
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('sr_mgmt','sys_admin','manager','tl_prod_qa','tl_qa','sme_prod_qa','sme_qa','user_prod_qa','user_prod','qa_ext','viewer','client'));

create or replace function public.my_role() returns text language sql stable security definer set search_path = public as
$$ select case role
     when 'sr_mgmt' then 'admin' when 'sys_admin' then 'admin'
     when 'manager' then 'supervisor' when 'tl_prod_qa' then 'supervisor' when 'tl_qa' then 'supervisor' when 'sme_prod_qa' then 'supervisor' when 'sme_qa' then 'supervisor'
     when 'user_prod' then 'specialist' when 'user_prod_qa' then 'specialist'
     when 'qa_ext' then 'auditor'
     else role end
   from public.profiles where id = auth.uid() and active $$;

create or replace function public.is_qa_reviewer() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role in ('sr_mgmt','manager','tl_prod_qa','tl_qa','sme_prod_qa','sme_qa','user_prod_qa','qa_ext') from public.profiles where id = auth.uid() and active), false) $$;
create or replace function public.is_setup_role() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role in ('sr_mgmt','sys_admin','manager') from public.profiles where id = auth.uid() and active), false) $$;

-- clients / providers: setup roles only (was: any supervisor-class user)
drop policy if exists "mgr_write_clients" on public.clients;
create policy "mgr_write_clients" on public.clients for all to authenticated using (public.is_setup_role()) with check (public.is_setup_role());
drop policy if exists "mgr_write_providers" on public.providers;
create policy "mgr_write_providers" on public.providers for all to authenticated using (public.is_setup_role()) with check (public.is_setup_role());

-- Managers may edit knowledge content rows only; taxonomy, buckets, statuses, stages, fields stay with Sr. Management / Admin
drop policy if exists "manager_write_content" on public.config_options;
create policy "manager_write_content" on public.config_options for all to authenticated
  using (public.my_role_exact() = 'manager' and category in ('playbook','snippet','letter','kb_article','carc','resource','payer','outcome'))
  with check (public.my_role_exact() = 'manager' and category in ('playbook','snippet','letter','kb_article','carc','resource','payer','outcome'));

-- Privilege-escalation guards
create or replace function public.profiles_role_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare me text := public.my_role_exact();
begin
  if me = 'sys_admin' and (tg_op = 'UPDATE' or tg_op = 'INSERT') then
    if (tg_op = 'UPDATE' and old.role in ('sr_mgmt','sys_admin') and old.id <> auth.uid()) or new.role in ('sr_mgmt','sys_admin') and (tg_op = 'INSERT' or old.role is distinct from new.role) then
      raise exception 'Admin cannot create, edit or promote Sr. Management / Admin accounts';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard before insert or update on public.profiles for each row execute function public.profiles_role_guard();

-- Only Sr. Management may change the permission matrix (highest-risk setting)
create or replace function public.app_settings_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.key = 'permissions' and coalesce(public.my_role_exact(), '') <> 'sr_mgmt' and auth.uid() is not null then raise exception 'Only Sr. Management can change the permission matrix'; end if;
  return new;
end $$;
drop trigger if exists app_settings_guard on public.app_settings;
create trigger app_settings_guard before insert or update on public.app_settings for each row execute function public.app_settings_guard();
