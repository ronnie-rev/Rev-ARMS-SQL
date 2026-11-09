// Policy / portal link resolution. Everything is configurable (Admin → Payers & Library); nothing here is hard-wired to a payer.
export interface LinkItem { label: string; url: string; kind: 'portal' | 'policy' | 'tool' | 'form' | 'reference' | 'search'; note?: string; source: 'payer' | 'library' | 'smart' }
export interface Resource { id: string; value: string; meta: { url?: string; kind?: LinkItem['kind']; payers?: string; tags?: string; note?: string } }
export interface PayerMeta { portal?: string; phone?: string; links?: { label: string; url: string; kind?: LinkItem['kind'] }[]; policy_domain?: string; appeal_days?: number; tf_days?: number; tips?: string; payer_id?: string; appeals_address?: string; claims_address?: string; aliases?: string }

const q = (s: string) => encodeURIComponent(s);
const host = (u?: string) => { try { return u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch { return ''; } };
export const safeUrl = (u?: string) => !!u && /^https?:\/\//i.test(u.trim());

/** All links relevant to this claim: the payer's own configured links, library resources scoped to the payer (or global), and smart searches built from the claim's codes. */
export function resolveLinks(payer: string | null | undefined, meta: PayerMeta | undefined, library: Resource[], ctx: { cpt?: string | null; codes?: string | null; rcaDetail?: string | null }): LinkItem[] {
  const out: LinkItem[] = [];
  if (safeUrl(meta?.portal)) out.push({ label: `${payer} provider portal`, url: meta!.portal!, kind: 'portal', source: 'payer' });
  (meta?.links || []).filter((l) => safeUrl(l.url)).forEach((l) => out.push({ label: l.label, url: l.url, kind: l.kind || 'reference', source: 'payer' }));
  const p = (payer || '').toLowerCase();
  library.forEach((r) => { if (!safeUrl(r.meta.url)) return; const scope = (r.meta.payers || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean); if (scope.length && !scope.some((s) => p.includes(s) || s.includes(p))) return; out.push({ label: r.value, url: r.meta.url!.trim(), kind: r.meta.kind || 'reference', note: r.meta.note, source: 'library' }); });
  const dom = meta?.policy_domain || host(meta?.portal);
  const cpt = (ctx.cpt || '').split(/[,;\s/|]+/).filter(Boolean)[0];
  if (dom && cpt) out.push({ label: `${payer} policy for CPT ${cpt}`, url: `https://www.google.com/search?q=${q(`site:${dom} ${cpt} policy`)}`, kind: 'search', source: 'smart', note: 'Searches the payer’s own site' });
  if (dom && ctx.rcaDetail) out.push({ label: `${payer}: “${ctx.rcaDetail}” guidance`, url: `https://www.google.com/search?q=${q(`site:${dom} ${ctx.rcaDetail}`)}`, kind: 'search', source: 'smart' });
  if (cpt) out.push({ label: `Code lookup: ${cpt}`, url: `https://www.google.com/search?q=${q(`CPT ${cpt} code description modifiers NCCI`)}`, kind: 'search', source: 'smart' });
  const code = (ctx.codes || '').split(/[,;\s|]+/).filter(Boolean)[0];
  if (code) out.push({ label: `Denial code ${code} — meaning & next steps`, url: `https://www.google.com/search?q=${q(`${code} claim adjustment reason code meaning how to appeal`)}`, kind: 'search', source: 'smart' });
  const seen = new Set<string>(); return out.filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)));
}

/** Starter library — public reference sites. Seeded once; fully editable. Verify each link for your environment. */
export const STARTER_RESOURCES: { value: string; url: string; kind: LinkItem['kind']; note: string }[] = [
  { value: 'CMS NCCI edits (Medicare bundling)', url: 'https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits', kind: 'reference', note: 'Procedure-to-procedure and MUE edits for bundling denials (CO-97).' },
  { value: 'CMS Medicare Coverage Database (LCD/NCD)', url: 'https://www.cms.gov/medicare-coverage-database/search.aspx', kind: 'policy', note: 'Medical-necessity policy for CO-50 / CO-151 appeals.' },
  { value: 'X12 claim adjustment reason codes (CARC)', url: 'https://x12.org/codes/claim-adjustment-reason-codes', kind: 'reference', note: 'Official code list.' },
  { value: 'X12 remittance advice remark codes (RARC)', url: 'https://x12.org/codes/remittance-advice-remark-codes', kind: 'reference', note: 'Pairs with CARC to explain denials.' },
  { value: 'NPI Registry', url: 'https://npiregistry.cms.hhs.gov/', kind: 'tool', note: 'Verify provider NPI / taxonomy (NPI mismatch denials).' },
  { value: 'CMS Physician Fee Schedule lookup', url: 'https://www.cms.gov/medicare/payment/fee-schedules/physician', kind: 'reference', note: 'Check allowed amounts for underpayment review.' },
  { value: 'ICD-10-CM browser (CDC)', url: 'https://icd10cmtool.cdc.gov/', kind: 'tool', note: 'Validate diagnosis codes.' },
  { value: 'NUCC taxonomy & claim form instructions', url: 'https://www.nucc.org/', kind: 'reference', note: 'CMS-1500 field guidance.' },
  { value: 'Availity (multi-payer portal)', url: 'https://www.availity.com/', kind: 'portal', note: 'Claim status / eligibility for many commercial payers.' },
  { value: 'Medicare timely filing rule (12 months)', url: 'https://www.cms.gov/medicare/payment/fee-for-service-providers/claims-processing', kind: 'policy', note: 'Reference for Medicare timely filing and appeals.' },
];
