// Visit type, provider roles, tags and encounter grouping (Functional Design v2 §1, §4, Taxonomy §5).
import type { Claim } from '../types';

export const VISIT_TYPES = ['Surgery', 'Office Visit', 'Procedure / Diagnostics', 'Behavioral Health', 'Therapy / Treatment', 'Preventive / Wellness', 'Inpatient / Facility', 'Other', 'Unknown'] as const;
export type VisitType = (typeof VISIT_TYPES)[number];
export const PROVIDER_ROLES = ['Main Surgeon', 'Assistant Surgeon', 'PA / NP', 'Co-Surgeon', 'Rendering', 'Billing'] as const;

const num = (cpt: string | null) => { const m = (cpt || '').match(/\b(\d{5})\b/); return m ? Number(m[1]) : null; };
/** Conservative CPT-based suggestion. Returns 'Unknown' when it cannot tell — that triggers triage, never a guess. */
export function inferVisitType(cpt: string | null): VisitType {
  const n = num(cpt); if (n == null) return 'Unknown';
  if (n >= 99381 && n <= 99397) return 'Preventive / Wellness';
  if (n >= 99221 && n <= 99239) return 'Inpatient / Facility';
  if ((n >= 99202 && n <= 99215) || (n >= 99241 && n <= 99245) || (n >= 99211 && n <= 99215)) return 'Office Visit';
  if (n >= 90785 && n <= 90899) return 'Behavioral Health';
  if (n >= 97010 && n <= 97799) return 'Therapy / Treatment';
  if (n >= 70000 && n <= 89999) return 'Procedure / Diagnostics';
  if (n >= 10004 && n <= 69990) return 'Surgery';
  return 'Unknown';
}
const ALIAS: [RegExp, VisitType][] = [[/surg|operat|\bor\b/i, 'Surgery'], [/office|\bov\b|clinic|e\/?m\b/i, 'Office Visit'], [/diagnos|procedure|radiol|imaging|lab/i, 'Procedure / Diagnostics'], [/behav|psych|mental/i, 'Behavioral Health'], [/therap|treat|\bpt\b|\bot\b/i, 'Therapy / Treatment'], [/prevent|well|physical/i, 'Preventive / Wellness'], [/inpat|facility|hospital|\bip\b/i, 'Inpatient / Facility'], [/unknown|^$/i, 'Unknown'], [/other/i, 'Other']];
export function normalizeVisitType(v: string | null | undefined): VisitType | null {
  const s = (v || '').trim(); if (!s) return null;
  const exact = VISIT_TYPES.find((x) => x.toLowerCase() === s.toLowerCase()); if (exact) return exact;
  return ALIAS.find(([re]) => re.test(s))?.[1] ?? 'Other';
}
export const visitTypeOf = (c: Claim): VisitType => normalizeVisitType(c.custom?.visit_type) ?? 'Unknown';
export const needsVisitTriage = (c: Claim) => visitTypeOf(c) === 'Unknown';

export interface ProviderRole { role: string; provider: string; npi?: string }
export const rolesOf = (c: Claim): ProviderRole[] => (Array.isArray(c.custom?.roles) ? c.custom.roles : []);

/** Encounter grouping: one visit can yield several claims (pro/facility, surgeon/assistant, primary/secondary). Derived, never merged. */
export const encounterKey = (c: Claim): string | null => (c.account_id && c.dos ? `${c.client_id}|${c.account_id.toUpperCase()}|${c.dos}` : null);
export function linkedClaims(c: Claim, all: Claim[]): Claim[] { const k = encounterKey(c); return k ? all.filter((x) => x.id !== c.id && encounterKey(x) === k) : []; }

// Tags: NAMESPACE:VALUE canonical ids; never contain PHI. Manual tags live in custom.tags; the rest are computed.
export const TAG_NS = ['VISIT', 'ROLE', 'DOC', 'RISK', 'PAYER', 'FIN', 'SOURCE', 'CLIENT'] as const;
const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
export const isValidTag = (t: string) => /^[A-Z]+:[A-Z0-9_]+$/.test(t) && (TAG_NS as readonly string[]).includes(t.split(':')[0]);
export function autoTags(c: Claim, o: { tfLeft: number | null; clientCode?: string | null; pms?: string | null; highBalance?: number }): string[] {
  const t = new Set<string>(); const v = visitTypeOf(c);
  t.add('VISIT:' + slug(v)); if (c.payer) t.add('PAYER:' + slug(c.payer).slice(0, 24)); if (o.pms) t.add('SOURCE:' + slug(o.pms)); if (o.clientCode) t.add('CLIENT:' + slug(o.clientCode));
  for (const r of rolesOf(c)) t.add('ROLE:' + slug(r.role));
  if (o.tfLeft != null && o.tfLeft <= 30) t.add('RISK:TFL_NEAR'); if (c.balance >= (o.highBalance ?? 2500)) t.add('FIN:HIGH_BALANCE');
  if (/op notes?/i.test(`${c.end_action} ${c.rca_detail}`)) t.add('DOC:OP_NOTE_PENDING');
  for (const m of (c.custom?.tags as string[]) || []) if (isValidTag(m)) t.add(m);
  return [...t].sort();
}
