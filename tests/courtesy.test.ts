import { describe, expect, it } from 'vitest';
import { courtesyBody, courtesySituation, planKindOf, regulatoryParagraph } from '../src/lib/engine/courtesy';
import { fillTemplate } from '../src/lib/engine/appealforge';

describe('courtesy / good-faith letters', () => {
  it('picks the right situation and always reserves appeal rights', () => {
    expect(courtesySituation('Timely Filing').id).toBe('timely'); expect(courtesySituation('Authorization').id).toBe('auth'); expect(courtesySituation('Medical Necessity').id).toBe('necessity'); expect(courtesySituation('Weird').id).toBe('general');
    for (const cat of ['Timely Filing', 'Authorization', 'Non Covered', 'Coding', 'Eligibility or Benefits', 'Additional Information Requested', 'NPI or Non Par or Out of Network', 'Paid According to Contract', 'Other']) {
      const b = courtesyBody({ category: cat, plan: 'commercial', includeRegulatory: true, deadlineExpired: false }); expect(b).toMatch(/waive, limit or substitute/); expect(b).toMatch(/We respectfully request/); expect(b).toMatch(/{{Claim.Number}}/);
    }
  });
  it('adapts to an expired appeal window and fills merge tokens', () => {
    const b = courtesyBody({ category: 'Timely Filing', plan: 'medicare', includeRegulatory: true, deadlineExpired: true, patientHarm: true });
    expect(b).toMatch(/standard appeal period/); expect(b).toMatch(/42 CFR 424.44/); expect(b).toMatch(/balance-billing/);
    const html = fillTemplate(b, { Claim: { Number: 'CLM-1', ServiceDate: '08/14/2026', BilledAmount: '$100.00', DenialReason: 'CO-29' }, Payer: { Name: 'Aetna' }, Provider: { Name: 'Dr A' }, Practice: { Name: 'Clinic' }, Sender: { Name: 'Sam', Email: 's@x.com', Phone: '555' } });
    expect(html).toContain('CLM-1'); expect(html).toContain('Aetna'); expect(html).not.toContain('{{');
  });
  it('detects plan kinds and cites only plan-appropriate rules', () => {
    expect(planKindOf('Medicare Part B')).toBe('medicare'); expect(planKindOf('Molina Healthcare')).toBe('medicaid'); expect(planKindOf('Aetna')).toBe('commercial'); expect(planKindOf('Aetna', 'Self-funded ERISA')).toBe('erisa'); expect(planKindOf('')).toBe('unknown');
    expect(regulatoryParagraph('erisa')).toMatch(/2560\.503-1/); expect(regulatoryParagraph('medicaid')).toMatch(/Part 438/); expect(regulatoryParagraph('commercial', 'Mental Health')).toMatch(/Parity/);
  });
});
