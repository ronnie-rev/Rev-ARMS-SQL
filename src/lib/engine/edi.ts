// X12 viewer: tokenises any ASC X12 file (835 remittance, 837 claim, 277CA status, 999/997 acknowledgement, 270/271, 276) and explains it in plain language.
// Pure and browser-safe (no Node APIs). The popular `node-x12` package needs Node streams/crypto, so this small reader is used instead.
export interface Seg { id: string; el: string[]; line: number }
export interface X12 { segs: Seg[]; elementSep: string; segSep: string; subSep: string; interchanges: { sender: string; receiver: string; date: string; control: string; version: string }[]; types: string[]; error?: string }

export function parseX12(raw: string): X12 {
  const text = raw.replace(/^﻿/, '').trim(); const empty: X12 = { segs: [], elementSep: '*', segSep: '~', subSep: ':', interchanges: [], types: [] };
  if (!text.startsWith('ISA') || text.length < 106) return { ...empty, error: 'This does not look like an X12 file (it should start with an ISA segment of at least 106 characters).' };
  const elementSep = text[3]; const subSep = text[104]; const segSep = text[105]; const body = text.split(segSep === '\n' ? '\n' : segSep);
  const segs: Seg[] = []; let line = 0;
  for (const chunk of body) { const t = chunk.replace(/[\r\n]+/g, '').trim(); if (!t) continue; line++; const el = t.split(elementSep); segs.push({ id: el[0], el: el.slice(1), line }); }
  const interchanges = segs.filter((s) => s.id === 'ISA').map((s) => ({ sender: (s.el[5] || '').trim(), receiver: (s.el[7] || '').trim(), date: s.el[8] || '', control: (s.el[12] || '').trim(), version: s.el[11] || '' }));
  return { segs, elementSep, segSep, subSep, interchanges, types: [...new Set(segs.filter((s) => s.id === 'ST').map((s) => s.el[0]))] };
}
export const SEG_NAME: Record<string, string> = { ISA: 'Interchange header', IEA: 'Interchange trailer', GS: 'Functional group header', GE: 'Functional group trailer', ST: 'Transaction header', SE: 'Transaction trailer', BPR: 'Payment information', TRN: 'Trace / check number', DTM: 'Date', N1: 'Name (payer / payee)', N3: 'Street address', N4: 'City, state, ZIP', REF: 'Reference number', LX: 'Line counter', CLP: 'Claim payment', NM1: 'Individual or organisation name', CAS: 'Adjustment', SVC: 'Service line payment', AMT: 'Amount', PLB: 'Provider-level adjustment', QTY: 'Quantity', LQ: 'Remark code', MOA: 'Outpatient adjudication', MIA: 'Inpatient adjudication', CLM: 'Claim', HI: 'Diagnosis codes', SV1: 'Professional service', SV2: 'Institutional service', SBR: 'Subscriber info', PAT: 'Patient info', DMG: 'Demographics', STC: 'Status information', HL: 'Hierarchy level', BHT: 'Beginning of transaction', AK1: 'Group acknowledged', AK9: 'Group response', TA1: 'Interchange acknowledgement', IK3: 'Segment error', IK4: 'Element error', PRV: 'Provider specialty', CUR: 'Currency', PER: 'Contact' };
export const CLP_STATUS: Record<string, string> = { '1': 'Processed as primary', '2': 'Processed as secondary', '3': 'Processed as tertiary', '4': 'Denied', '19': 'Processed as primary, forwarded to next payer', '20': 'Processed as secondary, forwarded', '21': 'Processed as tertiary, forwarded', '22': 'Reversal of previous payment', '23': 'Not our claim, forwarded', '25': 'Predetermination pricing only' };
export const CAS_GROUP: Record<string, string> = { CO: 'Contractual obligation', PR: 'Patient responsibility', OA: 'Other adjustment', PI: 'Payer initiated reduction', CR: 'Correction / reversal' };
const num = (s: string | undefined) => { const n = Number(s); return Number.isFinite(n) ? n : 0; };
const fmtDate = (d: string | undefined) => (d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d || '');

export interface Adj { group: string; code: string; amount: number; qty: number }
export interface RemitLine { proc: string; charge: number; paid: number; units: number; dos: string; adjustments: Adj[] }
export interface RemitClaim { controlNo: string; status: string; statusText: string; charge: number; paid: number; patientResp: number; payerClaimNo: string; filing: string; patientName: string; adjustments: Adj[]; lines: RemitLine[]; dos: string }
export interface Remit835 { payer: string; payee: string; payeeNpi: string; method: string; total: number; date: string; trace: string; claims: RemitClaim[]; providerAdj: { reason: string; amount: number }[]; sumPaid: number; reconciles: boolean; difference: number }
const readCas = (s: Seg): Adj[] => { const out: Adj[] = []; for (let i = 1; i + 1 < s.el.length; i += 3) if (s.el[i]) out.push({ group: s.el[0], code: s.el[i], amount: num(s.el[i + 1]), qty: num(s.el[i + 2]) }); return out; };

