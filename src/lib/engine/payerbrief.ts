// One-page payer playbook built from your own history: how they behave, what they deny, what wins, how reachable they are, and where to send things.
import type { Activity, Appeal, Claim } from '../types';
import { splitDenials } from '../kb';
import { callsOf, payerContactRate } from './calls';

export interface PayerBrief { payer: string; claims: number; open: number; openBalance: number; denialRate: number | null; topCodes: { code: string; n: number; balance: number }[]; appeals: { decided: number; won: number; rate: number | null; avgDays: number | null }; reach: { calls: number; rate: number | null }; contact: { label: string; value: string }[]; lines: string[] }
const dd = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T12:00:00Z') - Date.parse(a.slice(0, 10) + 'T12:00:00Z')) / 864e5);
export function payerBrief(payer: string, claims: Claim[], appeals: Appeal[], activity: Activity[], meta: Record<string, string> = {}): PayerBrief {
  const mine = claims.filter((c) => (c.payer || 'Unknown').toLowerCase() === payer.toLowerCase()); const open = mine.filter((c) => !c.closed_at); const ids = new Set(mine.map((c) => c.id));
  const denied = mine.filter((c) => splitDenials(c.denial_codes).length > 0); const codes = new Map<string, { n: number; balance: number }>();
  for (const c of open) { const k = splitDenials(c.denial_codes)[0]; if (!k) continue; const e = codes.get(k) || { n: 0, balance: 0 }; e.n++; e.balance += c.balance; codes.set(k, e); }
  const ap = appeals.filter((a) => ids.has(a.claim_id) && ['won', 'partial', 'lost'].includes(a.status)); const won = ap.filter((a) => a.status !== 'lost').length; const days = ap.filter((a) => a.filed_on && a.decided_on).map((a) => dd(a.filed_on!, a.decided_on!));
  const pr = payerContactRate(callsOf(activity), mine)[0];
  const contact = ([['Provider line', meta.phone], ['Portal', meta.portal_url], ['Appeal fax', meta.appeal_fax], ['Appeal address', [meta.appeal_address, meta.appeal_city_state_zip].filter(Boolean).join(', ')], ['Timely filing', meta.tf_days ? `${meta.tf_days} days` : ''], ['Appeal window', meta.afl_days ? `${meta.afl_days} days` : '']] as [string, string | undefined][]).filter(([, v]) => v).map(([label, value]) => ({ label, value: value! }));
  const b: PayerBrief = { payer, claims: mine.length, open: open.length, openBalance: Math.round(open.reduce((a, c) => a + c.balance, 0)), denialRate: mine.length >= 10 ? Math.round((denied.length / mine.length) * 100) : null,
    topCodes: [...codes.entries()].sort((a, b2) => b2[1].balance - a[1].balance).slice(0, 5).map(([code, v]) => ({ code, n: v.n, balance: Math.round(v.balance) })),
    appeals: { decided: ap.length, won, rate: ap.length >= 3 ? Math.round((won / ap.length) * 100) : null, avgDays: days.length ? Math.round(days.reduce((x, y) => x + y, 0) / days.length) : null }, reach: { calls: pr?.calls || 0, rate: pr && pr.calls >= 3 ? pr.rate : null }, contact, lines: [] };
  if (b.denialRate != null) b.lines.push(`${b.denialRate}% of ${b.claims} claims came back denied.`);
  if (b.topCodes[0]) b.lines.push(`Biggest open denial: ${b.topCodes[0].code} (${b.topCodes[0].n} claims, $${b.topCodes[0].balance.toLocaleString('en-US')}).`);
  if (b.appeals.rate != null) b.lines.push(`Appeals win ${b.appeals.rate}% of ${b.appeals.decided}${b.appeals.avgDays != null ? `, decided in about ${b.appeals.avgDays} days` : ''}.`);
  if (b.reach.rate != null) b.lines.push(`Calls reach a person ${b.reach.rate}% of the time (${b.reach.calls} logged) — ${b.reach.rate < 40 ? 'try the portal or fax first' : 'phone works'}.`);
  return b;
}
