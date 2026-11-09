// Appeal analytics + "chase" list. Pure.
import type { Appeal, Claim } from '../types';
import { splitDenials } from '../kb';

const dd = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);
export interface Cell { key: string; filed: number; decided: number; won: number; rate: number | null; recovered: number; disputed: number; avgDays: number | null }
const decided = (a: Appeal) => a.status === 'won' || a.status === 'partial' || a.status === 'lost';

export function appealAnalytics(appeals: Appeal[], claims: Claim[]) {
  const cl = new Map(claims.map((c) => [c.id, c]));
  const build = (keyOf: (a: Appeal) => string): Cell[] => {
    const m = new Map<string, { filed: number; dec: number; won: number; rec: number; disp: number; days: number[] }>();
    for (const a of appeals) { if (a.status === 'draft' || a.status === 'withdrawn') continue; const k = keyOf(a); const e = m.get(k) || { filed: 0, dec: 0, won: 0, rec: 0, disp: 0, days: [] }; e.filed++; e.disp += a.amount_disputed || 0;
      if (decided(a)) { e.dec++; if (a.status !== 'lost') e.won++; e.rec += a.amount_recovered || 0; if (a.filed_on && a.decided_on) e.days.push(dd(a.filed_on, a.decided_on)); } m.set(k, e); }
    return [...m.entries()].map(([key, e]) => ({ key, filed: e.filed, decided: e.dec, won: e.won, rate: e.dec ? Math.round((e.won / e.dec) * 100) : null, recovered: Math.round(e.rec), disputed: Math.round(e.disp), avgDays: e.days.length ? Math.round(e.days.reduce((x, y) => x + y, 0) / e.days.length) : null })).sort((a, b) => b.filed - a.filed);
  };
  const all = appeals.filter((a) => a.status !== 'draft' && a.status !== 'withdrawn'); const dec = all.filter(decided);
  return {
    byPayer: build((a) => a.payer || cl.get(a.claim_id)?.payer || 'Unknown'), byLevel: build((a) => `${a.kind === 'reconsideration' ? 'Reconsideration' : a.kind === 'external_review' ? 'External review' : a.kind === 'underpayment_dispute' ? 'Underpayment dispute' : a.kind === 'corrected_claim' ? 'Corrected claim' : `Level ${a.level}`}`),
    byCode: build((a) => splitDenials(cl.get(a.claim_id)?.denial_codes)[0] || 'No code'),
    overall: { filed: all.length, decided: dec.length, won: dec.filter((a) => a.status !== 'lost').length, recovered: Math.round(dec.reduce((x, a) => x + (a.amount_recovered || 0), 0)), disputedOpen: Math.round(all.filter((a) => !decided(a)).reduce((x, a) => x + (a.amount_disputed || 0), 0)) },
  };
}
export interface Chase { appeal: Appeal; daysOut: number; level: 'chase' | 'escalate' }
/** Sent / pending appeals with no decision after `days` (chase) or `days*2` (escalate). */
export function chaseList(appeals: Appeal[], today: string, days = 30): Chase[] {
  return appeals.filter((a) => (a.status === 'sent' || a.status === 'pending') && a.filed_on).map((a) => ({ appeal: a, daysOut: dd(a.filed_on!, today) })).filter((x) => x.daysOut >= days).map((x) => ({ ...x, level: (x.daysOut >= days * 2 ? 'escalate' : 'chase') as Chase['level'] })).sort((a, b) => b.daysOut - a.daysOut);
}
