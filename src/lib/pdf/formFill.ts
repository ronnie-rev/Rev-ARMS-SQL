import { PDFDocument, StandardFonts, rgb, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from 'pdf-lib';

export interface FormField { name: string; type: 'text' | 'check' | 'select' | 'radio' | 'other' }
export interface Overlay { id: string; page: number; x: number; y: number; size: number; text: string; w?: number }   // x/y in PDF points from the top-left of the page
export const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
export const bytesToB64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

export async function inspectPdf(bytes: Uint8Array): Promise<{ pages: number; fields: FormField[]; sizes: { w: number; h: number }[] }> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true }); const form = doc.getForm();
  const fields = form.getFields().map((f): FormField => ({ name: f.getName(), type: f instanceof PDFTextField ? 'text' : f instanceof PDFCheckBox ? 'check' : f instanceof PDFDropdown ? 'select' : f instanceof PDFRadioGroup ? 'radio' : 'other' }));
  return { pages: doc.getPageCount(), fields, sizes: doc.getPages().map((p) => ({ w: p.getWidth(), h: p.getHeight() })) };
}
/** Fills AcroForm fields by name and stamps overlay text (for flat/scanned forms). `values` are final strings. */
export async function fillPdf(bytes: Uint8Array, o: { fields?: Record<string, string>; overlays?: (Overlay & { value: string })[]; flatten?: boolean }): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true }); const form = doc.getForm(); const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [name, v] of Object.entries(o.fields || {})) {
    let f; try { f = form.getField(name); } catch { continue; }
    if (f instanceof PDFTextField) f.setText(v ?? ''); else if (f instanceof PDFCheckBox) { if (/^(1|true|yes|y|x|on)$/i.test(v)) f.check(); else f.uncheck(); } else if (f instanceof PDFDropdown) { try { f.select(v); } catch { /* value not an option */ } } else if (f instanceof PDFRadioGroup) { try { f.select(v); } catch { /* ignore */ } }
  }
  const pages = doc.getPages();
  for (const ov of o.overlays || []) { const pg = pages[ov.page]; if (!pg || !ov.value) continue; pg.drawText(ov.value, { x: ov.x, y: pg.getHeight() - ov.y - ov.size, size: ov.size, font, color: rgb(0.05, 0.05, 0.2), maxWidth: ov.w }); }
  form.updateFieldAppearances(font); if (o.flatten) form.flatten();
  return doc.save();
}
