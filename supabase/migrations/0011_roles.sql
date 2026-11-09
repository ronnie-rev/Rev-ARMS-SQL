-- 0011: role model — User (Production), User (Production + QA), SME (Production + QA), SME (QA), Team Lead (QA), Team Lead (QA & Production),
-- Manager, Sr. Management (+ viewer, client). Idempotent; run after 0010.
--
-- Design: policies written earlier use my_role() with the coarse classes 'admin' / 'supervisor' / 'specialist'. my_role() now maps the specific role onto
-- those classes so every existing policy keeps working, and my_role_exact() / is_qa_reviewer() expose the real role where it matters (QA).
--   Manager, Sr. Mgmt                      -> 'admin'      (everything, incl. configuration)
--   Team Leads, SMEs                       -> 'supervisor' (allocation, inventory/import, rules — not configuration)
--   Users (Production [+ QA])              -> 'specialist'
do $$ begin if exists (select 1 from public.profiles where role in ('admin','supervisor','specialist','auditor')) then alter table public.profiles drop constraint if exists profiles_role_check; end if; end $$;
update public.profiles set role = case role when 'admin' then 'sr_mgmt' when 'supervisor' then 'tl_prod_qa' when 'specialist' then 'user_prod' when 'auditor' then 'sme_qa' else role end
  where role in ('admin','supervisor','specialist','auditor');
-- (re-runnable: later migrations add roles; only (re)impose this constraint when no row uses a newer one)
do $$ begin
  if not exists (select 1 from public.profiles where role not in ('sr_mgmt','manager','tl_prod_qa','tl_qa','sme_prod_qa','sme_qa','user_prod_qa','user_prod','viewer','client')) then
    alter table public.profiles drop constraint if exists profiles_role_check;
    alter table public.profiles add constraint profiles_role_check check (role in ('sr_mgmt','manager','tl_prod_qa','tl_qa','sme_prod_qa','sme_qa','user_prod_qa','user_prod','viewer','client'));
  end if;
end $$;
alter table public.profiles alter column role set default 'user_prod';
update public.invites set role = case role when 'admin' then 'sr_mgmt' when 'supervisor' then 'tl_prod_qa' when 'specialist' then 'user_prod' when 'auditor' then 'sme_qa' else role end
  where role in ('admin','supervisor','specialist','auditor');

create or replace function public.my_role_exact() returns text language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() and active $$;

create or replace function public.my_role() returns text language sql stable security definer set search_path = public as
$$ select case role
     when 'sr_mgmt' then 'admin' when 'manager' then 'admin'
     when 'tl_prod_qa' then 'supervisor' when 'tl_qa' then 'supervisor' when 'sme_prod_qa' then 'supervisor' when 'sme_qa' then 'supervisor'
     when 'user_prod' then 'specialist' when 'user_prod_qa' then 'specialist'
     else role end
   from public.profiles where id = auth.uid() and active $$;

create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role <> 'client' from public.profiles where id = auth.uid() and active), false) $$;

-- QA capable: everyone who may review someone else's work
create or replace function public.is_qa_reviewer() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role in ('sr_mgmt','manager','tl_prod_qa','tl_qa','sme_prod_qa','sme_qa','user_prod_qa') from public.profiles where id = auth.uid() and active), false) $$;
create or replace function public.is_qa_manager() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role in ('sr_mgmt','manager','tl_prod_qa','tl_qa') from public.profiles where id = auth.uid() and active), false) $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.invites;
begin
  select * into inv from public.invites where lower(email) = lower(new.email);
  insert into public.profiles (id, email, full_name, role, client_id, client_ids, portal)
  values (new.id, new.email,
          coalesce(inv.full_name, new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          case when inv.email is not null then inv.role
               when (select count(*) from public.profiles) = 0 then 'sr_mgmt' else 'user_prod' end,
          inv.client_id, coalesce(inv.client_ids, '{}'), coalesce(inv.portal, '{}'::jsonb));
  if inv.email is not null then delete from public.invites where email = inv.email; end if;
  return new;
end $$;

-- QA policies: reviewers write, analysts (including Users who also do QA) only acknowledge / dispute their own reviews
drop policy if exists "write_qa_config" on public.qa_config;
create policy "write_qa_config" on public.qa_config for all to authenticated using (public.is_qa_manager()) with check (public.is_qa_manager());
drop policy if exists "read_qa_reviews" on public.qa_reviews;
create policy "read_qa_reviews" on public.qa_reviews for select to authenticated
  using (public.is_qa_reviewer() or public.my_role() in ('admin','supervisor','viewer') or analyst_id = auth.uid());
drop policy if exists "write_qa_reviews" on public.qa_reviews;
create policy "write_qa_reviews" on public.qa_reviews for all to authenticated
  using (public.is_qa_reviewer() and analyst_id is distinct from auth.uid()) with check (public.is_qa_reviewer() and analyst_id is distinct from auth.uid());

create or replace function public.qa_reviews_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_qa_reviewer() or old.analyst_id = auth.uid() then
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
