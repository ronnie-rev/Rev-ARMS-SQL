\set ON_ERROR_STOP off
truncate public.qa_reviews, public.work_log, public.claims, public.clients, public.profiles, auth.users cascade;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','admin@x.com'),('00000000-0000-0000-0000-0000000000b1','qa@x.com'),('00000000-0000-0000-0000-0000000000b2','an1@x.com'),('00000000-0000-0000-0000-0000000000b3','an2@x.com');
update public.profiles set role='sr_mgmt' where email='admin@x.com'; update public.profiles set role='sme_qa' where email='qa@x.com'; update public.profiles set role='user_prod' where email in ('an1@x.com','an2@x.com');
insert into public.clients(id,name) values ('10000000-0000-0000-0000-000000000001','P1');
insert into public.claims(id,client_id,claim_no,balance) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','K1',10);
insert into public.work_log(id,claim_id,client_id,work_date) values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',current_date);
grant usage on schema public to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
\echo --- QA reviewer inserts a completed review for analyst an1
insert into public.qa_reviews(work_log_id,claim_id,client_id,analyst_id,reviewer_id,status,score,result,comments) values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b1','completed',72,'fail','weak note');
insert into public.qa_config(id,value) values ('main','{"sample_rate_pct":5}') on conflict (id) do update set value=excluded.value;
\echo QA wrote config OK
reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b2';
\echo --- analyst an1 sees own review (1) and acknowledges
select count(*) from public.qa_reviews;
update public.qa_reviews set status='acknowledged', analyst_ack_at=now();
\echo --- analyst tries to change score (must fail)
update public.qa_reviews set score=100;
\echo --- analyst cannot write qa_config (must fail / 0 rows)
update public.qa_config set value='{"sample_rate_pct":0}';
select value->>'sample_rate_pct' as rate from public.qa_config;
reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b3';
\echo --- analyst an2 sees 0 reviews and cannot dispute someone elses
select count(*) from public.qa_reviews;
update public.qa_reviews set status='disputed';
reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b2';
\echo --- an1 disputes own (allowed) then QA resolves
update public.qa_reviews set status='disputed', dispute_note='I called twice';
select status, score from public.qa_reviews;
reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
update public.qa_reviews set status='resolved', dispute_outcome='overturned', score=88, result='pass';
select status, score, result, dispute_outcome from public.qa_reviews;
