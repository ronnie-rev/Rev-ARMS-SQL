// Pattern & trend miner: frequency statistics (lift, z-score, medians) over your own claims — explainable, no black box.
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { BatchSummary, Claim, ImportBatch, WorkLog } from '../types';
import { familyOf, splitCodes, type Carc } from './carc';
import { normCpt } from './normalize';

export interface Pattern { id: string; kind: 'payer-rca' | 'payer-code' | 'cpt-denial' | 'provider' | 'trend' | 'systemic' | 'speed' | 'growth'; severity: 'high' | 'med' | 'info'; title: string; detail: string; evidence: { n: number; lift?: number; pct?: number }; to?: string }
export interface PatternInput { claims: Claim[]; workLog: WorkLog[]; batches: ImportBatch[]; carc: Map<string, Carc>; today: string; minN?: number }
const pct = (x: number) => `${Math.round(x * 100)}%`;
const enc = encodeURIComponent;
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function minePatterns(inp: PatternInput): Pattern[] {
  const { claims, workLog, batches, carc, today } = inp; const minN = inp.minN ?? 8; const out: Pattern[] = [];
  // 1) payer × root-cause concentration (lift over the overall mix)
  const rcaClaims = claims.filter((c) => c.rca); const gRca = new Map<string, number>(); rcaClaims.forEach((c) => gRca.set(c.rca!, (gRca.get(c.rca!) || 0) + 1));
  const byPayer = new Map<string, Claim[]>(); rcaClaims.forEach((c) => byPayer.set(c.payer || 'Unknown', [...(byPayer.get(c.payer || 'Unknown') || []), c]));
  byPayer.forEach((list, payer) => { if (list.length < minN * 2) return; const m = new Map<string, number>(); list.forEach((c) => m.set(c.rca!, (m.get(c.rca!) || 0) + 1));
    m.forEach((n, rca) => { const share = n / list.length, base = (gRca.get(rca) || 0) / rcaClaims.length; if (n >= minN && base > 0 && share / base >= 1.8 && share >= 0.2) out.push({ id: `pr:${payer}:${rca}`, kind: 'payer-rca', severity: share / base >= 2.5 ? 'high' : 'med', title: `${payer}: “${rca}” is ${(share / base).toFixed(1)}× more common than usual`, detail: `${pct(share)} of ${payer} claims are coded “${rca}” versus ${pct(base)} overall (${n} claims). Look for a payer-specific rule or a front-end fix.`, evidence: { n, lift: share / base, pct: share }, to: `/worklist?payer=${enc(payer)}&rca=${enc(rca)}` }); }); });
  // 2) payer × denial-code family
  const withCodes = claims.filter((c) => splitCodes(c.denial_codes).length); const gFam = new Map<string, number>(); const famRows: { c: Claim; fam: string }[] = [];
  withCodes.forEach((c) => { for (const k of new Set(splitCodes(c.denial_codes).map((x) => familyOf(x, carc)))) { gFam.set(k, (gFam.get(k) || 0) + 1); famRows.push({ c, fam: k }); } });
  const pf = new Map<string, Map<string, number>>(); const pn = new Map<string, number>();
  famRows.forEach(({ c, fam }) => { const p = c.payer || 'Unknown'; const m = pf.get(p) || new Map<string, number>(); m.set(fam, (m.get(fam) || 0) + 1); pf.set(p, m); }); withCodes.forEach((c) => pn.set(c.payer || 'Unknown', (pn.get(c.payer || 'Unknown') || 0) + 1));
  pf.forEach((m, payer) => { const tot = pn.get(payer) || 0; if (tot < minN * 2) return; m.forEach((n, fam) => { const share = n / tot, base = (gFam.get(fam) || 0) / withCodes.length; if (n >= minN && fam !== 'Unclassified' && fam !== 'Contractual' && base > 0 && share / base >= 1.8 && share >= 0.2) out.push({ id: `pc:${payer}:${fam}`, kind: 'payer-code', severity: 'med', title: `${payer} denies for “${fam}” ${(share / base).toFixed(1)}× more than other payers`, detail: `${n} of ${tot} coded denials (${pct(share)}) vs ${pct(base)} overall.`, evidence: { n, lift: share / base, pct: share }, to: `/worklist?payer=${enc(payer)}` }); }); });
  // 3) CPT denial rate outliers
  const overall = claims.length ? withCodes.length / claims.length : 0; const byCpt = new Map<string, { n: number; d: number }>();
  claims.forEach((c) => { const k = normCpt(c.cpt).split('+')[0]; if (!k) return; const e = byCpt.get(k) || { n: 0, d: 0 }; e.n++; if (splitCodes(c.denial_codes).length) e.d++; byCpt.set(k, e); });
  byCpt.forEach((e, cpt) => { if (e.n >= minN * 2 && overall > 0 && e.d / e.n / overall >= 1.6 && e.d / e.n >= 0.3) out.push({ id: `cpt:${cpt}`, kind: 'cpt-denial', severity: 'med', title: `CPT ${cpt} is denied ${(e.d / e.n / overall).toFixed(1)}× more than average`, detail: `${e.d} of ${e.n} claims (${pct(e.d / e.n)}) carry denial codes vs ${pct(overall)} overall. Check modifiers, documentation and payer policy for this code.`, evidence: { n: e.n, lift: e.d / e.n / overall, pct: e.d / e.n }, to: `/worklist?q=${enc(cpt)}` }); });
  // 4) systemic issue: same payer + CPT + denial family repeating
  const cluster = new Map<string, number>(); famRows.forEach(({ c, fam }) => { const k = `${c.payer}|${normCpt(c.cpt).split('+')[0]}|${fam}`; cluster.set(k, (cluster.get(k) || 0) + 1); });
  cluster.forEach((n, k) => { const [payer, cpt, fam] = k.split('|'); if (n >= 5 && cpt && fam !== 'Unclassified' && fam !== 'Contractual' && fam !== 'Patient resp') out.push({ id: `sys:${k}`, kind: 'systemic', severity: 'high', title: `Systemic: ${payer} · CPT ${cpt} · “${fam}” (${n} claims)`, detail: 'The same payer, procedure and denial reason keep recurring — fix it once upstream (billing rule, modifier, documentation) instead of working each claim.', evidence: { n }, to: `/worklist?payer=${enc(payer)}&q=${enc(cpt)}` }); });
  // 5) provider outliers inside a client
  const prov = new Map<string, { n: number; d: number }>(); claims.forEach((c) => { if (!c.provider) return; const k = `${c.client_id}|${c.provider}`; const e = prov.get(k) || { n: 0, d: 0 }; e.n++; if (splitCodes(c.denial_codes).length) e.d++; prov.set(k, e); });
  const perClient = new Map<string, { n: number; d: number }>(); prov.forEach((e, k) => { const c = k.split('|')[0]; const t = perClient.get(c) || { n: 0, d: 0 }; t.n += e.n; t.d += e.d; perClient.set(c, t); });
  prov.forEach((e, k) => { const [cid, name] = k.split('|'); const t = perClient.get(cid)!; if (e.n >= 15 && t.n > e.n * 1.5 && e.d / e.n - t.d / t.n >= 0.15) out.push({ id: `prov:${k}`, kind: 'provider', severity: 'info', title: `${name}: denial rate ${pct(e.d / e.n)} vs ${pct(t.d / t.n)} for the practice`, detail: 'Provider-level outlier — often a documentation or coding-habit issue worth feeding back to the practice.', evidence: { n: e.n, pct: e.d / e.n } }); });
  // 6) weekly root-cause trend (z-score of the latest 2 weeks vs the prior 6)
  const weekOf = (d: string) => Math.floor(differenceInCalendarDays(parseISO(today), parseISO(d)) / 7); const series = new Map<string, number[]>();
  workLog.forEach((w) => { if (!w.rca) return; const wk = weekOf(w.work_date); if (wk < 0 || wk > 7) return; const a = series.get(w.rca) || Array(8).fill(0); a[wk]++; series.set(w.rca, a); });
  series.forEach((a, rca) => { const recent = (a[0] + a[1]) / 2, prior = a.slice(2); const mean = prior.reduce((x, y) => x + y, 0) / prior.length; const sd = Math.sqrt(prior.reduce((x, y) => x + (y - mean) ** 2, 0) / prior.length) || 1; const z = (recent - mean) / sd;
    if (z >= 2 && a[0] + a[1] >= 8) out.push({ id: `trend:${rca}`, kind: 'trend', severity: z >= 3 ? 'high' : 'med', title: `“${rca}” touches are surging (z=${z.toFixed(1)})`, detail: `${a[0] + a[1]} touches in the last 2 weeks vs a weekly average of ${mean.toFixed(1)} before.`, evidence: { n: a[0] + a[1], lift: mean ? recent / mean : undefined }, to: `/worklist?rca=${enc(rca)}` }); });
  // 7) payer speed: median days first-seen → closed
  const durations = new Map<string, number[]>(); claims.filter((c) => c.closed_at).forEach((c) => { const d = differenceInCalendarDays(parseISO(c.closed_at!.slice(0, 10)), parseISO(c.created_at.slice(0, 10))); if (d >= 0) durations.set(c.payer || 'Unknown', [...(durations.get(c.payer || 'Unknown') || []), d]); });
  const allD = [...durations.values()].flat(); const gMed = median(allD);
  durations.forEach((l, payer) => { if (l.length >= minN && gMed > 0 && median(l) / gMed >= 1.5) out.push({ id: `speed:${payer}`, kind: 'speed', severity: 'info', title: `${payer} takes ${Math.round(median(l))} days to resolve (median ${Math.round(gMed)} overall)`, detail: `Based on ${l.length} resolved claims. Plan cash flow and follow-up cadence accordingly.`, evidence: { n: l.length, lift: median(l) / gMed } }); });
  // 8) payer balance growth between the last two snapshots that carry payer detail
  const snaps = batches.filter((b) => b.summary?.payers && b.status !== 'rolled_back').sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (snaps.length >= 2) { const a = snaps[snaps.length - 2].summary as BatchSummary, b = snaps[snaps.length - 1].summary as BatchSummary;
    Object.entries(b.payers || {}).forEach(([p, v]) => { const was = a.payers?.[p] || 0; if (was > 0 && v - was >= 5000 && v / was >= 1.15) out.push({ id: `grow:${p}`, kind: 'growth', severity: 'med', title: `${p} AR grew ${pct(v / was - 1)} since the previous snapshot`, detail: `From $${Math.round(was).toLocaleString()} to $${Math.round(v).toLocaleString()}. Investigate new denials or slow pay.`, evidence: { n: 0, lift: v / was }, to: `/payers/${enc(p)}` }); }); }
  const order = { high: 0, med: 1, info: 2 }; return out.sort((a, b) => order[a.severity] - order[b.severity] || (b.evidence.lift || 0) - (a.evidence.lift || 0));
}