/** Plain-language view of an 835: who paid, how much, and per claim what was paid, adjusted or denied and why. */
export function summarize835(x: X12): Remit835 | null {
  if (!x.types.includes('835')) return null; const r: Remit835 = { payer: '', payee: '', payeeNpi: '', method: '', total: 0, date: '', trace: '', claims: [], providerAdj: [], sumPaid: 0, reconciles: true, difference: 0 };
  let cur: RemitClaim | null = null; let line: RemitLine | null = null; let n1: string | null = null;
  for (const s of x.segs) {
    switch (s.id) {
      case 'BPR': r.total = num(s.el[1]); r.method = ({ ACH: 'ACH', CHK: 'Check', NON: 'No payment', FWT: 'Wire' } as Record<string, string>)[s.el[3]] || s.el[3] || ''; r.date = fmtDate(s.el[15]); break;
      case 'TRN': r.trace = s.el[1] || ''; break;
      case 'N1': n1 = s.el[0]; if (s.el[0] === 'PR') r.payer = s.el[1] || ''; else if (s.el[0] === 'PE') { r.payee = s.el[1] || ''; if (s.el[2] === 'XX') r.payeeNpi = s.el[3] || ''; } break;
      case 'CLP': cur = { controlNo: s.el[0] || '', status: s.el[1] || '', statusText: CLP_STATUS[s.el[1]] || `Status ${s.el[1]}`, charge: num(s.el[2]), paid: num(s.el[3]), patientResp: num(s.el[4]), filing: s.el[5] || '', payerClaimNo: s.el[6] || '', patientName: '', adjustments: [], lines: [], dos: '' }; r.claims.push(cur); line = null; break;
      case 'NM1': if (cur && s.el[0] === 'QC') cur.patientName = [s.el[2], s.el[3]].filter(Boolean).join(', '); break;
      case 'SVC': if (cur) { const proc = (s.el[0] || '').split(x.subSep).slice(1, 2).join('') || s.el[0] || ''; line = { proc, charge: num(s.el[1]), paid: num(s.el[2]), units: num(s.el[4]) || 1, dos: '', adjustments: [] }; cur.lines.push(line); } break;
      case 'CAS': if (cur) (line || cur).adjustments.push(...readCas(s)); break;
      case 'DTM': if (cur && ['232', '150', '472'].includes(s.el[0])) { const d = fmtDate(s.el[1]); if (line) line.dos = d; else if (!cur.dos) cur.dos = d; } break;
      case 'PLB': for (let i = 2; i + 1 < s.el.length; i += 2) if (s.el[i]) r.providerAdj.push({ reason: (s.el[i] || '').split(x.subSep)[0], amount: num(s.el[i + 1]) }); break;
      default: void n1;
    }
  }
  r.sumPaid = Math.round(r.claims.reduce((a, c) => a + c.paid, 0) * 100) / 100; const prov = r.providerAdj.reduce((a, p) => a + p.amount, 0); r.difference = Math.round((r.total - (r.sumPaid - prov)) * 100) / 100; r.reconciles = Math.abs(r.difference) < 0.01; return r;
}
export interface Claim837 { id: string; amount: number; place: string; dx: string[]; lines: { proc: string; amount: number; units: number }[] }
export function summarize837(x: X12): { claims: Claim837[]; billingProvider: string } | null {
  if (!x.types.includes('837')) return null; const claims: Claim837[] = []; let cur: Claim837 | null = null; let billing = ''; let loop: string | null = null;
  for (const s of x.segs) { if (s.id === 'NM1') { loop = s.el[0]; if (s.el[0] === '85') billing = s.el[2] || s.el[3] || ''; } else if (s.id === 'CLM') { cur = { id: s.el[0], amount: num(s.el[1]), place: (s.el[4] || '').split(x.subSep)[0], dx: [], lines: [] }; claims.push(cur); } else if (s.id === 'HI' && cur) cur.dx.push(...s.el.map((e) => e.split(x.subSep)[1]).filter(Boolean)); else if ((s.id === 'SV1' || s.id === 'SV2') && cur) cur.lines.push({ proc: ((s.id === 'SV1' ? s.el[0] : s.el[1]) || '').split(x.subSep)[1] || '', amount: num(s.el[s.id === 'SV1' ? 1 : 2]), units: num(s.el[s.id === 'SV1' ? 3 : 4]) || 1 }); }
  void loop; return { claims, billingProvider: billing };
}
export interface Status277 { claimId: string; category: string; status: string; amount: number }
export function summarize277(x: X12): Status277[] | null {
  if (!x.types.includes('277')) return null; const out: Status277[] = []; let claimId = ''; for (const s of x.segs) { if (s.id === 'TRN') claimId = s.el[1] || claimId; if (s.id === 'REF' && s.el[0] === '1K') claimId = s.el[1] || claimId; if (s.id === 'STC') { const [cat, code] = (s.el[0] || '').split(x.subSep); out.push({ claimId, category: cat || '', status: code || '', amount: num(s.el[3]) }); } } return out;
}
