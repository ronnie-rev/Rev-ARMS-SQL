// Example rows for the "Sample" download of every Admin list. Keys match the editor columns (meta.* paths) so the file round-trips.
type R = Record<string, string>;
export const LIST_SAMPLES: Record<string, R[]> = {
  carc: [{ value: 'CO-29', 'meta.meaning': 'The time limit for filing has expired', 'meta.rca': 'Timely Filing', 'meta.rca_detail': 'Claim Billed Untimely', 'meta.action': 'Gather proof of timely filing and appeal within the window', 'meta.family': 'Timely filing', active: 'yes' }, { value: 'CO-97', 'meta.meaning': 'Payment is included in the allowance for another service', 'meta.rca': 'Bundling or Inclusive Service', 'meta.rca_detail': 'Bundled Service', 'meta.action': 'Check NCCI edits; add modifier 59/XS only if documented', 'meta.family': 'Bundling', active: 'yes' }],
  outcome: [{ value: 'Reprocessing requested', 'meta.id': 'reprocess', 'meta.body': 'Called {payer}; rep confirmed reprocessing. Ref# ____. Follow up {date}.', active: 'yes' }],
  playbook: [{ value: 'Timely filing denial (CO-29)', 'meta.codes': 'CO-29', 'meta.steps': '!Pull proof of timely filing\nAppeal with proof or route to write-off', active: 'yes' }, { value: 'Missing/Invalid Modifier', 'meta.codes': '', 'meta.steps': 'Identify the modifier edit\nConfirm modifier with the provider\nSubmit corrected claim\nFollow up in 30 days', active: 'yes' }],
  kb_article: [{ value: 'Weekly denial review meeting', 'meta.section': 'SOP', 'meta.summary': 'How to run the weekly denial huddle', 'meta.body': '# Agenda\n1. Top 5 denial reasons by dollars\n2. Payer patterns\n- Owners and due dates for each fix', active: 'yes' }],
  letter: [{ value: 'Appeal — custom example', 'meta.body': 'Date: {date}\n\nTo: {payer} Appeals\nRe: Claim {claim} — {patient} — DOS {dos}\n\nWe request reconsideration because ____.\n\n{user}\n{practice}', active: 'yes' }],
  resource: [{ value: 'Availity provider portal', 'meta.url': 'https://www.availity.com', 'meta.kind': 'portal', 'meta.payers': 'Aetna, Cigna', 'meta.note': 'Eligibility, claim status, appeals', active: 'yes' }],
  bucket: [{ value: '0-30', 'meta.min': '0', 'meta.max': '30', color: '#22c55e', active: 'yes' }, { value: '31-60', 'meta.min': '31', 'meta.max': '60', color: '#84cc16', active: 'yes' }],
  stage: [{ value: 'Appeal in progress', 'meta.rule': 'appeal', 'meta.keywords': 'appeal, reconsideration', 'meta.patientAR': 'no', color: '#8b5cf6', active: 'yes' }],
  status: [{ value: 'Waiting on client', 'meta.terminal': 'no', color: '#f59e0b', active: 'yes' }, { value: 'Resolved – Paid', 'meta.terminal': 'yes', color: '#22c55e', active: 'yes' }],
  priority: [{ value: 'Urgent', color: '#ef4444', active: 'yes' }],
  mode: [{ value: 'Portal', active: 'yes' }, { value: 'Call', active: 'yes' }],
  snippet: [{ value: 'Called payer — in process', 'meta.body': 'Called {payer} for {claim}. Claim in process. Ref# ____. Follow up {date}.', active: 'yes' }],
  field: [{ value: 'Referral number', 'meta.type': 'text', 'meta.options': '', active: 'yes' }, { value: 'Visit location', 'meta.type': 'select', 'meta.options': 'Main office, Satellite, Telehealth', active: 'yes' }],
  payer: [{ value: 'Aetna', 'meta.tf_days': '180', 'meta.appeal_days': '60', 'meta.followup_days': '30', 'meta.phone': '1-800-555-0100', 'meta.tips': 'IVR: press 3 for providers, then 2 for claims', active: 'yes' }],
};
export const TREE_SAMPLES: Record<string, R[]> = {
  rca: [{ type: 'parent', parent: '', value: 'Coding', status: '', fu_days: '', terminal: '' }, { type: 'child', parent: 'Coding', value: 'Missing/Invalid Modifier', status: '', fu_days: '', terminal: '' }],
  end_action: [{ type: 'parent', parent: '', value: 'Appeal Filed', status: 'Appealed', fu_days: '30', terminal: 'no' }, { type: 'child', parent: 'Appeal Filed', value: 'Level 1 — portal', status: '', fu_days: '', terminal: '' }],
};
export const CLIENT_SAMPLE: R[] = [{ name: 'Example Orthopedics', code: 'EXO', pms: 'eCW', aging_basis: 'dos', tf_days: '365', active: 'yes' }];
export const USER_SAMPLE: R[] = [{ email: 'new.analyst@example.com', full_name: 'New Analyst', role: 'user_prod', emp_code: 'E301', daily_target: '40', hire_date: '10/15/2026' }];
export const yes = (v: unknown) => /^(y|yes|true|1|x)$/i.test(String(v ?? '').trim());
