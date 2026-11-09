// Work-bucket families (Taxonomy v2 §4): *why* a claim is stuck, derived from the RCA / end action. Orthogonal to age buckets,
// payer-lifecycle queues (stages) and the native lifecycle status.
import type { Claim } from '../types';
export interface Family { name: string; color: string; hint: string }
export const FAMILIES: Family[] = [
  { name: 'Unworked / New', color: '#64748b', hint: 'No reviewed work event' },
  { name: 'No Claim on File', color: '#f97316', hint: 'Payer no-claim confirmation' },
  { name: 'Payer In Process', color: '#06b6d4', hint: 'Submitted and pending' },
  { name: 'Eligibility / COB', color: '#0ea5e9', hint: 'Coverage / member mismatch' },
  { name: 'Authorization / Referral', color: '#8b5cf6', hint: 'Auth or referral resolution' },
  { name: 'Coding / Bundling', color: '#d946ef', hint: 'CPT, modifier or edit issue' },
  { name: 'Medical Records / OP Notes', color: '#fb923c', hint: 'Documentation dependency' },
  { name: 'Appeals / Reconsiderations', color: '#7c3aed', hint: 'Appeal active, proof tracked' },
  { name: 'Provider / Credentialing', color: '#a855f7', hint: 'Enrollment / NPI / non-par' },
  { name: 'Payment / Posting / Recoupment', color: '#22c55e', hint: 'Payments and adjustments to reconcile' },
  { name: 'Patient Balance', color: '#84cc16', hint: 'Verified patient responsibility' },
  { name: 'Client / Front Office Hold', color: '#eab308', hint: 'External dependency' },
  { name: 'TFL / Write-off Review', color: '#be123c', hint: 'Deadline and approval management' },
];
export const familyOf = (c: Claim): string => {
  const ea = (c.end_action || '').toLowerCase(), rca = (c.rca || '').toLowerCase(), det = (c.rca_detail || '').toLowerCase();
  if (c.custom?.snooze_until && c.custom?.snooze_reason && /client|office|front/i.test(String(c.custom.snooze_reason))) return 'Client / Front Office Hold';
  if (ea.includes('appeal')) return 'Appeals / Reconsiderations';
  if (!c.touch_count && !rca && !ea) return 'Unworked / New';
  if (rca === 'timely filing' || ea.startsWith('adjustments') || ea.includes('adjustment approval')) return 'TFL / Write-off Review';
  if (det.includes('no claim on file')) return 'No Claim on File';
  if (ea.includes('credential') || rca.includes('npi') || rca.includes('credential')) return 'Provider / Credentialing';
  if (ea.includes('cash posting') || rca === 'paid according to contract') return 'Payment / Posting / Recoupment';
  if (rca === 'patient responsibility' || rca === 'billed to patient' || ea === 'billed to patient') return 'Patient Balance';
  if (rca === 'authorization' || rca === 'no referral') return 'Authorization / Referral';
  if (rca === 'coding' || rca.startsWith('bundling') || ea.includes('coding')) return 'Coding / Bundling';
  if (rca === 'additional information requested' || ea.includes('op notes') || ea.startsWith('documentation')) return 'Medical Records / OP Notes';
  if (rca === 'eligibility or benefits' || rca === 'demographics issue') return 'Eligibility / COB';
  return 'Payer In Process';
};
export const familyColor = (n: string) => FAMILIES.find((f) => f.name === n)?.color || '#64748b';
