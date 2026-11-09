import { inferVisitType, normalizeVisitType } from './visit';
import type { FieldDef } from '../pms';
import { AGING_FIELDS } from '../pms';
import { detectDateOrder, fingerprint, hash, structuralKey, isTotalRow, normClaimNo, normCpt, parseDate, parseMoney, type DateOrder } from './normalize';
import type { ImportSettings } from './settings';

export type Severity = 'info' | 'warn' | 'error';
export interface Issue { code: string; severity: Severity; message: string }

export interface Row {
  n: number;                                   // 1-based sheet row (header = 1)
  claim_no: string | null; key: string; generated: boolean;
  account_id: string | null; patient_name: string | null; dos: string | null; last_billed: string | null; payer: string | null;
  provider: string | null; provider_type: string | null; cpt: string | null; billed_amt: number | null; balance: number | null;
  pms_status: string | null; denial_codes: string | null; line_no: string | null; encounter_no: string | null; denial_date: string | null; paid_amt: number | null; allowed_amt: number | null; patient_resp: number | null;
  custom: Record<string, any>; issues: Issue[]; skip: Issue | null; fp: string; merged: number;
}

const txt = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).replace(/\s+/g, ' ').trim());
export interface BuildOut { rows: Row[]; skipped: Row[]; dateOrder: DateOrder; dateOrderCertain: boolean; dateCol: string | null; totals: number; headerRepeats: number }

