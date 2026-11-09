import { describe, expect, it } from 'vitest';
import { rcmGaps } from '../src/lib/engine/rcmfields';
describe('rcm gaps', () => {
  it('prompts what a specialist would chase', () => {
    expect(rcmGaps({ denial_codes: 'CO-197', custom: {} }, '2026-01-01').length).toBe(1);
    expect(rcmGaps({ denial_codes: '', custom: { rcm_secondary_payer: 'BCBS' } }, '2026-01-01')[0]).toMatch(/secondary/i);
    expect(rcmGaps({ denial_codes: '', custom: { rcm_check_no: '1', rcm_posted: 'No' } }, '2026-01-01')[0]).toMatch(/posted/i);
  });
});
