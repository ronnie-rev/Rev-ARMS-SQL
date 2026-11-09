// Starter dictionary of common claim adjustment reason codes → plain meaning, likely root cause (matching the AR team's own taxonomy),
// and a first-move recommendation. It is a *starting point*: edit/extend in Admin → Denial codes. Meanings are paraphrased summaries,
// not the licensed X12 text — always confirm on the payer remit / X12 code list.
export interface Carc { code: string; meaning: string; rca: string; rca_detail?: string; action: string; appeal?: string; family: string }

const C = (code: string, meaning: string, rca: string, rca_detail: string | undefined, action: string, family: string, appeal?: string): Carc => ({ code, meaning, rca, rca_detail, action, family, appeal });
export const CARC_DEFAULTS: Carc[] = [
  C('CO-4', 'Procedure code inconsistent with the modifier or a required modifier is missing', 'Coding', 'Missing/Invalid Modifier', 'Correct modifier and file corrected claim', 'Coding'),
  C('CO-11', 'Diagnosis is inconsistent with the procedure', 'Coding', 'Diagnosis Inconsistent with Procedure', 'Review dx/CPT pairing with coding; corrected claim', 'Coding'),
  C('CO-16', 'Claim lacks information or has billing errors', 'Additional Information Requested', 'Pending Info From Member', 'Identify the missing element (see RARC), correct and resubmit', 'Missing info'),
  C('CO-18', 'Exact duplicate claim/service', 'Billing Error', 'Denied as Duplicate', 'Verify original claim status; do not resubmit if original is processing', 'Duplicate'),
  C('CO-22', 'Care may be covered by another payer (coordination of benefits)', 'Eligibility or Benefits', 'COB - Other Insurance Primary', 'Verify primary/secondary; update COB and bill correct payer', 'COB'),
  C('CO-24', 'Charges covered under a capitation / managed-care plan', 'Eligibility or Benefits', undefined, 'Verify plan type; bill the capitated entity', 'Eligibility'),
  C('CO-27', 'Expenses incurred after coverage terminated', 'Eligibility or Benefits', 'Coverage Terminated', 'Verify eligibility on DOS; bill correct payer or patient', 'Eligibility'),
  C('CO-29', 'Time limit for filing has expired', 'Timely Filing', 'Claim Billed Untimely', 'Gather proof of timely filing (clearinghouse acceptance); appeal with evidence', 'Timely filing', 'Proof of timely filing: 277CA/999 acceptance, original submission report'),
  C('CO-31', 'Patient cannot be identified as our insured', 'Demographics Issue', 'Member Cannot be Found', 'Verify member ID / DOB / name; resubmit', 'Eligibility'),
  C('CO-45', 'Charge exceeds the fee schedule / contractual obligation', 'Paid According to Contract', undefined, 'Contractual adjustment — verify against contract, then adjust', 'Contractual'),
  C('CO-50', 'Not deemed a medical necessity by the payer', 'Coding', 'Medical Necessity', 'Review clinicals vs payer medical policy; appeal with notes', 'Medical necessity', 'Include clinical notes and cite the payer medical policy / LCD'),
  C('CO-55', 'Procedure/treatment is deemed experimental or investigational', 'Coding', 'Services Deemed to be experimental/investigational', 'Review payer policy; appeal with literature if supportable', 'Medical necessity'),
  C('CO-96', 'Non-covered charge(s)', 'Non Covered', 'Non Covered Under Patient Plan', 'Verify benefit exclusion; bill patient if allowed by contract/waiver', 'Non-covered'),
  C('CO-97', 'Benefit for this service is included in payment for another service (bundled)', 'Bundling or Inclusive Service', 'Charges Bundled/Inclusive', 'Check NCCI/modifier 59/XS eligibility; appeal if separately reportable', 'Bundling'),
  C('CO-109', 'Claim/service not covered by this payer — send to the correct payer', 'Eligibility or Benefits', 'COB - Other Insurance Primary', 'Identify correct payer and rebill', 'COB'),
  C('CO-119', 'Maximum benefit for this time period has been reached', 'Eligibility or Benefits', 'Benefits Exhausted - No Payable Benefits', 'Verify accumulators; bill patient per policy', 'Eligibility'),
  C('CO-151', 'Payment adjusted — information does not support this many services/frequency', 'Coding', 'NCD/LCD Guidelines not met', 'Review frequency limits; appeal with documentation', 'Medical necessity'),
  C('CO-167', 'Diagnosis is not covered', 'Coding', 'Diagnosis Invalid', 'Verify diagnosis coding; corrected claim or appeal', 'Coding'),
  C('CO-197', 'Precertification / authorization / notification absent', 'Authorization', 'Authorization Not Obtained', 'Request retro-authorization or appeal with proof of auth', 'Authorization', 'Include auth number/approval letter or medical-urgency documentation'),
  C('CO-198', 'Precertification / authorization exceeded', 'Authorization', 'Authorization - Invalid', 'Verify authorized units/dates; request extension', 'Authorization'),
  C('CO-204', 'Service not covered under the patient’s current benefit plan', 'Non Covered', 'Non Covered Under Patient Plan', 'Verify benefits; patient responsibility if covered by waiver', 'Non-covered'),
  C('CO-235', 'Sales tax', 'Billing Error', undefined, 'Review payer instructions', 'Other'),
  C('CO-252', 'An attachment/other documentation is required to adjudicate this claim', 'Additional Information Requested', 'Clinicals/Medical Records Requested', 'Send the requested records and reference the claim', 'Missing info'),
  C('PR-1', 'Patient responsibility — deductible', 'Patient Responsibility', 'Patient Deductible/Coinsurance/Copay', 'Transfer to patient responsibility', 'Patient resp'),
  C('PR-2', 'Patient responsibility — coinsurance', 'Patient Responsibility', 'Patient Deductible/Coinsurance/Copay', 'Transfer to patient responsibility', 'Patient resp'),
  C('PR-3', 'Patient responsibility — copayment', 'Patient Responsibility', 'Patient Deductible/Coinsurance/Copay', 'Transfer to patient responsibility', 'Patient resp'),
  C('OA-23', 'Payment adjusted due to prior payer’s adjudication (COB)', 'Eligibility or Benefits', 'COB - Other Insurance Primary', 'Verify primary EOB attached; rebill secondary', 'COB'),
  C('PI-204', 'Payer-initiated: not covered under plan', 'Non Covered', 'Non Covered Under Patient Plan', 'Verify benefits', 'Non-covered'),
];

