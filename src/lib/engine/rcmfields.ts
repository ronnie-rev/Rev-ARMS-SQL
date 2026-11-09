// The data points a senior AR specialist reaches for on every claim but most aging files don't carry. Stored in claim.custom under rcm_* keys, so they work in rules (custom:rcm_auth_no), imports and exports with no schema change.
export interface RcmField { key: string; label: string; type: 'text' | 'date' | 'number' | 'select'; options?: string[]; group: 'Authorization' | 'Payer' | 'Payment' | 'Coordination' | 'Billing'; hint?: string }
export const RCM_FIELDS: RcmField[] = [
  { key: 'rcm_auth_no', label: 'Auth / referral #', type: 'text', group: 'Authorization' }, { key: 'rcm_auth_exp', label: 'Auth valid through', type: 'date', group: 'Authorization' }, { key: 'rcm_auth_units', label: 'Units authorised', type: 'number', group: 'Authorization' },
  { key: 'rcm_icn', label: 'Payer claim # (ICN/DCN)', type: 'text', group: 'Payer', hint: 'The payer’s own number — payers ask for this, not yours' }, { key: 'rcm_payer_rep', label: 'Last payer rep', type: 'text', group: 'Payer' }, { key: 'rcm_call_ref', label: 'Call reference #', type: 'text', group: 'Payer' }, { key: 'rcm_member_id', label: 'Member ID', type: 'text', group: 'Payer' },
  { key: 'rcm_check_no', label: 'Check / EFT #', type: 'text', group: 'Payment' }, { key: 'rcm_check_date', label: 'Check / EFT date', type: 'date', group: 'Payment' }, { key: 'rcm_posted', label: 'Payment posted in PMS?', type: 'select', options: ['Yes', 'No', 'Partial'], group: 'Payment' }, { key: 'rcm_takeback', label: 'Recoupment / takeback $', type: 'number', group: 'Payment' },
  { key: 'rcm_secondary_payer', label: 'Secondary payer', type: 'text', group: 'Coordination' }, { key: 'rcm_cob', label: 'COB status', type: 'select', options: ['Verified', 'Pending', 'Updated by patient', 'Payer disputes'], group: 'Coordination' }, { key: 'rcm_sec_billed', label: 'Secondary billed?', type: 'select', options: ['Yes', 'No', 'N/A'], group: 'Coordination' },
  { key: 'rcm_pos', label: 'Place of service', type: 'text', group: 'Billing' }, { key: 'rcm_fin_class', label: 'Financial class', type: 'select', options: ['Commercial', 'Medicare', 'Medicaid', 'Self-pay', 'Workers comp', 'Auto / PI', 'Other'], group: 'Billing' }, { key: 'rcm_rebill_date', label: 'Last rebill / corrected date', type: 'date', group: 'Billing' }, { key: 'rcm_ch_status', label: 'Clearinghouse status', type: 'select', options: ['Accepted', 'Rejected', 'Not sent', 'Unknown'], group: 'Billing' },
];
export const RCM_GROUPS = ['Authorization', 'Payer', 'Payment', 'Coordination', 'Billing'] as const;
/** Gaps a specialist would chase: returns plain-language prompts for the claim's current situation. */
export function rcmGaps(c: { custom?: Record<string, any>; denial_codes?: string | null; dos?: string | null }, today: string): string[] {
  const v = (k: string) => c.custom?.[k]; const out: string[] = []; const codes = (c.denial_codes || '').toUpperCase();
  if (/CO-?(15|197|198|199)|N54/.test(codes) && !v('rcm_auth_no')) out.push('Authorization-type denial but no auth # recorded — pull it from the payer portal or the practice.');
  if (v('rcm_auth_exp') && v('rcm_auth_exp') < (c.dos || today)) out.push('Authorization expired before the date of service.');
  if (/CO-?22|CO-?23/.test(codes) && !v('rcm_cob')) out.push('Coordination-of-benefits denial — confirm COB status and the other payer.');
  if (v('rcm_secondary_payer') && !v('rcm_sec_billed')) out.push('A secondary payer is on file — has the secondary been billed?');
  if (v('rcm_check_no') && v('rcm_posted') === 'No') out.push('Payment received (check/EFT recorded) but not posted in the PMS.');
  if (Number(v('rcm_takeback')) > 0) out.push('Recoupment recorded — reconcile against the original payment.');
  if (!v('rcm_icn') && /status|call/i.test(codes)) out.push('No payer claim # (ICN/DCN) — you will need it on the call.');
  return out;
}
