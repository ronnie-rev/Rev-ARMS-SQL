import { describe, expect, it } from 'vitest';
import { codeStats } from '../src/lib/engine/learning';
describe('code stats', () => {
  it('summarises how a denial code goes for this workspace', () => {
    const claims = [{ id: 'a', denial_codes: 'CO-50', payer: 'Aetna', balance: 100, created_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-21T00:00:00Z' }, { id: 'b', denial_codes: 'CO50', payer: 'Aetna', balance: 300, created_at: '2026-01-01T00:00:00Z', closed_at: null }, { id: 'c', denial_codes: 'CO-16', payer: 'Cigna', balance: 50, created_at: '', closed_at: null }] as any;
    const log = [1, 2, 3].map(() => ({ claim_id: 'a', end_action: 'Appeal filed' })).concat([{ claim_id: 'b', end_action: 'Called payer' }]) as any;
    const s = codeStats('50', claims, [{ claim_id: 'a', status: 'won', amount_recovered: 90 }, { claim_id: 'b', status: 'lost' }] as any, log)!;
    expect(s.claims).toBe(2); expect(s.open).toBe(1); expect(s.balance).toBe(300); expect(s.resolvedPct).toBe(50); expect(s.medianDaysToClose).toBe(20); expect(s.appeals).toMatchObject({ decided: 2, winRate: 50, avgRecovered: 90 }); expect(s.topActions[0]).toMatchObject({ action: 'Appeal filed', rate: 100 }); expect(codeStats('999', claims, [], [])).toBeNull();
  });
});
