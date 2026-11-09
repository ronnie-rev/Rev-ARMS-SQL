// From what a payer document says to what we should change on the claim — as explicit, reviewable proposals (never applied until the biller confirms).
import { addBusinessDays } from '../utils';
import { docSummary, type DocRead } from './docintel';
import type { Appeal, Claim } from '../types';

export interface Proposal {
  id: string; label: string; from?: string; to: string; safe: boolean; on: boolean; why: string;
  apply: { kind: 'claim'; patch: Partial<Claim>; summary: string } | { kind: 'note'; body: string } | { kind: 'appeal'; appealId: string; patch: Partial<Appeal> };
}
export interface ProposeCtx { appeals: Appeal[]; statuses: string[]; today: string; fromOcr: boolean; hash: string }

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/** The date printed on the letter (labelled "date", "dated", "notice date", "letter date"), else the earliest date found. */
export function letterDate(r: DocRead): string | null { const d = r.facts.dates.find((x) => /letter|notice|dated|^date\b|issued|processed|determination/i.test(x.label)) || [...r.facts.dates].sort((a, b) => a.iso.localeCompare(b.iso))[0]; return d?.iso || null; }
/** First configured workflow status whose name matches — we never invent a status your workspace does not have. */
export const pickStatus = (statuses: string[], re: RegExp) => statuses.find((s) => re.test(s)) || null;
const uniq = (a: string[]) => [...new Set(a.filter(Boolean))];

