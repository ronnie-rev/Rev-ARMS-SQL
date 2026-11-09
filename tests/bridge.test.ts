import { describe, it, expect } from 'vitest';
import { arBridge, snapshotDates } from '../src/lib/engine/bridge';
const s = (claim: string, as_of: string, balance: number, client = 'c1') => ({ id: claim + as_of, batch_id: 'b', claim_id: claim, client_id: client, as_of, balance, billed_amt: balance, payer: 'P', provider: null, age_days: 10, bucket: '0-30', created_at: '' });
const rec = (amount: number, type: any, on: string, basis = 'last_touch', client = 'c1') => ({ id: Math.random() + '', claim_id: null, client_id: client, batch_id: null, user_id: null, user_name: null, amount, type, basis, share: 1, touch_id: null, window_days: 30, occurred_on: on, created_at: '' });
describe('AR bridge', () => {
  const snaps = [s('a', '2026-10-01', 100), s('b', '2026-10-01', 200), s('c', '2026-10-01', 300), s('a', '2026-10-08', 40), s('b', '2026-10-08', 250), s('d', '2026-10-08', 50)];
  // a: -60 (reduction), b: +50 (increase), c: dropped -300, d: new +50
  it('balances and attributes reductions', () => {
    const b = arBridge(snaps, [rec(60, 'payment', '2026-10-08', 'era835'), rec(300, 'adjustment', '2026-10-08')], { from: '2026-10-01', to: '2026-10-08' });
    expect(b.opening).toBe(600); expect(b.ending).toBe(340); expect(b.balanced).toBe(true);
    const L = Object.fromEntries(b.lines.map((l) => [l.key, l.amount])); expect(L.new).toBe(50); expect(L.inc).toBe(50); expect(L.era).toBe(-60); expect(L.adj).toBe(-300); expect(L.res).toBe(0);
    expect(b.opening + L.new + L.inc + L.era + L.pay + L.adj + L.pat + L.unk + L.res).toBe(b.ending);
  });
  it('surfaces an unexplained residual instead of hiding it', () => { const b = arBridge(snaps, [rec(60, 'payment', '2026-10-08')], { from: '2026-10-01', to: '2026-10-08' }); expect(b.residual).toBe(300); expect(b.lines.find((l) => l.key === 'res')!.amount).toBe(-300); });
  it('ignores recoveries outside the window and other practices', () => { const b = arBridge(snaps, [rec(60, 'payment', '2026-09-20'), rec(999, 'payment', '2026-10-08', 'x', 'c2')], { from: '2026-10-01', to: '2026-10-08' }); expect(b.lines.find((l) => l.key === 'pay')!.amount).toBe(0); });
  it('lists dates newest first', () => expect(snapshotDates(snaps)).toEqual(['2026-10-08', '2026-10-01']));
});
