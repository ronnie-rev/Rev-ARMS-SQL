// Fax helpers shared by the UI: number validation, cover-sheet text and page maths. Pure and unit-tested.
/** US fax number → E.164 (+1XXXXXXXXXX). Returns null if it can't be a valid number. */
export function normalizeFax(raw: string | null | undefined): string | null {
  const d = String(raw || '').replace(/[^\d+]/g, ''); if (!d) return null; const digits = d.replace(/\D/g, '');
  if (d.startsWith('+') && digits.length >= 8 && digits.length <= 15) return '+' + digits; if (digits.length === 10 && /^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return '+1' + digits; if (digits.length === 11 && digits[0] === '1' && /^[2-9]\d{2}[2-9]\d{6}$/.test(digits.slice(1))) return '+' + digits; return null;
}
export const formatFax = (e164: string) => { const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164; };
export const FAX_STATUS_LABEL: Record<string, string> = { queued: 'Sending…', sent: 'Delivered', failed: 'Failed', test: 'Test' };
export interface FaxCfg { enabled: boolean; provider: 'mock' | 'phaxio' | 'documo' | 'srfax'; fromNumber: string; coverNote: string; confidentiality: string; maxPages: number }
export const DEFAULT_FAX_CFG: FaxCfg = { enabled: false, provider: 'mock', fromNumber: '', coverNote: 'Please find the enclosed appeal and supporting documentation. Please confirm receipt.', confidentiality: 'CONFIDENTIALITY NOTICE: This facsimile contains information that may be privileged, confidential and protected by law (including HIPAA). It is intended only for the addressee. If you received it in error, notify the sender immediately by telephone and destroy all copies.', maxPages: 40 };
export const resolveFaxCfg = (raw?: Partial<FaxCfg> | null): FaxCfg => ({ ...DEFAULT_FAX_CFG, ...(raw || {}) });
export function validateFaxCfg(c: FaxCfg): string[] { const e: string[] = []; if (c.fromNumber && !normalizeFax(c.fromNumber)) e.push('“From number” is not a valid fax / phone number'); if (c.provider === 'srfax' && !c.fromNumber) e.push('SRFax needs a From number (caller ID)'); if (!(c.maxPages >= 1 && c.maxPages <= 200)) e.push('Max pages must be 1–200'); if (c.confidentiality.trim().length < 20) e.push('Keep a confidentiality notice on the cover sheet'); return e; }
export const MAX_FAX_BYTES = 4_000_000;   // Netlify function request limit is 6 MB once base64-encoded
