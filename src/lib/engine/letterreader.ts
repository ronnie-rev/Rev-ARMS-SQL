// Reads text pulled from a payer denial letter / EOB / remittance and extracts what billers re-type by hand: codes, dates, amounts, reference numbers and deadline language.
export interface LetterFacts { carc: string[]; rarc: string[]; claimNos: string[]; refs: string[]; dates: { label: string; iso: string }[]; amounts: { label: string; value: number }[]; deadlineDays: { days: number; context: string }[]; asks: string[]; payerHint: string | null }
const iso = (m: string, d: string, y: string) => { const yy = y.length === 2 ? '20' + y : y; const mm = m.padStart(2, '0'), dd = d.padStart(2, '0'); const t = Date.parse(`${yy}-${mm}-${dd}T12:00:00Z`); return Number.isNaN(t) || +m > 12 || +d > 31 ? null : `${yy}-${mm}-${dd}`; };
const MONTHS: Record<string, string> = { jan: '1', feb: '2', mar: '3', apr: '4', may: '5', jun: '6', jul: '7', aug: '8', sep: '9', oct: '10', nov: '11', dec: '12' };
const uniq = <T,>(a: T[]) => [...new Set(a)];
import { extraDates } from './dates';
export function readLetter(text: string): LetterFacts {
  const t = text.replace(/ /g, ' '); const carc = uniq([...t.matchAll(/\b(?:CO|PR|OA|PI|CR)[\s-]?(\d{1,3})\b/g)].map((m) => `${m[0].slice(0, 2).toUpperCase()}-${m[1]}`));
  const rarc = uniq([...t.matchAll(/\b(?:RARC\s*)?(M\d{1,3}|N\d{1,3}|MA\d{1,3})\b/g)].map((m) => m[1]));
  const claimNos = uniq([...t.matchAll(/(?:claim|icn|dcn|tcn)\s*(?:#|no\.?|number|id)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{6,24})/gi)].map((m) => m[1].toUpperCase()).filter((x) => /\d/.test(x)));
  const refs = uniq([...t.matchAll(/(?:reference|ref\.?|case|appeal|authorization|auth|check|eft|trace)\s*(?:#|no\.?|number)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,24})/gi)].map((m) => m[1].toUpperCase()).filter((x) => /\d/.test(x)));
  const dates: LetterFacts['dates'] = []; const addDate = (label: string, d: string | null) => { if (d && !dates.some((x) => x.iso === d && x.label === label)) dates.push({ label, iso: d }); };
  for (const m of t.matchAll(/([A-Za-z ]{3,30}?)[:\s]\s*(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/g)) addDate(m[1].trim().replace(/\s+/g, ' ').slice(-24) || 'Date', iso(m[2], m[3], m[4]));
  for (const m of t.matchAll(/([A-Za-z ]{3,30}?)[:\s]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/gi)) addDate(m[1].trim().replace(/\s+/g, ' ').slice(-24) || 'Date', iso(MONTHS[m[2].toLowerCase().slice(0, 3)], m[3], m[4]));
  for (const d of extraDates(t)) addDate(d.label, d.iso);
  const amounts: LetterFacts['amounts'] = []; for (const m of t.matchAll(/([A-Za-z ]{3,28}?)[:\s]\s*\$\s?(-?[\d,]+(?:\.\d{2})?)/g)) { const v = Number(m[2].replace(/,/g, '')); if (!Number.isNaN(v)) amounts.push({ label: m[1].trim().replace(/\s+/g, ' ').slice(-24), value: v }); }
  const deadlineDays = [...t.matchAll(/([^.\n]{0,60}?)\b(\d{2,3})\s*(?:calendar\s*)?days\b([^.\n]{0,40})/gi)].map((m) => ({ days: +m[2], context: (m[1] + m[2] + ' days' + m[3]).trim() })).filter((d) => /appeal|file|submit|receipt|within|from|reconsider|dispute|resubmit/i.test(d.context)).slice(0, 5);
  const asks = uniq([...t.matchAll(/(?:please|you must|you may|must be|request(?:ed)?|submit|provide|send)\s+([^.\n]{10,120})/gi)].map((m) => m[0].trim())).slice(0, 6);
  const payer = /(aetna|cigna|united\s?healthcare|uhc|humana|anthem|blue (?:cross|shield)|bcbs|medicare|medicaid|tricare|kaiser|molina|centene|oscar)/i.exec(t);
  return { carc, rarc, claimNos, refs, dates: dates.slice(0, 10), amounts: amounts.slice(0, 10), deadlineDays, asks, payerHint: payer ? payer[1] : null };
}
