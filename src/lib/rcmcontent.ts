// RCM-expert starter content: playbooks for every root-cause detail, note snippets, letters, and the SOP / benchmark / escalation
// articles shown in Knowledge → RCM playbook. All of it is guidance and is editable from Admin (Playbooks, Snippets, Letters, Knowledge articles).
// Payer-specific rules vary: items say "verify" where the payer contract or plan document decides.

export const EXTRA_PLAYBOOKS: Record<string, string[]> = {
  'COB from Patient': ['Check the claim for the COB/other-coverage reason (CARC 22 / 23 / 24).', 'Call the patient (or use the portal) to confirm every active plan, subscriber ID, effective dates and who is primary (birthday rule for dependents, active-employment rule for Medicare).', 'Update insurance order in the PMS, then re-verify eligibility on both plans.', 'Resubmit to the correct primary; once paid, bill secondary with the primary EOB/ERA attached.', 'Document patient contact (who/when) and set follow-up for 30 days.'],
  'Pending Info From Member': ['Identify exactly what the payer is waiting for (accident questionnaire, COB form, member statement).', 'Contact the patient with a written request and a deadline; offer to complete it by phone.', 'Once received, submit to the payer by portal/fax and capture the confirmation #.', 'If the patient does not respond in 2 attempts, escalate to the practice for a statement/letter and note the final attempt.'],
  'Review with Insurance': ['Confirm the claim is on file with a status (not “received” only) — note ICN and last action date.', 'If in review beyond the payer’s prompt-pay window, ask for the reviewer unit and expected completion date.', 'Request an expedited review if records are already on file; send missing records the same day.', 'Set follow-up to the quoted completion date; escalate to a supervisor at 45 days with no movement.'],
  'Diagnosis Inconsistent with Procedure': ['Pull the denial detail and the payer’s LCD/NCD or medical policy for the CPT.', 'Review the encounter note: is there a more specific, documented diagnosis that supports the procedure?', 'If documentation supports it, send a coding query to the provider/coder and submit a corrected claim.', 'If it does not, do not add diagnoses to fit — adjust per policy and flag the coding pattern to the practice.'],
  'Missing/Invalid CLIA No': ['Confirm the lab test requires a CLIA waiver/certificate (CLIA-waived vs moderate complexity).', 'Get the practice’s current CLIA number from the client file; verify it is active and covers the test.', 'Enter it in the claim (837P 2300 REF*X4 / CMS-1500 box 23) and resubmit as a corrected claim.', 'If the practice has no valid certificate, stop billing the test and escalate to the client.'],
  'Missing/Invalid NDC Number': ['Locate the NDC on the drug administration record / invoice (11-digit, 5-4-2 format).', 'Report it in the 837P LIN/CTP segments with the correct unit of measure (ML, UN, GR, F2) and quantity.', 'Check HCPCS J-code units against the NDC quantity to avoid a mismatch denial.', 'Submit a corrected claim; note the NDC and units in the touch.'],
  'NCD/LCD Guidelines not Met': ['Open the NCD/LCD and list each coverage criterion for the CPT/ICD pair.', 'Compare against the clinical note — is each criterion documented (frequency, failed conservative care, severity)?', 'If met: appeal with the policy citation, highlighted note excerpts and the provider’s attestation. If not met and no ABN/waiver was on file: adjust per policy and notify the client.'],
  'New Patient Qualification not Met': ['Verify the 3-year / same-group-same-specialty rule against prior claims for this patient (any provider in the group with the same specialty).', 'If the patient was seen within 3 years: re-code to the established-patient E/M and submit a corrected claim.', 'If not seen, appeal with the prior-visit history from the PMS and payer eligibility confirmation.'],
  'Non Emergent Services': ['Check whether the service was billed in an ER/urgent setting with a non-emergent diagnosis (CARC 204/B7).', 'Review the record for prudent-layperson criteria; if emergent, appeal with the triage note and symptoms at presentation.', 'If truly non-emergent, bill the correct place of service/code or adjust per contract.'],
  'Procedure Code Inconsistent with Modifier': ['Identify the modifier-to-CPT edit (CARC 4 / 5 / 6) in the payer’s edit list or claim scrubber.', 'Confirm with the provider which modifier the documentation supports (e.g., -25, -59/XS, -RT/LT, -50).', 'Correct and resubmit; never append a modifier only to bypass an edit.', 'Log the pair and ask the practice to add it to charge-entry rules.'],
  "Procedure/Diagnosis Code Inconsistent with Patient's Age": ['Verify the patient’s DOB in the PMS against the insurance card/eligibility response.', 'If DOB is wrong: correct demographics and resubmit. If right: review whether the code is age-restricted and whether a different code applies.', 'If clinically appropriate, appeal with a provider letter stating the clinical rationale.'],
  'Procedure/Diagnosis Code Inconsistent with Pt Gender': ['Check the patient’s sex on file vs eligibility; fix a data-entry mismatch and resubmit.', 'For sex-specific services on patients whose recorded sex differs, add the correct condition code/modifier per payer policy (e.g., KX/-modifier per plan guidance — verify).', 'Appeal with documentation if the service is medically appropriate.'],
  'Qualifying CPT not Received': ['Find the primary/qualifying code that the add-on or secondary code requires (CARC 107/ N-codes).', 'Confirm whether the qualifying procedure was billed on the same claim/date and was paid or denied.', 'If missing: bill the qualifying service (corrected claim). If denied: resolve the primary first, then reprocess the add-on.'],
  'Services Deemed to be experimental/investigational': ['Pull the payer’s policy and check effective date and code list; compare to the actual service.', 'Ask the provider for peer-reviewed support and the FDA/clinical-trial status; request a medical-director peer-to-peer.', 'File a level-1 appeal with literature and the provider letter; if upheld, ask for the external review route (verify state rules).'],
  'Patient Name Conflict': ['Compare the claim’s patient name/DOB/subscriber ID against eligibility (270/271) and the card.', 'Correct spelling, suffix, hyphenation or order of first/last name in the PMS.', 'Resubmit a corrected claim; if the payer still rejects, ask them to update the member record.'],
  'Dependent Not Eligible': ['Verify the dependent’s coverage dates and relationship on a fresh eligibility check.', 'Confirm with the patient — age-out (26), divorce, student status or enrollment lapse.', 'If coverage is active, appeal/reprocess with proof; if not, find other coverage or transfer to patient responsibility (with practice approval).'],
  'Hospice Related': ['Check Medicare/payer hospice election dates (HETS/eligibility) against the DOS.', 'Determine whether the service is related to the terminal diagnosis — unrelated services may be billed with the GW modifier to Medicare; related services go to the hospice.', 'Bill the hospice or resubmit with the correct modifier and documentation; do not bill the patient for hospice-covered services.'],
  'Life Time Maximum Met': ['Confirm the benefit exhaustion with the payer (call: ask for the amount used and reset rules).', 'Check whether a different benefit category, secondary plan or a medical-necessity exception applies.', 'Notify the patient and the practice; after approval, transfer to patient responsibility with a financial-assistance option.'],
  'Member Cannot be Found': ['Re-run eligibility using member ID + DOB, then name + DOB, then SSN where permitted.', 'Check for a new ID/plan year change, prefix/suffix, or a termed/replaced policy.', 'Call the patient for the current card; update the PMS and resubmit. If coverage has ended, bill the new plan or patient.'],
  'Patient Did Not Pay Premiums': ['Verify the grace period (e.g., ACA 3-month rule: month 1 payable, months 2–3 pended) and exact termination date.', 'For pended claims: re-bill after the payer confirms reinstatement, or monitor until the grace period ends.', 'If terminated retroactively: bill the patient (with the practice’s policy) and document notice given.'],
  'No Response On Claim': ['Check clearinghouse for 277CA acceptance; if accepted, call the payer for status — never just resubmit blindly.', 'If the payer has no record: resubmit electronically and attach the acceptance report as proof of timely filing.', 'Escalate through the payer’s provider-rep if no response in 45 days after verified receipt.'],
  'Non Covered Under Patient Plan': ['Verify benefits: is the service excluded entirely, or covered under a different code/place of service?', 'Check whether a valid financial-responsibility/ABN waiver was signed before service.', 'If patient liability is valid: transfer the balance to the patient with the EOB and notify the practice.'],
  'Non-Covered Under Provider Contract': ['Review the provider’s fee schedule/contract for the CPT — covered, bundled or carved out?', 'If the contract covers it, appeal with the contract language; if not, adjust as a contractual write-off (never bill the patient for contractual adjustments).', 'Report repeated carve-outs to the practice for renegotiation.'],
  'Routine Services/Exam': ['Check whether the visit was billed as preventive vs problem-oriented — and whether the diagnosis supports a medical visit.', 'If a problem was addressed, recode (e.g., E/M with -25) per documentation and send a corrected claim.', 'If truly routine and excluded, move to patient responsibility following the practice’s policy.'],
  'NPI  and Taxonomy Not Matching': ['Verify the NPI and taxonomy in NPPES and the payer’s provider file (rendering vs billing vs group).', 'Correct the taxonomy on the claim (2310B PRV) or update the payer enrollment record.', 'Resubmit; if the payer record is wrong, open a provider-data-update ticket and keep proof for the timely-filing appeal.'],
  'Claim Paid to Patient': ['Confirm from the EOB/835 that payment went to the member (assignment of benefits missing / out-of-network).', 'Ask the patient to forward the payment (send a courteous request with the EOB and payment instructions).', 'Request the payer to reissue to the provider if AOB was on file; document the call ref #.'],
  'Claim Paid To Provider': ['Locate the payment (check #/EFT trace) in the bank/remit and post it against the claim.', 'If payment is unposted or misapplied, work with the client’s posting team; attach the 835.', 'Close the follow-up once the balance matches the allowed amount.'],
  'Primary Paid More than Secondary': ['Compare the primary payment against the secondary’s allowed amount (COB/non-duplication rules).', 'If the primary exceeds the secondary’s allowed, the secondary correctly pays $0 — adjust the remaining balance by contract.', 'Only bill the patient for the amount the EOB assigns as patient responsibility.'],
  'Billed To Patient': ['Confirm the patient statement was sent with the EOB-supported amount and the date.', 'Track payment plan / collections per the practice’s policy; do not change the insurance balance without approval.', 'Close the AR claim when moved to patient AR (keep the link in notes).'],
  'Sent To Credentialing/Provider Enrollment': ['Confirm the enrollment application status and effective date with the payer (get the application tracking #).', 'Hold claims for the effective date or request retro-effective dating per the payer’s policy.', 'After approval, resubmit within the new timely-filing window; log the expected effective date.'],
};

