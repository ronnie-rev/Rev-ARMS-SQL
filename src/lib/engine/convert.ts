// CPT-/line-level report → claim-level, explained. A pure summary of what the importer did so a person can trust it (or spot a bad file) before committing.
import type { Row, CollapseOut } from './rows';
export interface ConvertReport { fileRows: number; claims: number; lineLevel: boolean; rolledUp: number; maxLines: number; exactDupes: number; splitKeys: number; generated: number; encounterKeyed: number; dosSpread: number; ambiguous: { key: string; rows: number[]; why: string }[]; totals: { before: number; after: number; diff: number }; verdict: 'clean' | 'review'; notes: string[] }
const r2 = (n: number) => Math.round(n * 100) / 100;
export function convertReport(fileRows: number, built: Row[], col: CollapseOut): ConvertReport {
  const rolled = col.aggregated.length; const lines = col.aggregated.reduce((a, g) => a + g.parts, 0); const exact = col.dropped.filter((d) => d.code === 'DUPLICATE_ROW').length;
  const has = (code: string) => col.rows.filter((r) => r.issues.some((i) => i.code === code)).length;
  const split = has('KEY_SPLIT_PAYER'); const enc = has('ENCOUNTER_ID'); const spread = has('DOS_SPREAD'); const gen = col.rows.filter((r) => r.generated).length;
  const sum = (rs: Row[]) => r2(rs.reduce((a, r) => a + (r.balance || 0), 0)); const before = sum(built); const dropped = sum(col.dropped.map((d) => d.row)); const after = sum(col.rows);
  const ambiguous: ConvertReport['ambiguous'] = []; const seen = new Map<string, Row[]>();
  for (const r of col.rows) { if (!r.generated || !r.fp) continue; const k = r.fp + '|' + (r.payer || ''); seen.set(k, [...(seen.get(k) || []), r]); }
  for (const [, rs] of seen) if (rs.length > 1) ambiguous.push({ key: rs[0].claim_no || rs[0].key, rows: rs.map((x) => x.n), why: 'Several generated IDs share the same account, date, CPT and amount — could be a real repeat or a double-posted line' });
  for (const r of col.rows) if (r.issues.some((i) => i.code === 'IDENTICAL_ROW')) ambiguous.push({ key: r.claim_no || r.key, rows: [r.n], why: 'Identical to an earlier row but has no claim number — kept as a separate claim' });
  const notes: string[] = []; const lineLevel = rolled > 0 && lines / Math.max(1, fileRows) >= 0.15; const maxLines = Math.max(0, ...col.aggregated.map((g) => g.parts));
  if (lineLevel) notes.push(`This looks like a line- / CPT-level report: ${lines} lines were combined into ${rolled} claims (up to ${maxLines} lines each). Balances and billed amounts were added up; CPT and denial codes were merged.`);
  else if (rolled) notes.push(`${lines} lines were combined into ${rolled} claims.`);
  if (exact) notes.push(`${exact} exact duplicate row(s) were dropped ($${dropped.toLocaleString('en-US')} not double counted).`);
  if (split) notes.push(`${split} claim number(s) appeared under different payers and were kept as separate claims — check the numbers.`);
  if (enc) notes.push(`${enc} row(s) had no claim number; the encounter # was used as the identity.`);
  if (gen - enc > 0) notes.push(`${gen - enc} row(s) got a generated ID (no claim # and no encounter #).`);
  if (spread) notes.push(`${spread} claim(s) have lines on different dates of service (kept at the earliest date).`);
  const diff = r2(before - dropped - after);
  return { fileRows, claims: col.rows.length, lineLevel, rolledUp: rolled, maxLines, exactDupes: exact, splitKeys: split, generated: gen, encounterKeyed: enc, dosSpread: spread, ambiguous: ambiguous.slice(0, 20), totals: { before, after, diff }, verdict: ambiguous.length || split || Math.abs(diff) > 0.5 ? 'review' : 'clean', notes };
}
