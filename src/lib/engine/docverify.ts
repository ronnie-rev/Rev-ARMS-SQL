// Cross-checks what a payer document says against what we hold on the claim, and ranks a batch of documents by what needs doing first.
import type { Claim } from '../types';
import type { EraClaim } from './era835';
import type { DocRead } from './docintel';

export interface Check { level: 'ok' | 'warn' | 'bad'; text: string }
const r2 = (n: number) => Math.round(n * 100) / 100; const $ = (n: number) => '$' + n.toFixed(2);
const firstWord = (s?: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/)[0] || '';

/** One remit line vs. its claim: amounts, date of service, payer, math and balance sanity. */
export function verifyRemit(e: EraClaim, claim: Claim, payer?: string | null): Check[] {
  const out: Check[] = []; const add = (level: Check['level'], text: string) => out.push({ level, text });
  if (e.charge > 0 && claim.billed_amt > 0) { Math.abs(e.charge - claim.billed_amt) <= 0.01 ? add('ok', 'Billed amount matches the claim') : add('warn', `Remit shows billed ${$(e.charge)} but the claim has ${$(claim.billed_amt)}`); }
  if (e.dos && claim.dos) { e.dos === claim.dos.slice(0, 10) ? add('ok', 'Date of service matches') : add('warn', `Date of service ${e.dos} differs from the claim (${claim.dos.slice(0, 10)})`); }
  if (payer && claim.payer && firstWord(payer) !== firstWord(claim.payer) && !firstWord(claim.payer).startsWith(firstWord(payer)) && !firstWord(payer).startsWith(firstWord(claim.payer))) add('warn', `Remit is from ${payer}, the claim is with ${claim.payer} — possible secondary payer or wrong match`);
  if (e.charge > 0 && !e.reversal) { const adj = e.adj.reduce((s, a) => s + (a.group === 'PR' ? 0 : a.amount), 0); const gap = r2(e.charge - e.paid - e.patientResp - adj); if (adj > 0 && Math.abs(gap) > 1) add('warn', `Amounts do not reconcile: billed − paid − patient − adjustments leaves ${$(Math.abs(gap))} unexplained`); else if (adj > 0) add('ok', 'Billed = paid + patient share + adjustments'); }
  if (e.paid > claim.balance + 0.01 && claim.balance >= 0 && !e.reversal) add('bad', `Payment ${$(e.paid)} is more than the open balance ${$(claim.balance)} — possible overpayment`);
  if (claim.closed_at && e.paid > 0) add('warn', 'This claim is already closed — posting will reopen the question of where the money goes');
  if (e.allowed != null && claim.expected_amt && claim.expected_src !== 'balance' && e.allowed + 0.01 < claim.expected_amt * 0.98) add('warn', `Allowed ${$(e.allowed)} is below the expected ${$(claim.expected_amt)} (${claim.expected_src || 'estimate'}) — underpayment candidate`);
  if (e.denied && e.adj.every((a) => a.code === '45')) add('warn', 'Marked denied but the only adjustment is CO-45 — likely a contractual write-off, not a true denial');
  return out;
}
/** A letter vs. the claim it was matched to. */
export function verifyLetter(r: DocRead, claim: Claim): Check[] {
  const out: Check[] = []; const f = r.facts;
  if (f.payerHint && claim.payer) (firstWord(claim.payer).includes(firstWord(f.payerHint)) || firstWord(f.payerHint).includes(firstWord(claim.payer))) ? out.push({ level: 'ok', text: 'Payer matches the claim' }) : out.push({ level: 'warn', text: `Letter is from ${f.payerHint}, the claim is with ${claim.payer}` });
  if (claim.dos) { const d = claim.dos.slice(0, 10); const dates = f.dates.map((x) => x.iso); if (dates.length) dates.includes(d) ? out.push({ level: 'ok', text: 'Date of service appears in the letter' }) : out.push({ level: 'warn', text: `Date of service ${d} is not in the letter — confirm it is the same service` }); }
  const amts = f.amounts.map((a) => Math.round(a.value * 100)); if (claim.billed_amt && amts.length) (amts.includes(Math.round(claim.billed_amt * 100)) || amts.includes(Math.round(claim.balance * 100))) ? out.push({ level: 'ok', text: 'An amount in the letter matches the claim' }) : out.push({ level: 'warn', text: 'No amount in the letter matches the claim’s billed or balance amount' });
  if (r.type === 'denial' && f.carc.length === 0 && f.rarc.length === 0) out.push({ level: 'warn', text: 'No denial code was found — read the reason in the letter and enter it manually' });
  if (r.appealDeadline && r.appealDeadline.days <= 60) out.push({ level: 'bad', text: `Short appeal window: ${r.appealDeadline.days} days` });
  return out;
}

export interface Triage { score: number; reasons: string[] }
/** Higher = do first: closing deadlines, denials and appeal decisions, then dollars, then matched documents over unmatched. */
export function triage(r: DocRead | null, o: { dollars: number; matched: boolean; deadlineDaysLeft?: number | null; status: string }): Triage {
  if (!r || o.status !== 'ready') return { score: o.status === 'needs_ocr' ? 5 : 0, reasons: [] }; const reasons: string[] = []; let s = 10;
  const w: Record<string, number> = { appeal_decision: 40, denial: 35, records: 32, overpayment: 30, auth: 15, eob: 12, other: 3 }; s += w[r.type] || 0;
  const dl = o.deadlineDaysLeft ?? r.appealDeadline?.days ?? null; if (dl != null) { if (dl <= 30) { s += 40; reasons.push(`${dl} days left`); } else if (dl <= 60) { s += 25; reasons.push(`${dl} days left`); } else if (dl <= 120) s += 10; }
  if (o.dollars > 0) { s += Math.min(25, Math.round(Math.log10(o.dollars + 10) * 6)); if (o.dollars >= 1000) reasons.push(`$${Math.round(o.dollars).toLocaleString('en-US')}`); }
  if (!o.matched) { s -= 8; reasons.push('no claim matched'); } if (r.type === 'records') reasons.push('records pend');
  return { score: s, reasons };
}
