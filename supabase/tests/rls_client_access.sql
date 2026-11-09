\set ON_ERROR_STOP on
truncate public.claims, public.clients, public.profiles, public.client_requests, auth.users cascade;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','admin@x.com'),('00000000-0000-0000-0000-0000000000c1','cl1@x.com'),('00000000-0000-0000-0000-0000000000c2','cl2@x.com'),('00000000-0000-0000-0000-0000000000c3','cl3@x.com');
-- trigger made profiles (first = admin). now set roles
update public.profiles set role='sr_mgmt' where email='admin@x.com';
insert into public.clients(id,name) values ('10000000-0000-0000-0000-000000000001','P1'),('10000000-0000-0000-0000-000000000002','P2'),('10000000-0000-0000-0000-000000000003','P3');
insert into public.claims(client_id,claim_no,balance) select c, 'K'||n, 10 from (values ('10000000-0000-0000-0000-000000000001'::uuid),('10000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000003')) v(c), generate_series(1,3) n;
update public.profiles set role='client', client_id='10000000-0000-0000-0000-000000000001', client_ids='{10000000-0000-0000-0000-000000000002}', portal='{"can_message":true}' where email='cl1@x.com';   -- P1 + P2
update public.profiles set role='client', client_id='10000000-0000-0000-0000-000000000003', portal='{"can_message":false,"can_approve":false}' where email='cl2@x.com';                              -- P3, no messaging
update public.profiles set role='client', client_ids='{}', client_id=null where email='cl3@x.com';                                                                                                         -- nothing assigned
grant usage on schema public to authenticated; grant select, insert, update on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;
\echo --- cl1 (P1+P2): claims should be 6, clients 2
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000c1';
select count(*) as claims from public.claims; select count(*) as clients from public.clients; select my_clients();
insert into public.client_requests(client_id,kind,body,status) values ('10000000-0000-0000-0000-000000000002','question','hi','open');
\echo cl1 insert to P2 OK
do $$ begin begin insert into public.client_requests(client_id,kind,body,status) values ('10000000-0000-0000-0000-000000000003','question','x','open'); raise exception 'LEAK: inserted for P3'; exception when insufficient_privilege or others then if sqlerrm like 'LEAK%' then raise; end if; end; end $$;
\echo cl1 blocked from P3 OK
reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000c2';
\echo --- cl2 (P3, no messaging): claims 3
select count(*) as claims from public.claims;
do $$ begin begin insert into public.client_requests(client_id,kind,body,status) values ('10000000-0000-0000-0000-000000000003','question','x','open'); raise exception 'LEAK: messaging should be off'; exception when others then if sqlerrm like 'LEAK%' then raise; end if; end; end $$;
\echo cl2 messaging blocked OK
reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000c3';
\echo --- cl3 (none): claims 0, clients 0
select count(*) as claims from public.claims; select count(*) as clients from public.clients;
reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1';
\echo --- admin sees all: 9 claims, plus user_items write
select count(*) as claims from public.claims;
insert into public.user_items(kind,name,body) values ('capa','t','{}'); select count(*) as items from public.user_items;
reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000c1';
\echo --- client cannot read staff user_items
select count(*) as items from public.user_items;
