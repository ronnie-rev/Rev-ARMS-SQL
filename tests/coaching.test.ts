import { describe, expect, it } from 'vitest';
import { coaching } from '../src/lib/engine/coaching';
const W = (user: string, day: string, o: any = {}) => ({ user_id: user, work_date: day, claim_id: 'c' + (o.c || 1), comment: 'called payer, rep said reprocess in 14 days', end_action: 'Called payer', audit_status: null, ...o }) as any;
describe('coaching', () => {
  it('flags low output, thin notes and repeated actions', () => {
    const log = [...Array.from({ length: 12 }, (_, i) => W('a', '2026-03-02', { c: 1, comment: i % 2 ? '' : 'ok' })), W('b', '2026-03-02', { c: 2 })];
    const r = coaching(log, [{ id: 'a', full_name: 'Ann', daily_target: 40 }, { id: 'b', full_name: 'Bob', daily_target: 1 }], '2026-03-02', '2026-03-02', 1);
    const ann = r.find((x) => x.id === 'a')!; expect(ann.flags.some((f) => f.msg.includes('target'))).toBe(true); expect(ann.flags.some((f) => f.msg.includes('almost no comment'))).toBe(true); expect(ann.flags.some((f) => f.msg.includes('repeat'))).toBe(true);
    expect(r.find((x) => x.id === 'b')!.flags).toEqual([]);
  });
});
