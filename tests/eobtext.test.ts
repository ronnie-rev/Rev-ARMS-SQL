import { describe, expect, it } from 'vitest';
import { docHash, isX12, looksLikeEob, parseEobText } from '../src/lib/engine/eobtext';
import { makeEra835, parseEra } from '../src/lib/engine/era835';
import { mergeConfirmed, proposeUpdates, letterDate } from '../src/lib/engine/docactions';
import { readDocument } from '../src/lib/engine/docintel';

const EOB = `Aetna Explanation of Payment
Check/EFT #: EFT7788123   Payment date: 10/05/2026
Payee: Center for Plastic Surgery
Claim #: CLM-1001  Member ID: W123456789
DOS 08/14/2026  Billed amount 1,000.00  Allowed amount 640.00  Amount paid 512.00
Patient responsibility 128.00
CO-45 360.00  PR-2 128.00
Claim #: CLM-1002
DOS 08/20/2026  Billed amount 450.00  Amount paid 0.00
Claim denied. CO-50 450.00 not medically necessary
Check amount 512.00`;

describe('EOB text → remittance', () => {
  it('parses a printed EOB into claims with payments, patient share and adjustment codes', () => {
    expect(looksLikeEob(EOB)).toBe(true); const e = parseEobText(EOB)!;
    expect(e.claims.length).toBe(2); expect(e.trace).toBe('EFT7788123'); expect(e.date).toBe('2026-10-05'); expect(e.amount).toBe(512);
    const a = e.claims[0]; expect(a.pcn).toBe('CLM-1001'); expect(a.charge).toBe(1000); expect(a.allowed).toBe(640); expect(a.paid).toBe(512); expect(a.patientResp).toBe(128); expect(a.dos).toBe('2026-08-14'); expect(a.adj.find((x) => x.code === '45')?.amount).toBe(360);
    const b = e.claims[1]; expect(b.denied).toBe(true); expect(b.paid).toBe(0); expect(b.adj.some((x) => x.group === 'CO' && x.code === '50')).toBe(true);
  });
  it('detects and parses real X12 835 text, and hashes documents stably', () => {
    const t = makeEra835({ payer: 'AETNA', payee: 'CLINIC', trace: 'EFT1', date: '2026-10-05', claims: [{ pcn: 'CLM-9', charge: 100, paid: 80, contractual: 20 }] });
    expect(isX12(t)).toBe(true); expect(parseEra(t).claims[0].pcn).toBe('CLM-9'); expect(isX12('Dear provider')).toBe(false);
    expect(docHash('Claim  CLM-1\nDenied')).toBe(docHash('claim clm-1 denied')); expect(docHash('a b')).not.toBe(docHash('a c'));
  });
});

describe('document → claim update proposals', () => {
  const claim: any = { id: 'c1', claim_no: 'CLM-1', status: 'Billed', denial_codes: null, next_fu: null, custom: {} };
  const ctx = { appeals: [], statuses: ['Billed', 'Denied - appeal needed', 'Records requested'], today: '2026-11-06', fromOcr: false, hash: 'h1' };
  it('proposes denial codes, date, status, deadline and follow-up from a denial letter', () => {
    const text = 'Letter date: 10/20/2026\nClaim # CLM-1\nThis claim is denied. CO-50 not medically necessary.\nYou may appeal within 90 days of the date of this notice.'; const r = readDocument(text);
    const ps = proposeUpdates(r, text, claim, ctx); const by = (l: string) => ps.find((p) => p.label === l);
    expect(by('Denial code(s)')?.to).toContain('CO-50'); expect(by('Workflow status')?.to).toBe('Denied - appeal needed'); expect(by('Workflow status')?.safe).toBe(false); expect(by('Appeal deadline')?.to).toBe('2027-01-18'); expect(by('Claim note')).toBeTruthy();
    const m = mergeConfirmed(ps.filter((p) => p.safe), claim, 'h1'); expect(m.patch.denial_codes).toContain('CO-50'); expect(m.patch.status).toBeUndefined(); expect((m.patch.custom as any).ocr_hashes).toContain('h1'); expect(m.notes.length).toBe(1);
  });
  it('marks the open appeal won or lost from a decision letter, and never invents a status', () => {
    const appeal: any = { id: 'a1', claim_id: 'c1', status: 'sent', level: 1 };
    const won = 'We have completed our review of your appeal. The denial is overturned and the claim will be reprocessed.'; const lost = 'We have completed our review of your appeal. The denial is upheld.';
    const pw = proposeUpdates(readDocument(won), won, claim, { ...ctx, appeals: [appeal], statuses: [] }); expect(pw.find((p) => p.label.startsWith('Appeal L1'))?.to).toBe('won'); expect(pw.some((p) => p.label === 'Workflow status')).toBe(false);
    const pl = proposeUpdates(readDocument(lost), lost, claim, { ...ctx, appeals: [appeal] }); expect(pl.find((p) => p.label.startsWith('Appeal L1'))?.to).toBe('lost');
    expect(letterDate(readDocument('Notice date: 03/04/2026 claim denied'))).toBe('2026-03-04');
  });
  it('records authorization numbers and records-request follow-ups', () => {
    const t = 'Prior authorization approved. Authorization number: AUTH778899 for CPT 19364.'; const ps = proposeUpdates(readDocument(t), t, claim, ctx); expect(ps.find((p) => p.label === 'Authorization #')?.to).toBe('AUTH778899');
    const t2 = 'Additional information is required. Please submit the operative report and medical records.'; const p2 = proposeUpdates(readDocument(t2), t2, claim, ctx); expect(p2.find((p) => p.label === 'Workflow status')?.to).toBe('Records requested'); expect(p2.find((p) => p.label === 'Next follow-up')).toBeTruthy();
  });
});
