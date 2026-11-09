import { describe, expect, it } from 'vitest';
import { unresolvedSweep } from '../src/lib/engine/sweep';
const C = (o: any) => ({ id: o.id, closed_at: null, flags: [], assigned_to: 'u', next_fu: '2026-07-10', created_at: '2026-06-20T00:00:00Z', last_touched_at: '2026-06-28T00:00:00Z', custom: {}, resolution: null, ...o }) as any;
describe('unresolved sweep', () => {
  const today = '2026-07-01';
  it('finds each way a claim is forgotten', () => {
    const claims = [C({ id: 'a', assigned_to: null }), C({ id: 'b', next_fu: null }), C({ id: 'c', last_touched_at: '2026-05-01T00:00:00Z' }), C({ id: 'd', flags: ['missing_review'], missing_since: '2026-06-10' }), C({ id: 'e', flags: ['deadline_expired'] }), C({ id: 'f', closed_at: '2026-06-15T00:00:00Z', resolution: 'unknown' }), C({ id: 'g', custom: { snooze_until: '2026-06-25' } }), C({ id: 'h', custom: { snooze_until: '2026-08-01' }, assigned_to: null, next_fu: null }), C({ id: 'ok' })];
    const s = unresolvedSweep(claims, [{ claim_id: 'ok', status: 'sent', due_on: '2026-06-20' } as any], today);
    const ids = (k: keyof typeof s) => s[k].map((c) => c.id);
    expect(ids('no_owner')).toEqual(['a']); expect(ids('no_followup')).toEqual(['b']); expect(ids('stale')).toEqual(['c']); expect(ids('missing_pending')).toEqual(['d']); expect(ids('deadline_expired')).toEqual(['e']); expect(ids('unconfirmed_close')).toEqual(['f']); expect(ids('snooze_ended')).toEqual(['g']); expect(ids('appeal_overdue')).toEqual(['ok']);
  });
  it('a clean claim appears nowhere', () => { const s = unresolvedSweep([C({ id: 'ok' })], [], today); expect(Object.values(s).every((l) => l.length === 0)).toBe(true); });
});