export const EXTRA_SNIPPETS: [string, string][] = [
  ['Called payer – denial explained', 'Called {payer} re {claim}. Rep explained denial ({codes}). Plan: per rep, next step is _____. Rep name/ref#: _____. Follow up {date}.'],
  ['Portal status check', 'Checked {payer} portal for {claim} on {date}: status _____, last action _____, paid/allowed _____. Next step: _____.'],
  ['Claim reprocessing requested', 'Payer confirmed processing error on {claim}. Reprocessing requested (ref# _____), expected 15–30 days. Follow up {date}.'],
  ['Eligibility re-verified', 'Eligibility re-verified for {claim} on {date}: plan _____, effective _____, subscriber ID _____. Claim to be resubmitted to the correct payer.'],
  ['COB updated with patient', 'Spoke with patient re other coverage on {claim}. Other plan: _____, ID _____. PMS updated; claim to be rebilled to correct primary.'],
  ['Authorization retro requested', 'Retro-authorization requested from {payer} for {claim} (ref# _____). Clinical documentation sent {date}. Decision expected in _____ days.'],
  ['Peer-to-peer scheduled', 'Peer-to-peer with {payer} medical director scheduled for _____ for {claim}. Provider notified; case summary prepared.'],
  ['Records requested from practice', 'Requested records for {claim} from practice ({date}) — documents needed: _____. Will resubmit on receipt.'],
  ['Appeal level 1 filed', 'Level-1 appeal filed for {claim} ({balance}) on {date} via _____ (ref/tracking# _____). Appeal deadline: _____. Follow up in 30 days.'],
  ['Appeal upheld – escalate', '{payer} upheld denial on {claim}. Reviewing level-2 / external review options with supervisor. Deadline: _____.'],
  ['Underpayment dispute', '{claim} paid {balance} below contracted allowable. Fee schedule rate _____ vs paid _____. Underpayment dispute submitted ({date}), ref# _____.'],
  ['Refund / overpayment identified', 'Overpayment identified on {claim}. Refund request/credit balance reviewed with practice on {date}; payer notified per 60-day rule.'],
  ['Timely filing proof sent', 'Proof of timely filing (clearinghouse acceptance {date}) submitted to {payer} for {claim} with appeal. Ref# _____.'],
  ['Corrected claim – modifier fix', 'Corrected claim sent for {claim}: modifier _____ added/removed per documentation. Resubmitted {date}; expect response in 30 days.'],
  ['Patient contacted – balance', 'Contacted patient re {claim} on {date}. Discussed EOB/balance {balance}; outcome: _____. Payment plan: _____.'],
  ['Escalated to supervisor', 'Escalated {claim} to supervisor on {date}: reason _____. Ageing {balance}, payer unresponsive after _____ attempts.'],
  ['Write-off approval request', 'Requesting write-off approval for {claim} ({balance}) — reason: _____; timely-filing/appeal options exhausted; supporting notes linked.'],
  ['Bulk issue logged', 'Pattern identified on {payer}: _____. Affects _____ claims / $_____. Logged to payer escalation for provider-rep follow-up.'],
];

