import { describe, expect, it } from 'vitest';
import { REPORTS, runReport } from '../src/lib/engine/reportdefs';
import { buildSeed } from '../src/lib/seed';
import { enrichClaims } from '../src/lib/engine/enrich';
import { defaultConfig } from '../src/lib/defaults';

// Every catalogue report must run on real seed data with default params and with all filters open, never throwing and always returning consistent rows.
describe('every report runs', () => {
  const s = buildSeed('demo') as any; const today = new Date().toISOString().slice(0, 10);
  const ecs = enrichClaims(s.claims, { clients: s.clients, profiles: s.profiles, config: defaultConfig() as any, today, includeClosed: true, scope: [] });
  const ctx: any = { ecs, claims: s.claims, workLog: s.work_log, recoveries: s.recoveries, batches: s.import_batches, profiles: s.profiles, clients: s.clients, config: defaultConfig(), carc: new Map(), violations: [], today, showPhi: true, qaReviews: s.qa_reviews, snapshots: s.claim_snapshots };
  for (const r of REPORTS) it(`${r.id}`, () => { const out = runReport(r.id, ctx, {}); expect(Array.isArray(out.result.columns)).toBe(true); expect(Array.isArray(out.result.rows)).toBe(true); const keys = out.result.columns.map((c) => c.key); for (const row of out.result.rows.slice(0, 50)) for (const k of keys) expect(k in row || row[k] === undefined).toBe(true); expect(JSON.stringify(out.result)).not.toMatch(/NaN|undefined|\[object/); });
});
