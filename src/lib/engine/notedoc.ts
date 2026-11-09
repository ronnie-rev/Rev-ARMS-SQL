// Structured touch notes. A claim comment is plain text, but it is organised into labelled blocks so that the checklist, the call/contact line, documents,
// next step and free text can each be added or replaced WITHOUT overwriting the others — and the result still reads like a note a person wrote.
//
//   Contact: Called Aetna by phone; spoke with Maria (ref 88123). Claim denied CO-50; appeal allowed within 180 days.
//   Steps taken:
//   • Verified eligibility on the date of service
//   • Reviewed the EOB and denial letter
//   Documents: operative notes, EOB
//   Next step: File a level-1 appeal; follow up 11/19.
//   Notes: Rep said the policy changed in July.
export const NOTE_LABELS = ['Contact', 'Steps taken', 'Documents', 'Next step', 'Notes'] as const;
export type NoteLabel = (typeof NOTE_LABELS)[number];
export interface NoteBlock { label: NoteLabel; body: string }
export interface ParsedNote { free: string; blocks: NoteBlock[] }
const LABEL_RE = new RegExp(`^\\s*(${NOTE_LABELS.join('|')}):[ \\t]*(.*)$`, 'i');
const canon = (l: string): NoteLabel => NOTE_LABELS.find((x) => x.toLowerCase() === l.toLowerCase()) as NoteLabel;

export function parseNote(text: string): ParsedNote {
  const free: string[] = []; const blocks: NoteBlock[] = []; let cur: NoteBlock | null = null;
  for (const line of (text || '').replace(/\r/g, '').split('\n')) {
    const m = LABEL_RE.exec(line);
    if (m) { cur = { label: canon(m[1]), body: m[2] }; blocks.push(cur); continue; }
    if (cur) cur.body += (cur.body || !line.trim() ? '\n' : '') + line; else free.push(line);
  }
  return { free: free.join('\n').trim(), blocks: blocks.map((b) => ({ ...b, body: b.body.replace(/\n{3,}/g, '\n\n').trim() })).filter((b) => b.body) };
}
const fmtBlock = (b: NoteBlock) => (b.body.includes('\n') ? `${b.label}:\n${b.body}` : `${b.label}: ${b.body}`);
export function buildNote(p: ParsedNote): string {
  const order = (l: NoteLabel) => NOTE_LABELS.indexOf(l);
  const blocks = [...p.blocks].sort((a, b) => order(a.label) - order(b.label)).map(fmtBlock);
  return [p.free.trim(), ...blocks].filter(Boolean).join('\n');
}
/** Add or change ONE block, leaving everything else (other blocks and any free text) exactly as it is. */
export function upsertBlock(text: string, label: NoteLabel, body: string, mode: 'replace' | 'append' = 'replace'): string {
  const p = parseNote(text); const b = body.trim(); if (!b) return text; const i = p.blocks.findIndex((x) => x.label === label);
  if (i < 0) p.blocks.push({ label, body: b });
  else if (mode === 'append') { if (!p.blocks[i].body.toLowerCase().includes(b.toLowerCase())) p.blocks[i] = { label, body: p.blocks[i].body + (label === 'Steps taken' || b.includes('\n') ? '\n' : ' ') + b }; }
  else p.blocks[i] = { label, body: b };
  return buildNote(p);
}
export function removeBlock(text: string, label: NoteLabel): string { const p = parseNote(text); p.blocks = p.blocks.filter((x) => x.label !== label); return buildNote(p); }
export const getBlock = (text: string, label: NoteLabel) => parseNote(text).blocks.find((x) => x.label === label)?.body || '';
/** Tidy: canonical block order, free text folded into "Notes", consistent bullets, sentence case and end punctuation. */
export function organize(text: string): string {
  const p = parseNote(text); const out: NoteBlock[] = [...p.blocks];
  if (p.free) { const j = out.findIndex((x) => x.label === 'Notes'); const f = sentence(p.free); if (j >= 0) out[j] = { label: 'Notes', body: f + ' ' + out[j].body }; else out.push({ label: 'Notes', body: f }); }
  return buildNote({ free: '', blocks: out.map((b) => ({ ...b, body: b.label === 'Steps taken' ? bullets(b.body) : sentence(b.body) })) });
}
const sentence = (s: string) => s.split('\n').map((l) => { const t = l.trim(); if (!t) return ''; const c = t[0].toUpperCase() + t.slice(1); return /[.!?:)\]]$/.test(c) || /^[•-]/.test(c) ? c : c + '.'; }).join('\n');
const bullets = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (/^[•\-*]\s*/.test(l) ? '• ' + l.replace(/^[•\-*]\s*/, '') : '• ' + l)).join('\n');

const PAST: Record<string, string> = { verify: 'Verified', check: 'Checked', review: 'Reviewed', confirm: 'Confirmed', request: 'Requested', call: 'Called', send: 'Sent', submit: 'Submitted', obtain: 'Obtained', attach: 'Attached', ask: 'Asked', document: 'Documented', escalate: 'Escalated', resubmit: 'Resubmitted', file: 'Filed', appeal: 'Appealed', compare: 'Compared', identify: 'Identified', find: 'Found', locate: 'Located', pull: 'Pulled', print: 'Printed', fax: 'Faxed', email: 'Emailed', update: 'Updated', correct: 'Corrected', add: 'Added', ensure: 'Ensured', gather: 'Gathered', calculate: 'Calculated', note: 'Noted', open: 'Opened', log: 'Logged', schedule: 'Scheduled', contact: 'Contacted', research: 'Researched', validate: 'Validated', refer: 'Referred', provide: 'Provided', complete: 'Completed', follow: 'Followed' };
/** "Verify eligibility on DOS." → "Verified eligibility on DOS" — checklist steps read as work that was done. */
export function pastTense(step: string): string {
  const t = step.trim().replace(/[.;]+$/, ''); const m = /^([A-Za-z]+)\b(.*)$/.exec(t); if (!m) return t; const v = PAST[m[1].toLowerCase()]; return v ? v + m[2] : t;
}
export const stepsBody = (steps: string[]) => steps.map((s) => '• ' + pastTense(s)).join('\n');
