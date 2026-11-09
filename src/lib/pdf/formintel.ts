// Reads a flat (non-fillable) form's text layer, finds its labels ("Patient Name:", "Claim #", "Date of Service" …) and proposes where each piece of claim data belongs.
import type { TextItem } from './pdfedit';

export type FieldKey = 'patient' | 'member' | 'claim' | 'dos' | 'billed' | 'balance' | 'payer' | 'provider' | 'npi' | 'practice' | 'date' | 'account' | 'auth' | 'dx' | 'cpt' | 'dob';
const LABELS: { key: FieldKey; re: RegExp }[] = [
  { key: 'patient', re: /^(patient(?:'s)?\s*name|name of patient|patient|member name|subscriber name|insured'?s? name)\s*[:#]?\s*$/i }, { key: 'dob', re: /^(patient\s*)?(dob|d\.o\.b\.?|date of birth|birth\s*date)\s*[:#]?\s*$/i },
  { key: 'member', re: /^(member|subscriber|policy|insured)\s*(id|#|no\.?|number)?\s*[:#]?\s*$/i }, { key: 'claim', re: /^(claim|icn|dcn|tcn)\s*(id|#|no\.?|number)?\s*[:#]?\s*$/i },
  { key: 'dos', re: /^(date\s*of\s*service|dos|service\s*date|dates?\s*of\s*service)\s*[:#]?\s*$/i }, { key: 'billed', re: /^(billed|total\s*charges?|charges?|amount\s*billed|billed\s*amount)\s*[:#$]?\s*$/i },
  { key: 'balance', re: /^(balance|amount\s*(in\s*)?(dispute|due|denied)|denied\s*amount|amount\s*disputed)\s*[:#$]?\s*$/i }, { key: 'payer', re: /^(payer|insurance(\s*company)?|carrier|health\s*plan)\s*(name)?\s*[:#]?\s*$/i },
  { key: 'provider', re: /^(rendering\s*provider|provider(?:'s)?\s*name|physician|doctor|provider)\s*[:#]?\s*$/i }, { key: 'npi', re: /^(provider\s*)?npi\s*(#|no\.?|number)?\s*[:#]?\s*$/i },
  { key: 'practice', re: /^(practice|facility|billing\s*provider|group)\s*(name)?\s*[:#]?\s*$/i }, { key: 'date', re: /^(date|today'?s?\s*date|date\s*signed|signature\s*date)\s*[:#]?\s*$/i },
  { key: 'account', re: /^(patient\s*)?(account|acct|mrn|chart)\s*(id|#|no\.?|number)?\s*[:#]?\s*$/i }, { key: 'auth', re: /^(prior\s*)?(auth(?:orization)?|referral)\s*(id|#|no\.?|number)?\s*[:#]?\s*$/i },
  { key: 'dx', re: /^(diagnosis|icd-?10|dx)\s*(codes?)?\s*[:#]?\s*$/i }, { key: 'cpt', re: /^(cpt|procedure)\s*(codes?)?\s*[:#]?\s*$/i },
];
export interface FillSuggestion { key: FieldKey; label: string; value: string; page: number; x: number; y: number; size: number }
/** `values` holds what we know (omit a key to skip it — e.g. patient name when the workspace is PHI-free). A label is skipped when something is already written to its right. */
export function suggestFills(items: TextItem[], values: Partial<Record<FieldKey, string>>, page: number): FillSuggestion[] {
  const out: FillSuggestion[] = []; const used = new Set<string>();
  items.forEach((it, i) => {
    const raw = it.str.trim().replace(/[_.\s]+$/, ''); let label = raw; let inline: string | null = null; const colon = /^(.{2,40}?):\s*(.*)$/.exec(raw); if (colon) { label = colon[1] + ':'; inline = colon[2]; }
    const hit = LABELS.find((l) => l.re.test(label.trim())); if (!hit) return; const v = values[hit.key]; if (!v) return;
    if (inline && !/^[_\s.-]*$/.test(inline)) return; // already filled
    const isLabel = (t: string) => LABELS.some((l) => l.re.test(t.trim().replace(/[_.\s]+$/, ''))); const same = items.filter((o, j) => j !== i && Math.abs(o.y - it.y) < it.h * 0.7 && o.x > it.x + it.w - 2 && o.x < it.x + it.w + 170 && !isLabel(o.str)); const next = same.sort((a, b) => a.x - b.x)[0]; if (next && !/^[_\s.-]*$/.test(next.str)) return; // something already printed on the line
    const k = `${hit.key}:${Math.round(it.y)}`; if (used.has(k)) return; used.add(k);
    const size = Math.max(7, Math.min(12, Math.round(it.h * 0.85 * 10) / 10)); out.push({ key: hit.key, label: label.replace(/[:#]\s*$/, '').trim(), value: v, page, x: (next ? next.x : it.x + it.w) + 4, y: it.y + (it.h - size) * 0.35, size });
  });
  return out;
}
