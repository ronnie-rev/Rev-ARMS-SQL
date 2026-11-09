-- 0020: managers may also edit client SOPs (client_sops) and inbound-email settings (email_cfg). Idempotent; run after 0019.
drop policy if exists "manager_write_payer_rules" on public.app_settings;
create policy "manager_write_payer_rules" on public.app_settings for all to authenticated
  using (public.my_role_exact() = 'manager' and key in ('limits_cfg','reimb_cfg','score_cfg','priority_cfg','bulk_cfg','appeal_cfg','intel_cfg','custom_recs','appeal_lib','fax_cfg','client_sops','email_cfg'))
  with check (public.my_role_exact() = 'manager' and key in ('limits_cfg','reimb_cfg','score_cfg','priority_cfg','bulk_cfg','appeal_cfg','intel_cfg','custom_recs','appeal_lib','fax_cfg','client_sops','email_cfg'));
