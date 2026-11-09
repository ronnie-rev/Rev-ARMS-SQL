-- 0021: managers may also save per-client monthly charges (client_fin) for true Days-in-A/R. Idempotent; run after 0020.
drop policy if exists "manager_write_payer_rules" on public.app_settings;
create policy "manager_write_payer_rules" on public.app_settings for all to authenticated
  using (public.my_role_exact() = 'manager' and key in ('limits_cfg','reimb_cfg','score_cfg','priority_cfg','bulk_cfg','appeal_cfg','intel_cfg','custom_recs','appeal_lib','fax_cfg','client_sops','email_cfg','client_fin'))
  with check (public.my_role_exact() = 'manager' and key in ('limits_cfg','reimb_cfg','score_cfg','priority_cfg','bulk_cfg','appeal_cfg','intel_cfg','custom_recs','appeal_lib','fax_cfg','client_sops','email_cfg','client_fin'));
