// Denial & AR knowledge base, imported from the team's RevAtlas training workbook. Lazy-loaded (≈350 KB) so it never
// weighs on the first paint. Content is guidance, not payer-contract truth: items marked "verify" must be checked per payer.
import { useEffect, useState } from 'react';

export interface Guide { t: string; why: string; steps: string[]; checklist?: string[]; pitfalls?: string[] }
export interface Flow { start: string[]; check: string; yes: string[]; no: string[] }
export interface Scenario { code: string; cat: string; t: string; what: string; causes: string[]; flow: Flow; exceptions: string[]; action: string; ask: string[] }
export type CarcRow = [string, string, string, string, string];
export interface Kb {
  SCEN: Scenario[]; POLMAP: Record<string, string[]>; VARIANTS: string[][]; TRI: Record<string, { q: string; a: [string, string][] }>; SE: Record<string, string>; REJECTS: string[][]; CAT_DEFAULT: Record<string, { exc: string[]; ask: string[] }>;
  CARC: CarcRow[]; CARC2: string[][]; RARC: string[][]; GROUPS: string[][];
  LADDERS: [string, string[][], string][]; PLAYBOOK: [string, string[], string, string][]; PAYER_TOP: { p: string; d: string[][] }[]; BULK: { t: string; sig: string; scope: string; fix: string[]; ex: string }[];
  APPEALS: Record<string, string>; CALL_BASE: string[]; CALL_BRANCH: Record<string, string[]>; PREVENT: string[][];
  TEAMS: Record<string, string>; ROUTE_RULES: [{ __re: string; flags: string }, string[], string][]; OUTCOMES: [string, number][]; MODES: Record<string, { req: string[]; f: string[] }>; NF: Record<string, string>; LIFE: any[];
  CONCEPTS: string[][]; GUIDES: Guide[]; REFDB: Record<string, string[][]>; MEDICARE: string[][]; UHC: string[][];
}
let cache: Promise<Kb> | null = null;
export const loadKb = (): Promise<Kb> => (cache ||= Promise.all([import('./scen.json'), import('./codes.json'), import('./playbooks.json'), import('./learn.json')]).then((m) => Object.assign({}, ...m.map((x: any) => x.default)) as Kb));
export function useKb(): Kb | null { const [k, setK] = useState<Kb | null>(null); useEffect(() => { let on = true; void loadKb().then((x) => on && setK(x)); return () => { on = false; }; }, []); return k; }

// "CO-31/140" and "PR-1/2/3" cover several codes. Index every member so "CO-140" or "PR-2" resolve.
export function scenarioIndex(kb: Kb): Map<string, Scenario> {
  const m = new Map<string, Scenario>();
  for (const s of kb.SCEN) { const base = s.code.replace(/ (OON|Global)$/i, ''); const g = /^(CO|PR|OA|PI)-(.+)$/.exec(base); if (g) { for (const n of g[2].split('/')) if (!m.has(`${g[1]}-${n}`)) m.set(`${g[1]}-${n}`, s); } if (!m.has(s.code)) m.set(s.code, s); if (!m.has(base)) m.set(base, s); }
  return m;
}
export const splitDenials = (s: string | null | undefined) => (s || '').split(/[,;\s]+/).map((x) => x.trim().toUpperCase().replace(/^([A-Z]{2})(\d)/, '$1-$2')).filter(Boolean);
export function scenariosFor(kb: Kb, idx: Map<string, Scenario>, codes: string | null | undefined): Scenario[] { const out: Scenario[] = []; for (const c of splitDenials(codes)) { const s = idx.get(c); if (s && !out.includes(s)) out.push(s); } return out; }
export function routeFor(kb: Kb, code: string): { teams: string[]; note: string } | null { for (const [re, teams, note] of kb.ROUTE_RULES) if (new RegExp(re.__re, re.flags).test(code)) return { teams: teams.map((t) => kb.TEAMS[t] || t), note }; return null; }
export const carcMeaning = (kb: Kb, code: string) => { const n = code.replace(/^[A-Z]{2}-/, ''); const r = kb.CARC.find((x) => x[0] === n); return r ? { desc: r[1], plain: r[2], action: r[3], group: r[4] } : null; };
