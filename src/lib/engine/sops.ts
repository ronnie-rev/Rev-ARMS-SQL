// Client SOPs: "this client wants X when payer/CPT/provider/denial looks like Y". Managers keep them in one place; billers see the matching ones on every claim.
import type { Claim } from '../types';
export type SopLevel = 'info' | 'important' | 'must';
export interface ClientSop { id: string; client_id: string | null; title: string; instruction: string; level: SopLevel; active: boolean; payers: string[]; cpts: string[]; providers: string[]; codes: string[]; minBalance?: number | null; /** original wording this came from */ source?: string }
export const SOP_LEVEL: Record<SopLevel, { label: string; color: string; rank: number }> = { must: { label: 'Must', color: '#dc2626', rank: 3 }, important: { label: 'Important', color: '#d97706', rank: 2 }, info: { label: 'Note', color: '#6366f1', rank: 1 } };
const norm = (s: string) => s.trim().toLowerCase();
const cptList = (s: string | null | undefined) => (s || '').toUpperCase().split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
/** Pattern: exact (11042), prefix (110*), range (97110-97140). */
export function cptMatches(pattern: string, cpt: string): boolean {
  const p = pattern.trim().toUpperCase(); if (!p) return false;
  if (p.endsWith('*')) return cpt.startsWith(p.slice(0, -1));
  const r = /^([A-Z0-9]{5})\s*-\s*([A-Z0-9]{5})$/.exec(p); if (r) return cpt >= r[1] && cpt <= r[2] && cpt.length === 5;
  return cpt === p;
}
export function sopMatches(s: ClientSop, c: Pick<Claim, 'client_id' | 'payer' | 'cpt' | 'provider' | 'denial_codes' | 'balance'>): boolean {
  if (!s.active) return false; if (s.client_id && s.client_id !== c.client_id) return false;
  if (s.payers.length && !s.payers.some((p) => norm(p) === norm(c.payer || ''))) return false;
  if (s.providers.length && !s.providers.some((p) => norm(p) === norm(c.provider || ''))) return false;
  if (s.cpts.length) { const mine = cptList(c.cpt); if (!mine.some((x) => s.cpts.some((p) => cptMatches(p, x)))) return false; }
  if (s.codes.length) { const codes = (c.denial_codes || '').toUpperCase().replace(/([A-Z]{2})(\d)/g, '$1-$2').split(/[,;\s]+/).filter(Boolean); if (!codes.some((x) => s.codes.some((k) => x === k.toUpperCase().replace(/^([A-Z]{2})(\d)/, '$1-$2')))) return false; }
  if (s.minBalance != null && (c.balance || 0) < s.minBalance) return false;
  return true;
}
export const sopsFor = (sops: ClientSop[], c: Parameters<typeof sopMatches>[1]) => sops.filter((s) => sopMatches(s, c)).sort((a, b) => SOP_LEVEL[b.level].rank - SOP_LEVEL[a.level].rank);
/** How specific a rule is — shown so managers see why a broad rule will fire a lot. */
export const sopScope = (s: ClientSop) => [s.payers.length && `${s.payers.length} payer${s.payers.length > 1 ? 's' : ''}`, s.cpts.length && `CPT ${s.cpts.slice(0, 3).join(', ')}${s.cpts.length > 3 ? '…' : ''}`, s.providers.length && `${s.providers.length} provider${s.providers.length > 1 ? 's' : ''}`, s.codes.length && s.codes.slice(0, 3).join(', '), s.minBalance && `≥ $${s.minBalance}`].filter(Boolean).join(' · ') || 'every claim';

/** Turn a pasted SOP document / email into draft rules: one per bullet or line, with payers, CPTs, denial codes and a severity guessed from the wording. A manager reviews before saving. */
export function suggestSops(text: string, knownPayers: string[], knownProviders: string[] = [], clientId: string | null = null): ClientSop[] {
  const out: ClientSop[] = []; const lines = text.split(/\r?\n/).map((l) => l.replace(/^[\s>*•\-–\d.)]+/, '').trim()).filter((l) => l.length >= 12);
  for (const line of lines) {
    const low = line.toLowerCase(); const payers = knownPayers.filter((p) => p.length > 2 && low.includes(p.toLowerCase())); const providers = knownProviders.filter((p) => p.length > 3 && low.includes(p.toLowerCase()));
    const cpts = [...new Set([...line.matchAll(/\b(\d{5}\s*-\s*\d{5}|\d{3,5}\*|\d{5}|[A-Z]\d{4})\b/g)].map((m) => m[1].replace(/\s/g, '')).filter((x) => !/^(19|20)\d{2}$/.test(x)))];
    const codes = [...new Set([...line.matchAll(/\b(CO|PR|OA|PI)[\s-]?(\d{1,3})\b/gi)].map((m) => `${m[1].toUpperCase()}-${m[2]}`))];
    const bal = /(?:over|above|greater than|more than|>=?|at least)\s*\$\s?([\d,]+)/i.exec(line); const hasScope = payers.length || cpts.length || codes.length || providers.length || bal;
    if (!hasScope && !/\b(always|never|must|do not|don't|before|prior to|only|approval|call|email|escalate|write.?off|appeal|contact)\b/i.test(line)) continue;
    const level: SopLevel = /\b(never|must|do not|don't|always|required|strictly|not allowed)\b/i.test(line) ? 'must' : /\b(prefer|please|should|important|need to|ask|check|before)\b/i.test(line) ? 'important' : 'info';
    out.push({ id: Math.random().toString(36).slice(2, 10), client_id: clientId, title: line.length > 60 ? line.slice(0, 57) + '…' : line, instruction: line, level, active: true, payers, cpts, providers, codes, minBalance: bal ? Number(bal[1].replace(/,/g, '')) : null, source: line });
  }
  return out;
}
