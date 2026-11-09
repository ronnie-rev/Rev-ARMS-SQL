// X12 835 (ERA) parser and claim-matching planner. Pure functions: parse → plan → (store applies). No network, no PHI leaves the browser.
import type { Claim, Recovery, WorkLog } from '../types';
import { normClaimNo } from './normalize';

export interface Adj { group: string; code: string; amount: number; qty: number | null }
export interface EraLine { cpt: string; mods: string[]; charge: number; paid: number; units: number; allowed: number | null; adj: Adj[]; remarks: string[]; dos: string | null }
export interface EraClaim { pcn: string; icn: string | null; status: string; statusLabel: string; charge: number; paid: number; patientResp: number; patient: string | null; memberId: string | null; dos: string | null; adj: Adj[]; remarks: string[]; lines: EraLine[]; allowed: number | null; reversal: boolean; denied: boolean }
export interface Era { payer: string | null; payee: string | null; trace: string | null; method: string | null; date: string | null; amount: number; credit: boolean; claims: EraClaim[]; plb: { code: string; amount: number; ref: string }[]; warnings: string[]; segments: number; versionOk: boolean }

const STATUS: Record<string, string> = { '1': 'Processed as primary', '2': 'Processed as secondary', '3': 'Processed as tertiary', '4': 'Denied', '19': 'Primary — forwarded', '20': 'Secondary — forwarded', '21': 'Tertiary — forwarded', '22': 'Reversal of previous payment', '23': 'Not our claim — forwarded', '25': 'Predetermination' };
const num = (v: string | undefined) => { const n = parseFloat(v || ''); return Number.isFinite(n) ? n : 0; };
const ymd = (d: string | undefined) => (d && /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function parseEra(text: string): Era {
  const t = text.replace(/^﻿/, '').trim(); const warnings: string[] = [];
  if (!t.startsWith('ISA') || t.length < 106) throw new Error('This does not look like an X12 835 file (no ISA header).');
  const el = t[3], sub = t[104], term = t[105] === '\r' || t[105] === '\n' ? t[105] : t[105];
  const segs = t.split(term === '\n' || term === '\r' ? /\r?\n|\r/ : term).map((s) => s.trim()).filter(Boolean).map((s) => s.split(el));
  const era: Era = { payer: null, payee: null, trace: null, method: null, date: null, amount: 0, credit: true, claims: [], plb: [], warnings, segments: segs.length, versionOk: true };
  let cur: EraClaim | null = null; let line: EraLine | null = null; let ctx: 'hdr' | 'clm' | 'svc' = 'hdr'; let stSeen = 0, seCount: number | null = null, stStart = 0;
  const adjTo = (s: string[]): Adj[] => { const g = s[1]; const out: Adj[] = []; for (let i = 2; i + 1 < s.length; i += 3) if (s[i]) out.push({ group: g, code: s[i], amount: r2(num(s[i + 1])), qty: s[i + 2] ? num(s[i + 2]) : null }); return out; };
  segs.forEach((s, idx) => {
    switch (s[0]) {
      case 'ST': stSeen++; stStart = idx; if (s[1] !== '835') warnings.push(`Transaction set ${s[1]} is not an 835.`); break;
      case 'SE': seCount = Number(s[1]); if (seCount !== idx - stStart + 1) warnings.push(`SE segment count ${seCount} ≠ actual ${idx - stStart + 1} — file may be truncated or edited.`); break;
      case 'BPR': era.amount = r2(num(s[2])); era.credit = s[3] !== 'D'; era.method = s[4] || null; era.date = ymd(s[16]); break;
      case 'TRN': if (!era.trace) era.trace = s[2] || null; break;
      case 'N1': if (s[1] === 'PR') era.payer = s[2] || null; else if (s[1] === 'PE') era.payee = s[2] || null; break;
      case 'CLP': { cur = { pcn: s[1] || '', status: s[2] || '', statusLabel: STATUS[s[2]] || `Status ${s[2]}`, charge: r2(num(s[3])), paid: r2(num(s[4])), patientResp: r2(num(s[5])), icn: s[7] || null, patient: null, memberId: null, dos: null, adj: [], remarks: [], lines: [], allowed: null, reversal: s[2] === '22', denied: s[2] === '4' }; era.claims.push(cur); line = null; ctx = 'clm'; break; }
      case 'NM1': if (cur && s[1] === 'QC') cur.patient = [s[3], s[4]].filter(Boolean).join(', ') || null; if (cur && s[1] === 'IL') cur.memberId = s[9] || null; break;
      case 'CAS': if (cur) (ctx === 'svc' && line ? line.adj : cur.adj).push(...adjTo(s)); break;
      case 'SVC': { if (!cur) break; const c = (s[1] || '').split(sub); line = { cpt: c[1] || '', mods: c.slice(2).filter(Boolean), charge: r2(num(s[2])), paid: r2(num(s[3])), units: num(s[5]) || 1, allowed: null, adj: [], remarks: [], dos: null }; cur.lines.push(line); ctx = 'svc'; break; }
      case 'DTM': if (cur) { const d = ymd(s[2]); if (ctx === 'svc' && line) { if (['150', '472', '232'].includes(s[1])) line.dos = d; } else if (['232', '150', '232'].includes(s[1]) && !cur.dos) cur.dos = d; } break;
      case 'AMT': if (cur) { if (s[1] === 'B6') { if (ctx === 'svc' && line) line.allowed = r2(num(s[2])); else cur.allowed = r2(num(s[2])); } } break;
      case 'LQ': if (cur && s[1] === 'HE') (ctx === 'svc' && line ? line.remarks : cur.remarks).push(s[2]); break;
      case 'MOA': case 'MIA': if (cur) for (const x of s.slice(1)) if (/^(MA|N)\d+/.test(x)) cur.remarks.push(x); break;
      case 'PLB': for (let i = 3; i + 1 < s.length; i += 2) { const [code, ref] = (s[i] || '').split(sub); if (code) era.plb.push({ code, ref: ref || '', amount: r2(num(s[i + 1])) }); } break;
    }
  });
  if (stSeen === 0) warnings.push('No ST segment found.');
  for (const c of era.claims) { const dd = c.lines.find((l) => l.dos)?.dos; if (!c.dos && dd) c.dos = dd; if (!c.remarks.length) c.remarks = [...new Set(c.lines.flatMap((l) => l.remarks))]; }
  const paid = r2(era.claims.reduce((a, c) => a + c.paid, 0)); const plb = r2(era.plb.reduce((a, p) => a + p.amount, 0));
  if (Math.abs(r2(paid - plb) - era.amount) > 0.01 && Math.abs(paid - era.amount) > 0.01) warnings.push(`Out of balance: payment ${era.amount.toFixed(2)} ≠ claim payments ${paid.toFixed(2)} − provider adjustments ${plb.toFixed(2)}. Review before posting.`);
  for (const c of era.claims) { const lp = r2(c.lines.reduce((a, l) => a + l.paid, 0)); if (c.lines.length && Math.abs(lp - c.paid) > 0.01) warnings.push(`Claim ${c.pcn}: line payments ${lp.toFixed(2)} ≠ claim payment ${c.paid.toFixed(2)}.`); }
  return era;
}

export const adjCodes = (c: { adj: Adj[] }) => [...new Set(c.adj.map((a) => `${a.group}-${a.code}`))];
/** Contractual write-down (CO-45 etc.), patient responsibility (PR), and everything else, for one claim. */
export function adjSplit(c: EraClaim) { const s = { contractual: 0, patient: 0, other: 0 }; for (const a of c.adj) { if (a.group === 'PR') s.patient += a.amount; else if (a.group === 'CO' && a.code === '45') s.contractual += a.amount; else s.other += a.amount; } return { contractual: r2(s.contractual), patient: r2(s.patient), other: r2(s.other) }; }

// ── matching & plan ──
export type EraMatch = 'matched' | 'unmatched' | 'ambiguous' | 'duplicate';
export interface EraRow { era: EraClaim; claim: Claim | null; match: EraMatch; via: string; expectedBalance: number | null; balanceGap: null; codes: string[]; lifecycle: string; recovery: Omit<Recovery, 'id' | 'created_at'> | null; note: string }
export interface EraPlan { rows: EraRow[]; totals: { claims: number; matched: number; unmatched: number; ambiguous: number; duplicate: number; paid: number; denied: number; reversals: number; matchedPaid: number }; duplicateFile: boolean }

export function planEra(era: Era, claims: Claim[], o: { clientId: string; today: string; workLog: WorkLog[]; windowDays: number; posted: Set<string>; usersName?: (id: string | null) => string }): EraPlan {
  const mine = claims.filter((c) => c.client_id === o.clientId); const byKey = new Map<string, Claim[]>(); const add = (k: string, c: Claim) => { if (!k) return; (byKey.get(k) || byKey.set(k, []).get(k)!).push(c); };
  for (const c of mine) { add(normClaimNo(c.claim_no).key, c); for (const a of c.aliases || []) add(normClaimNo(a).key, c); if (c.account_id) add('ACCT:' + normClaimNo(c.account_id).key, c); }
  const rows: EraRow[] = []; const seen = new Set<string>();
  for (const e of era.claims) {
    const k = normClaimNo(e.pcn).key; let cand = [...new Set(byKey.get(k) || [])]; let via = 'claim number';
    if (!cand.length) { cand = [...new Set(byKey.get('ACCT:' + k) || [])]; via = 'account # (pcn)'; if (cand.length > 1 && e.dos) { const f = cand.filter((c) => c.dos === e.dos); if (f.length) cand = f; } if (cand.length > 1) { const f = cand.filter((c) => Math.abs(c.billed_amt - e.charge) < 0.01); if (f.length) cand = f; } }
    const claim = cand.length === 1 ? cand[0] : null; const match: EraMatch = !cand.length ? 'unmatched' : cand.length > 1 ? 'ambiguous' : 'matched';
    const dupKey = `${era.trace}:${e.pcn}:${e.icn || ''}`; const dup = o.posted.has(dupKey) || seen.has(dupKey); seen.add(dupKey);
    const codes = [...adjCodes(e), ...e.remarks.filter((r) => /^(MA|N)\d+/.test(r))];
    const sp = adjSplit(e); const expected = claim ? r2(claim.balance - e.paid - sp.contractual + (e.reversal ? 2 * e.paid : 0)) : null;
    const lifecycle = e.reversal ? 'WRK' : e.denied ? 'DEN' : e.paid > 0 && sp.patient > 0 && e.paid + sp.contractual + sp.patient >= e.charge - 0.01 ? 'PTB' : e.paid > 0 && e.paid + sp.contractual + sp.patient < e.charge - 0.01 ? 'PRT' : e.paid > 0 ? 'PAY' : 'DEN';
    let recovery: EraRow['recovery'] = null;
    if (claim && !dup && !e.reversal && e.paid > 0) {
      const when = new Date(o.today + 'T12:00:00Z').getTime(); const touches = o.workLog.filter((w) => w.claim_id === claim.id && w.user_id && when - new Date(w.created_at).getTime() <= o.windowDays * 864e5).sort((a, b) => b.created_at.localeCompare(a.created_at));
      const w = touches[0]; recovery = { claim_id: claim.id, client_id: claim.client_id, batch_id: null, user_id: w?.user_id ?? null, user_name: w?.user_name ?? null, amount: e.paid, type: 'payment', basis: 'era835', share: 1, touch_id: w?.id ?? null, window_days: o.windowDays, occurred_on: era.date || o.today };
    }
    rows.push({ era: e, claim, match: dup ? 'duplicate' : match, via, expectedBalance: expected, balanceGap: null, codes, lifecycle, recovery, note: e.reversal ? 'Payment reversal — review manually' : e.denied ? 'Denied — codes copied to the claim' : e.paid > 0 ? 'Payment verified on remit' : 'Zero pay' });
  }
  const m = rows.filter((r) => r.match === 'matched');
  return { rows, duplicateFile: !!era.trace && rows.length > 0 && rows.every((r) => r.match === 'duplicate'), totals: { claims: rows.length, matched: m.length, unmatched: rows.filter((r) => r.match === 'unmatched').length, ambiguous: rows.filter((r) => r.match === 'ambiguous').length, duplicate: rows.filter((r) => r.match === 'duplicate').length, paid: r2(era.claims.reduce((a, c) => a + c.paid, 0)), denied: era.claims.filter((c) => c.denied).length, reversals: era.claims.filter((c) => c.reversal).length, matchedPaid: r2(m.reduce((a, r) => a + r.era.paid, 0)) } };
}

// ── generator (demo data + tests): builds a syntactically valid, balanced 835 from a list of outcomes ──
export interface EraSpec { pcn: string; charge: number; paid: number; patient?: number; contractual?: number; deny?: { group: string; code: string; rarc?: string }; patientName?: string; dos?: string; cpt?: string }
export function makeEra835(o: { payer: string; payee: string; trace: string; date: string; claims: EraSpec[] }): string {
  const seg: string[] = []; const f = (n: number) => n.toFixed(2); const d8 = (d: string) => d.replace(/-/g, '');
  const total = o.claims.reduce((a, c) => a + c.paid, 0);
  seg.push(`ISA*00*          *00*          *ZZ*${o.payer.slice(0, 15).padEnd(15)}*ZZ*ARMS           *${d8(o.date).slice(2)}*1200*^*00501*000000001*0*P*:`, `GS*HP*${o.payer.slice(0, 10)}*ARMS*${d8(o.date)}*1200*1*X*005010X221A1`);
  const st: string[] = ['ST*835*0001', `BPR*I*${f(total)}*C*ACH*CCP*01*999999999*DA*123456*1512345678**01*888888888*DA*654321*${d8(o.date)}`, `TRN*1*${o.trace}*1512345678`, `N1*PR*${o.payer}`, `N1*PE*${o.payee}*XX*1234567890`];
  o.claims.forEach((c, i) => {
    const st4 = c.deny ? '4' : '1'; const co = c.contractual ?? 0; const pr = c.patient ?? 0; const cpt = c.cpt || '99214';
    st.push(`LX*${i + 1}`, `CLP*${c.pcn}*${st4}*${f(c.charge)}*${f(c.paid)}*${f(pr)}*12*ICN${i + 1}${o.trace.slice(-4)}`, `NM1*QC*1*${(c.patientName || 'DOE, JANE').split(', ')[0]}*${(c.patientName || 'DOE, JANE').split(', ')[1] || 'JANE'}`, `DTM*232*${d8(c.dos || o.date)}`);
    const cas = c.deny ? [`CAS*${c.deny.group}*${c.deny.code}*${f(c.charge)}`] : [...(co ? [`CAS*CO*45*${f(co)}`] : []), ...(pr ? [`CAS*PR*1*${f(pr)}`] : [])];
    st.push(...cas, `SVC*HC:${cpt}*${f(c.charge)}*${f(c.paid)}**1`, ...cas, ...(c.deny?.rarc ? [`LQ*HE*${c.deny.rarc}`] : []));
  });
  st.push(`SE*${st.length + 1}*0001`);
  seg.push(...st, 'GE*1*1', 'IEA*1*000000001');
  return seg.join('~') + '~';
}