export function buildRows(raw: Record<string, any>[], headers: string[], mapping: Record<string, string | null>, s: ImportSettings, customKeys: string[] = [], today = new Date().toISOString().slice(0, 10)): BuildOut {
  const get = (r: Record<string, any>, k: string) => (mapping[k] ? r[mapping[k]!] : undefined);
  // 1) date order: decide once per file from the DOS (and billed) column so dd/mm exports don't silently corrupt dates
  let order: DateOrder = s.dateOrder === 'dmy' ? 'dmy' : 'mdy'; let certain = s.dateOrder !== 'auto';
  if (s.dateOrder === 'auto') { const d = detectDateOrder(raw.flatMap((r) => [get(r, 'dos'), get(r, 'last_billed')])); order = d.order; certain = d.certain; }
  const rows: Row[] = []; const skipped: Row[] = []; const structSeen = new Map<string, number>(); let totals = 0, headerRepeats = 0;
  const hset = new Set(headers.map((h) => h.toLowerCase()));
  raw.forEach((r, i) => {
    const cells = headers.map((h) => r[h]);
    const row: Row = { n: i + 2, claim_no: null, key: '', generated: false, account_id: null, patient_name: null, dos: null, last_billed: null, payer: null, provider: null, provider_type: null, cpt: null, billed_amt: null, balance: null, pms_status: null, denial_codes: null, encounter_no: null, denial_date: null, paid_amt: null, allowed_amt: null, patient_resp: null, line_no: null, custom: {}, issues: [], skip: null, fp: '', merged: 1 };
    const fail = (code: string, message: string) => { row.skip = { code, severity: 'error', message }; };
    const nonEmpty = cells.filter((c) => c != null && String(c).trim() !== '');
    if (!nonEmpty.length) return;
    if (isTotalRow(cells)) { totals++; fail('TOTAL_ROW', 'Summary / footer row'); skipped.push(row); return; }
    if (nonEmpty.length >= 3 && nonEmpty.every((c) => hset.has(String(c).toLowerCase()))) { headerRepeats++; fail('HEADER_REPEAT', 'Repeated header row (page break)'); skipped.push(row); return; }

    const cn = normClaimNo(get(r, 'claim_no'), { stripPrefix: s.stripPrefix });
    row.claim_no = txt(typeof get(r, 'claim_no') === 'number' ? String(get(r, 'claim_no')) : get(r, 'claim_no'));
    row.account_id = txt(get(r, 'account_id')); row.patient_name = s.phiFree ? null : txt(get(r, 'patient_name')); row.payer = txt(get(r, 'payer'));
    row.provider = txt(get(r, 'provider')); row.provider_type = txt(get(r, 'provider_type')); row.cpt = txt(get(r, 'cpt')); row.pms_status = txt(get(r, 'pms_status')); row.denial_codes = txt(get(r, 'denial_codes'));
    row.line_no = txt((r as any)[mapping['line_no'] || '']); row.encounter_no = txt((r as any)[mapping['encounter_no'] || '']);
    for (const f of ['dos', 'last_billed'] as const) {
      const v = get(r, f); row[f] = parseDate(v, order);
      if (v != null && v !== '' && !row[f]) row.issues.push({ code: 'BAD_DATE', severity: 'warn', message: `${f === 'dos' ? 'Date of service' : 'Last billed'} “${v}” not readable` });
    }
    row.denial_date = parseDate(get(r, 'denial_date'), order); row.paid_amt = parseMoney(get(r, 'paid_amt')); row.allowed_amt = parseMoney(get(r, 'allowed_amt')); row.patient_resp = parseMoney(get(r, 'patient_resp'));
    const bal = parseMoney(get(r, 'balance')), bill = parseMoney(get(r, 'billed_amt'));
    row.balance = bal; row.billed_amt = bill;
    { const vt = normalizeVisitType(txt(get(r, 'visit_type'))); const inf = vt ? null : inferVisitType(row.cpt);
      row.custom.visit_type = vt ?? inf; row.custom.visit_src = vt ? 'file' : inf !== 'Unknown' ? 'inferred' : 'none';
      const roles = [['Main Surgeon', txt(get(r, 'main_surgeon'))], ['Assistant Surgeon', txt(get(r, 'assistant_surgeon'))]].filter(([, n]) => n).map(([role, provider]) => ({ role, provider })); if (roles.length) row.custom.roles = roles; }
    for (const k of customKeys) { const v = get(r, k); if (v != null && v !== '') row.custom[k] = v instanceof Date ? parseDate(v) : v; }

    if (bal == null) { fail('NO_BALANCE', 'Balance missing or not numeric'); skipped.push(row); return; }
    if (cn.sci) row.issues.push({ code: 'SCI_NOTATION', severity: 'warn', message: `Claim number “${get(r, 'claim_no')}” was converted to scientific notation by Excel — digits are lost. Re-export the column as text.` });
    else if (cn.key && cn.key.length < 4) row.issues.push({ code: 'SHORT_ID', severity: 'warn', message: `Claim number “${row.claim_no}” is very short — risk of collisions` });
    if (row.dos && row.dos > today) { fail('DOS_FUTURE', `Date of service ${row.dos} is in the future`); skipped.push(row); return; }
    if (row.dos && row.dos < '1990-01-01') { fail('DOS_ANCIENT', `Date of service ${row.dos} is implausible`); skipped.push(row); return; }
    if (row.dos && row.last_billed && row.last_billed < row.dos) row.issues.push({ code: 'BILLED_BEFORE_DOS', severity: 'warn', message: 'Last billed date is before date of service' });
    if (bill != null && bill > 0 && bal > bill * 1.01) row.issues.push({ code: 'BAL_GT_BILLED', severity: 'warn', message: `Balance ${bal} exceeds billed ${bill}` });
    if (!row.payer) row.issues.push({ code: 'NO_PAYER', severity: 'warn', message: 'Payer missing — imported as “Unknown”' });
    if (!row.dos && !row.last_billed) row.issues.push({ code: 'NO_DATES', severity: 'warn', message: 'No usable date — claim cannot be aged' });

    row.fp = fingerprint({ patient_name: row.patient_name, dos: row.dos, cpt: row.cpt, billed_amt: bill, balance: bal, account_id: row.account_id, encounter_no: row.encounter_no });
    // identity
    let base = cn.sci ? '' : cn.key;
    if (!base) {
      const sk = !row.fp && s.missingKey === 'generate' ? structuralKey({ dos: row.dos, cpt: row.cpt, payer: row.payer, provider: row.provider, billed_amt: bill, balance: bal }) : '';
      if (s.missingKey === 'generate' && s.encounterAsKey !== false && row.encounter_no && !/^0+$/.test(row.encounter_no)) { const en = row.encounter_no.toUpperCase().replace(/[^A-Z0-9]/g, ''); base = 'ENC' + en + (row.account_id ? '-' + row.account_id.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''); row.generated = true; row.claim_no = 'ENC-' + en; row.issues.push({ code: 'ENCOUNTER_ID', severity: 'info', message: `No claim number — using encounter # ${row.encounter_no} as the claim identity` }); }
      else if (s.missingKey === 'generate' && row.fp) { base = 'GEN' + row.fp.toUpperCase(); row.generated = true; row.claim_no = 'GEN-' + row.fp.slice(0, 8).toUpperCase(); row.issues.push({ code: 'GENERATED_ID', severity: 'info', message: `No claim number — generated ${row.claim_no} from ${row.patient_name ? 'patient' : 'account/encounter'}/DOS/CPT/amount` }); }
      else if (sk) {
        const n = (structSeen.get(sk) || 0) + 1; structSeen.set(sk, n); base = 'GENS' + sk.toUpperCase() + (n > 1 ? `-${n}` : ''); row.generated = true; row.claim_no = 'GEN-' + sk.slice(0, 8).toUpperCase() + (n > 1 ? `-${n}` : '');
        row.issues.push({ code: 'GENERATED_ID', severity: 'info', message: `No claim number, patient or account — generated ${row.claim_no} from DOS/CPT/payer/provider/charge` });
        if (n > 1) row.issues.push({ code: 'IDENTICAL_ROW', severity: 'warn', message: `Identical to ${n - 1} earlier row(s) in this file — kept as separate claim ${row.claim_no}; verify it is not a duplicate` });
      }
      else { fail('NO_IDENTITY', row.fp ? 'Missing claim number (generation disabled)' : 'Missing claim number and not enough data (claim #, patient, account/encounter, or DOS + CPT/amount) to identify the claim'); skipped.push(row); return; }
    }
    row.key = s.granularity === 'line' ? `${base}#${row.line_no ? row.line_no.toUpperCase().replace(/[^A-Z0-9]/g, '') : normCpt(row.cpt) || '0'}` : base;
    rows.push(row);
  });
  const dateCol = mapping['dos'] || null;
  return { rows, skipped, dateOrder: order, dateOrderCertain: certain, dateCol, totals, headerRepeats };
}

