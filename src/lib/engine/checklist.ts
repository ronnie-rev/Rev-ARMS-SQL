import type { ConfigOption } from '../types';

export interface Checklist { id: string; title: string; steps: { text: string; required: boolean }[]; by: 'code' | 'rca' | 'kb' | 'base' }
const norm = (c: string) => c.trim().toUpperCase().replace(/\s+/g, '');
export const splitList = (s: unknown): string[] => String(s ?? '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
/** Steps: one per line; a leading "!" marks the step as required. */
export const parseSteps = (raw: unknown) => String(raw ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (l.startsWith('!') ? { text: l.slice(1).trim(), required: true } : { text: l, required: false }));

/** Does a playbook "codes" pattern match a claim's denial code? Patterns: "CO-29", "29" (any group), "CO-*" (whole group), "*" (every denial). */
export function codeMatches(pattern: string, code: string): boolean {
  const p = norm(pattern), c = norm(code); if (!p || !c) return false; if (p === '*') return true;
  const [pg, pn] = p.includes('-') ? p.split('-') : ['', p]; const [cg, cn] = c.includes('-') ? c.split('-') : ['', c];
  return (!pg || pg === cg) && (pn === '*' || pn === cn);
}
/** Checklists for a claim: playbooks tied to its denial codes first, then the one matching the chosen root-cause detail. Editable in Admin → Playbooks. */
export function matchChecklists(playbooks: ConfigOption[], o: { codes: string[]; rcaDetail?: string | null }): Checklist[] {
  const out: Checklist[] = [];
  for (const p of playbooks) {
    if (!p.active) continue; const steps = parseSteps(p.meta.steps); if (!steps.length) continue;
    const pats = splitList(p.meta.codes);
    if (pats.length && o.codes.some((c) => pats.some((pt) => codeMatches(pt, c)))) out.push({ id: p.id, title: p.value, steps, by: 'code' });
    else if (!pats.length && o.rcaDetail && p.value === o.rcaDetail) out.push({ id: p.id, title: p.value, steps, by: 'rca' });
  }
  const rank = { code: 0, rca: 1, kb: 2, base: 3 } as const; return out.sort((a, b) => rank[a.by] - rank[b.by]);
}
export const progress = (cl: Checklist, done: number[] | undefined) => { const d = new Set(done || []); return { done: cl.steps.filter((_, i) => d.has(i)).length, total: cl.steps.length, requiredLeft: cl.steps.filter((s, i) => s.required && !d.has(i)).length }; };

// ───────── knowledge-hub derived checklists (every denial gets one) ─────────
export interface ScenarioLike { code: string; t: string; what: string; causes: string[]; flow: { start: string[]; check: string; yes: string[]; no: string[] }; exceptions: string[]; action: string; ask: string[] }
const uniq = (a: string[]) => [...new Set(a.map((x) => x.trim()).filter(Boolean))];
/** Steps built from a Knowledge-hub scenario: verify → decide → branch → rule out exceptions → resolution path → questions for the payer → document. */
export function scenarioChecklist(s: ScenarioLike): Checklist {
  const steps: Checklist['steps'] = [{ text: `Confirm the payer's reason matches: ${s.what}`, required: true }];
  for (const t of uniq(s.flow.start)) steps.push({ text: t, required: true });
  if (s.flow.check) steps.push({ text: `Decide: ${s.flow.check}`, required: true });
  for (const t of uniq(s.flow.yes)) steps.push({ text: `If yes → ${t}`, required: false });
  for (const t of uniq(s.flow.no)) steps.push({ text: `If no → ${t}`, required: false });
  for (const t of uniq(s.exceptions).slice(0, 4)) steps.push({ text: `Rule out: ${t}`, required: false });
  if (s.action) steps.push({ text: `Resolution path: ${s.action}`, required: false });
  for (const t of uniq(s.ask).slice(0, 4)) steps.push({ text: `Ask the payer: ${t}`, required: false });
  steps.push({ text: 'Record call reference #, rep name and date; set the next follow-up', required: true });
  return { id: 'kb:' + s.code, title: `${s.code} · ${s.t}`, steps, by: 'kb' };
}
/** Applies to every denial, whatever the code. */
export const BASE_CHECKLIST: Checklist = { id: 'base', title: 'Every denial — baseline', by: 'base', steps: [
  { text: 'Verify patient, member ID, DOS and claim # on the payer’s own record (not only our PMS)', required: true },
  { text: 'Read the adjustment group, CARC and every RARC remark — not just the headline reason', required: true },
  { text: 'Check the filing windows (timely filing / appeal / corrected claim) in Deadline radar', required: true },
  { text: 'Check for a secondary payer, patient-responsibility split or prior payment before acting', required: false },
  { text: 'Choose the path: corrected claim, appeal, records, reprocess request, patient bill or adjustment', required: false },
  { text: 'Log the root cause and end action, reference #, and the next follow-up date', required: true },
] };
