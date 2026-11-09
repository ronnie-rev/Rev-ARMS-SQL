import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/browser';
import { format, isValid, parse, parseISO } from 'date-fns';
import type { Claim, Client, ImportTemplate } from './types';
import { fieldsFor, type FieldDef } from './pms';

export interface ParsedSheet { headers: string[]; rows: Record<string, any>[]; sheetNames?: string[]; headerRow: number }

const norm = (s: any) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export async function parseFile(file: File): Promise<ParsedSheet> {
  let grid: any[][];
  if (/\.xlsx$/i.test(file.name)) {
    const sheets = (await readXlsxFile(file)) as unknown as { sheet: string; data: any[][] }[];
    const pick = sheets.find((x) => /^(log|aging|ar aging|claims)$/i.test(x.sheet)) || [...sheets].sort((a, b) => b.data.length - a.data.length)[0];
    if (!pick) throw new Error('No sheets found in workbook.');
    grid = pick.data;
  } else if (/\.(csv|txt|tsv)$/i.test(file.name)) {
    const text = await file.text();
    grid = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' }).data;
  } else {
    throw new Error('Unsupported file type. Upload .xlsx or .csv (re-save .xls files as .xlsx).');
  }
  grid = grid.filter((r) => r && r.some((c) => c !== null && c !== '' && c !== undefined));
  if (!grid.length) throw new Error('The file is empty.');
  // header row = first row (within the first 15) with the most non-empty text cells
  let hr = 0, best = -1;
  grid.slice(0, 15).forEach((r, i) => {
    const score = r.filter((c) => typeof c === 'string' && c.trim() !== '' && isNaN(Number(c))).length;
    if (score > best) { best = score; hr = i; }
  });
  const seen = new Map<string, number>();
  const headers = grid[hr].map((h, i) => {
    let base = String(h ?? '').trim() || `Column ${i + 1}`;
    const n = seen.get(base) ?? 0; seen.set(base, n + 1);
    return n ? `${base} (${n + 1})` : base;
  });
  const rows = grid.slice(hr + 1).map((r) => {
    const o: Record<string, any> = {};
    headers.forEach((h, i) => { o[h] = r[i] ?? null; });
    return o;
  });
  return { headers, rows, headerRow: hr };
}

export interface MapResult { mapping: Record<string, string | null>; confidence: Record<string, number> }

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.5 + 0.45;
  const bi = (s: string) => { const r = new Set<string>(); for (let i = 0; i < s.length - 1; i++) r.add(s.slice(i, i + 2)); return r; };
  const A = bi(a), B = bi(b); let inter = 0; A.forEach((x) => B.has(x) && inter++);
  return (2 * inter) / (A.size + B.size || 1);
}

export function autoMap(headers: string[], tpl: Pick<ImportTemplate, 'mapping' | 'kind'>, custom: string[] = []): MapResult {
  const mapping: Record<string, string | null> = {};
  const confidence: Record<string, number> = {};
  const used = new Set<string>();
  const targets = [...fieldsFor(tpl.kind).map((f) => f.key), ...custom];
  const nh = headers.map((h) => [h, norm(h)] as const);
  // pass 1: exact alias hits (priority by alias order), pass 2: fuzzy
  for (const t of targets) {
    const aliases = (tpl.mapping[t] || []).map(norm);
    let hit: string | null = null;
    for (const al of aliases) { const f = nh.find(([h, n]) => n === al && !used.has(h)); if (f) { hit = f[0]; break; } }
    if (hit) { mapping[t] = hit; confidence[t] = 1; used.add(hit); }
  }
  for (const t of targets) {
    if (mapping[t]) continue;
    const field = fieldsFor(tpl.kind).find((f) => f.key === t);
    const cands = [...(tpl.mapping[t] || []), field?.label || t].map(norm);
    let best: [string, number] | null = null;
    for (const [h, n] of nh) {
      if (used.has(h)) continue;
      const s = Math.max(...cands.map((c) => similarity(n, c)));
      if (!best || s > best[1]) best = [h, s];
    }
    if (best && best[1] >= 0.62) { mapping[t] = best[0]; confidence[t] = best[1]; used.add(best[0]); }
    else { mapping[t] = null; confidence[t] = 0; }
  }
  return { mapping, confidence };
}

/** Score how well a template matches the headers of a file, for auto-detecting the PMS. */
export function detectTemplate(headers: string[], templates: ImportTemplate[]): { tpl: ImportTemplate; score: number } | null {
  let best: { tpl: ImportTemplate; score: number } | null = null;
  for (const t of templates) {
    const { confidence } = autoMap(headers, t);
    const fields = fieldsFor(t.kind);
    const exact = fields.filter((f) => confidence[f.key] === 1).length;
    const req = fields.filter((f) => f.required && (confidence[f.key] ?? 0) >= 0.62).length;
    const score = exact + req * 2 - (t.pms === 'Standard' ? 0.5 : 0);
    if (!best || score > best.score) best = { tpl: t, score };
  }
  return best;
}