const same = (a: Row, b: Row) => a.balance === b.balance && a.billed_amt === b.billed_amt && a.dos === b.dos && (a.payer || '') === (b.payer || '') && normCpt(a.cpt) === normCpt(b.cpt) && (a.patient_name || '') === (b.patient_name || '');
export interface CollapseOut { rows: Row[]; dropped: { row: Row; into: Row; code: string; message: string }[]; aggregated: { into: Row; parts: number }[]; conflicts: Row[] }

/** Collapse rows that share an identity key. Exact duplicates are dropped; differing rows follow the duplicates policy. */
export function collapse(rows: Row[], s: ImportSettings): CollapseOut {
  const groups = new Map<string, Row[]>(); rows.forEach((r) => groups.set(r.key, [...(groups.get(r.key) || []), r]));
  const out: Row[] = [], dropped: CollapseOut['dropped'] = [], aggregated: CollapseOut['aggregated'] = [], conflicts: Row[] = [];
  const split = new Map<string, Row[]>();
  groups.forEach((g, key) => {   // one claim number cannot belong to two payers: a recycled / mistyped number is split into separate claims instead of silently summed
    const pay = [...new Set(g.map((r) => (r.payer || '').trim().toLowerCase()).filter(Boolean))];
    if (s.splitOnPayer === false || pay.length < 2) { split.set(key, g); return; }
    pay.forEach((pn, i) => { const part = g.filter((r) => (r.payer || '').trim().toLowerCase() === pn || (!r.payer && i === 0)); part.forEach((r) => { r.key = `${key}~P${i + 1}`; r.issues.push({ code: 'KEY_SPLIT_PAYER', severity: 'warn', message: `Claim # ${key} appears with ${pay.length} different payers — kept as separate claims; verify the number` }); }); split.set(`${key}~P${i + 1}`, part); });
  });
  split.forEach((g, key) => {
    if (g.length === 1) { out.push(g[0]); return; }
    const uniq: Row[] = [];
    for (const r of g) { const dup = uniq.find((u) => same(u, r)); if (dup) dropped.push({ row: r, into: dup, code: 'DUPLICATE_ROW', message: `Exact duplicate of row ${dup.n}` }); else uniq.push(r); }
    if (uniq.length === 1) { out.push(uniq[0]); return; }
    if (s.granularity === 'line') {                       // legitimate repeated charge lines → distinct records
      uniq.forEach((r, i) => { r.key = `${key}~${i + 1}`; out.push(r); }); return;
    }
    if (s.duplicates === 'first') { out.push(uniq[0]); uniq.slice(1).forEach((r) => dropped.push({ row: r, into: uniq[0], code: 'DUP_KEY_FIRST', message: `Same claim # as row ${uniq[0].n}; kept first` })); return; }
    if (s.duplicates === 'last') { const l = uniq[uniq.length - 1]; out.push(l); uniq.slice(0, -1).forEach((r) => dropped.push({ row: r, into: l, code: 'DUP_KEY_LAST', message: `Same claim # as row ${l.n}; kept last` })); return; }
    if (s.duplicates === 'skip') { uniq.forEach((r) => { r.skip = { code: 'DUP_KEY_CONFLICT', severity: 'error', message: 'Claim # appears on several rows with different values' }; conflicts.push(r); }); return; }
    const head = { ...uniq[0], custom: { ...uniq[0].custom }, issues: [...uniq[0].issues] };            // aggregate: charge lines of one claim
    for (const r of uniq.slice(1)) {
      head.balance = Math.round(((head.balance || 0) + (r.balance || 0)) * 100) / 100; head.billed_amt = Math.round(((head.billed_amt || 0) + (r.billed_amt || 0)) * 100) / 100;
      head.cpt = [...new Set([...(head.cpt || '').split(/[,;\s]+/), ...(r.cpt || '').split(/[,;\s]+/)].filter(Boolean))].join(', ') || null;
      head.denial_codes = [...new Set([head.denial_codes, r.denial_codes].filter(Boolean))].join(', ') || null;
      for (const f of ['paid_amt', 'allowed_amt', 'patient_resp'] as const) if (r[f] != null) head[f] = Math.round(((head[f] || 0) + r[f]!) * 100) / 100;
      if (r.denial_date && (!head.denial_date || r.denial_date < head.denial_date)) head.denial_date = r.denial_date;
      head.issues.push(...r.issues); head.dos = head.dos && r.dos ? (head.dos < r.dos ? head.dos : r.dos) : head.dos || r.dos;
    }
    const dosSet = new Set(uniq.map((u) => u.dos).filter(Boolean)); if (dosSet.size > 1) head.issues.push({ code: 'DOS_SPREAD', severity: 'info', message: `Lines span ${dosSet.size} dates of service — rolled into one claim at the earliest date` });
    head.merged = uniq.length; head.fp = head.fp; head.issues.push({ code: 'AGGREGATED_LINES', severity: 'info', message: `${uniq.length} charge lines rolled up into one claim (rows ${uniq.map((u) => u.n).join(', ')})` });
    aggregated.push({ into: head, parts: uniq.length }); out.push(head);
  });
  return { rows: out.sort((a, b) => a.n - b.n), dropped, aggregated, conflicts };
}
export { AGING_FIELDS, hash };
export type { FieldDef };
