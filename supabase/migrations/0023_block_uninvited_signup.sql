-- 0023: SECURITY — only invited people (or the very first account) may create an account.
-- Before this, any email that signed up through the public auth endpoint received a profile with the "user_prod" role, which can read every claim.
-- The auth endpoint and anon key are public by design, so sign-up must be blocked in the database, not only in the UI. Idempotent; run after 0022.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.invites; n int;
begin
  select * into inv from public.invites where lower(email) = lower(new.email);
  select count(*) into n from public.profiles;
  if inv.email is null and n > 0 then
    raise exception 'This email has not been invited. Ask an administrator to invite you.' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, email, full_name, role, client_id, client_ids, portal)
  values (new.id, new.email,
          coalesce(inv.full_name, new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          case when inv.email is not null then inv.role else 'sr_mgmt' end,   -- no invite is only possible for the very first account
          inv.client_id, coalesce(inv.client_ids, '{}'), coalesce(inv.portal, '{}'::jsonb));
  if inv.email is not null then delete from public.invites where email = inv.email; end if;
  return new;
end $$;
