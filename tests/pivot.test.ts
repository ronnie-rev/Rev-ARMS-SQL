import { describe, it, expect } from 'vitest';
import { compile, defaultConfig, deltaOf, flatten, toReport, DATASETS, type PRow } from '../src/lib/engine/pivot';
import { parsePivotRequest } from '../src/lib/engine/pivot_nl';
const rows: PRow[] = [
  { id: 'a', client: 'NCPS', payer: 'Aetna', bucket: '0-30', balance: 100, age: 10, touches: 0, denied: 0, visit: 'Surgery', family: 'x' },
  { id: 'b', client: 'NCPS', payer: 'Aetna', bucket: '91-120', balance: 300, age: 100, touches: 2, denied: 1, visit: 'Surgery', family: 'x' },
  { id: 'c', client: 'NCPS', payer: 'UHC', bucket: '91-120', balance: 600, age: 95, touches: 1, denied: 1, visit: 'Office Visit', family: 'x' },
  { id: 'd', client: 'Other', payer: 'UHC', bucket: '0-30', balance: 50, age: 5, touches: 0, denied: 0, visit: 'Office Visit', family: 'x' },
];
describe('pivot engine', () => {
  it('sums balance by payer × bucket with correct totals', () => {
    const cfg = { ...defaultConfig('claims'), rows: ['payer'], cols: ['bucket'], values: ['balance'] }; const m = compile(rows, cfg);
    expect(m.colKeys).toEqual(['0-30', '91-120']); expect(m.grand[0]).toBe(1050);
    const uhc = m.tree.find((n) => n.label === 'UHC')!; expect(uhc.total[0]).toBe(650); expect(uhc.cells).toEqual([50, 600]);
  });
  it('ratios are computed per cell, never summed', () => {
    const m = compile(rows, { ...defaultConfig('claims'), rows: ['client'], cols: [], values: ['denied_pct', 'avg_age'] });
    const n = m.tree.find((x) => x.label === 'NCPS')!; expect(n.cells[0]).toBeCloseTo(2 / 3); expect(m.grand[0]).toBeCloseTo(2 / 4); expect(m.grand[1]).toBeCloseTo((10 + 100 + 95 + 5) / 4);
  });
  it('nested rows, collapse, topN and filters', () => {
    const cfg = { ...defaultConfig('claims'), rows: ['client', 'payer'], cols: [], values: ['claims'], filters: { visit: ['Surgery', 'Office Visit'] } }; const m = compile(rows, cfg);
    expect(flatten(m, new Set()).length).toBe(5); expect(flatten(m, new Set(['NCPS'])).length).toBe(3);
    expect(compile(rows, { ...cfg, filters: { visit: ['Surgery'] } }).grand[0]).toBe(2); expect(compile(rows, { ...cfg, rows: ['payer'], topN: 1 }).tree.length).toBe(1);
  });
  it('distinct claims not inflated by duplicates', () => { const dup = [...rows, { ...rows[0] }]; expect(compile(dup, { ...defaultConfig('claims'), rows: [], cols: [], values: ['claims'] }).grand[0]).toBe(4); });
  it('exports to a flat report', () => { const cfg = { ...defaultConfig('claims'), rows: ['payer'], cols: ['bucket'], values: ['balance'] }; const r = toReport(compile(rows, cfg), cfg); expect(r.columns.length).toBeGreaterThan(3); expect(r.totals.t0).toBe(1050); });
  it('every dataset measure runs on empty input', () => { for (const d of Object.values(DATASETS)) for (const m of d.measures) expect(Number.isFinite(m.fn([]))).toBe(true); });
});
describe('natural language → config', () => {
  const data: any = { claims: rows, work: [], recoveries: [], snapshots: [{ as_of: '2026-10-01' }, { as_of: '2026-10-08' }] };
  it('parses the spec example shape', () => {
    const r = parsePivotRequest('Build a pivot with payer and RCA category in rows; age groups in columns; sum outstanding AR and distinct claims in values; filter surgery cases', data);
    expect(r.config.rows).toEqual(['payer', 'rca']); expect(r.config.cols).toEqual(['bucket']); expect(r.config.values).toEqual(expect.arrayContaining(['balance', 'claims'])); expect(r.config.filters.visit).toEqual(['Surgery']);
  });
  it('compares the latest two snapshots', () => { const r = parsePivotRequest('compare latest two snapshots by payer', data); expect(r.config.dataset).toBe('snapshots'); expect(r.config.filters.as_of).toEqual(['2026-10-01', '2026-10-08']); expect(r.config.cols).toEqual(['as_of']); expect(r.config.delta).toBe(true); });
  it('flags unsupported asks instead of guessing', () => expect(parsePivotRequest('sla compliance excluding client hold', data).clarify.join(' ')).toMatch(/SLA/));
  it('delta = last snapshot − first', () => { const sn = [{ id: 'a', as_of: '2026-10-01', payer: 'P', balance: 100, age: 1 }, { id: 'a', as_of: '2026-10-08', payer: 'P', balance: 70, age: 8 }]; const cfg = { ...defaultConfig('snapshots'), rows: ['payer'], cols: ['as_of'], values: ['balance'] }; const m = compile(sn, cfg); expect(deltaOf(m, m.tree[0].cells)).toEqual([-30]); });
});
import { moveItem, wellItems } from '../src/lib/engine/pivot';
describe('pivot drag-and-drop model', () => {
  const base = { ...defaultConfig('claims'), rows: ['payer', 'client', 'visit'], cols: ['bucket'], values: ['balance', 'claims'], filters: { family: ['x'] } };
  it('reorders inside a well', () => { expect(moveItem(base, { key: 'visit', kind: 'f', from: 'rows', to: 'rows', index: 0 }).rows).toEqual(['visit', 'payer', 'client']); expect(moveItem(base, { key: 'balance', kind: 'm', from: 'values', to: 'values', index: 2 }).values).toEqual(['claims', 'balance']); });
  it('moves rows↔cols without duplicates', () => { const n = moveItem(base, { key: 'client', kind: 'f', from: 'rows', to: 'cols', index: 0 }); expect(n.rows).toEqual(['payer', 'visit']); expect(n.cols).toEqual(['client', 'bucket']); const m = moveItem(n, { key: 'bucket', kind: 'f', from: null, to: 'rows', index: 1 }); expect(m.cols).toEqual(['client']); expect(m.rows).toEqual(['payer', 'bucket', 'visit']); });
  it('adds from the field list, keeps filter selections and order', () => { const n = moveItem(base, { key: 'rca', kind: 'f', from: null, to: 'filters', index: 0 }); expect(wellItems(n, 'filters')).toEqual(['rca', 'family']); expect(n.filters.family).toEqual(['x']); });
  it('refuses measures outside Values and fields inside Values', () => { expect(moveItem(base, { key: 'balance', kind: 'm', from: null, to: 'rows', index: 0 })).toBe(base); expect(moveItem(base, { key: 'payer', kind: 'f', from: null, to: 'values', index: 0 })).toBe(base); });
  it('does not duplicate when dropped on itself', () => { expect(moveItem(base, { key: 'payer', kind: 'f', from: 'rows', to: 'rows', index: 0 }).rows).toEqual(['payer', 'client', 'visit']); });
});
