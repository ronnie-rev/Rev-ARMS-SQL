// Appeal intelligence: should we appeal, what proof wins, how strong is the letter, where/when to send, and when to chase — all from your own history plus well-known denial playbooks.
import type { Activity, Appeal, Claim } from '../types';
import { splitDenials } from '../kb';
import { appealOdds } from './learning';
import { callsOf, payerContactRate } from './calls';

const dd = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/** Proof that typically decides each denial family. First match wins; the generic list is the fallback. */
const EVIDENCE: { test: RegExp; label: string; items: [string, string][] }[] = [
  { test: /^CO-?(29)$/, label: 'Timely filing', items: [['Clearinghouse acceptance / 277CA report with original submission date', 'Proves the claim was filed in time'], ['Payer rejection or acknowledgement letters showing earlier attempts', 'Shows diligent prior filing'], ['Copy of the original claim as submitted', 'Matches dates and amounts']] },
  { test: /^CO-?(50|55|56|57|58|59)$/, label: 'Medical necessity', items: [['Clinical notes / operative report supporting need', 'Core of a medical-necessity appeal'], ['Payer policy or LCD/NCD criteria with each criterion mapped to the chart', 'Payers must apply their own published criteria'], ['Letter of medical necessity from the treating provider', 'Adds the clinician’s reasoning'], ['Peer-to-peer request (if offered)', 'Often overturns on a call']] },
  { test: /^CO-?(15|197|198|199)$|^N54$/, label: 'Authorization / referral', items: [['Authorization or referral number and approval letter', 'Direct proof of approval'], ['Eligibility verification screenshot dated before the service', 'Shows due diligence'], ['Retro-authorization request (if allowed)', 'Some payers accept it within a window']] },
  { test: /^CO-?(97|234|236)$/, label: 'Bundling / global period', items: [['Modifier rationale (59/XS/25/57/79) with documentation', 'Shows the service was separate'], ['Operative / procedure notes showing distinct sites or sessions', 'NCCI edits turn on distinct service'], ['NCCI edit and CMS policy reference', 'Cite the edit being overridden']] },
  { test: /^CO-?(16|4|11|181|182|183|184|185|251)$/, label: 'Billing error / missing info', items: [['Corrected claim (frequency code 7) with the missing/invalid field fixed', 'Usually a corrected claim, not an appeal'], ['Copy of the denial showing the exact missing item', 'Anchor for the fix'], ['Proof of the correct code/modifier/diagnosis from the chart', 'Supports the change']] },
  { test: /^CO-?(18)$/, label: 'Duplicate', items: [['Both claim copies showing different dates/lines/modifiers', 'Shows it is not a duplicate'], ['Remittance for the original claim', 'Shows what was already paid']] },
  { test: /^CO-?(22|23|109|24)$/, label: 'Coordination of benefits / wrong payer', items: [['Primary EOB (for secondary) or updated eligibility showing the correct primary', 'COB order proof'], ['Patient COB questionnaire / payer COB confirmation', 'Resolves who is primary']] },
  { test: /^CO-?(45|253|94)$/, label: 'Contractual adjustment / underpayment', items: [['Contract or fee-schedule page for each CPT', 'Proves the allowed amount'], ['Remittance (835/EOB) showing the paid amount and allowed', 'Calculates the variance'], ['Underpayment worksheet (expected vs paid)', 'Makes the ask exact']] },
  { test: /^PR-?/, label: 'Patient responsibility', items: [['Benefit verification showing coverage for the service', 'Challenges the cost-share'], ['EOB with the deductible/coinsurance applied', 'Shows the amounts in dispute']] },
];
const GENERIC: [string, string][] = [['Copy of the denial / EOB / remittance', 'Identifies exactly what is being appealed'], ['Original claim as submitted', 'Matches dates, codes and amounts'], ['Supporting clinical or billing documentation', 'Evidence for the argument']];

export function evidenceFor(codes: string[]): { family: string; items: { item: string; why: string }[] } {
  for (const c of codes) { const hit = EVIDENCE.find((e) => e.test.test(c.toUpperCase())); if (hit) return { family: hit.label, items: hit.items.map(([item, why]) => ({ item, why })) }; }
  return { family: 'General', items: GENERIC.map(([item, why]) => ({ item, why })) };
}

