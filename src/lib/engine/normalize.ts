// Pure normalisation + parsing primitives for the import engine. No React, no store: safe to unit-test and reuse server-side.

/** Stable 53-bit string hash (cyrb53). Sync, deterministic, good enough for fingerprints (not security). */
export function hash(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export interface KeyOptions { stripPrefix?: string[]; stripLeadingZeros?: boolean }

/**
 * Canonical form of a PMS claim identifier. Makes "CLM-00123", "clm 123", "123.0" and 123 (number) compare equal.
 * Returns '' when nothing usable remains. Excel scientific notation ("1.23457E+11") is returned as-is with `sci` true
 * because the digits are already lost — callers must warn instead of trusting it.
 */
export function normClaimNo(raw: unknown, opts: KeyOptions = {}): { key: string; sci: boolean } {
  if (raw == null) return { key: '', sci: false };
  let s = typeof raw === 'number' ? (Number.isInteger(raw) ? String(raw) : String(raw)) : String(raw);
  s = s.trim().toUpperCase();
  const sci = /^\d+(\.\d+)?E\+?\d+$/.test(s);
  if (sci) return { key: s, sci: true };
  s = s.replace(/\.0+$/, '');                              // Excel numeric → "12345.0"
  for (const p of opts.stripPrefix || []) if (p && s.startsWith(p.toUpperCase())) s = s.slice(p.length);
  s = s.replace(/[^A-Z0-9]/g, '');                         // spaces, dashes, slashes, dots, # …
  if (opts.stripLeadingZeros !== false) s = s.replace(/^0+(?=\d)/, '');   // "000123" → "123" (keeps a lone "0")
  return { key: s, sci: false };
}

/** Name → order-independent token string: "DOE, JANE A." == "Jane A Doe" == "jane doe a". */
export function normName(raw: unknown): string {
  if (!raw) return '';
  return String(raw).toUpperCase().replace(/['’`.]/g, '').replace(/[^A-Z\s,]/g, ' ').replace(/\b(JR|SR|II|III|IV|MR|MRS|MS|DR)\b/g, ' ').split(/[\s,]+/).filter((t) => t.length > 0).sort().join(' ');
}
/** Looser: surname + first initial, tolerates middle names / nicknames. */
export function nameCore(raw: unknown): string {
  const toks = normName(raw).split(' ').filter(Boolean); if (!toks.length) return '';
  return toks.filter((t) => t.length > 1).slice(0, 2).join(' ') || toks[0];
}

/** Payer → canonical comparison form (suffix noise removed). Aliases are applied separately by the caller. */
export function normPayer(raw: unknown): string {
  if (!raw) return '';
  return String(raw).toUpperCase().replace(/&/g, ' AND ').replace(/\b(INC|LLC|CORP|CO|COMPANY|OF|THE|HEALTH|PLAN|PLANS|INSURANCE|INS|GROUP|HMO|PPO|NATIONAL)\b/g, ' ').replace(/[^A-Z0-9]/g, '');
}

export function normCpt(raw: unknown): string {
  if (!raw) return '';
  return [...new Set(String(raw).toUpperCase().split(/[,;/\s|]+/).map((c) => c.replace(/[^A-Z0-9]/g, '')).filter(Boolean))].sort().join('+');
}

export const cents = (n: number) => Math.round((n || 0) * 100);

/** patient + DOS + CPT + billed: identical charge regardless of claim number. With no patient name, falls back to an account / encounter reference instead. */
export function fingerprint(c: { patient_name?: unknown; dos?: string | null; cpt?: unknown; billed_amt?: number | null; balance?: number | null; account_id?: string | null; encounter_no?: string | null }): string {
  const amt = cents(c.billed_amt || c.balance || 0); const nm = normName(c.patient_name);
  if (nm && c.dos) return hash(`${nm}|${c.dos}|${normCpt(c.cpt)}|${amt}`);
  const ref = String(c.account_id || c.encounter_no || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ref && c.dos ? hash(`R|${ref}|${c.dos}|${normCpt(c.cpt)}|${amt}`) : '';
}
/** Last-resort identity when a row has no claim #, no patient and no account/encounter: DOS + CPT + payer + provider + charge. Never used to auto-merge claims. */
export function structuralKey(c: { dos?: string | null; cpt?: unknown; payer?: string | null; provider?: string | null; billed_amt?: number | null; balance?: number | null }): string {
  if (!c.dos) return ''; const amt = cents(c.billed_amt || c.balance || 0); const cpt = normCpt(c.cpt); if (!cpt && !amt) return '';
  return hash(`S|${c.dos}|${cpt}|${String(c.payer || '').toLowerCase().replace(/[^a-z0-9]/g, '')}|${String(c.provider || '').toLowerCase().replace(/[^a-z0-9]/g, '')}|${amt}`, 3);
}
/** weaker: patient + DOS only (amount/CPT may differ after re-bill). */
export function looseFingerprint(c: { patient_name?: unknown; dos?: string | null }): string {
  const nm = nameCore(c.patient_name); if (!nm || !c.dos) return '';
  return hash(`${nm}|${c.dos}`, 7);
}

// ───────── money ─────────
/** Robust money parser. Handles $, commas, (parentheses), trailing minus "12.50-", CR/DR suffix, unicode minus, "N/A". Returns null for non-numeric. */
export function parseMoney(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  let s = String(v).trim(); if (!s || /^(n\/?a|null|none|-|—|#\w+!?)$/i.test(s)) return null;
  s = s.replace(/[−–—]/g, '-');
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s) || /\bCR\b$/i.test(s);
  const digits = s.replace(/[^0-9.,]/g, '');
  if (!digits) return null;
  // decide decimal separator: "1.234,56" (EU) vs "1,234.56"
  let t = digits;
  const lastC = t.lastIndexOf(','), lastD = t.lastIndexOf('.');
  if (lastC > -1 && lastD > -1) t = lastC > lastD ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (lastC > -1) t = /,\d{2}$/.test(t) && t.split(',').length === 2 ? t.replace(',', '.') : t.replace(/,/g, '');
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : Math.round((neg ? -n : n) * 100) / 100;
}

// ───────── dates ─────────
export type DateOrder = 'mdy' | 'dmy';
const pad = (n: number) => String(n).padStart(2, '0');
const valid = (y: number, m: number, d: number) => { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; };

/** Parse to ISO yyyy-mm-dd. `order` only matters for ambiguous numeric dates like 03/04/2026. */
export function parseDate(v: unknown, order: DateOrder = 'mdy'): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(+v) ? null : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
    if (v > 19000101 && v < 21000101) return parseDate(String(v), order);    // 20260314
    return null;
  }
  const s = String(v).trim(); let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/)) || (m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/))) return valid(+m[1], +m[2], +m[3]) ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : null;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return valid(+m[1], +m[2], +m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})(?:[\s,T].*)?$/))) {
    let a = +m[1], b = +m[2], y = +m[3]; if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
    let mo = order === 'mdy' ? a : b, d = order === 'mdy' ? b : a;
    if (mo > 12 && d <= 12) [mo, d] = [d, mo];            // unambiguous: 25/03/2026 under mdy → swap
    return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  const mon = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');
  if ((m = s.toUpperCase().match(/^(\d{1,2})[\s\-]([A-Z]{3})[A-Z]*[\s\-,]+(\d{2}|\d{4})$/))) { const mi = mon.indexOf(m[2]) + 1; let y = +m[3]; if (m[3].length === 2) y += 2000; return mi && valid(y, mi, +m[1]) ? `${y}-${pad(mi)}-${pad(+m[1])}` : null; }
  if ((m = s.toUpperCase().match(/^([A-Z]{3})[A-Z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/))) { const mi = mon.indexOf(m[1]) + 1; return mi && valid(+m[3], mi, +m[2]) ? `${m[3]}-${pad(mi)}-${pad(+m[2])}` : null; }
  return null;
}

/** Look at a whole column: if any value has a first number > 12 it is dmy; second > 12 → mdy; else undecided (default mdy). */
export function detectDateOrder(values: unknown[]): { order: DateOrder; certain: boolean } {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    if (typeof v !== 'string') continue; const m = v.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})/); if (!m) continue;
    if (+m[1] > 12 && +m[2] <= 12) dmy++; else if (+m[2] > 12 && +m[1] <= 12) mdy++;
  }
  if (dmy > mdy) return { order: 'dmy', certain: true }; if (mdy > dmy) return { order: 'mdy', certain: true };
  return { order: 'mdy', certain: false };
}

/** Summary / subtotal / footer rows that must never become claims. */
export function isTotalRow(cells: unknown[]): boolean {
  const txt = cells.filter((c) => typeof c === 'string').map((c) => (c as string).trim().toLowerCase());
  return txt.some((t) => /^(grand\s+)?total(s)?\b|^sub\s*-?total|^report\s+total|^page\s+\d+|^printed\b|^run date\b|^\*+$/.test(t));
}
