import type { BatchSummary, Claim, Client } from '../types';
import { ageDays, bucketFor, type Bucket } from '../utils';

/** PHI-free snapshot of an inventory: used for trend charts, the insight engine and the client portal. */
export function batchSummary(claims: Claim[], client: Client, buckets: Bucket[], resolved?: { n: number; v: number }): BatchSummary {
  const open = claims.filter((c) => !c.closed_at); const b: Record<string, { n: number; v: number }> = {}; const payers: Record<string, number> = {}; let total = 0;
  for (const c of open) { const k = bucketFor(ageDays(c, client), buckets)?.label || '?'; b[k] = b[k] || { n: 0, v: 0 }; b[k].n++; b[k].v += c.balance; payers[c.payer || 'Unknown'] = (payers[c.payer || 'Unknown'] || 0) + c.balance; total += c.balance; }
  return { buckets: b, payers, total: Math.round(total), count: open.length, resolved };
}
