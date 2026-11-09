import type { Claim } from '../types';
import { looseFingerprint, normClaimNo } from './normalize';
import type { Row } from './rows';
import type { ImportSettings } from './settings';

export type MatchKind = 'key' | 'alias' | 'fingerprint' | 'new';
export interface Cand { claim: Claim; confidence: 'high' | 'low'; reason: string }
export interface MatchResult { row: Row; kind: MatchKind; claim?: Claim; ask: boolean; candidates: Cand[]; possibleDup: boolean; why: string; /** claim # was reused for a different patient/DOS: sequence suffix for the separate claim */ reuse?: number }
export type Decisions = Record<number, { action: 'link'; claimId: string } | { action: 'new' }>;

export const keyOf = (c: Pick<Claim, 'claim_key' | 'claim_no'>, s?: Pick<ImportSettings, 'stripPrefix'>) => c.claim_key || normClaimNo(c.claim_no, { stripPrefix: s?.stripPrefix }).key;

/** the PMS recycled a claim number for a different patient/visit — only when BOTH the date of service and the patient differ */
const tokens = (n: string | null | undefined) => (n || '').toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 1).sort().join(' ');
export function sameEncounter(r: Pick<Row, 'dos' | 'patient_name'>, c: Pick<Claim, 'dos' | 'patient_name'>): boolean {
  if (!r.dos || !c.dos || r.dos === c.dos) return true; const a = tokens(r.patient_name), b = tokens(c.patient_name); if (!a || !b) return true; return a === b;
}
export const baseKey = (k: string) => k.replace(/~\d+$/, '');

export interface Index { byBase: Map<string, Claim[]>; byKey: Map<string, Claim>; byAlias: Map<string, Claim>; byFp: Map<string, Claim[]>; byLoose: Map<string, Claim[]> }
export function buildIndex(existing: Claim[], s: Pick<ImportSettings, 'stripPrefix' | 'granularity'>): Index {
  const byBase = new Map<string, Claim[]>(); const byKey = new Map<string, Claim>(), byAlias = new Map<string, Claim>(), byFp = new Map<string, Claim[]>(), byLoose = new Map<string, Claim[]>();
  const push = (m: Map<string, Claim[]>, k: string, c: Claim) => { if (k) m.set(k, [...(m.get(k) || []), c]); };
  for (const c of existing) {
    const k = keyOf(c, s); if (k && !byKey.has(k)) byKey.set(k, c); if (k) { const b = baseKey(k); const l = byBase.get(b); if (l) l.push(c); else byBase.set(b, [c]); }
    for (const a of c.aliases || []) if (a && !byAlias.has(a)) byAlias.set(a, c);
    push(byFp, c.fingerprint || '', c); push(byLoose, looseFingerprint(c), c);
  }
  return { byBase, byKey, byAlias, byFp, byLoose };
}

/**
 * Identity cascade (strongest → weakest):
 *  1. normalised claim key   2. known alias (old / merged numbers)
 *  3. fingerprint (patient+DOS+CPT+billed) for a row whose key is unknown → PMS re-numbered the claim
 *  4. otherwise a new claim; a same-patient-same-DOS neighbour is only flagged, never auto-linked.
 * Direct matches are resolved first so a fingerprint can never steal a claim another row legitimately owns.
 */
export function matchRows(rows: Row[], idx: Index, s: ImportSettings, decisions: Decisions = {}): MatchResult[] {
  const out = new Map<number, MatchResult>(); const claimed = new Map<string, number>();
  const take = (c: Claim, n: number) => claimed.set(c.id, n);
  for (const r of rows) {
    const same = idx.byBase.get(r.key) || []; const k = same.find((c) => !claimed.has(c.id) && sameEncounter(r, c)); const a = !k && !same.length ? idx.byAlias.get(r.key) : undefined; const hit = k || a;
    if (hit && !claimed.has(hit.id)) { take(hit, r.n); out.set(r.n, { row: r, kind: k ? 'key' : 'alias', claim: hit, ask: false, candidates: [], possibleDup: false, why: k ? 'claim number match' : 'matched an earlier/merged claim number' }); }
    else if (same.length && !k && !same.some((c) => claimed.has(c.id) && sameEncounter(r, c))) out.set(r.n, { row: r, kind: 'new', ask: false, candidates: [], possibleDup: false, reuse: same.length + 1, why: `claim # ${r.claim_no ?? r.key} already belongs to a different patient/DOS — kept as a separate claim` });
  }
  const pending = rows.filter((r) => !out.has(r.n));
  const strongBy = new Map<string, Row[]>(); pending.forEach((r) => r.fp && strongBy.set(r.fp, [...(strongBy.get(r.fp) || []), r]));
  for (const r of pending) {
    const dec = decisions[r.n];
    const strongAll = r.fp ? idx.byFp.get(r.fp) || [] : [];
    const strong = strongAll.filter((c) => !claimed.has(c.id));
    const looseK = looseFingerprint({ patient_name: r.patient_name, dos: r.dos });
    const loose = looseK ? (idx.byLoose.get(looseK) || []).filter((c) => !claimed.has(c.id) && !strong.includes(c)) : [];
    const cands: Cand[] = [...strong.map((c) => ({ claim: c, confidence: 'high' as const, reason: 'same patient, DOS, CPT and charge under a different claim number' })), ...loose.map((c) => ({ claim: c, confidence: 'low' as const, reason: 'same patient and DOS, different charge' }))];
    if (dec) {
      if (dec.action === 'link') { const c = cands.find((x) => x.claim.id === dec.claimId)?.claim || strong.find((x) => x.id === dec.claimId) || loose.find((x) => x.id === dec.claimId); if (c && !claimed.has(c.id)) { take(c, r.n); out.set(r.n, { row: r, kind: 'fingerprint', claim: c, ask: false, candidates: cands, possibleDup: false, why: 'linked by reviewer' }); continue; } }
      out.set(r.n, { row: r, kind: 'new', ask: false, candidates: cands, possibleDup: false, why: 'new claim (reviewer choice)' }); continue;
    }
    const contested = r.fp ? (strongBy.get(r.fp) || []).length > 1 : false;
    if (strong.length === 1 && !contested && s.identity !== 'strict') {
      if (s.identity === 'auto') { take(strong[0], r.n); out.set(r.n, { row: r, kind: 'fingerprint', claim: strong[0], ask: false, candidates: cands, possibleDup: false, why: 'claim re-numbered: identical patient, DOS, CPT and charge' }); }
      else out.set(r.n, { row: r, kind: 'new', ask: true, candidates: cands, possibleDup: false, why: 'looks like a re-numbered claim — confirm' });
      continue;
    }
    if (strong.length > 1 || contested) { out.set(r.n, { row: r, kind: 'new', ask: s.identity !== 'strict', candidates: cands, possibleDup: true, why: 'several identical charges — cannot tell which is which' }); continue; }
    if (loose.length && s.identity === 'ask') { out.set(r.n, { row: r, kind: 'new', ask: true, candidates: cands, possibleDup: true, why: 'same patient & DOS as an existing claim' }); continue; }
    out.set(r.n, { row: r, kind: 'new', ask: false, candidates: cands, possibleDup: loose.length > 0 || strongAll.length > 0, why: strongAll.length ? 'identical charge exists under another claim number' : 'no existing claim matches' });
  }
  return rows.map((r) => out.get(r.n)!);
}
