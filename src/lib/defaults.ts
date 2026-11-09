import { RCA_TREE, END_ACTION_TREE, MODES } from './taxonomy';
import type { ConfigOption } from './types';
import { uid } from './utils';
import { DEFAULT_OUTCOMES } from './engine/notes';
import { STARTER_RESOURCES } from './engine/links';
import { STAGE_DEFAULTS } from './engine/stages';

type O = Omit<ConfigOption, 'id'>;
const mk = (category: ConfigOption['category'], value: string, sort: number, extra: Partial<O> = {}): ConfigOption => ({
  id: uid(), category, value, parent: null, label: null, color: null, sort, active: true, meta: {}, ...extra,
});

export const BUCKET_DEFS: [string, number, number | null, string][] = [
  ['0-30', 0, 30, '#5fbf8f'], ['31-60', 31, 60, '#9ccf7a'], ['61-90', 61, 90, '#e2cf63'], ['91-120', 91, 120, '#efb55a'],
  ['121-150', 121, 150, '#ec9556'], ['151-180', 151, 180, '#e5735a'], ['181-365', 181, 365, '#cf4f5a'], ['365+', 366, null, '#a63d56'],
];

// End action → workflow status, default follow-up window, and whether the claim leaves the active worklist.
const END_META: Record<string, { status: string; fu: number | null; terminal?: boolean }> = {
  'Adjustments': { status: 'Adjusted', fu: null, terminal: true },
  'Billed To Patient': { status: 'Billed to Patient', fu: null, terminal: true },
  'Claim Appealed': { status: 'Appealed', fu: 30 },
  'Claim Escalation': { status: 'Escalated', fu: 3 },
  'Claim Follow Up Required': { status: 'Follow-up Pending', fu: 7 },
  'Claim Submitted': { status: 'Claim Submitted', fu: 30 },
  'Documentation Submitted': { status: 'Docs Submitted', fu: 21 },
  'Sent To Cash Posting': { status: 'With Cash Posting', fu: 3 },
  'Sent To Coding': { status: 'With Coding', fu: 5 },
  'Need OP Notes': { status: 'Awaiting Documents', fu: 7 },
  'Sent To Credentialing/Provider Enrollment': { status: 'With Credentialing', fu: 14 },
};
export const STATUS_DEFS: [string, string, boolean][] = [
  ['New', '#64748b', false], ['In Progress', '#6366f1', false], ['Claim Submitted', '#0ea5e9', false], ['Appealed', '#8b5cf6', false],
  ['Docs Submitted', '#06b6d4', false], ['Follow-up Pending', '#f59e0b', false], ['Escalated', '#ef4444', false],
  ['With Cash Posting', '#14b8a6', false], ['With Coding', '#d946ef', false], ['Awaiting Documents', '#fb923c', false],
  ['With Credentialing', '#a855f7', false], ['Adjusted', '#22c55e', true], ['Billed to Patient', '#84cc16', true], ['Resolved – Paid', '#16a34a', true],
];