const L = (title: string, body: string): [string, string] => [title, body];
export const EXTRA_LETTERS: [string, string][] = [
  L('Appeal — authorization / retro-authorization', 'Date: {date}\n\nTo: {payer} Appeals Department\nRe: Claim {claim} — Patient {patient} — DOS {dos} — CPT {cpt}\n\nDear Appeals Reviewer,\n\nWe are appealing the denial ({codes}) of the above claim, billed at {billed} (outstanding {balance}), for lack of authorization.\n\nThe service was medically necessary and rendered by {provider} of {practice}. [Explain: urgent/emergent circumstances, authorization requested on ____ (ref ____), or payer-side authorization error.] Enclosed are the clinical documentation, the authorization request/confirmation, and the payer’s denial.\n\nWe request retro-authorization and reprocessing of the claim for payment.\n\nSincerely,\n{user}\n{practice}'),
  L('Appeal — coding / modifier correction', 'Date: {date}\n\nTo: {payer} Claims Review\nRe: Claim {claim} — Patient {patient} — DOS {dos} — CPT {cpt}\n\nDear Reviewer,\n\nThe claim was denied ({codes}) for a coding/modifier inconsistency. The documentation supports the services as billed: [cite note section/procedure details]. Modifier ____ is appropriate because ____.\n\nEnclosed: operative/clinical note, corrected claim (if applicable), and payer policy citation. Please reprocess for payment of {balance}.\n\nSincerely,\n{user}\n{practice}'),
  L('Appeal — eligibility / coverage dispute', 'Date: {date}\n\nTo: {payer} Provider Appeals\nRe: Claim {claim} — Patient {patient} — DOS {dos}\n\nDear Appeals Reviewer,\n\nThis claim was denied as {reason}. Eligibility was verified on ____ (ref # ____) showing active coverage on the date of service under member ID ____. Enclosed: eligibility response, insurance card copy and payer correspondence.\n\nPlease reverse the denial and process the claim for payment of {balance}.\n\nSincerely,\n{user}\n{practice}'),
  L('Appeal — duplicate claim denial', 'Date: {date}\n\nTo: {payer} Claims Department\nRe: Claim {claim} — Patient {patient} — DOS {dos}\n\nDear Reviewer,\n\nThe claim was denied as a duplicate of ICN ____. The original claim was ____ [denied/not adjudicated/for different services]. This submission is distinct because ____ (different CPT/modifier/date of service/units).\n\nEnclosed: both claim copies and the remittance. Please reprocess for payment of {balance}.\n\nSincerely,\n{user}\n{practice}'),
  L('Underpayment dispute', 'Date: {date}\n\nTo: {payer} Provider Services — Contract Compliance\nRe: Underpayment — Claim {claim} — Patient {patient} — DOS {dos} — CPT {cpt}\n\nDear Representative,\n\nThe above claim was paid below the contracted rate. Contracted allowable: ____ per fee schedule effective ____; amount paid: ____; variance: ____.\n\nEnclosed: fee schedule excerpt, remittance (ERA/EOB) and claim copy. Please reprocess and remit the balance of {balance} with applicable prompt-pay interest.\n\nSincerely,\n{user}\n{practice}'),
  L('Request for claim status / escalation to provider rep', 'Date: {date}\n\nTo: {payer} Provider Relations\nRe: Escalation — Claim {claim} — Patient {patient} — DOS {dos}\n\nDear Provider Representative,\n\nThis claim (billed {billed}) has been pending beyond the payer’s prompt-pay period. Prior contacts: ____ (dates/ref#). We request research and a resolution date. Please confirm the claim’s current status and any information needed from us.\n\nThank you,\n{user}\n{practice}'),
  L('Overpayment / refund notice response', 'Date: {date}\n\nTo: {payer} Recovery Department\nRe: Overpayment notice — Claim {claim} — Patient {patient} — DOS {dos}\n\nWe received your request regarding the above claim. After review, we [agree / disagree] with the overpayment finding because ____. [If disagree: enclosed documentation.] [If agree: refund of ____ will be issued on ____ / please offset against future payments.]\n\nSincerely,\n{user}\n{practice}'),
  L('Patient letter — insurance information needed', 'Date: {date}\n\nDear {patient},\n\nYour insurer has not been able to process the claim for your visit on {dos} at {practice} because they need additional information. Please call us at your earliest convenience (or update your coverage information) so we can complete the claim and avoid delays or a balance billed to you.\n\nThank you,\n{practice} billing team'),
];

