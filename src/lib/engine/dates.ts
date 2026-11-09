// Free-text date finder (chrono-node, MIT): "the 20th of October, 2026", "mailed on Oct 3rd 2026" — formats the fixed patterns in letterreader.ts miss.
import * as chrono from 'chrono-node';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Only dates where day, month AND year are all stated in the text (never guessed from "today"/"next Friday"). */
export function extraDates(text: string, ref = new Date(Date.UTC(2026, 0, 1, 12))): { label: string; iso: string }[] {
  const out: { label: string; iso: string }[] = [];
  for (const r of chrono.en.parse(text, ref, { forwardDate: false })) { const s = r.start; if (!s.isCertain('year') || !s.isCertain('month') || !s.isCertain('day')) continue; const d = iso(s.date()); const y = +d.slice(0, 4); if (y < 2000 || y > 2100) continue; const before = text.slice(Math.max(0, r.index - 30), r.index).replace(/\s+/g, ' ').trim().split(/[.:\n]/).pop() || ''; const label = before.split(' ').slice(-3).join(' ').replace(/[^A-Za-z ]/g, '').trim() || 'Date'; if (!out.some((x) => x.iso === d)) out.push({ label, iso: d }); }
  return out;
}
