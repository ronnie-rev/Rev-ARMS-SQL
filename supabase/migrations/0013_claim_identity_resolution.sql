-- 0013: permanent claim UIDs, encounter #, missing-from-file review fields, closed-claim protection. Idempotent; run after 0012.
alter table public.claims add column if not exists claim_uid text;
alter table public.claims add column if not exists encounter_no text;
alter table public.claims add column if not exists missing_since date;
alter table public.claims add column if not exists resolved_by uuid references public.profiles(id) on delete set null;
alter table public.claims add column if not exists resolved_at timestamptz;
alter table public.claims add column if not exists resolution_note text;

-- ── UID: RR-<CLIENT>-<YY>-<7-digit seq>-<check>, issued once per claim, sequential per client (mirrors src/lib/engine/uid.ts)
create or replace function public.claim_uid_check(body text) returns text language plpgsql immutable as $$
declare s int := 0; i int; alpha text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
begin
  for i in 1..length(body) loop s := (s * 7 + ascii(substr(body, i, 1)) * (i + 2)) % 32; end loop;
  return substr(alpha, s + 1, 1);
end $$;
create or replace function public.client_uid_tag(p_code text, p_name text) returns text language plpgsql immutable as $$
declare raw text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); t text; w text[];
begin
  if length(raw) >= 2 then return substr(raw, 1, 5); end if;
  w := regexp_split_to_array(trim(upper(regexp_replace(coalesce(p_name, 'CL'), '[^A-Za-z0-9 ]', '', 'g'))), '\s+');
  t := case when array_length(w, 1) > 1 then (select string_agg(substr(x, 1, 1), '') from unnest(w) x where x <> '') else coalesce(w[1], 'CL') end;
  t := substr(t, 1, 5); if length(t) < 2 then t := t || 'X'; end if; return t;
end $$;
create or replace function public.format_claim_uid(tag text, yr int, seq bigint) returns text language plpgsql immutable as $$
declare body text := tag || '-' || lpad((yr % 100)::text, 2, '0') || '-' || lpad(seq::text, 7, '0');
begin return 'RR-' || body || '-' || public.claim_uid_check(body); end $$;

create table if not exists public.client_uid_counters (client_id uuid primary key references public.clients(id) on delete cascade, last_seq bigint not null default 0);
alter table public.client_uid_counters enable row level security;     -- no policies: only alloc_claim_uids() (security definer) touches it

-- atomically reserve p_n sequence numbers; returns the last number used BEFORE the reservation (first new seq = result + 1)
create or replace function public.alloc_claim_uids(p_client uuid, p_n int) returns bigint language plpgsql security definer set search_path = public as $$
declare prev bigint;
begin
  if not public.is_staff() then raise exception 'not allowed'; end if;
  insert into public.client_uid_counters(client_id, last_seq) values (p_client, p_n)
    on conflict (client_id) do update set last_seq = public.client_uid_counters.last_seq + p_n returning last_seq - p_n into prev;
  return prev;
end $$;

-- backfill existing claims in creation order, then seed the counters
do $$
declare c record;
begin
  for c in select id as cid, public.client_uid_tag(code, name) as tag from public.clients loop
    update public.claims x set claim_uid = public.format_claim_uid(c.tag, extract(year from x.created_at)::int, n.rn + coalesce((select last_seq from public.client_uid_counters where client_id = c.cid), 0))
      from (select id, row_number() over (order by created_at, id) as rn from public.claims where client_id = c.cid and claim_uid is null) n
      where x.id = n.id;
    insert into public.client_uid_counters(client_id, last_seq)
      select c.cid, coalesce(max(substring(claim_uid from '-(\d{7,})-[0-9A-Z]$')::bigint), 0) from public.claims where client_id = c.cid
      on conflict (client_id) do update set last_seq = greatest(public.client_uid_counters.last_seq, excluded.last_seq);
  end loop;
end $$;

create unique index if not exists claims_uid_uidx on public.claims (claim_uid) where claim_uid is not null;
create index if not exists claims_encounter_idx on public.claims (client_id, encounter_no) where encounter_no is not null;
-- one live claim key per client (belt and braces next to unique(client_id, claim_no)); skipped with a notice when legacy duplicates exist
do $$ begin
  create unique index if not exists claims_client_key_uidx on public.claims (client_id, claim_key) where claim_key is not null;
exception when unique_violation then raise notice 'claims_client_key_uidx skipped: duplicate claim_key values exist — resolve them and re-run'; end $$;

-- review queue + closed-claim lookups
create index if not exists claims_review_idx on public.claims (client_id, missing_since) where closed_at is null and 'missing_review' = any(flags);
create index if not exists claims_resolved_idx on public.claims (client_id, resolved_at) where resolved_at is not null;
create index if not exists claims_resolved_by_idx on public.claims (resolved_by) where resolved_by is not null;

-- UID is immutable; nobody can sign a decision in somebody else's name; closed claims are history (only Sr. Management may delete them)
create or replace function public.claims_identity_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.closed_at is not null and coalesce(public.my_role_exact(), '') <> 'sr_mgmt' and auth.uid() is not null then raise exception 'Closed claims are history and can only be deleted by Sr. Management'; end if;
    return old;
  end if;
  if old.claim_uid is not null and new.claim_uid is distinct from old.claim_uid then raise exception 'claim_uid is permanent'; end if;
  if new.resolved_by is distinct from old.resolved_by and new.resolved_by is not null and auth.uid() is not null and new.resolved_by <> auth.uid() then raise exception 'resolved_by must be the signed-in user'; end if;
  -- two supervisors deciding the same claim at once: the second write is refused
  if old.closed_at is not null and old.resolved_by is not null and new.resolved_by is not null and new.resolved_by is distinct from old.resolved_by and new.closed_at is not null then raise exception 'Claim was already resolved by someone else'; end if;
  return new;
end $$;
drop trigger if exists claims_identity_guard_upd on public.claims;
create trigger claims_identity_guard_upd before update on public.claims for each row execute function public.claims_identity_guard();
drop trigger if exists claims_identity_guard_del on public.claims;
create trigger claims_identity_guard_del before delete on public.claims for each row execute function public.claims_identity_guard();