export interface Article { id: string; section: 'SOP' | 'Checklist' | 'KPI' | 'Escalation' | 'Client comms'; title: string; summary: string; body: string; tags?: string; builtin?: boolean }
export const ARTICLE_SECTIONS: Article['section'][] = ['SOP', 'Checklist', 'KPI', 'Escalation', 'Client comms'];
// Body format: one line per item. "# " = sub-heading, "- " = bullet, "1." = numbered step, "| a | b |" = table row, everything else = paragraph.
export const RCM_ARTICLES: Article[] = [
  { id: 'sop-ar-touch', section: 'SOP', title: 'Working an A/R claim — the 8-step touch', summary: 'The standard every touch is scored against in QA.', tags: 'touch qa standard', body: `1. Open the claim; read the last 3 notes and the current status before doing anything.
2. Check the remit/EOB (CARC + RARC) and the PMS status — decide the root cause from evidence, not from the payer rep’s first sentence.
3. Verify timely filing and appeal deadlines from the DOS / denial date (Knowledge → Deadlines). If less than 30 days remain, escalate priority.
4. Choose the most collectible next step: reprocess request, corrected claim, records, appeal, patient transfer or adjust — in that order of preference.
5. Do the action (call / portal / resubmit). Capture the call reference #, rep name and date/time.
6. Record the touch: root cause + detail, end action + sub-category, and a note that someone else could act on without opening the claim.
7. Set the follow-up date to the payer’s turnaround (not a default), and make sure the workflow status reflects the state.
8. If a balance cannot be recovered, request an adjustment with the evidence — never adjust without approval.` },
  { id: 'sop-call', section: 'SOP', title: 'Payer call script & documentation', summary: 'Before, during and after a payer call.', tags: 'call ivr reference', body: `# Before you dial
- Have ready: NPI/TIN, patient name/DOB/member ID, claim #, DOS, CPT, billed amount, denial codes.
- Check the payer directory for the right IVR path and provider-services number.
# During the call
1. Verify the claim is on file; ask for status, paid/allowed amounts, denial reason and the ICN.
2. Ask what exactly will resolve it (reprocess / corrected claim / appeal / records) and the turnaround time.
3. Ask whether the rep can reprocess now; if yes, get the reference # and the expected date.
4. Ask for the appeal address/fax/portal and the filing deadline.
# After the call
- Log: rep name, ref #, date/time, what was promised, next step and follow-up date.
- If the rep is wrong or unclear, call again — do not close on an unverified promise.` },
  { id: 'sop-appeal', section: 'SOP', title: 'Appeal workflow (level 1 → external review)', summary: 'How to build and track a winning appeal.', tags: 'appeal denial', body: `1. Confirm the denial is appealable and the deadline (typically 60–180 days from the denial/EOB; verify per payer).
2. Gather: denial letter/EOB, claim copy, clinical records, the payer’s policy citation, proof of timely filing, prior correspondence.
3. Write the appeal using the Letters library: state the claim identifiers, the reason for denial, why it is wrong (policy + evidence), and the exact remedy requested.
4. Submit through the payer’s required channel (portal preferred — saves confirmation #) and log the tracking #.
5. Follow up at 30 days; at 45 days escalate to the provider rep. Typical decision windows are 30–60 days.
6. If upheld: assess level 2 / external review value vs cost; document the decision and get supervisor approval before writing off.
# Tips
- One appeal per issue; attach only the relevant pages and highlight the key sentences.
- Peer-to-peer is often faster than paper for medical-necessity denials.` },
  { id: 'sop-adjust', section: 'SOP', title: 'Adjustment & write-off policy', summary: 'When it is acceptable to give up a balance — and who must approve.', tags: 'adjustment write-off approval', body: `- Only adjust when: contractual obligation, timely filing missed beyond appeal rights, exhausted appeals, patient-liability transfer, or duplicate/erroneous charge.
- Never adjust to “clean up” aging; the reason must be one of the above and documented.
- Approval ladder (default — set by the client contract): ≤ $100 specialist; ≤ $500 supervisor; > $500 or any timely-filing write-off requires client approval.
- Timely-filing write-offs need: proof of the original submission attempt(s), payer denial and appeal result.
- Every adjustment is audited and counts as a QA force-review item.` },
  { id: 'chk-new-denial', section: 'Checklist', title: 'New denial triage checklist (5 minutes)', summary: 'Decide the path before touching the claim.', tags: 'denial triage', body: `- Is the patient/payer/DOS correct? (demographics, COB, eligibility)
- Is the code combination valid? (CPT–ICD, modifier, units, age/sex edits)
- Was authorization/referral required and on file?
- Is the service covered under this plan/contract?
- Was the claim timely, and do I have proof?
- Was documentation requested or required?
- Is this an isolated claim or a payer pattern (same code on 3+ claims)?
- What is the appeal deadline and who needs to approve?` },
  { id: 'chk-handoff', section: 'Checklist', title: 'End-of-day handoff checklist', summary: 'Keep the queue clean for tomorrow.', tags: 'daily handoff', body: `- All touches logged with a follow-up date (no blanks).
- Promised callbacks and escalations noted and assigned.
- No claim left “In Progress” without a note in the last 7 days.
- Pending adjustments submitted for approval.
- High-dollar claims (> client threshold) reviewed or escalated.
- Anything blocked by the client is raised as a Client Request.` },
  { id: 'chk-client-onboard', section: 'Checklist', title: 'New client onboarding checklist', summary: 'Everything to configure before the first aging import.', tags: 'onboarding client', body: `- Create the client; set aging basis (DOS vs last billed) and timely-filing days.
- Add providers (rendering + billing NPIs) and the specialty’s visit types.
- Map the PMS aging export with an Import template; run a test import on a copy.
- Confirm payer list, appeal addresses and contract fee schedules.
- Agree write-off thresholds and the approval contact.
- Set the weekly report schedule and portal users (view-only).
- Run the first import, review exceptions and assign the A/R.` },
  { id: 'kpi-benchmarks', section: 'KPI', title: 'RCM KPI benchmarks & definitions', summary: 'What good looks like for outsourced A/R management.', tags: 'kpi benchmark days ar denial', body: `| KPI | Definition | Healthy target | Warning |
| Days in A/R | Total A/R ÷ average daily charges (trailing 90 days) | 30–40 days | > 50 |
| A/R > 90 days | A/R older than 90 days ÷ total A/R | < 20% | > 30% |
| A/R > 120 days | A/R older than 120 days ÷ total A/R | < 12% | > 20% |
| First-pass resolution | Clean claims paid on first submission ÷ claims submitted | > 90% | < 80% |
| Initial denial rate | Denied claims ÷ claims submitted | < 5–8% | > 10% |
| Net collection rate | Payments ÷ (charges − contractual adjustments) | > 95% | < 90% |
| Appeal success rate | Appeals overturned ÷ appeals filed | > 50% | < 30% |
| Cost to collect | RCM cost ÷ total collections | 3–6% | > 8% |
| Touches per resolved claim | Average work touches before payment | < 3 | > 5 |
| QA score | Average scorecard result | ≥ 90% | < 85% |` },
  { id: 'kpi-productivity', section: 'KPI', title: 'Analyst productivity standards', summary: 'Starting points — tune to your claim mix.', tags: 'productivity touches target', body: `- Typical specialist: 35–50 touches/day (mix of portal checks, calls, resubmissions).
- Call-heavy queues: 20–30 touches/day; portal/EDI queues: 50–80.
- Rework (repeat touches on the same claim inside 14 days) above 35% signals poor next-step choices.
- Recoveries are attributed to the last qualifying touch; use dollars worked as a context metric, not a quota.
- Combine volume, QA quality and rework into one composite (QA settings → Performance mix).` },
  { id: 'esc-ladder', section: 'Escalation', title: 'Payer escalation ladder', summary: 'Who to go to when a claim is stuck.', tags: 'escalation payer provider rep', body: `1. Day 0–30: portal/IVR status, request reprocess.
2. Day 30–45 with no movement: call a live rep, get a reference #, ask for the claims supervisor.
3. Day 45–60: written escalation to the payer’s provider representative (Letters → escalation).
4. Day 60+: supervisor + client involvement; consider state prompt-payment complaint or the Department of Insurance for fully insured plans (verify the rules for self-funded/ERISA plans).
5. Pattern (≥ 3 claims, same issue): log a bulk escalation with a claim list and dollars at stake.
# Internal
- Specialist → Supervisor: any claim over the client’s high-dollar threshold, or untouched for 14 days.
- Supervisor → Client: write-offs over threshold, credentialing blockers, suspected billing-process errors.` },
  { id: 'esc-timely', section: 'Escalation', title: 'Timely filing & appeal deadline escalation', summary: 'Rules of thumb that protect revenue.', tags: 'timely filing deadline', body: `- Under 60 days left: flag Critical; work today.
- Under 30 days: supervisor review + proof-of-timely-filing hunt (clearinghouse reports, rejections, prior EOBs).
- Deadline passed: appeal with proof; if none, escalate for a root-cause review before any write-off.
- Typical limits: Medicare 12 months from DOS; many commercial plans 90–180 days; Medicaid varies by state (verify); corrected-claim and appeal windows are shorter than original filing.` },
  { id: 'cc-weekly', section: 'Client comms', title: 'Weekly client update — what to say', summary: 'Structure for the weekly report email.', tags: 'client report weekly', body: `1. Headline: A/R total, change vs last week, and % over 90 days.
2. What we recovered (payments + adjustments) and the largest wins.
3. Top 3 denial reasons and what the practice can fix upstream.
4. Items needing the client: documents, credentialing, approvals — with due dates.
5. Next week’s focus (oldest high-dollar claims, payer escalations).` },
  { id: 'cc-denial-prevent', section: 'Client comms', title: 'Denial prevention feedback to the front office', summary: 'Turn A/R findings into upstream fixes.', tags: 'prevention front desk', body: `- Eligibility & COB: verify at scheduling and check-in; capture secondary and subscriber details.
- Authorization: build an auth-required CPT list per payer and check before scheduling.
- Coding: add the modifier/NDC/diagnosis edits you see weekly to the charge-entry rules.
- Documentation: for medical-necessity payers, make sure the note states severity, failed conservative care and plan.
- Timely: submit within 2 business days of the visit; check clearinghouse rejections daily.` },
];
