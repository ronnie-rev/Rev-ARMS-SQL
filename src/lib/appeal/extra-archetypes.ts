// Additional professionally-drafted letter shapes for denial categories the original Appeal Forge reference letters did not cover.
// They are appended after the imported shapes, so they are only used where no imported shape applies; managers can still override any of them in Admin → Appeal library.
import type { Archetype } from '../engine/appealforge';

const HEAD = `To Whom It May Concern:

Patient: {{Patient.Name}} (Member ID {{Patient.MemberID}})
Claim #: {{Claim.Number}}  |  CPT {{Claim.CPT}}  |  Date of Service: {{Claim.ServiceDate}}
Rendering Provider: {{Provider.Name}}  |  NPI: {{Provider.NPI}}
Diagnosis Code(s): {{Claim.DiagnosisCodes}}
`;
const CLOSE = `We expect a written determination within the timeframe required by the plan and applicable law. If any portion of this claim remains denied, please identify the specific plan provision, clinical criteria and reviewer credentials relied upon, and the next level of appeal available to us. For questions, contact {{Sender.Name}} at {{Sender.Email}} or {{Sender.Phone}}.`;

export const EXTRA_ARCHETYPES: Archetype[] = [
  { code: 'X-MEDNEC-PEER', name: 'Medical Necessity — Clinical Rebuttal with Peer-to-Peer Request', levelDefault: 'First Level', denialCategories: ['Medical Necessity'],
    summary: 'Rebuts a medical-necessity denial point by point: indication, failed conservative care, guideline support, and a same-specialty peer-to-peer request.',
    body: `${HEAD}
We are appealing the denial of CPT {{Claim.CPT}} performed by {{Provider.Name}} on {{Claim.ServiceDate}}, which {{Payer.Name}} determined was not medically necessary. The service met generally accepted standards of medical practice: it was clinically appropriate for the patient’s condition, consistent with recognized specialty-society guidelines, not primarily for convenience, and the most appropriate level of care.

Clinical summary: [FILL IN: presenting condition, relevant history, examination and imaging/diagnostic findings with dates].

Conservative or alternative treatment: [FILL IN: treatments tried, duration and outcome — or why they were contraindicated].

Supporting guideline or criteria: [FILL IN: specialty-society guideline or payer policy number and the criterion the patient meets].

If the reviewer is unable to reverse the denial on the documentation provided, we request a peer-to-peer discussion with a physician in the same or a similar specialty before the determination is finalized, and a copy of the clinical criteria applied.

We respectfully request that {{Payer.Name}} overturn the denial and reprocess the claim for payment at the contracted rate.

${CLOSE}` },
  { code: 'X-NORESPONSE-INQUIRY', name: 'No Response / Claim Not Adjudicated — Formal Inquiry and Prompt-Pay Demand', levelDefault: 'First Level', denialCategories: ['No Response', 'Claim is in Process'],
    summary: 'Documents the original submission and every follow-up, then asks for adjudication within the prompt-pay period.',
    body: `${HEAD}
This letter is a formal request for adjudication of the above claim. The claim was submitted on [FILL IN: submission date] by [FILL IN: clearinghouse / portal / paper] (confirmation #[FILL IN]) and has not been adjudicated. Our follow-up history is below.

Follow-up history: [FILL IN: date — method — representative name — call/reference number — outcome, one line per contact].

{{Payer.Name}} has had the claim for [FILL IN: number] days. Please process it within the period required by the provider agreement and applicable state prompt-payment requirements, and pay interest where it is owed. If the claim cannot be adjudicated, please state in writing exactly what is missing and the date by which it must be supplied.

We respectfully request that {{Payer.Name}}:
• Confirm receipt of the claim and the original receipt date.
• Adjudicate and issue payment, or state the specific reason payment cannot be issued.
• Treat the original submission date as the date of filing for timely-filing purposes.

${CLOSE}` },
  { code: 'X-NOREFERRAL-RETRO', name: 'Missing Referral — Retroactive Referral and Continuity of Care', levelDefault: 'First Level', denialCategories: ['No Referral'],
    summary: 'Asks the payer to accept a retroactive referral, citing the referring provider’s order and the member’s continuity of care.',
    body: `${HEAD}
We are appealing the denial of this claim for lack of a referral. The service was ordered by [FILL IN: referring provider, NPI] on [FILL IN: date], and the member was seen on {{Claim.ServiceDate}} on the strength of that order. [FILL IN: referral / authorization reference #, if one was issued or requested].

Any gap in the referral record is administrative. The member’s primary-care or referring provider [FILL IN: confirms / has confirmed in the enclosed letter] that the service was requested, and delaying care to obtain paperwork would not have been in the member’s interest.

We respectfully request that {{Payer.Name}}:
• Accept the enclosed referral documentation, or issue a retroactive referral for the date of service.
• Reprocess the claim at the in-network benefit level.
• Confirm in writing that the member will not be balance-billed for the service.

${CLOSE}` },
  { code: 'X-OTHER-GENERAL', name: 'General Formal Appeal — Specific Basis Requested', levelDefault: 'First Level', denialCategories: ['Other'],
    summary: 'A clean general-purpose formal appeal for denials that do not fit another category; asks the payer to state its basis and reconsider.',
    body: `${HEAD}
We are writing to formally appeal the denial of this claim. {{Payer.Name}} denied the claim with the following explanation: {{Claim.DenialReason}}. We believe the claim was submitted correctly and should be paid under the member’s benefits and our agreement with {{Payer.Name}}.

Basis for appeal: [FILL IN: two or three sentences stating the facts that show the denial is incorrect, with dates and document references].

We respectfully request that {{Payer.Name}}:
• Review the enclosed documentation and reverse the denial.
• Reprocess the claim for payment at the contracted rate of {{Claim.ContractedRate}}.
• If any portion remains denied, state the specific basis in writing.

${CLOSE}` },
];
