import { describe, it, expect } from 'vitest';
import { validateOption, validateConfig, validateClient, validateProfile, validateImportSettings } from '../src/lib/engine/adminvalidate';
import type { ConfigOption } from '../src/lib/types';
const o = (category: any, value: string, extra: Partial<ConfigOption> = {}): ConfigOption => ({ id: Math.random() + '', category, value, parent: null, label: null, color: null, sort: 0, active: true, meta: {}, ...extra });
const msgs = (e: any[]) => e.map((x) => x.field + ':' + x.msg);
describe('option validation', () => {
  it('requires value, no padding, unique per parent', () => { const a = o('mode', 'Call'); expect(validateOption(o('mode', '  '), [a]).length).toBe(1); expect(msgs(validateOption(o('mode', ' x '), []))).toContain('value:Remove leading/trailing spaces'); expect(validateOption(o('mode', 'call'), [a])[0].msg).toMatch(/already exists/); expect(validateOption(o('rca_detail', 'call', { parent: 'A' }), [o('rca_detail', 'Call', { parent: 'B' })])).toEqual([]); });
  it('buckets: ints, order, overlap', () => { const a = o('bucket', '0-30', { meta: { min: 0, max: 30 } }); expect(validateOption(o('bucket', 'bad', { meta: { min: -1, max: 5 } }), []).length).toBeGreaterThan(0); expect(msgs(validateOption(o('bucket', 'x', { meta: { min: 10, max: 5 } }), []))).toContain('meta.max:To must be a whole number ≥ From (or empty for open-ended)'); expect(validateOption(o('bucket', '20-40', { meta: { min: 20, max: 40 } }), [a])[0].msg).toMatch(/Overlaps/); expect(validateOption(o('bucket', '31-60', { meta: { min: 31, max: 60 } }), [a])).toEqual([]); });
  it('payer: day ranges, phone, url', () => { expect(validateOption(o('payer', 'Aetna', { meta: { tf_days: 0 } }), []).length).toBe(1); expect(validateOption(o('payer', 'A', { meta: { tf_days: 90, phone: '1-800-555-0100', portal: 'https://x.com' } }), [])).toEqual([]); expect(validateOption(o('payer', 'A', { meta: { phone: 'abc' } }), []).length).toBe(1); expect(validateOption(o('payer', 'A', { meta: { portal: 'ftp://x' } }), []).length).toBe(1); expect(validateOption(o('payer', 'A', { meta: { tf_days: 2.5 } }), []).length).toBe(1); });
  it('carc, colours, letters, custom stage', () => { expect(validateOption(o('carc', 'CO-45'), [])).toEqual([]); expect(validateOption(o('carc', 'hello'), []).length).toBe(1); expect(validateOption(o('status', 'S', { color: 'red' }), []).length).toBe(1); expect(validateOption(o('letter', 'L', { meta: { body: '' } }), []).length).toBe(1); expect(validateOption(o('stage', 'Q', { meta: { rule: 'custom', keywords: '' } }), []).length).toBe(1); expect(validateOption(o('end_action', 'E', { meta: { fu_days: 400 } }), []).length).toBeGreaterThan(0); });
  it('config consistency finds gaps, missing mappings, orphans', () => {
    const cfg = [o('bucket', 'a', { meta: { min: 0, max: 30 } }), o('bucket', 'b', { meta: { min: 40, max: null } }), o('status', 'S1'), o('end_action', 'E', { meta: { status: 'Nope' } }), o('rca_detail', 'D', { parent: 'Gone' })];
    const m = msgs(validateConfig(cfg)).join('|'); expect(m).toMatch(/Gap or overlap/); expect(m).toMatch(/No status closes/); expect(m).toMatch(/missing status/); expect(m).toMatch(/missing parent/);
    expect(validateConfig([o('bucket', 'a', { meta: { min: 0, max: 30 } }), o('bucket', 'b', { meta: { min: 31, max: null } }), o('status', 'Done', { meta: { terminal: true } })])).toEqual([]);
  });
});
describe('client / profile / import validation', () => {
  it('client', () => { const all: any[] = [{ id: '1', name: 'Alpha', code: 'ALP' }]; expect(validateClient({ name: '' }, all).length).toBe(1); expect(validateClient({ name: 'alpha' }, all)[0].msg).toMatch(/another/i); expect(validateClient({ name: 'B', code: 'ALP' }, all)[0].msg).toMatch(/already/); expect(validateClient({ name: 'B', code: 'x!' }, all).length).toBe(1); expect(validateClient({ name: 'B', tf_days: 5000 }, all).length).toBe(1); expect(validateClient({ name: 'Beta', code: 'BET', tf_days: 90, aging_basis: 'dos' }, all)).toEqual([]); });
  it('profile', () => { const all: any[] = [{ id: '1', email: 'a@x.com', emp_code: 'E1' }]; expect(msgs(validateProfile({ full_name: 'X', email: 'bad', role: 'user_prod' }, all))).toContain('email:Enter a valid email'); expect(validateProfile({ full_name: 'X', email: 'A@x.com', role: 'user_prod' }, all)[0].msg).toMatch(/in use/); expect(validateProfile({ id: '2', full_name: 'X', email: 'b@x.com', role: 'client' }, all)[0].msg).toMatch(/practice/); expect(validateProfile({ id: '2', full_name: 'X', email: 'b@x.com', role: 'user_prod', daily_target: -3, supervisor_id: '2' }, all).length).toBe(2); expect(validateProfile({ id: '2', full_name: 'X', email: 'b@x.com', role: 'client', client_ids: ['c1'] }, all, ['c1'])).toEqual([]); });
  it('import settings', () => { expect(validateImportSettings({ maxDropPct: 150 }).length).toBe(1); expect(validateImportSettings({ closeAfterMisses: 1.5 }).length).toBe(1); expect(validateImportSettings({ maxDropPct: 40, closeAfterMisses: 2 })).toEqual([]); });
});
import { defaultConfig } from '../src/lib/defaults';
describe('shipped defaults are valid', () => {
  it('every default option passes validation and the config is consistent', () => {
    const cfg = defaultConfig() as ConfigOption[]; const bad = cfg.map((x) => ({ x, e: validateOption(x, cfg) })).filter((y) => y.e.length);
    expect(bad.map((y) => `${y.x.category}:${y.x.value}:${y.e[0].msg}`)).toEqual([]); expect(validateConfig(cfg)).toEqual([]);
  });
});
