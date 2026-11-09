// Denial prevention: turn denials into feedback for the practice — which front-end / coding / charge-capture control would have stopped the most money, and who/what is behind it.
import type { Claim } from '../types';
export interface PreventRow { area: string; control: string; codes: string[] }
export interface PreventionArea { area: string; denials: number; amount: number; topCodes: { code: string; n: number; amount: number }[]; controls: string[]; topProviders: { name: string; n: number; amount: number }[]; topCpts: { cpt: string; n: number; amount: number }[]; topPayers: { name: string; n: number; amount: number }[] }
const split = (s: string | null | undefined) => (s || '').toUpperCase().split(/[,;\s]+/).map((x) => x.trim().replace(/^([A-Z]{2})(\d)/, '$1-$2')).filter(Boolean);
const top = <T,>(m: Map<string, { n: number; amount: number }>, shape: (k: string, v: { n: number; amount: number }) => T, k = 4) => [...m].sort((a, b) => b[1].amount - a[1].amount).slice(0, k).map(([a, b]) => shape(a, b));
const bump = (m: Map<string, { n: number; amount: number }>, k: string, amt: number) => { const e = m.get(k) || { n: 0, amount: 0 }; e.n++; e.amount += amt; m.set(k, e); };
/** A denied claim counts once per prevention area it maps to. Amount = billed (open or closed) so closed write-offs still show what the leak cost. */
export function preventionReport(claims: Claim[], rows: string[][], opts: { from?: string } = {}): PreventionArea[] {
  const defs: PreventRow[] = rows.map((r) => ({ area: r[0], control: r[1], codes: split(r[2]) })); const byCode = new Map<string, PreventRow[]>(); for (const d of defs) for (const c of d.codes) byCode.set(c, [...(byCode.get(c) || []), d]);
  const out = new Map<string, { a: PreventionArea; codes: Map<string, { n: number; amount: number }>; prov: Map<string, { n: number; amount: number }>; cpt: Map<string, { n: number; amount: number }>; payer: Map<string, { n: number; amount: number }>; ctl: Set<string> }>();
  for (const c of claims) {
    const codes = split(c.denial_codes); if (!codes.length) continue; if (opts.from && (c.dos || '') < opts.from) continue; const amt = Math.max(c.billed_amt || 0, c.balance || 0); const seen = new Set<string>();
    for (const code of codes) for (const d of byCode.get(code) || []) {
      let g = out.get(d.area); if (!g) out.set(d.area, (g = { a: { area: d.area, denials: 0, amount: 0, topCodes: [], controls: [], topProviders: [], topCpts: [], topPayers: [] }, codes: new Map(), prov: new Map(), cpt: new Map(), payer: new Map(), ctl: new Set() }));
      g.ctl.add(d.control); bump(g.codes, code, amt); if (!seen.has(d.area)) { seen.add(d.area); g.a.denials++; g.a.amount += amt; bump(g.prov, c.provider || 'Unknown', amt); bump(g.cpt, (c.cpt || '—').split(/[,;\s]+/)[0] || '—', amt); bump(g.payer, c.payer || 'Unknown', amt); }
    }
  }
  return [...out.values()].map((g) => ({ ...g.a, amount: Math.round(g.a.amount), topCodes: top(g.codes, (code, v) => ({ code, n: v.n, amount: Math.round(v.amount) })), controls: [...g.ctl], topProviders: top(g.prov, (name, v) => ({ name, n: v.n, amount: Math.round(v.amount) }), 3), topCpts: top(g.cpt, (cpt, v) => ({ cpt, n: v.n, amount: Math.round(v.amount) }), 3), topPayers: top(g.payer, (name, v) => ({ name, n: v.n, amount: Math.round(v.amount) }), 3) })).sort((a, b) => b.amount - a.amount);
}