// Collectability prior per root-cause category (1 = neutral). Editable in Admin → Root causes.
export const RCA_WEIGHT: Record<string, number> = {
  'Claim is in Process': 1.25, 'Additional Information Requested': 1.1, 'Billing Error': 0.95, 'Demographics Issue': 1.05, 'Coding': 0.9, 'No Response': 1.0,
  'Authorization': 0.7, 'Eligibility or Benefits': 0.55, 'Bundling or Inclusive Service': 0.5, 'Non Covered': 0.3, 'NPI or Non Par or Out of Network': 0.5,
  'Paid According to Contract': 0.15, 'Patient Responsibility': 0.25, 'Timely Filing': 0.2, 'No Referral': 0.75, 'Billed To Patient': 0.2, 'Sent To Credentialing/Provider Enrollment': 0.6,
};
import { EXTRA_LETTERS, EXTRA_PLAYBOOKS, EXTRA_SNIPPETS, RCM_ARTICLES } from './rcmcontent';
import { CARC_DEFAULTS } from './engine/carc';
export const CODE_PLAYBOOKS: [string, string, string][] = [
  ['Timely filing denial (CO-29)', 'CO-29', '!Pull the original submission date and clearing-house acceptance report\n!Check the payer TFL and any extension/waiver rule\nLook for payer-side rejections or prior timely claims in the history\nIf proof exists, appeal with proof of timely filing; if not, route to supervisor for write-off decision\nSet the appeal follow-up date'],
  ['Missing / invalid information (CO-16, CO-4, CO-11)', 'CO-16, CO-4, CO-11', '!Identify the exact field or modifier the remark code asks for\n!Confirm the correct value with the provider or practice\nSubmit a corrected claim (not an appeal) within the corrected-claim limit\nNote the corrected claim submission date and tracking number'],
  ['Medical necessity / no authorization (CO-50, CO-197)', 'CO-50, CO-197, CO-198', '!Check whether prior authorization was required and obtained\n!Request the clinical notes and medical-necessity documentation from the practice\nQuote the payer policy in the appeal\nSchedule peer-to-peer if offered'],
  ['Duplicate claim (CO-18)', 'CO-18', '!Confirm the original claim was paid or is still in process\nIf paid, post the payment and close as duplicate\nIf the first claim was denied, work that claim instead'],
  ['Patient responsibility (PR-1, PR-2, PR-3)', 'PR-*', '!Verify the patient-responsibility amount matches the EOB\nTransfer the balance to patient billing with the EOB attached\nCheck for secondary insurance before billing the patient'],
];
export const STARTER_LETTERS: { name: string; kind: string; codes: string; body: string }[] = [
  { name: 'Underpayment dispute — contract rate', kind: 'underpayment_dispute', codes: '', body: 'Date: {date}\n\nTo: {payer} Provider Services\nRe: Underpayment — Claim {claim} — Patient {patient} — DOS {dos} — CPT {cpt}\n\nOn review of the remittance for the above claim, payment of {paid} was received. Under our contracted rate the expected reimbursement is {expected}, leaving a shortfall of {variance}.\n\nWe request that the claim be reprocessed at the contracted rate and the difference remitted. Supporting remittance advice and the fee schedule excerpt are enclosed.[[ Reference: {tracking}.]]\n\nSincerely,\n{user}\n{practice}' },
  { name: 'Appeal — second level', kind: 'appeal', codes: '', body: 'Date: {date}\n\nTo: {payer} Appeals Department\nRe: {level} — Claim {claim} — Patient {patient} — DOS {dos}\n\nWe previously appealed this denial ({codes}) and the determination was upheld. We are requesting a second-level review within the appeal window ({deadline}).[[ Basis: {reason}.]]\n\nAdditional documentation is enclosed. Please overturn the denial and reprocess the claim for {balance}.\n\nSincerely,\n{user}\n{practice}' },
];
export const STARTER_VERSION = 4;
export const SNIPPETS: [string, string][] = [
  ['Called payer – in process', 'Called {payer} for claim {claim}. Rep confirms claim is in process, no further action required. Ref# . Follow up {date}.'],
  ['Corrected claim filed', 'Denial reviewed for {claim}. Corrected claim submitted to {payer} via clearinghouse. Expect response in 30 days.'],
  ['Records sent', 'Medical records for {claim} sent to {payer} per request ({date}). Tracking/ref# .'],
  ['Appeal submitted', 'Appeal filed with {payer} for {claim} (balance {balance}) with supporting documentation. Appeal deadline noted.'],
  ['No claim on file – resubmit', '{payer} has no claim on file for {claim}. Resubmitting electronically; will verify receipt in 7 days.'],
  ['Left voicemail / portal message', 'Unable to reach live rep at {payer}; left secure message / submitted portal inquiry on {date} for {claim}.'],
  ['Adjustment request', 'Balance {balance} on {claim} not recoverable (see root cause). Adjustment submitted for supervisor approval.'],
];
export const PLAYBOOKS: Record<string, string[]> = {
  'Authorization Not Obtained': ['Check payer portal/contract: was an authorization required for this CPT?', 'Ask the practice for any auth or referral on file (date, number, units).', 'If none: request a retro-authorization with clinical notes; note the payer deadline.', 'If denied: appeal citing urgency/medical necessity; escalate to supervisor if >$2k.', 'Set follow-up 7 days; log reference # for every contact.'],
  'Authorization - Invalid': ['Compare authorized CPT/units/dates/provider with the claim.', 'Request an auth update/extension from the payer if the service fits clinically.', 'Correct and resubmit if the claim data was wrong; otherwise appeal with the auth letter.'],
  'Medical Necessity': ['Pull the operative/clinical notes and the payer’s medical policy (see policy links).', 'Check diagnosis ↔ CPT pairing against the policy criteria.', 'If criteria are met: file appeal with notes + policy citation; ask the provider for a letter of medical necessity if needed.', 'If criteria not met: escalate to supervisor for write-off / patient-responsibility decision.'],
  'Missing/Invalid Modifier': ['Review the claim and notes with coding for the correct modifier (e.g. 25, 59/X{EPSU}, 51, LT/RT).', 'File a corrected claim (frequency code 7) with the right modifier.', 'Follow up in 30 days; verify the payer received the correction.'],
  'Missing/Invalid CPT-4 and/or HCPCS': ['Verify the CPT/HCPCS against the encounter and the payer’s code set for the DOS.', 'Send to coding for review; correct and resubmit.'],
  'Diagnosis Invalid': ['Validate the ICD-10 code (specificity, laterality, 7th character).', 'Update the diagnosis with coding and resubmit a corrected claim.'],
  'Charges Bundled/Inclusive': ['Check NCCI/payer bundling edits for the code pair; is a modifier (59/XS/XU) legitimately supportable?', 'If separately reportable: appeal with documentation showing a distinct procedure/site.', 'If truly bundled: adjust per contract after supervisor approval.'],
  'Inclusive in Global Period': ['Confirm the global period for the primary procedure (0/10/90 days) and the DOS.', 'If unrelated/ separately billable: append modifier 24/79 and appeal with notes.', 'Otherwise adjust as inclusive (contractual).'],
  'Denied as Duplicate': ['Locate the original claim and its status before doing anything.', 'If the original paid/is processing: no action, note the claim number and close.', 'If original was rejected/denied: correct that claim instead of resubmitting a new one.'],
  'No Claim on File': ['Check clearinghouse acceptance reports (277CA/999) for the original submission.', 'If accepted: send proof and ask the payer to locate it; if not: resubmit electronically now.', 'Verify receipt on the payer portal in 5–7 days.'],
  'Claim Billed Untimely': ['Gather proof of timely filing: clearinghouse acceptance, payer rejection letters, prior EOBs.', 'File a timely-filing appeal within the payer’s appeal window with evidence attached.', 'If no proof exists: escalate for adjustment approval — do not bill the patient unless contract allows.'],
  'Coverage Terminated': ['Verify eligibility for the DOS on the payer portal and obtain the term date.', 'Ask the practice/patient for current coverage; bill the correct payer.', 'If none: transfer to patient responsibility per policy.'],
  'COB - Other Insurance Primary': ['Verify primary vs secondary with the patient/practice and payers.', 'Update coverage order in the PMS; bill the correct primary first.', 'Attach the primary EOB when billing secondary.'],
  'Incorrect Policy ID': ['Verify the member ID, group #, DOB and name on the eligibility check.', 'Correct demographics in the PMS and resubmit.'],
  'DOB Mismatch': ['Confirm DOB with the practice/registration; verify against the insurance card.', 'Correct and resubmit; update the PMS.'],
  'Clinicals/Medical Records Requested': ['Identify exactly which records the payer wants and the deadline.', 'Request records from the practice if needed; send via the payer’s preferred channel with claim # on every page.', 'Log tracking/fax confirmation; follow up in 14 days.'],
  'Itemized Bill': ['Generate the itemized statement from the PMS.', 'Send with claim # to the payer; record method and confirmation.'],
  'Primary EOB': ['Obtain the primary payer EOB/remit (portal or practice).', 'Attach to the secondary claim and resubmit; follow up in 30 days.'],
  'Recently Filed': ['Confirm receipt on the payer portal; note payer’s standard processing time.', 'Set follow-up at day 30 from submission; do not call before then unless TF-risk.'],
  'Approved to pay-Chk not issued yet': ['Get the expected payment date and reference #.', 'Follow up 3 days after the promised date; if unpaid, escalate with the reference.'],
  'Provider Out of Network': ['Check the provider’s participation status for the DOS and the plan type.', 'If a credentialing delay: escalate to credentialing with effective-date proof.', 'If truly OON: review the OON benefits / no-surprises protections; adjust or bill per policy.'],
  'NPI-Physician Not Credentialed': ['Confirm credentialing status and effective date with enrollment.', 'Ask the payer to backdate to the application date if applicable; send to credentialing.'],
  'Referral Missing/Invalid': ['Check if the plan requires a referral; ask the practice for the referral on file.', 'Request a retro-referral from the PCP/payer; resubmit with referral #.'],
  'Patient Deductible/Coinsurance/Copay': ['Verify the EOB shows patient responsibility and the amount.', 'Transfer the balance to patient billing and close insurance AR.'],
  'Offset/Recoupment': ['Locate the recoupment letter/remit and the original paid claim.', 'Validate the reason; dispute within the payer’s window if incorrect, otherwise adjust.'],
  'Posting Error': ['Compare the remit/EOB to the payment posted in the PMS.', 'Send to cash posting for correction; follow up when re-posted.'],
  'Benefits Exhausted - No Payable Benefits': ['Verify the accumulator/annual maximum with the payer.', 'Bill the patient if allowed; otherwise adjust per contract.'],
};
export const LETTERS: [string, string][] = [
  ['Appeal — medical necessity', 'Date: {date}\n\nTo: {payer} Appeals Department\nRe: Claim {claim} — Patient {patient} — DOS {dos}\nProvider: {provider} · Billed {billed} · Outstanding {balance}\n\nDear Appeals Reviewer,\n\nWe are writing to appeal the denial of the above claim ({codes}). The services (CPT {cpt}) were medically necessary for the reasons documented in the enclosed clinical notes. {reason}\n\nPlease reconsider and process this claim for payment. Enclosed: clinical documentation, relevant policy excerpts, and the original remittance.\n\nSincerely,\n{user}\n{practice}'],
  ['Appeal — timely filing with proof', 'Date: {date}\n\nTo: {payer} Appeals Department\nRe: Claim {claim} — Patient {patient} — DOS {dos}\n\nDear Appeals Reviewer,\n\nThis claim was denied as untimely ({codes}). Enclosed is proof that it was submitted within the filing limit: clearinghouse acceptance/acknowledgement reports and prior correspondence showing original submission dates. We request that the denial be overturned and the claim processed (outstanding {balance}).\n\nSincerely,\n{user}\n{practice}'],
  ['Reconsideration request', 'Date: {date}\n\nTo: {payer} Provider Services\nRe: Request for reconsideration — Claim {claim} — {patient} — DOS {dos}\n\nWe respectfully request reconsideration of the processing of this claim (CPT {cpt}, balance {balance}). {reason}\n\nPlease contact us with any questions.\n\n{user}\n{practice}'],
  ['Records submission cover', 'Date: {date}\n\nTo: {payer} Claims Review\nRe: Medical records for Claim {claim} — {patient} — DOS {dos}\n\nAs requested, enclosed are the medical records supporting this claim. Please attach to the claim above and process for payment.\n\n{user}\n{practice}'],
  ['Corrected claim cover note', 'Date: {date}\n\nTo: {payer} Claims Department\nRe: Corrected claim — original claim {claim} — {patient} — DOS {dos}\n\nEnclosed is a corrected claim replacing the original. Correction: {reason}. Please reprocess.\n\n{user}\n{practice}'],
];
export const DEFAULT_MODEL = { forecast: [0.35, 0.35, 0.3], minSupport: 3, maskPhi: false, staleDays: 14, requireNextFu: true };

