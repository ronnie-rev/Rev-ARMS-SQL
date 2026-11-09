\set ON_ERROR_STOP off
truncate public.claims, public.clients, public.config_options, public.app_settings, public.profiles, auth.users cascade;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','sr@x.com'),('00000000-0000-0000-0000-0000000000a2','adm@x.com'),('00000000-0000-0000-0000-0000000000a3','mgr@x.com'),('00000000-0000-0000-0000-0000000000a4','u@x.com'),('00000000-0000-0000-0000-0000000000a5','qx@x.com');
update public.profiles set role='sr_mgmt' where email='sr@x.com'; update public.profiles set role='sys_admin' where email='adm@x.com'; update public.profiles set role='manager' where email='mgr@x.com'; update public.profiles set role='user_prod' where email='u@x.com'; update public.profiles set role='qa_ext' where email='qx@x.com';
insert into public.clients(id,name) values ('10000000-0000-0000-0000-000000000001','P1');
insert into public.config_options(id,category,value) values ('40000000-0000-0000-0000-000000000001','letter','L1'),('40000000-0000-0000-0000-000000000002','bucket','B1');
grant usage on schema public to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;
\echo === manager: may edit a letter (1 row), may NOT edit a bucket (0 rows), may NOT write permissions, may NOT change roles
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a3';
update public.config_options set meta='{"x":1}' where category='letter'; update public.config_options set meta='{"x":1}' where category='bucket';
insert into public.app_settings(key,value) values ('permissions','{}');
update public.profiles set role='sr_mgmt' where email='u@x.com';
update public.clients set name='P1b';
reset role;
select category, meta from public.config_options order by category;
select name from public.clients; select role from public.profiles where email='u@x.com';
\echo === admin: may edit bucket, may promote user to manager, may NOT promote to sr_mgmt, may NOT touch sr_mgmt, may NOT write permissions
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a2';
update public.config_options set meta='{"y":1}' where category='bucket';
update public.profiles set role='manager' where email='u@x.com';
update public.profiles set role='sr_mgmt' where email='u@x.com';
update public.profiles set full_name='hacked' where email='sr@x.com';
insert into public.app_settings(key,value) values ('permissions','{"a":1}');
reset role; select category, meta from public.config_options where category='bucket'; select email, role, full_name from public.profiles order by email;
\echo === sr_mgmt: may write permissions and promote
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1';
insert into public.app_settings(key,value) values ('permissions','{"ok":1}'); update public.profiles set role='sr_mgmt' where email='u@x.com';
reset role; select key, value from public.app_settings; select role from public.profiles where email='u@x.com';
\echo === external QA analyst: cannot write claims/clients/config
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a5';
update public.clients set name='nope'; insert into public.config_options(category,value) values ('letter','nope');
reset role; select name from public.clients; select count(*) from public.config_options where value='nope';