export function proposeUpdates(r: DocRead, text: string, claim: Claim, c: ProposeCtx): Proposal[] {
  const out: Proposal[] = []; const ld = letterDate(r); const base = ld && ld <= c.today ? ld : c.today; let n = 0; const id = () => 'p' + ++n;
  const add = (p: Omit<Proposal, 'id'>) => out.push({ id: id(), ...p });
  const status = (re: RegExp, why: string) => { const s = pickStatus(c.statuses, re); if (s && s !== claim.status) add({ label: 'Workflow status', from: claim.status, to: s, safe: false, on: true, why, apply: { kind: 'claim', patch: { status: s }, summary: `Status → ${s} (from payer document)` } }); };
  const followUp = (iso: string, why: string) => { if (iso > c.today && iso !== claim.next_fu) add({ label: 'Next follow-up', from: claim.next_fu || '—', to: iso, safe: true, on: true, why, apply: { kind: 'claim', patch: { next_fu: iso }, summary: `Follow-up set to ${iso} (from payer document)` } }); };
  const deadlineIso = r.appealDeadline && ld ? addDays(ld, r.appealDeadline.days) : null;
  switch (r.type) {
    case 'denial': {
      const codes = uniq([...r.facts.carc, ...r.facts.rarc.filter(() => false)]); const have = (claim.denial_codes || '').split(/[,;\s]+/).filter(Boolean).map((x) => x.toUpperCase());
      if (codes.some((k) => !have.includes(k))) add({ label: 'Denial code(s)', from: claim.denial_codes || '—', to: uniq([...have, ...codes]).join(', '), safe: true, on: true, why: 'Codes printed on the denial letter', apply: { kind: 'claim', patch: { denial_codes: uniq([...have, ...codes]).join(', ') }, summary: `Denial codes updated from letter: ${codes.join(', ')}` } });
      const dd = (claim as any).denial_date as string | null | undefined; if (ld && !dd) add({ label: 'Denial date', from: '—', to: ld, safe: true, on: true, why: 'Date on the letter', apply: { kind: 'claim', patch: { denial_date: ld } as any, summary: `Denial date set to ${ld} (from letter)` } });
      status(/denied|denial/i, 'The payer has confirmed the denial');
      if (deadlineIso) add({ label: 'Appeal deadline', from: String(claim.custom?.appeal_deadline || '—'), to: deadlineIso, safe: true, on: true, why: `${r.appealDeadline!.days} days from ${ld}`, apply: { kind: 'claim', patch: { custom: { ...(claim.custom || {}), appeal_deadline: deadlineIso } }, summary: `Appeal deadline recorded: ${deadlineIso}` } });
      followUp(deadlineIso ? (addDays(deadlineIso, -14) > c.today ? addDays(deadlineIso, -14) : addBusinessDays(c.today, 3)) : addBusinessDays(c.today, 3), 'Start the appeal well before the deadline');
      break; }
    case 'records': status(/record|document|info|awaiting|pend|hold/i, 'The payer is waiting on documents'); followUp(addBusinessDays(base > c.today ? c.today : base, 5), 'Send the records and confirm receipt'); break;
    case 'auth': { const no = ([...text.matchAll(/(?:auth(?:orization)?|precert(?:ification)?|reference|approval)\s*(?:#|no\.?|number|id)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,19})/gi)].map((x) => x[1]).find((x) => /\d/.test(x)) || '').toUpperCase() || null; if (no && no !== claim.custom?.auth_no) add({ label: 'Authorization #', from: String(claim.custom?.auth_no || '—'), to: no, safe: true, on: true, why: 'Number printed on the authorization letter', apply: { kind: 'claim', patch: { custom: { ...(claim.custom || {}), auth_no: no } }, summary: `Authorization # ${no} recorded (from payer letter)` } }); break; }
    case 'appeal_decision': {
      const won = /overturn|approved|in your favou?r|reversed|paid in full|will be reprocessed|decision is reversed/i.test(text) && !/\b(?:not|un)(?:\s|-)?(?:overturn|approved)/i.test(text); const lost = !won && /upheld|denial (?:is )?(?:upheld|maintained)|remains denied|unable to overturn|not approved|affirmed/i.test(text);
      const live = c.appeals.filter((a) => a.claim_id === claim.id && ['sent', 'pending', 'ready', 'draft'].includes(a.status)).sort((a, b) => b.level - a.level)[0];
      if (live && (won || lost)) add({ label: `Appeal L${live.level} outcome`, from: live.status, to: won ? 'won' : 'lost', safe: false, on: true, why: won ? 'Letter says the denial was overturned' : 'Letter says the denial was upheld', apply: { kind: 'appeal', appealId: live.id, patch: { status: won ? 'won' : 'lost', decided_on: ld || c.today, outcome_note: docSummary(r, c.fromOcr).split('\n').slice(0, 4).join(' · ') } as Partial<Appeal> } });
      if (won) followUp(addBusinessDays(c.today, 7), 'Confirm the payment posts after reprocessing'); else if (lost) { status(/denied|denial/i, 'The denial stands after appeal'); followUp(addBusinessDays(c.today, 3), 'Review next-level appeal or courtesy review'); }
      break; }
    case 'overpayment': followUp(addBusinessDays(c.today, 3), 'Verify the overpayment claim before refunding or disputing'); add({ label: 'Flag', to: 'Overpayment request', safe: true, on: true, why: 'Keeps it out of normal collections follow-up', apply: { kind: 'claim', patch: { custom: { ...(claim.custom || {}), overpayment_request: { date: ld || c.today, amount: r.facts.amounts[0]?.value ?? null } } }, summary: 'Overpayment / refund request recorded' } }); break;
    default: break;
  }
  add({ label: 'Claim note', to: 'Facts from the document', safe: true, on: true, why: 'Keeps the evidence on the claim', apply: { kind: 'note', body: docSummary(r, c.fromOcr) } });
  return out;
}

/** One claim patch + one note + appeal updates from the confirmed proposals (merged so the claim is written once). */
export function mergeConfirmed(ps: Proposal[], claim: Claim, hash: string) {
  let patch: Partial<Claim> = {}; const summaries: string[] = []; const notes: string[] = []; const appeals: { id: string; patch: Partial<Appeal> }[] = [];
  for (const p of ps) { const a = p.apply; if (a.kind === 'claim') { patch = { ...patch, ...a.patch, custom: { ...(patch.custom || claim.custom || {}), ...(a.patch.custom || {}) } }; summaries.push(a.summary); } else if (a.kind === 'note') notes.push(a.body); else appeals.push({ id: a.appealId, patch: a.patch }); }
  const prev: string[] = ((patch.custom || claim.custom || {}).ocr_hashes as string[]) || []; patch.custom = { ...(patch.custom || claim.custom || {}), ocr_hashes: [...new Set([...prev, hash])].slice(-20) };
  return { patch, summary: summaries.join(' · ') || 'Payer document filed', notes, appeals };
}
