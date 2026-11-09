-- Managers maintain payer & filing rules (limits, reimbursement, scorecard, priority, bulk, appeals). Other settings stay admin-only. Idempotent; run after 0014.
drop policy if exists "manager_write_payer_rules" on public.app_settings;
create policy "manager_write_payer_rules" on public.app_settings for all to authenticated
  using (public.my_role_exact() = 'manager' and key in ('limits_cfg','reimb_cfg','score_cfg','priority_cfg','bulk_cfg','appeal_cfg'))
  with check (public.my_role_exact() = 'manager' and key in ('limits_cfg','reimb_cfg','score_cfg','priority_cfg','bulk_cfg','appeal_cfg'));
