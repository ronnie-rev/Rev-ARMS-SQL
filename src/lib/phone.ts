// Phone / fax validation and formatting with libphonenumber-js (MIT, "min" metadata): payers print numbers in every style, and a bad fax number wastes a send.
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export interface Phone { valid: boolean; national: string; e164: string | null; raw: string }
export function parsePhone(raw: string, country: 'US' = 'US'): Phone { const p = parsePhoneNumberFromString(String(raw || '').trim(), country); return p ? { valid: p.isValid(), national: p.formatNational(), e164: p.number, raw } : { valid: false, national: String(raw || '').trim(), e164: null, raw }; }
export const fmtPhone = (raw: string) => parsePhone(raw).national; export const phoneOk = (raw: string) => parsePhone(raw).valid;