export interface LetterCheck { ok: boolean; label: string; fix?: string; points: number }
/** Scores the letter text itself — the things reviewers look for. */
export function letterScore(html: string, o: { claimNo?: string; dos?: string | null; codes: string[]; amount: number; enclosures: number; deadlineLeft: number | null; npi?: string | null; memberId?: string | null }): { score: number; checks: LetterCheck[] } {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); const low = text.toLowerCase(); const words = text.split(' ').filter(Boolean).length;
  const has = (re: RegExp) => re.test(low);
  const checks: LetterCheck[] = [
    { ok: !/\[(fill in|[A-Z][a-z]+[^\]]*)\]/i.test(text) || !/\[(fill in|patient name|member id|claim #|date of service|diagnosis|authorization|sender|payer name|provider npi|cpt)/i.test(text), label: 'No unfinished placeholders', fix: 'Complete the highlighted fill-ins', points: 16 },
    { ok: !!o.claimNo && text.includes(o.claimNo), label: 'Claim number stated', fix: 'Reference the claim number in the body or RE line', points: 8 },
    { ok: !o.codes.length || o.codes.some((c) => low.includes(c.toLowerCase().replace('-', '')) || low.includes(c.toLowerCase())), label: 'Cites the denial code', fix: `Name the denial code (${o.codes[0] || 'CARC'}) and what it means`, points: 8 },
    { ok: has(/\b(we (respectfully )?request|please (reprocess|overturn|reverse|reconsider|pay|issue)|requesting)\b/), label: 'Makes a specific request', fix: 'End with a clear ask: “We request that you overturn this denial and reprocess the claim for payment.”', points: 12 },
    { ok: o.amount <= 0 || text.replace(/,/g, '').includes(String(Math.round(o.amount))) || /\$\s?\d/.test(text), label: 'States the amount in dispute', fix: `Mention the amount (${money(o.amount)})`, points: 8 },
    { ok: has(/\b(policy|guideline|criteria|contract|agreement|lcd|ncd|cms|ncci|medicare|manual|clinical practice|section|§)\b/), label: 'Cites a policy, contract or guideline', fix: 'Add the payer policy / CMS / contract provision that supports payment', points: 12 },
    { ok: o.enclosures > 0 || has(/enclos|attach/), label: 'Lists supporting enclosures', fix: 'Tick the packet items that are ready so they appear under Enclosures', points: 10 },
    { ok: has(/\b(within|timely|filed on|dated|deadline|days)\b/) || o.deadlineLeft == null, label: 'References timing / timeliness', fix: 'State that the appeal is filed within the allowed window', points: 4 },
    { ok: words >= 120 && words <= 520, label: `Length is reviewer-friendly (${words} words)`, fix: words < 120 ? 'Add the clinical/billing reasoning — letters under ~120 words are usually denied again' : 'Tighten to the key argument — reviewers skim long letters', points: 10 },
    { ok: !o.dos || /\b(date of service|dos|service date)\b/.test(low) || low.includes(o.dos.slice(0, 4)) , label: 'States the date of service', fix: 'Add the date of service so the payer can pull the right claim line', points: 4 },
    { ok: !o.npi || text.includes(o.npi), label: 'Names the rendering provider by NPI', fix: 'Include the rendering provider’s NPI — payers match appeals on it', points: 4 },
    { ok: !o.memberId || text.includes(o.memberId), label: 'Includes the member / policy ID', fix: 'Add the member ID so the appeal attaches to the right coverage record', points: 4 },
  ];
  return { score: Math.round(checks.reduce((a, c) => a + (c.ok ? c.points : 0), 0)), checks };
}

export interface Strategy {
  verdict: 'strong' | 'worth' | 'marginal' | 'skip' | 'unknown'; headline: string; reasons: string[];
  odds: { rate: number; n: number; level: string; avgRecovered: number } | null; ev: number; cost: number;
  family: string; evidence: { item: string; why: string }[];
  levelAdvice: string; bestLevel: { label: string; rate: number; n: number } | null;
  channel: { recommend: string; why: string }; turnaround: { avgDays: number | null; n: number }; chase: { date: string; days: number };
  template: { won: number; n: number } | null;
  similar: { claim_no: string; level: number; outcome: string; recovered: number; note: string }[];
}
export interface StrategyIn { claim: Claim; claims: Claim[]; appeals: Appeal[]; activity: Activity[]; payerMeta: Record<string, string>; level: number; amount: number; today: string; templateId?: string | null; costPerTouch?: number; touches?: number; deadlineLeft: number | null }
export function appealStrategy(i: StrategyIn): Strategy {
  const codes = splitDenials(i.claim.denial_codes); const payer = i.claim.payer || ''; const odds = appealOdds(i.appeals, i.claims, 3)(payer, codes[0] || null);
  const cost = (i.costPerTouch ?? 12) * (i.touches ?? 5); const amount = Math.max(0, i.amount || i.claim.balance || 0); const rate = odds?.winRate ?? 0.35; const ev = Math.round(amount * rate - cost);
  const reasons: string[] = []; let verdict: Strategy['verdict'] = 'unknown';
  if (odds) { reasons.push(`Your history: ${Math.round(odds.winRate * 100)}% of ${odds.n} similar ${odds.level === 'payer+code' ? `${payer} / ${codes[0]}` : odds.level === 'payer' ? payer : codes[0]} appeals were won${odds.avgRecovered ? `, averaging ${money(odds.avgRecovered)}` : ''}.`); }
  else reasons.push('Not enough decided appeals for this payer/code yet — using a 35% planning assumption.');
  reasons.push(`Expected value ≈ ${money(amount)} × ${Math.round(rate * 100)}% − ~${money(cost)} of work = ${ev >= 0 ? '+' : '−'}${money(Math.abs(ev))}.`);
  if (i.deadlineLeft != null) reasons.push(i.deadlineLeft < 0 ? `The appeal window closed ${-i.deadlineLeft} days ago — only worth filing with proof of timely filing or an exception.` : `${i.deadlineLeft} days left in the appeal window.`);
  if (ev <= 0) verdict = 'skip'; else if (rate >= 0.6 && ev > cost) verdict = 'strong'; else if (rate >= 0.4) verdict = 'worth'; else verdict = 'marginal';
  if (i.deadlineLeft != null && i.deadlineLeft < 0 && verdict !== 'skip') verdict = 'marginal';
  const headline = { strong: 'Strong case — file this', worth: 'Worth appealing', marginal: 'Marginal — file only with strong proof', skip: 'Low return — consider write-off review', unknown: 'No history yet' }[verdict];

  const cl = new Map(i.claims.map((c) => [c.id, c])); const samePayer = i.appeals.filter((a) => (a.payer || cl.get(a.claim_id)?.payer || '').toLowerCase() === payer.toLowerCase() && ['won', 'partial', 'lost'].includes(a.status));
  const lv = new Map<number, { w: number; n: number }>(); for (const a of samePayer) { if (a.kind !== 'appeal') continue; const e = lv.get(a.level) || { w: 0, n: 0 }; e.n++; if (a.status !== 'lost') e.w++; lv.set(a.level, e); }
  const lvl = [...lv.entries()].filter(([, e]) => e.n >= 3).sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n)[0]; const bestLevel = lvl ? { label: `Level ${lvl[0]}`, rate: lvl[1].w / lvl[1].n, n: lvl[1].n } : null;
  const prior = i.appeals.filter((a) => a.claim_id === i.claim.id && ['lost', 'partial'].includes(a.status));
  const levelAdvice = prior.length ? `This claim already lost at level ${Math.max(...prior.map((a) => a.level))} — escalate to level ${Math.max(...prior.map((a) => a.level)) + 1} with NEW evidence (repeating the same argument rarely changes the outcome) and ask for a different reviewer.` : bestLevel && bestLevel.label !== `Level ${i.level}` ? `${payer} decides ${bestLevel.label} appeals in your favour ${Math.round(bestLevel.rate * 100)}% of the time (${bestLevel.n} cases). You are drafting level ${i.level}.` : i.level === 1 ? 'First-level appeal: keep it factual and attach the proof up front — this is where most overturns happen.' : `Level ${i.level}: reference the earlier decision and what new evidence changes the outcome.`;

  const reach = payerContactRate(callsOf(i.activity), i.claims.filter((c) => (c.payer || '').toLowerCase() === payer.toLowerCase()))[0]; const m = i.payerMeta;
  const channel = (() => { if (m.portal_url && (!reach || reach.rate < 40)) return { recommend: 'Payer portal', why: reach ? `Phone reaches a person only ${reach.rate}% of the time; the portal gives a dated receipt.` : 'The portal gives a dated receipt for proof of timely filing.' }; if (m.appeal_fax) return { recommend: 'Fax with cover sheet', why: 'A fax confirmation is proof of delivery; send to the appeals fax on file.' }; if (m.appeal_address) return { recommend: 'Certified mail', why: 'Use tracked mail to the appeals address; keep the receipt for timely-filing proof.' }; return { recommend: 'Add the payer’s appeal channel', why: 'No portal, fax or address on file — add one in Admin → Payers.' }; })();
  const days = samePayer.filter((a) => a.filed_on && a.decided_on).map((a) => dd(a.filed_on!, a.decided_on!)); const avg = days.length ? Math.round(days.reduce((x, y) => x + y, 0) / days.length) : null;
  const chaseDays = Math.max(14, Math.round((avg ?? 30) * 0.75));
  const tpl = i.templateId ? samePayer.filter((a) => a.template === i.templateId) : []; const template = tpl.length >= 2 ? { won: tpl.filter((a) => a.status !== 'lost').length, n: tpl.length } : null;
  const similar = samePayer.filter((a) => a.claim_id !== i.claim.id && (!codes[0] || splitDenials(cl.get(a.claim_id)?.denial_codes)[0] === codes[0])).sort((a, b) => (b.decided_on || '').localeCompare(a.decided_on || '')).slice(0, 4).map((a) => ({ claim_no: cl.get(a.claim_id)?.claim_no || '—', level: a.level, outcome: a.status, recovered: Math.round(a.amount_recovered || 0), note: a.outcome_note || '' }));
  const ev_ = evidenceFor(codes);
  return { verdict, headline, reasons, odds: odds ? { rate: odds.winRate, n: odds.n, level: odds.level, avgRecovered: odds.avgRecovered } : null, ev, cost, family: ev_.family, evidence: ev_.items, levelAdvice, bestLevel, channel, turnaround: { avgDays: avg, n: days.length }, chase: { date: addDays(i.today, chaseDays), days: chaseDays }, template, similar };
}
