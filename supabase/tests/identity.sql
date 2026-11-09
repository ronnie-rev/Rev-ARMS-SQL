\set ON_ERROR_STOP off
truncate public.claims, public.clients, public.client_uid_counters, public.profiles, auth.users cascade;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','sr@x.com'),('00000000-0000-0000-0000-0000000000a2','tl@x.com'),('00000000-0000-0000-0000-0000000000a3','tl2@x.com');
update public.profiles set role='sr_mgmt' where email='sr@x.com'; update public.profiles set role='tl_prod_qa' where email in ('tl@x.com','tl2@x.com');
insert into public.clients(id,name,code) values ('10000000-0000-0000-0000-000000000001','Alpha Clinic','ALP'),('10000000-0000-0000-0000-000000000002','Beta Clinic','BET');
grant usage on schema public to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a2';
\echo === alloc: two reservations never overlap (expect 0 then 5)
select public.alloc_claim_uids('10000000-0000-0000-0000-000000000001', 5); select public.alloc_claim_uids('10000000-0000-0000-0000-000000000001', 3);
\echo === same claim_no/key in two clients is fine (2 rows)
insert into public.claims(client_id, claim_no, claim_key, claim_uid, encounter_no) values ('10000000-0000-0000-0000-000000000001','C1','C1',public.format_claim_uid('ALP',2026,1),'E1'),('10000000-0000-0000-0000-000000000002','C1','C1',public.format_claim_uid('BET',2026,1),'E1');
select count(*) from public.claims;
\echo === duplicate key inside one client is rejected
insert into public.claims(client_id, claim_no, claim_key, claim_uid) values ('10000000-0000-0000-0000-000000000001','C1x','C1',public.format_claim_uid('ALP',2026,2));
\echo === duplicate UID is rejected
insert into public.claims(client_id, claim_no, claim_key, claim_uid) values ('10000000-0000-0000-0000-000000000002','C9','C9',public.format_claim_uid('BET',2026,1));
\echo === UID is permanent
update public.claims set claim_uid = 'RR-HACK-26-0000001-0' where claim_no='C1' and client_id='10000000-0000-0000-0000-000000000001';
\echo === cannot sign a decision as someone else, can as self
update public.claims set resolved_by='00000000-0000-0000-0000-0000000000a3', closed_at=now() where claim_no='C1' and client_id='10000000-0000-0000-0000-000000000001';
update public.claims set resolved_by='00000000-0000-0000-0000-0000000000a2', closed_at=now(), resolved_at=now() where claim_no='C1' and client_id='10000000-0000-0000-0000-000000000001';
\echo === a team lead cannot delete a closed claim; Sr. Management can
delete from public.claims where claim_no='C1' and client_id='10000000-0000-0000-0000-000000000001'; select count(*) from public.claims;
reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1';
delete from public.claims where claim_no='C1' and client_id='10000000-0000-0000-0000-000000000001'; select count(*) from public.claims;
