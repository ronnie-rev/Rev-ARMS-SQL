import { describe, expect, it } from 'vitest';
import { pivotInsights } from '../src/lib/engine/pivotinsights';
import { dropoffClusters, learnedHint, payerOutcomeRates, triagePlan } from '../src/lib/engine/missingintel';

const node = (label: string, total: number, rows: any[] = []) => ({ key: label, label, level: 0, path: [label], rows, cells: [total], total: [total], children: [], leaf: true }) as any;
const matrix = (nodes: any[]) => ({ tree: nodes, rowFields: ['payer'], colFields: [], valueIds: ['balance'], columns: [], grand: [], grandCells: {}, rowCount: nodes.length, sourceRows: 0, warnings: [] }) as any;
const o = { measureLabel: 'Open balance', additive: true, fmt: (v: number) => '$' + Math.round(v), drillFields: [{ key: 'rca', label: 'Root cause' }, { key: 'bucket', label: 'Aging bucket' }], usedFields: ['payer'] };

describe('pivot insights', () => {
  it('finds concentration, Pareto, tail, outliers and the best drill-down', () => {
    const big = Array.from({ length: 40 }, (_, i) => ({ rca: i < 30 ? 'Auth' : 'Coding', bucket: ['0-30', '31-60', '61-90', '90+'][i % 4] }));
    const nodes = [node('Aetna', 60000, big), node('Cigna', 9000), node('UHC', 8000), node('Humana', 3000), node('BCBS', 900), node('A', 400), node('B', 300), node('C', 250), node('D', 200), node('E', 150), node('F', 100), node('G', 90)];
    const f = pivotInsights(matrix(nodes), o); const kinds = f.map((x) => x.kind); expect(kinds).toContain('concentration'); expect(kinds).toContain('outlier'); expect(kinds).toContain('drill'); expect(f.find((x) => x.kind === 'drill')!.drillField).toBe('rca'); expect(f.find((x) => x.kind === 'concentration')!.text).toMatch(/Aetna alone is 7\d% of open balance/); expect(f.length).toBeLessThanOrEqual(5);
    expect(pivotInsights(matrix([node('x', 1), node('y', 2)]), o)).toEqual([]); expect(pivotInsights(matrix(nodes), { ...o, additive: false }).some((x) => x.kind === 'concentration')).toBe(false);
  });
});
const C = (id: string, o: any = {}) => ({ id, client_id: 'k', payer: 'Aetna', balance: 100, missing_since: '2026-11-01', custom: {}, closed_reason: null, resolution: null, ...o }) as any;
describe('missing-from-file intelligence', () => {
  it('clusters bulk drop-offs and says whether they look like a payment run', () => {
    const rows = [...Array.from({ length: 8 }, (_, i) => C('a' + i)), ...Array.from({ length: 2 }, (_, i) => C('b' + i, { payer: 'Cigna' }))]; const ev = new Set(['a0', 'a1', 'a2', 'a3', 'a4', 'a5']);
    const c = dropoffClusters(rows, ev); expect(c.length).toBe(1); expect(c[0]).toMatchObject({ payer: 'Aetna', n: 8, balance: 800, evidenceShare: 75 }); expect(c[0].verdict).toMatch(/payment run/); expect(dropoffClusters(rows, new Set())[0].verdict).toMatch(/No payment evidence/);
  });
  it('learns payer outcome rates and nudges weak suggestions only', () => {
    const past = Array.from({ length: 10 }, (_, i) => C('p' + i, { custom: { resolution_basis: 'missing_review' }, resolution: i < 9 ? 'paid' : 'adjusted' })); const rates = payerOutcomeRates([...past, C('x', { resolution: 'paid' })]); expect(rates.get('Aetna')!.n).toBe(10);
    const weak = learnedHint(C('n1'), { outcome: 'restore', confidence: 'low' }, rates); expect(weak.outcome).toBe('paid'); expect(weak.confidence).toBe('medium'); expect(weak.note).toMatch(/90% of 10 past Aetna/);
    expect(learnedHint(C('n1'), { outcome: 'paid', confidence: 'high' }, rates).note).toBeNull(); expect(learnedHint(C('n2', { payer: 'Unknown' }), { outcome: 'paid', confidence: 'low' }, rates).note).toBeNull();
    const wo = payerOutcomeRates(Array.from({ length: 10 }, (_, i) => C('w' + i, { payer: 'Slow', custom: { resolution_basis: 'missing_review' }, resolution: 'adjusted' }))); expect(learnedHint(C('s', { payer: 'Slow' }), { outcome: 'paid', confidence: 'low' }, wo).outcome).toBe('written_off');
  });
  it('splits quick wins from the ones that need a human', () => {
    const rows = [C('1', { balance: 500 }), C('2', { balance: 300 }), C('3', { balance: 50 })]; const p = triagePlan(rows, new Map([['1', { confidence: 'high' as const }], ['2', { confidence: 'low' as const }]])); expect(p.quickWins).toEqual(['1']); expect(p.quickWinBalance).toBe(500); expect(p.needHuman.sort()).toEqual(['2', '3']); expect(p.needHumanBalance).toBe(350);
  });
});
