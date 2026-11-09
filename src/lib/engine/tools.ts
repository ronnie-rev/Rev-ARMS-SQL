// Everyday A/R calculators. Pure, unit-tested; shown on the Tools page.
const r2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (iso: string, d: number) => new Date(Date.parse(iso + 'T12:00:00Z') + d * 864e5).toISOString().slice(0, 10);
const diff = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
/** Filing deadline: clock start + allowed days → due date, days left today, and a plain-language status. */
export function filingDeadline(start: string, days: number, today: string) { const due = addDays(start, days); const left = diff(today, due); return { due, left, status: left < 0 ? `Expired ${-left} days ago` : left === 0 ? 'Due today' : left <= 7 ? `Critical — ${left} days left` : left <= 30 ? `${left} days left — act soon` : `${left} days left` }; }
/** Days in A/R = open A/R ÷ average daily charges. */
export const daysInAR = (openAR: number, grossCharges: number, periodDays: number) => (grossCharges > 0 && periodDays > 0 ? r2(openAR / (grossCharges / periodDays)) : null);
/** Net collection rate = payments ÷ (charges − contractual adjustments). */
export const netCollectionRate = (payments: number, charges: number, contractualAdj: number) => (charges - contractualAdj > 0 ? r2((payments / (charges - contractualAdj)) * 100) : null);
/** Gross collection rate = payments ÷ charges. */
export const grossCollectionRate = (payments: number, charges: number) => (charges > 0 ? r2((payments / charges) * 100) : null);
/** Contractual write-off = billed − allowed; expected patient + insurance total = allowed. */
export const contractual = (billed: number, allowed: number) => ({ writeOff: r2(Math.max(0, billed - allowed)), pctOfBilled: billed > 0 ? r2((allowed / billed) * 100) : null });
/** Who owes what once the payer has processed: patient = allowed − paid − (other adjustments). Flags a mismatch with the EOB's patient-responsibility figure. */
export function patientSplit(o: { allowed: number; paid: number; otherAdj?: number; eobPatient?: number | null }) { const expected = r2(o.allowed - o.paid - (o.otherAdj || 0)); const mismatch = o.eobPatient != null && Math.abs(expected - o.eobPatient) > 0.01 ? r2(expected - o.eobPatient) : 0; return { patient: Math.max(0, expected), mismatch, note: expected < 0 ? 'Paid more than allowed — possible overpayment' : mismatch ? `EOB says ${o.eobPatient!.toFixed(2)}; math says ${expected.toFixed(2)}` : 'Matches' }; }
/** Underpayment: how far short, and whether it clears a worth-disputing bar. */
export function underpaymentCheck(expected: number, paid: number, patient: number, minDollars = 10, minPct = 5) { const short = r2(expected - paid - patient); const pct = expected > 0 ? r2((short / expected) * 100) : 0; return { short: Math.max(0, short), pct: Math.max(0, pct), dispute: short >= minDollars && pct >= minPct }; }
/** Is an appeal worth the time? Expected recovery = amount × win probability; cost = hours × hourly rate. */
export function appealRoi(amount: number, winPct: number, hours: number, hourly: number) { const expected = r2(amount * (winPct / 100)); const cost = r2(hours * hourly); return { expected, cost, net: r2(expected - cost), worthIt: expected > cost, breakEvenWinPct: amount > 0 ? r2((cost / amount) * 100) : null }; }
/** Expected reimbursement from billed charges and a client's gross collection rate. */
export const expectedFromGcr = (billed: number, gcrPct: number) => r2(billed * (gcrPct / 100));