export const normCode = (raw: string) => { const m = raw.toUpperCase().replace(/\s+/g, '').match(/^(CO|PR|OA|PI|CR)?[-:]?(\d{1,3})$/); return m ? `${m[1] || 'CO'}-${m[2]}` : raw.toUpperCase().trim(); };
export const splitCodes = (raw: string | null | undefined): string[] => (raw || '').toUpperCase().replace(/\b(CO|PR|OA|PI|CR)[\s:]+(\d{1,3})\b/g, '$1-$2').split(/[,;\s|/]+/).map((c) => c.trim()).filter(Boolean).map(normCode);

export function carcMap(overrides: Carc[] = []): Map<string, Carc> { const m = new Map(CARC_DEFAULTS.map((c) => [c.code, c])); overrides.forEach((o) => m.set(normCode(o.code), { ...(m.get(normCode(o.code)) || ({} as Carc)), ...o, code: normCode(o.code) })); return m; }

/** From a claim's denial codes suggest the most likely root cause (category/detail) and a first move. Majority vote across codes, patient-responsibility last. */
export function suggestFromCodes(codes: string | null | undefined, map: Map<string, Carc>): { rca: string; rca_detail?: string; action: string; codes: Carc[]; confidence: number } | null {
  const hits = splitCodes(codes).map((c) => map.get(c)).filter((c): c is Carc => !!c && !!c.rca); if (!hits.length) return null; // reference-only codes (no mapped root cause) never drive a suggestion
  const tally = new Map<string, { n: number; c: Carc }>(); hits.forEach((h) => { const w = h.rca === 'Patient Responsibility' ? 0.5 : h.rca === 'Paid According to Contract' ? 0.4 : 1; const t = tally.get(h.rca) || { n: 0, c: h }; t.n += w; tally.set(h.rca, t); });
  const best = [...tally.values()].sort((a, b) => b.n - a.n)[0]; const tot = [...tally.values()].reduce((a, t) => a + t.n, 0);
  return { rca: best.c.rca, rca_detail: best.c.rca_detail, action: best.c.action, codes: hits, confidence: best.n / tot };
}
export const familyOf = (code: string, map: Map<string, Carc>) => map.get(normCode(code))?.family || 'Unclassified';