export function defaultConfig(): ConfigOption[] {
  const out: ConfigOption[] = [];
  BUCKET_DEFS.forEach(([l, min, max, c], i) => out.push(mk('bucket', l, i, { color: c, meta: { min, max } })));
  STATUS_DEFS.forEach(([l, c, t], i) => out.push(mk('status', l, i, { color: c, meta: { terminal: t } })));
  Object.entries(RCA_TREE).forEach(([cat, details], i) => {
    out.push(mk('rca', cat, i, { meta: { weight: RCA_WEIGHT[cat] ?? 1 } }));
    details.forEach((d, j) => out.push(mk('rca_detail', d, j, { parent: cat })));
  });
  Object.entries(END_ACTION_TREE).forEach(([a, subs], i) => {
    const m = END_META[a] || { status: 'In Progress', fu: 7 };
    out.push(mk('end_action', a, i, { meta: { status: m.status, fu_days: m.fu, terminal: !!m.terminal } }));
    subs.forEach((s, j) => out.push(mk('end_sub', s, j, { parent: a })));
  });
  MODES.forEach((m, i) => out.push(mk('mode', m, i)));
  [...SNIPPETS, ...EXTRA_SNIPPETS].forEach(([n, b], i) => out.push(mk('snippet', n, i, { meta: { body: b } })));
  DEFAULT_OUTCOMES.forEach((o, i) => out.push(mk('outcome', o.name, i, { meta: { id: o.id, body: o.body } })));
  Object.entries({ ...PLAYBOOKS, ...EXTRA_PLAYBOOKS }).forEach(([d, steps], i) => out.push(mk('playbook', d, i, { meta: { steps: steps.join('\n') } })));
  // denial-code checklists ("!" = required step). Editable in Admin → Playbooks; "Denial codes" ties them to the claim's CARC codes.
  STARTER_LETTERS.forEach((l, i) => out.push(mk('letter', l.name, 100 + i, { meta: { body: l.body.replace(/\\n/g, '\n'), kind: l.kind, codes: l.codes } })));
  CODE_PLAYBOOKS.forEach(([name, codes, steps], i) => out.push(mk('playbook', name, 200 + i, { meta: { codes, steps } })));
  STARTER_RESOURCES.forEach((r, i) => out.push(mk('resource', r.value, i, { meta: { url: r.url, kind: r.kind, note: r.note, payers: '', tags: '' } })));
  [...LETTERS, ...EXTRA_LETTERS].forEach(([n, b], i) => out.push(mk('letter', n, i, { meta: { body: b.replace(/\\n/g, '\n') } })));
  // visible, editable copies of the built-in dictionary and articles (Admin → Denial codes / Knowledge articles)
  CARC_DEFAULTS.forEach((c, i) => out.push(mk('carc', c.code, i, { meta: { meaning: c.meaning, rca: c.rca, rca_detail: c.rca_detail || '', action: c.action, family: c.family } })));
  RCM_ARTICLES.forEach((a, i) => out.push(mk('kb_article', a.title, i, { meta: { section: a.section, summary: a.summary, body: a.body, tags: a.tags || '' } })));
  STAGE_DEFAULTS.forEach((d, i) => out.push(mk('stage', d.value, i, { color: d.color, meta: { rule: d.rule, keywords: d.keywords, patientAR: !!d.patientAR, hint: d.hint } })));
  [['Low', '#94a3b8'], ['Normal', '#6366f1'], ['High', '#f59e0b'], ['Critical', '#ef4444']].forEach(([p, c], i) => out.push(mk('priority', p, i, { color: c })));
  return out;
}
