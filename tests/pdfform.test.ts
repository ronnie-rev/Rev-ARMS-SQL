import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { fillPdf, inspectPdf } from '../src/lib/pdf/formFill';
describe('payer form fill', () => {
  it('lists AcroForm fields, fills them and stamps overlays', async () => {
    const doc = await PDFDocument.create(); const page = doc.addPage([612, 792]); const form = doc.getForm();
    const t = form.createTextField('PatientName'); t.addToPage(page, { x: 50, y: 700, width: 200, height: 20 }); const c = form.createCheckBox('Urgent'); c.addToPage(page, { x: 50, y: 650, width: 14, height: 14 });
    const bytes = await doc.save(); const info = await inspectPdf(bytes);
    expect(info.pages).toBe(1); expect(info.fields.map((f) => f.name).sort()).toEqual(['PatientName', 'Urgent']);
    const out = await fillPdf(bytes, { fields: { PatientName: 'Jane Roe', Urgent: 'yes', Missing: 'x' }, overlays: [{ id: 'o', page: 0, x: 100, y: 100, size: 10, text: '{claim}', value: 'C-1' }] });
    const re = await PDFDocument.load(out); expect(re.getForm().getTextField('PatientName').getText()).toBe('Jane Roe'); expect(re.getForm().getCheckBox('Urgent').isChecked()).toBe(true);
  });
});
