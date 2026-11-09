import { describe, expect, it } from 'vitest';
import content from '../src/lib/appeal/forge-content.json';
import { assembleLetter, availableDenials, composeLetterBody, deriveRole, fillIns, fillTemplate, findTemplate, groupForCpt, mergeLibrary, primaryCpt, qualityIssues, remainingFillIns, resolveCptSearch, type ForgeContent } from '../src/lib/engine/appealforge';
const c = content as unknown as ForgeContent;
describe('Appeal Forge content', () => {
  it('loads the library', () => { expect(c.scenarios.length).toBeGreaterThan(80); expect(c.codeTemplates.length).toBeGreaterThan(50); expect(c.archetypes.length).toBe(15); expect(c.denialCategories).toContain('Timely Filing'); });
  it('resolves CPTs by code, modifier text and plain-English search', () => { expect(primaryCpt(c, '19380 50, 15772')).toBe('19380'); expect(groupForCpt(c, '19364')?.code).toBe('BREAST-RECON-FLAP'); expect(resolveCptSearch(c, 'breast reduction').length).toBeGreaterThan(0); expect(primaryCpt(c, 'zzz')).toBeNull(); });
  it('roles map to the library roles', () => { expect(deriveRole('Main Surgeon')).toBe('Main Surgeon'); expect(deriveRole('Co-Surgeon')).toBe('Co-Surgeon'); expect(deriveRole('Physician Assistant')).toBe('PA'); expect(deriveRole('Nurse Practitioner')).toBe('PA'); expect(deriveRole(undefined)).toBe('Main Surgeon'); });
  it('prefers an exact-CPT template, then group, then letter shape, then composes', () => {
    const t = c.codeTemplates.find((x) => x.cpt && x.denialDetail)!; const exact = findTemplate(c, { cpt: t.cpt!, denialDetail: t.denialDetail, role: t.providerRole }); expect(exact.tier).toBe('tailored'); expect(exact.body.length).toBeGreaterThan(200);
    const shape = findTemplate(c, { cpt: '99999', denialCategory: 'Timely Filing', role: 'Main Surgeon' }); expect(['shape', 'composed']).toContain(shape.tier); expect(shape.body).toContain('{{Payer.Name}}');
    const composed = findTemplate(c, { cpt: '99213', denialCategory: 'Coding', role: 'Main Surgeon' }); expect(composed.body.length).toBeGreaterThan(100); expect(findTemplate(c, { cpt: '' , role: 'Main Surgeon' }).tier).toBe('none');
  });
  it('lists denials flagged by specificity', () => { const t = c.codeTemplates.find((x) => x.cpt)!; const l = availableDenials(c, t.cpt!); expect(l[0].level).toBe(2); expect(l.length).toBeGreaterThan(0); });
  it('compose uses the CPT + denial rationale libraries', () => { const b = composeLetterBody(c, { cpt: '19364', denialCategory: 'Non Covered' }); expect(b).toContain('Women'); expect(b).toContain('{{Payer.Name}}'); });
  it('merges known tokens; blank PHI becomes a labelled fill-in', () => {
    const html = fillTemplate('Patient: {{Patient.Name}} claim {{Claim.Number}} to {{Payer.Name}}. [FILL IN: dx]', { Patient: { Name: '' }, Claim: { Number: 'C1' }, Payer: { Name: 'Aetna' } });
    expect(html).toContain('claim C1'); expect(html).toContain('[Patient name]'); expect(html).toContain('Aetna'); expect(remainingFillIns(html).length).toBe(2); expect(fillIns('a [FILL IN: x] b [DESCRIBE: y] [FILL IN: x]')).toEqual(['[FILL IN: x]', '[DESCRIBE: y]']);
  });
  it('manager overrides replace, add and disable built-ins', () => {
    const s0 = c.scenarios[0]; const m = mergeLibrary(c, { scenarios: [{ ...s0, templateBody: 'EDITED' }, { ...c.scenarios[1], disabled: true }, { ...s0, id: 'custom-1', templateBody: 'NEW' }] }); expect(m.scenarios.find((s) => s.id === s0.id)!.templateBody).toBe('EDITED'); expect(m.scenarios.some((s) => s.id === c.scenarios[1].id)).toBe(false); expect(m.scenarios.some((s) => s.id === 'custom-1')).toBe(true); expect(mergeLibrary(c, null)).toBe(c);
  });
  it('assembles a full letter and flags quality issues', () => {
    const html = assembleLetter({ head: { name: 'CPS', phone: '555' }, date: 'November 4, 2026', payerName: 'Aetna', payerAddress: 'PO Box 1', re: 'First Level Appeal — Claim #C1', bodyHtml: '<p>[FILL IN: x]</p>', enclosures: ['EOB'], followUps: [{ date: '10/01/2026', note: 'Called' }], sender: { name: 'Pat' }, practice: 'CPS' }); expect(html).toContain('Enclosures'); expect(html).toContain('Follow-up history'); expect(html).toContain('Sincerely');
    const q = qualityIssues({ html, claimNo: 'C1', dos: null, deadlineLeft: -3, senderName: 'Pat' }); expect(q.some((i) => i.text.includes('placeholder'))).toBe(true); expect(q.some((i) => i.text.includes('passed'))).toBe(true); expect(q.some((i) => i.text.includes('address or fax'))).toBe(true);
  });
});
