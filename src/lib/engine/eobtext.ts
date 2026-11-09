// Turns the text of a printed / scanned EOB or payer remittance (PDF text or OCR) into the same `Era` structure an X12 835 produces,
// so the verified ERA pipeline (claim matching, duplicate protection, payment posting, denial codes) works for paper remits too.
import type { Adj, Era, EraClaim } from './era835';
import { readLetter } from './letterreader';

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (s: string) => { const neg = /^\(.*\)$/.test(s.trim()) || /^-/.test(s.trim()); const n = parseFloat(s.replace(/[^\d.]/g, '')); return Number.isFinite(n) ? (neg ? -n : n) : 0; };
const AMT = '\\(?-?\\$?\\s?[\\d,]+\\.\\d{2}\\)?';
const grab = (t: string, labels: string, flags = 'gi'): number | null => { const m = [...t.matchAll(new RegExp(`(?:${labels})[^\\d$()\\n-]{0,28}(${AMT})`, flags))]; return m.length ? money(m[m.length - 1][1]) : null; };
const isoOf = (s: string): string | null => { const m = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s); if (!m) return null; const y = m[3].length === 2 ? '20' + m[3] : m[3]; const mm = +m[1], dd = +m[2]; return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 ? `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` : null; };
const ID_RE = /(?:claim|icn|dcn|tcn|pcn|patient\s*account|account|acct|ref(?:erence)?)\s*(?:#|no\.?|number|id)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{5,24})/gi;

/** FNV-1a hash of the normalised text — used only to detect "this document was already filed"; the text itself is never stored. */
export function docHash(text: string): string { const t = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
/** Does the text look like an X12 835 file? */
export const isX12 = (t: string) => /^\s*ISA[*|^~]/.test(t) && /(^|[~\n])\s*(BPR|CLP)[*|]/.test(t);
/** Does printed text look like an EOB / remit (as opposed to a letter)? */
export const looksLikeEob = (t: string) => (/explanation of (?:benefits|payment)|remittance advice|\bEOB\b|\bERA\b|claim payment/i.test(t) && /(paid|allowed|payment)/i.test(t)) || (t.match(/\b(?:paid|allowed|billed)\b/gi) || []).length >= 4;

export function parseEobText(text: string): Era | null {
  const t = text.replace(/ /g, ' ').replace(/[ \t]+/g, ' '); const lines = t.split(/\n/); const facts = readLetter(t);
  // block starts: each line that carries a claim identifier begins a new claim block
  const starts: number[] = []; lines.forEach((l, i) => { ID_RE.lastIndex = 0; const m = ID_RE.exec(l); if (m && /\d/.test(m[1]) && !/^(?:phone|fax)/i.test(l.trim())) starts.push(i); });
  const blocks: string[] = []; if (!starts.length) blocks.push(t); else starts.forEach((s, k) => blocks.push(lines.slice(s, (starts[k + 1] ?? lines.length)).join('\n')));
  const claims: EraClaim[] = []; const warnings: string[] = ['Read from printed text — confirm every amount against the original before posting.'];
  for (const b of blocks) {
    ID_RE.lastIndex = 0; const ids = [...b.matchAll(ID_RE)].map((m) => m[1].toUpperCase()).filter((x) => /\d/.test(x)); const pcn = ids[0] || ''; const icn = ids.find((x) => x !== pcn) || null;
    const adj: Adj[] = []; for (const m of b.matchAll(new RegExp(`\\b(CO|PR|OA|PI|CR)[\\s-]?(\\d{1,3})\\b[^\\d$()\\n]{0,50}(${AMT})`, 'g'))) adj.push({ group: m[1], code: m[2], amount: r2(Math.abs(money(m[3]))), qty: null });
    for (const m of b.matchAll(/\b(CO|PR|OA|PI|CR)[\s-]?(\d{1,3})\b/g)) if (!adj.some((a) => a.group === m[1] && a.code === m[2])) adj.push({ group: m[1], code: m[2], amount: 0, qty: null });
    const charge = grab(b, 'amount billed|billed amount|total charges?|charges?|billed') ?? 0; const allowed = grab(b, 'allowed amount|amount allowed|allowed|approved amount|eligible expenses?'); const paid = grab(b, 'amount paid|plan paid|total paid|payment amount|paid to provider|net payment|paid') ?? 0;
    const pr = grab(b, 'patient responsibility|patient resp\\.?|member responsibility|you owe|amount you owe|patient owes'); const cop = (grab(b, 'copay(?:ment)?') || 0) + (grab(b, 'coinsurance') || 0) + (grab(b, 'deductible') || 0); const patientResp = pr ?? r2(cop + adj.filter((a) => a.group === 'PR').reduce((s, a) => s + a.amount, 0));
    const denied = paid === 0 && /denied|not covered|non-?covered|no payment|payment denied|rejected/i.test(b); const dosM = /(?:dos|date of service|service date|dates? of service)[^\d\n]{0,12}(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i.exec(b); const mem = /member\s*(?:id|#|no\.?)\s*[:#]?\s*([A-Z0-9]{6,20})/i.exec(b);
    if (!pcn && blocks.length === 1 && !paid && !charge && !denied) return null;
    claims.push({ pcn, icn, status: denied ? '4' : '1', statusLabel: denied ? 'Denied' : 'Processed as primary', charge, paid, patientResp, patient: null, memberId: mem?.[1] || null, dos: dosM ? isoOf(dosM[1]) : null, adj, remarks: facts.rarc, lines: [], allowed, reversal: false, denied });
    if (!pcn) warnings.push('A claim block has no claim number — it cannot be matched automatically.');
  }
  if (!claims.length) return null;
  const trace = /(?:check|eft|trace|payment|remittance)\s*(?:#|no\.?|number|id)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{5,24})/i.exec(t)?.[1]?.toUpperCase() || null; const dm = /(?:payment|check|paid|processed|remit(?:tance)?)\s*date[^\d\n]{0,8}(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i.exec(t);
  const payee = /(?:payee|pay to|provider name)\s*[:#]?\s*([A-Z][A-Za-z0-9 &.,'-]{3,50})/i.exec(t)?.[1]?.trim() || null; const total = r2(claims.reduce((s, c) => s + c.paid, 0));
  const stated = grab(t, 'check amount|total payment|payment total|eft amount|total paid'); if (stated != null && Math.abs(stated - total) > 0.01) warnings.push(`Printed payment total ${stated.toFixed(2)} does not equal the sum of the claim payments ${total.toFixed(2)}.`);
  return { payer: facts.payerHint ? facts.payerHint.replace(/\b\w/g, (c) => c.toUpperCase()) : null, payee, trace, method: /eft|ach|direct deposit/i.test(t) ? 'ACH' : /check/i.test(t) ? 'CHK' : null, date: dm ? isoOf(dm[1]) : null, amount: stated ?? total, credit: true, claims, plb: [], warnings, segments: lines.length, versionOk: true };
}

const HDR = { claim: /claim\s*(#|no\.?|number|id)|\bicn\b|\bpcn\b|patient\s*account|\bacct\b|^account/i, billed: /billed|charge/i, allowed: /allowed|approved|eligible/i, paid: /^(amount\s*)?paid|payment(?!\s*date)|plan\s*paid|net\s*pay|paid\s*amount/i, pr: /patient\s*(resp|owes|portion)|pt\s*resp|copay|co-?ins|deductible/i, code: /denial|reason|carc|adj(ustment)?\s*(code|reason)|remark|^code/i, dos: /\bdos\b|date\s*of\s*service|service\s*date/i, status: /status|disposition|result/i, trace: /check|eft|trace|remit(tance)?\s*(#|no)/i, payer: /^payer|insurance|plan\s*name/i, date: /payment\s*date|check\s*date|paid\s*date|process(ed)?\s*date/i };
/** A remittance exported as a spreadsheet (Excel / CSV): finds the header row, maps the columns and builds the same `Era` the posting pipeline uses. Returns null when no claim + amount columns are found. */
export function parseRemitSheet(rows: string[][]): Era | null {
  let h = -1; let cols: Record<string, number[]> = {};
  for (let i = 0; i < Math.min(rows.length, 15); i++) { const c: Record<string, number[]> = {}; rows[i].forEach((cell, j) => { const t = String(cell).trim(); if (!t) return; for (const [k, re] of Object.entries(HDR)) if (re.test(t)) (c[k] ||= []).push(j); }); if (c.claim && (c.paid || c.billed || c.allowed)) { h = i; cols = c; break; } }
  if (h < 0) return null; const n = (r: string[], k: string) => (cols[k] || []).reduce((s, j) => s + (r[j] ? money(r[j]) : 0), 0); const first = (r: string[], k: string) => (cols[k] || []).map((j) => (r[j] || '').trim()).find(Boolean) || '';
  const by = new Map<string, EraClaim>(); const warnings = ['Read from a spreadsheet — confirm the column mapping and amounts before posting.'];
  for (const r of rows.slice(h + 1)) { const id = first(r, 'claim').toUpperCase(); if (!id || !/\d/.test(id)) continue; const paid = r2(n(r, 'paid')); const pr = r2(n(r, 'pr')); const codes = [...first(r, 'code').matchAll(/\b(CO|PR|OA|PI|CR)[\s-]?(\d{1,3})\b/gi)].map((m) => ({ group: m[1].toUpperCase(), code: m[2], amount: 0, qty: null as number | null })); const st = first(r, 'status'); const denied = /denied|reject|not covered/i.test(st) || (paid === 0 && codes.some((c) => c.group === 'CO' && c.code !== '45'));
    const prev = by.get(id); if (prev) { prev.charge = r2(prev.charge + n(r, 'billed')); prev.paid = r2(prev.paid + paid); prev.patientResp = r2(prev.patientResp + pr); prev.allowed = cols.allowed ? r2((prev.allowed || 0) + n(r, 'allowed')) : null; prev.adj.push(...codes); prev.denied = prev.denied && denied; continue; }
    const dm = first(r, 'dos'); by.set(id, { pcn: id, icn: null, status: denied ? '4' : '1', statusLabel: denied ? 'Denied' : 'Processed as primary', charge: r2(n(r, 'billed')), paid, patientResp: pr, patient: null, memberId: null, dos: dm ? isoOf(dm) || (/^\d{4}-\d{2}-\d{2}/.test(dm) ? dm.slice(0, 10) : null) : null, adj: codes, remarks: [], lines: [], allowed: cols.allowed ? r2(n(r, 'allowed')) : null, reversal: false, denied }); }
  const claims = [...by.values()]; if (!claims.length) return null; const trace = rows.slice(h + 1).map((r) => first(r, 'trace')).find(Boolean) || null; const dt = rows.slice(h + 1).map((r) => first(r, 'date')).find(Boolean) || ''; const payer = rows.slice(h + 1).map((r) => first(r, 'payer')).find(Boolean) || null;
  const miss = [['claim', cols.claim], ['paid', cols.paid]].filter(([, v]) => !v).map(([k]) => k); if (miss.length) warnings.push(`No "${miss.join('", "')}" column was found.`);
  return { payer, payee: null, trace: trace ? trace.toUpperCase() : null, method: null, date: dt ? isoOf(dt) : null, amount: r2(claims.reduce((s, c) => s + c.paid, 0)), credit: true, claims, plb: [], warnings, segments: rows.length, versionOk: true };
}
