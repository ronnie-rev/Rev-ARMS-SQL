-- Server-side summaries: one cheap call replaces loading every claim just to draw totals. SECURITY INVOKER, so row-level security still decides which claims a user may see.
-- p_buckets: [{"label":"0-30","min":0,"max":30},…] (max null = open-ended). Age follows each client's aging basis (dos | billed). Idempotent; run after 0015.
create or replace function public.claim_summary(p_clients uuid[] default null, p_today date default current_date, p_buckets jsonb default '[]'::jsonb)
returns jsonb language sql stable security invoker set search_path = public as $$
  with b as (
    select (x->>'label') as label, (x->>'min')::int as bmin, nullif(x->>'max','')::int as bmax, ord
    from jsonb_array_elements(coalesce(p_buckets,'[]'::jsonb)) with ordinality as t(x, ord)
  ),
  c as (
    select cl.id as client_id, cl.name as client_name, c.payer, c.status, c.balance, c.assigned_to, c.next_fu, c.flags, c.closed_at,
           case when cl.aging_basis = 'billed' then coalesce(c.last_billed, c.dos) else coalesce(c.dos, c.last_billed) end as base
    from public.claims c join public.clients cl on cl.id = c.client_id
    where p_clients is null or c.client_id = any(p_clients)
  ),
  o as (select *, case when base is null then null else greatest(0, p_today - base) end as age from c where closed_at is null),
  ob as (
    select o.*, (select b.label from b where o.age is not null and o.age >= b.bmin and (b.bmax is null or o.age <= b.bmax) order by b.ord limit 1) as bucket
    from o
  )
  select jsonb_build_object(
    'as_of', p_today,
    'open_claims', (select count(*) from o),
    'open_balance', coalesce((select round(sum(balance)::numeric, 2) from o), 0),
    'unassigned', (select count(*) from o where assigned_to is null),
    'followups_due', (select count(*) from o where next_fu is not null and next_fu <= p_today),
    'missing_review', (select count(*) from o where 'missing_review' = any(flags)),
    'by_client', coalesce((select jsonb_agg(jsonb_build_object('client_id', client_id, 'name', client_name, 'n', n, 'balance', bal) order by bal desc) from (select client_id, client_name, count(*) n, round(sum(balance)::numeric, 2) bal from o group by 1, 2) q), '[]'::jsonb),
    'by_bucket', coalesce((select jsonb_agg(jsonb_build_object('label', coalesce(bucket, 'Unknown'), 'n', n, 'balance', bal) order by mn) from (select bucket, count(*) n, round(sum(balance)::numeric, 2) bal, min(coalesce((select ord from b where b.label = ob.bucket), 9999)) mn from ob group by 1) q), '[]'::jsonb),
    'by_status', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'n', n, 'balance', bal) order by bal desc) from (select status, count(*) n, round(sum(balance)::numeric, 2) bal from o group by 1) q), '[]'::jsonb),
    'by_payer', coalesce((select jsonb_agg(jsonb_build_object('payer', payer, 'n', n, 'balance', bal) order by bal desc) from (select coalesce(payer, 'Unknown') payer, count(*) n, round(sum(balance)::numeric, 2) bal from o group by 1 order by bal desc limit 50) q), '[]'::jsonb)
  )
$$;
grant execute on function public.claim_summary(uuid[], date, jsonb) to authenticated;

-- fast per-client open counts for the "large workspace" decision at sign-in
create index if not exists claims_client_open_idx on public.claims (client_id) where closed_at is null;