// ───── value coercion ─────
export function toISODate(v: any): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isValid(v) ? format(v, 'yyyy-MM-dd') : null;
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return format(new Date(Math.round((v - 25569) * 86400 * 1000) + new Date().getTimezoneOffset() * 60000), 'yyyy-MM-dd');
    return null;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = parseISO(s.slice(0, 10)); return isValid(d) ? s.slice(0, 10) : null; }
  for (const f of ['M/d/yyyy', 'M/d/yy', 'MM-dd-yyyy', 'M-d-yyyy', 'MMM d, yyyy', 'd-MMM-yy', 'd-MMM-yyyy', 'yyyy/MM/dd', 'M/d/yyyy H:mm', 'M/d/yyyy h:mm a']) {
    const d = parse(s, f, new Date());
    if (isValid(d) && d.getFullYear() > 1990) return format(d, 'yyyy-MM-dd');
  }
  return null;
}
export function toMoney(v: any): number {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  if (v == null) return 0;
  let s = String(v).trim();
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /CR$/i.test(s);
  s = s.replace(/[^0-9.]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round((neg ? -n : n) * 100) / 100;
}
export const toBool = (v: any) => /^(y|yes|true|1)$/i.test(String(v ?? '').trim());
const str = (v: any) => (v == null || String(v).trim() === '' ? null : String(v).replace(/\s+/g, ' ').trim());

export interface CanonRow { [k: string]: any; _row: number; _errors: string[] }

export function canonicalize(rows: Record<string, any>[], mapping: Record<string, string | null>, kind: 'aging' | 'worklog', customKeys: string[] = []): CanonRow[] {
  const fields: FieldDef[] = fieldsFor(kind);
  return rows.map((r, i) => {
    const o: CanonRow = { _row: i + 2, _errors: [] };
    for (const f of fields) {
      const h = mapping[f.key];
      const raw = h ? r[h] : null;
      o[f.key] = f.type === 'date' ? toISODate(raw) : f.type === 'money' ? toMoney(raw) : f.type === 'bool' ? toBool(raw) : str(raw);
      if (f.type === 'date' && raw != null && raw !== '' && !o[f.key]) o._errors.push(`${f.label}: unreadable date "${raw}"`);
    }
    o._custom = {} as Record<string, any>;
    for (const k of customKeys) { const h = mapping[k]; if (h && r[h] != null && r[h] !== '') o._custom[k] = r[h] instanceof Date ? toISODate(r[h]) : r[h]; }
    if (!o.claim_no) o._errors.push('Missing claim number');
    if (kind === 'aging' && !o.payer) o._errors.push('Missing payer');
    return o;
  });
}

// ───── diff against existing claims ─────
export interface AgingDiff {
  fresh: CanonRow[]; changed: { row: CanonRow; claim: Claim; balanceDelta: number; reopened: boolean }[];
  same: CanonRow[]; dropped: Claim[]; invalid: CanonRow[]; duplicates: number; totalBalance: number;
}
export function diffAging(rows: CanonRow[], existing: Claim[], client: Client): AgingDiff {
  const byNo = new Map(existing.filter((c) => c.client_id === client.id).map((c) => [c.claim_no.toLowerCase(), c]));
  const seen = new Set<string>();
  const d: AgingDiff = { fresh: [], changed: [], same: [], dropped: [], invalid: [], duplicates: 0, totalBalance: 0 };
  for (const r of rows) {
    if (r._errors.some((e) => e.startsWith('Missing'))) { d.invalid.push(r); continue; }
    const k = String(r.claim_no).toLowerCase();
    if (seen.has(k)) { d.duplicates++; continue; }
    seen.add(k);
    d.totalBalance += r.balance || 0;
    const c = byNo.get(k);
    if (!c) { d.fresh.push(r); continue; }
    const delta = (r.balance || 0) - c.balance;
    const reopened = !!c.closed_at;
    if (Math.abs(delta) > 0.004 || reopened || (r.payer && r.payer !== c.payer) || (r.pms_status && r.pms_status !== c.pms_status)) d.changed.push({ row: r, claim: c, balanceDelta: delta, reopened });
    else d.same.push(r);
  }
  d.dropped = [...byNo.values()].filter((c) => !c.closed_at && !seen.has(c.claim_no.toLowerCase()));
  return d;
}
