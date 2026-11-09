// Claim search (MiniSearch, MIT, pinned): prefix + typo-tolerant matching over identifiers, payer, CPT and denial codes.
// Patient names are indexed ONLY for roles that may see them, so search can never reveal a name the screen would mask.
import MiniSearch from 'minisearch';
import { useMemo } from 'react';
import { useStore } from '../store';
import type { Claim } from '../lib/types';

const norm = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export interface ClaimDoc { id: string; claim_no: string; ids: string; payer: string; codes: string; provider: string; patient: string }
export function buildClaimIndex(claims: Claim[], withPatient: boolean) {
  const ms = new MiniSearch<ClaimDoc>({ fields: ['claim_no', 'ids', 'payer', 'codes', 'provider', 'patient'], storeFields: ['id'], idField: 'id',
    extractField: (d, f) => (d as any)[f], tokenize: (s) => s.split(/[^A-Za-z0-9]+/).filter(Boolean), searchOptions: { boost: { claim_no: 4, ids: 3 }, prefix: true, fuzzy: (term) => (term.length >= 6 ? 0.2 : false), combineWith: 'AND' } });
  ms.addAll(claims.map((c) => ({ id: c.id, claim_no: `${c.claim_no} ${norm(c.claim_no)}`, ids: [c.claim_uid, c.account_id, c.encounter_no, ...(c.aliases || [])].filter(Boolean).map((x) => `${x} ${norm(x)}`).join(' '), payer: c.payer || '', codes: [c.cpt, c.denial_codes].filter(Boolean).join(' '), provider: c.provider || '', patient: withPatient ? c.patient_name || '' : '' })));
  return ms;
}
/** Search hook: the index is built lazily on the first query (never during render) and reused until the claims change. */
export function useClaimSearch() {
  const claims = useStore((s) => s.claims); const canSeeNames = useStore((s) => s.has('view_phi'));
  return useMemo(() => {
    let index: MiniSearch<ClaimDoc> | null = null; let byId: Map<string, Claim> | null = null;
    return { search: (q: string, limit = 8): Claim[] => { const t = q.trim(); if (t.length < 2) return []; if (!index) { index = buildClaimIndex(claims, canSeeNames); byId = new Map(claims.map((c) => [c.id, c])); } return index.search(t).slice(0, limit).map((r) => byId!.get(r.id as string)).filter(Boolean) as Claim[]; } };
  }, [claims, canSeeNames]);
}
