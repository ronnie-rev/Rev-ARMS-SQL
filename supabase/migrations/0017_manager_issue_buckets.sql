-- Managers may also maintain per-client issue buckets (bulk-issue lanes). Idempotent; run after 0016.
drop policy if exists "manager_write_content" on public.config_options;
create policy "manager_write_content" on public.config_options for all to authenticated
  using (public.my_role_exact() = 'manager' and category in ('playbook','snippet','letter','kb_article','carc','resource','payer','outcome','issue_bucket'))
  with check (public.my_role_exact() = 'manager' and category in ('playbook','snippet','letter','kb_article','carc','resource','payer','outcome','issue_bucket'));
