// Mirror of the SQL function public.claim_summary (migration 0016): the same aggregates computed in the browser, used for the demo store,
// for tests (parity with the database) and as the fallback when the RPC is unavailable.
import type { Claim, Client } from '../types';
import { bucketFor, type Bucket } from '../utils';

const ageAt = (c: Pick<Claim, 'dos' | 'last_billed'>, basis: string | undefined, today: string): number | null => { const base = basis === 'billed' ? c.last_billed || c.dos : c.dos || c.last_billed; return base ? Math.max(0, Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(base.slice(0, 10) + 'T00:00:00Z')) / 864e5)) : null; };

export interface ClaimSummary {
  as_of: string; open_claims: number; open_balance: number; unassigned: number; followups_due: number; missing_review: number;
  by_client: { client_id: string; name: string; n: number; balance: number }[]; by_bucket: { label: string; n: number; balance: number }[];
  by_status: { status: string; n: number; balance: number }[]; by_payer: { payer: string; n: number; balance: number }[];
}
const r2 = (n: number) => Math.round(n * 100) / 100;
export function computeSummary(claims: Claim[], clients: Client[], buckets: Bucket[], today: string, only?: string[] | null): ClaimSummary {
  const cm = new Map(clients.map((c) => [c.id, c])); const open = claims.filter((c) => !c.closed_at && cm.has(c.client_id) && (!only || only.includes(c.client_id)));
  const grp = <T extends string>(key: (c: Claim) => T) => { const m = new Map<T, { n: number; balance: number }>(); for (const c of open) { const k = key(c); const e = m.get(k) || { n: 0, balance: 0 }; e.n++; e.balance += c.balance; m.set(k, e); } return m; };
  const order = new Map(buckets.map((b, i) => [b.label, i]));
  const bk = grp((c) => bucketFor(ageAt(c, cm.get(c.client_id)?.aging_basis, today), buckets)?.label ?? 'Unknown');
  return {
    as_of: today, open_claims: open.length, open_balance: r2(open.reduce((a, c) => a + c.balance, 0)), unassigned: open.filter((c) => !c.assigned_to).length, followups_due: open.filter((c) => c.next_fu && c.next_fu <= today).length, missing_review: open.filter((c) => (c.flags || []).includes('missing_review')).length,
    by_client: [...grp((c) => c.client_id)].map(([client_id, v]) => ({ client_id, name: cm.get(client_id)!.name, n: v.n, balance: r2(v.balance) })).sort((a, b) => b.balance - a.balance),
    by_bucket: [...bk].map(([label, v]) => ({ label, n: v.n, balance: r2(v.balance) })).sort((a, b) => (order.get(a.label) ?? 9999) - (order.get(b.label) ?? 9999)),
    by_status: [...grp((c) => c.status)].map(([status, v]) => ({ status, n: v.n, balance: r2(v.balance) })).sort((a, b) => b.balance - a.balance),
    by_payer: [...grp((c) => c.payer || 'Unknown')].map(([payer, v]) => ({ payer, n: v.n, balance: r2(v.balance) })).sort((a, b) => b.balance - a.balance).slice(0, 50),
  };
}
