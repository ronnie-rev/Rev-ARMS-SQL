import { clsx, type ClassValue } from 'clsx';
import { differenceInCalendarDays, format, parseISO, isValid } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import type { Claim, Client, ConfigOption } from './types';

export const cn = (...a: ClassValue[]) => clsx(a);
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
/** Workspace time zone (IANA, e.g. America/New_York). "Today" for deadlines, follow-ups and reports follows it, so a user on another coast or travelling sees the same dates as the team. Empty = this device's zone. */
let WS_TZ = '';
export const setWorkspaceTz = (tz: string | null | undefined) => { try { if (tz) Intl.DateTimeFormat('en-US', { timeZone: tz }); WS_TZ = tz || ''; } catch { WS_TZ = ''; } };
export const workspaceTz = () => WS_TZ || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');
export const todayISO = () => (WS_TZ ? formatInTimeZone(new Date(), WS_TZ, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
export const US_TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC'];
const nthMon = (y: number, m: number, n: number) => { const d = new Date(Date.UTC(y, m, 1)); const off = (8 - d.getUTCDay()) % 7; return new Date(Date.UTC(y, m, 1 + off + (n - 1) * 7)); };
const lastMon = (y: number, m: number) => { const d = new Date(Date.UTC(y, m + 1, 0)); return new Date(Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() + 6) % 7))); };
/** US federal holidays (observed dates) for a year, as YYYY-MM-DD. Payers are closed on these. */
export function usHolidays(y: number): Set<string> {
  const fixed = (m: number, d: number) => { const dt = new Date(Date.UTC(y, m, d)); const w = dt.getUTCDay(); if (w === 6) dt.setUTCDate(d - 1); else if (w === 0) dt.setUTCDate(d + 1); return dt; };
  const thu4 = (() => { const d = new Date(Date.UTC(y, 10, 1)); const off = (11 - d.getUTCDay()) % 7; return new Date(Date.UTC(y, 10, 1 + off + 21)); })();
  return new Set([fixed(0, 1), nthMon(y, 0, 3), nthMon(y, 1, 3), lastMon(y, 4), fixed(5, 19), fixed(6, 4), nthMon(y, 8, 1), nthMon(y, 9, 2), fixed(10, 11), thu4, fixed(11, 25)].map((d) => d.toISOString().slice(0, 10)));
}
/** Add business days (skip weekends and US federal holidays) to an ISO date. */
export function addBusinessDays(iso: string, n: number): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00Z'); let left = Math.abs(n); const step = n < 0 ? -1 : 1; const hol = new Map<number, Set<string>>();
  while (left > 0) { d.setUTCDate(d.getUTCDate() + step); const w = d.getUTCDay(); const y = d.getUTCFullYear(); if (!hol.has(y)) hol.set(y, usHolidays(y)); if (w !== 0 && w !== 6 && !hol.get(y)!.has(d.toISOString().slice(0, 10))) left--; }
  return d.toISOString().slice(0, 10);
}
export const nowISO = () => new Date().toISOString();

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
export const money = (n: number | null | undefined, cents = false) => (cents ? usd2 : usd).format(n || 0);
export function moneyShort(n: number) {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
  return `$${Math.round(n)}`;
}
export const num = (n: number) => new Intl.NumberFormat('en-US').format(n);
export const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;

export function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  const d = parseISO(s);
  return isValid(d) ? format(d, 'MM/dd/yyyy') : s;
}
export function fmtDateTime(s: string) {
  const d = parseISO(s);
  return isValid(d) ? format(d, 'MM/dd/yyyy h:mm a') : s;
}
export function relTime(s: string) {
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(s.slice(0, 10));
}

export function ageDays(c: Pick<Claim, 'dos' | 'last_billed'>, client?: Pick<Client, 'aging_basis'>): number | null {
  const base = client?.aging_basis === 'billed' ? c.last_billed || c.dos : c.dos || c.last_billed;
  if (!base) return null;
  const d = parseISO(base);
  return isValid(d) ? Math.max(0, differenceInCalendarDays(new Date(), d)) : null;
}

export interface Bucket { label: string; min: number; max: number | null; color: string }
export function bucketsFrom(opts: ConfigOption[]): Bucket[] {
  return opts.filter((o) => o.category === 'bucket' && o.active).sort((a, b) => a.sort - b.sort)
    .map((o) => ({ label: o.value, min: Number(o.meta.min ?? 0), max: o.meta.max == null || o.meta.max === '' ? null : Number(o.meta.max), color: o.color || '#6366f1' }));
}
export function bucketFor(age: number | null, buckets: Bucket[]): Bucket | null {
  if (age == null) return null;
  return buckets.find((b) => age >= b.min && (b.max == null || age <= b.max)) || buckets[buckets.length - 1] || null;
}

/** Days remaining before the payer's timely-filing window closes (negative = passed). */
export function tfDaysLeft(c: Claim, client: Client | undefined, payerTf?: number | null): number | null {
  const tf = payerTf ?? client?.tf_days;
  if (!tf || !c.dos) return null;
  return tf - differenceInCalendarDays(new Date(), parseISO(c.dos));
}

/** 0–100 "work next" score: dollars × age urgency × timely-filing risk × follow-up due. */
export function workScore(c: Claim, age: number | null, tfLeft: number | null): number {
  const ageF = Math.min((age ?? 0) / 120, 1.6) + 0.4;
  const tfF = tfLeft == null ? 1 : tfLeft <= 0 ? 1.5 : tfLeft <= 30 ? 1.8 : tfLeft <= 60 ? 1.35 : 1;
  const fuF = c.next_fu && c.next_fu <= todayISO() ? 1.25 : 1;
  const base = Math.sqrt(Math.max(c.balance, 0));
  return Math.min(100, Math.round(base * ageF * tfF * fuF * 0.7));
}

export function groupBy<T, K extends string | number>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const a of arr) { const k = key(a); const l = m.get(k); if (l) l.push(a); else m.set(k, [a]); }
  return m;
}
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export function downloadFile(name: string, content: string | Blob, type = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function toCSV(rows: Record<string, any>[], cols?: string[]) {
  if (!rows.length) return '';
  const keys = cols || Object.keys(rows[0]);
  const esc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}
export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';
}
export const hashColor = (s: string) => {
  let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 52%)`;
};

/** ISO yyyy-MM-dd → MM/DD/YYYY (US). Anything else is returned unchanged. */
/** Rewrites every ISO date inside free text to MM/DD/YYYY. */
export const usText = (t: string) => t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$2/$3/$1');
export const usDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(5, 7)}/${v.slice(8, 10)}/${v.slice(0, 4)}` : v == null ? '' : String(v));

/** Strips scripts, frames and inline event handlers from HTML before it is rendered with dangerouslySetInnerHTML. */
export function safeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]*>/g, '');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form,base').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => { for (const a of Array.from(el.attributes)) { if (/^on/i.test(a.name) || (/^(href|src|xlink:href|action)$/i.test(a.name) && /^\s*(javascript|data):/i.test(a.value))) el.removeAttribute(a.name); } });
  return doc.body.innerHTML;
}
