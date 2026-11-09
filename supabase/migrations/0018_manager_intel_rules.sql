-- Managers may also edit the intelligence-rules setting (next-best-action thresholds, forecast, capacity, signals, sweep, calculators). Idempotent; run after 0017.
drop policy if exists "manager_write_payer_rules" on public.app_settings;
create policy "manager_write_payer_rules" on public.app_settings for all to authenticated
  using (public.my_role_exact() = 'manager' and key in ('limits_cfg','reimb_cfg','score_cfg','priority_cfg','bulk_cfg','appeal_cfg','intel_cfg','custom_recs','appeal_lib','fax_cfg'))
  with check (public.my_role_exact() = 'manager' and key in ('limits_cfg','reimb_cfg','score_cfg','priority_cfg','bulk_cfg','appeal_cfg','intel_cfg','custom_recs','appeal_lib','fax_cfg'));
