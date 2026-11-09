import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { docMeta, findText, healthOf, newBlank, scrubMetadata } from '../src/lib/pdf/pdfedit';
import { suggestFills } from '../src/lib/pdf/formintel';
import { triage, verifyLetter, verifyRemit } from '../src/lib/engine/docverify';
import { readDocument } from '../src/lib/engine/docintel';

const it0 = (str: string, x: number, y: number, w = str.length * 5, h = 10) => ({ str, x, y, w, h });
describe('form auto-fill', () => {
  it('places claim data to the right of labels, skips filled lines and unknown values', () => {
    const items = [it0('Patient Name:', 40, 100), it0('Member ID:', 40, 130), it0('Claim #', 40, 160), it0('____________', 100, 160), it0('Date of Service:', 40, 190), it0('08/14/2026', 140, 190), it0('Payer: Aetna', 40, 220), it0('NPI:', 40, 250), it0('Date', 300, 100)];
    const s = suggestFills(items, { patient: 'MOORE, THOMAS', member: 'W123', claim: 'CLM-9', dos: '08/14/2026', payer: 'Aetna', npi: '1710111885', date: '11/09/2026' }, 0);
    const by = Object.fromEntries(s.map((x) => [x.key, x])); expect(Object.keys(by).sort()).toEqual(['claim', 'date', 'member', 'npi', 'patient']);
    expect(by.patient.x).toBeGreaterThan(40 + 13 * 5); expect(by.claim.x).toBe(104); expect(by.claim.value).toBe('CLM-9'); expect(s.some((x) => x.key === 'dos')).toBe(false); expect(s.some((x) => x.key === 'payer')).toBe(false);
    expect(suggestFills(items, { member: undefined }, 0)).toEqual([]);
  });
});
describe('PDF search and health', () => {
  it('finds every match with a box and context', () => {
    const h = findText([it0('Claim CLM-1 and clm-1 again', 10, 10, 130), it0('nothing', 10, 30)], 'clm-1'); expect(h.length).toBe(2); expect(h[0].text).toBe('CLM-1'); expect(h[0].x).toBeGreaterThan(10); expect(findText([it0('ABC', 0, 0)], 'a')).toEqual([]); expect(findText([it0('ABC abc', 0, 0, 35)], 'abc', true).length).toBe(1);
  });
  it('reports metadata, scan state, PHI and size with the matching fix', async () => {
    const d = await PDFDocument.create(); d.addPage(); d.setAuthor('Dr. Smith Clinic'); const m = await docMeta(await d.save()); expect(m.author).toBe('Dr. Smith Clinic'); expect(m.pages).toBe(1);
    const h = healthOf(m, { sizeBytes: 9 * 1048576, textChars: 0, phiHits: 3 }); expect(h.map((x) => x.fix).filter(Boolean).sort()).toEqual(['ocr', 'optimize', 'phi', 'scrub']);
    const clean = await docMeta(await scrubMetadata(await newBlank(1))); expect(healthOf(clean, { sizeBytes: 1000, textChars: 500, phiHits: 0 }).every((x) => x.level === 'ok')).toBe(true);
  });
});
describe('document verification and triage', () => {
  const claim: any = { billed_amt: 100, balance: 100, dos: '2026-08-14', payer: 'Aetna Better Health', closed_at: null, expected_amt: 90, expected_src: 'fee_schedule' };
  const era: any = { charge: 100, paid: 60, patientResp: 10, dos: '2026-08-14', adj: [{ group: 'CO', code: '45', amount: 30, qty: null }], allowed: 70, denied: false, reversal: false };
  it('flags mismatches, overpayments and underpayments on a remit line', () => {
    const ok = verifyRemit(era, claim, 'AETNA'); expect(ok.filter((c) => c.level === 'ok').length).toBeGreaterThanOrEqual(3); expect(ok.some((c) => /underpayment/.test(c.text))).toBe(true);
    const bad = verifyRemit({ ...era, charge: 120, dos: '2026-08-15', paid: 150 }, claim, 'Cigna').map((c) => c.text).join('|'); expect(bad).toMatch(/billed \$120/); expect(bad).toMatch(/differs/); expect(bad).toMatch(/Cigna/); expect(bad).toMatch(/overpayment/);
  });
  it('cross-checks a letter and ranks documents by urgency', () => {
    const t = 'Aetna\nDenied CO-50. Date of service 08/14/2026. You may appeal within 45 days.'; const r = readDocument(t); const c = verifyLetter(r, claim); expect(c.some((x) => x.level === 'bad')).toBe(true); expect(c.some((x) => /Payer matches/.test(x.text))).toBe(true);
    const a = triage(r, { dollars: 5000, matched: true, status: 'ready' }), b = triage(readDocument('Explanation of benefits amount paid allowed amount'), { dollars: 100, matched: false, status: 'ready' }); expect(a.score).toBeGreaterThan(b.score); expect(a.reasons.join()).toMatch(/45 days left/);
    expect(triage(null, { dollars: 0, matched: false, status: 'needs_ocr' }).score).toBe(5);
  });
});
