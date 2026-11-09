// Governed pivot engine (Functional Design v2 / Pivot spec). Pure: datasets → flat rows, a metric registry whose
// measures are evaluated over each cell's row subset (so ratios and distinct counts are never summed across groups),
// and a compiler from a PivotConfig to a matrix. No arbitrary SQL / formulas: only registered fields and measures.
import type { EClaim } from './eclaim';
import type { ClaimSnapshot, Profile, Recovery, WorkLog, Client } from '../types';

export type DatasetId = 'claims' | 'work' | 'recoveries' | 'snapshots';
export type MType = 'money' | 'int' | 'num1' | 'pct';
export interface FieldDef { key: string; label: string; group: string; date?: boolean }
export interface Measure { id: string; label: string; type: MType; hint: string; fn: (rows: PRow[]) => number }
export type PRow = Record<string, any>;
const sum = (r: PRow[], k: string) => r.reduce((a, x) => a + (Number(x[k]) || 0), 0);
const distinct = (r: PRow[], k: string) => new Set(r.map((x) => x[k]).filter(Boolean)).size;
const avg = (r: PRow[], k: string) => (r.length ? sum(r, k) / r.length : 0);

export const DATASETS: Record<DatasetId, { label: string; grain: string; fields: FieldDef[]; measures: Measure[]; defaults: Partial<PivotConfig> }> = {
  claims: {
    label: 'Current claims', grain: 'One logical ARMS claim (current inventory; closed claims only when included)',
    fields: [
      ['client', 'Client', 'Who'], ['payer', 'Payer', 'Who'], ['provider', 'Provider', 'Who'], ['owner', 'Owner', 'Who'], ['visit', 'Visit type', 'Who'],
      ['bucket', 'Aging bucket', 'Where'], ['queue', 'Claim queue', 'Where'], ['family', 'Work bucket (cause)', 'Where'], ['lifecycle', 'Lifecycle status', 'Where'], ['status', 'Workflow status', 'Where'], ['priority', 'Priority', 'Where'],
      ['rca', 'Root cause', 'Why'], ['rca_detail', 'Root cause detail', 'Why'], ['end_action', 'End action', 'Why'], ['tf_risk', 'Timely-filing risk', 'Why'], ['dos_month', 'DOS month', 'When', true], ['touched', 'Worked?', 'When'], ['mix', 'Open / closed', 'When'],
    ].map(([key, label, group, date]) => ({ key: key as string, label: label as string, group: group as string, date: !!date })),
    measures: [
      { id: 'balance', label: 'Outstanding AR ($)', type: 'money', hint: 'SUM of claim balance', fn: (r) => sum(r, 'balance') },
      { id: 'claims', label: 'Claims (distinct)', type: 'int', hint: 'COUNT DISTINCT claim', fn: (r) => distinct(r, 'id') },
      { id: 'billed', label: 'Billed ($)', type: 'money', hint: 'SUM billed amount', fn: (r) => sum(r, 'billed') },
      { id: 'avg_age', label: 'Avg age (days)', type: 'num1', hint: 'Balance-weighted would hide small claims; simple average', fn: (r) => avg(r, 'age') },
      { id: 'avg_bal', label: 'Avg balance ($)', type: 'money', hint: 'Balance ÷ distinct claims', fn: (r) => { const n = distinct(r, 'id'); return n ? sum(r, 'balance') / n : 0; } },
      { id: 'touches', label: 'Touches (lifetime)', type: 'int', hint: 'SUM touch count', fn: (r) => sum(r, 'touches') },
      { id: 'touches100', label: 'Touches per 100 claims', type: 'num1', hint: 'Touches ÷ claims × 100', fn: (r) => (r.length ? (sum(r, 'touches') / r.length) * 100 : 0) },
      { id: 'denied', label: 'Denied claims', type: 'int', hint: 'Claims in the Denied queue or with CO denial codes', fn: (r) => sum(r, 'denied') },
      { id: 'denied_pct', label: 'Denied % of claims', type: 'pct', hint: 'Denied claims ÷ claims (denominator = claims in the cell)', fn: (r) => (r.length ? sum(r, 'denied') / r.length : 0) },
      { id: 'pct90', label: '90+ exposure %', type: 'pct', hint: 'Balance with age ≥ 90 ÷ balance (same as-of basis)', fn: (r) => { const t = sum(r, 'balance'); return t ? r.filter((x) => (x.age ?? 0) >= 90).reduce((a, x) => a + x.balance, 0) / t : 0; } },
      { id: 'unworked', label: 'Unworked claims', type: 'int', hint: 'No work event yet', fn: (r) => r.filter((x) => !x.touches).length },
      { id: 'fu_due', label: 'Follow-ups due', type: 'int', hint: 'Next F/U ≤ today and not snoozed', fn: (r) => sum(r, 'fu_due') },
    ] as Measure[],
    defaults: { rows: ['payer'], cols: ['bucket'], values: ['balance', 'claims'], view: 'matrix' },
  },
  work: {
    label: 'Work events', grain: 'One saved touch (a row of the production tracker)',
    fields: [['client', 'Client', 'Who'], ['user', 'Analyst', 'Who'], ['supervisor', 'Supervisor', 'Who'], ['payer', 'Payer', 'Who'], ['visit', 'Visit type', 'Who'], ['date', 'Work date', 'When', true], ['week', 'Week', 'When', true], ['month', 'Month', 'When', true],
      ['rca', 'Root cause', 'Why'], ['rca_detail', 'Root cause detail', 'Why'], ['end_action', 'End action', 'Why'], ['end_sub', 'End action sub-category', 'Why'], ['mode', 'Mode', 'Why'], ['bucket', 'Aging bucket (at touch)', 'Where'], ['audit', 'QA result', 'Quality'], ['multi', 'Repeat touch?', 'Quality']]
      .map(([key, label, group, date]) => ({ key: key as string, label: label as string, group: group as string, date: !!date })),
    measures: [
      { id: 'touches', label: 'Touches', type: 'int', hint: 'COUNT work events', fn: (r) => r.length },
      { id: 'claims', label: 'Claims worked (distinct)', type: 'int', hint: 'COUNT DISTINCT claim', fn: (r) => distinct(r, 'claim_id') },
      { id: 'tpc', label: 'Touches per claim', type: 'num1', hint: 'Touches ÷ distinct claims worked', fn: (r) => { const n = distinct(r, 'claim_id'); return n ? r.length / n : 0; } },
      { id: 'balance', label: 'Balance touched ($)', type: 'money', hint: 'Balance at time of touch, distinct claims counted once (latest)', fn: (r) => { const m = new Map<string, number>(); r.forEach((x) => m.set(x.claim_id, x.balance)); return [...m.values()].reduce((a, b) => a + b, 0); } },
      { id: 'repeat_pct', label: 'Repeat-touch %', type: 'pct', hint: 'Touches flagged multi-touch ÷ touches', fn: (r) => (r.length ? sum(r, 'multi_n') / r.length : 0) },
      { id: 'qa_pass', label: 'QA pass rate', type: 'pct', hint: 'Pass ÷ (pass + fail) among audited touches', fn: (r) => { const p = r.filter((x) => x.audit === 'pass').length, f = r.filter((x) => x.audit === 'fail').length; return p + f ? p / (p + f) : 0; } },
      { id: 'minutes', label: 'Minutes logged', type: 'num1', hint: 'SUM time spent', fn: (r) => sum(r, 'secs') / 60 },
    ] as Measure[],
    defaults: { rows: ['user'], cols: ['week'], values: ['touches'], view: 'matrix' },
  },
  snapshots: {
    label: 'Snapshot history', grain: 'One claim per aging snapshot (import) — the A/R inventory as it stood on each as-of date',
    fields: [['as_of', 'As-of date', 'When', true], ['client', 'Client', 'Who'], ['payer', 'Payer', 'Who'], ['provider', 'Provider', 'Who'], ['bucket', 'Aging bucket (at snapshot)', 'Where']]
      .map(([key, label, group, date]) => ({ key: key as string, label: label as string, group: group as string, date: !!date })),
    measures: [
      { id: 'balance', label: 'A/R balance ($)', type: 'money', hint: 'SUM of balance as of the snapshot', fn: (r) => sum(r, 'balance') },
      { id: 'claims', label: 'Claims (distinct)', type: 'int', hint: 'COUNT DISTINCT claim', fn: (r) => distinct(r, 'id') },
      { id: 'avg_age', label: 'Avg age at snapshot (days)', type: 'num1', hint: 'Simple average age', fn: (r) => avg(r, 'age') },
      { id: 'pct90', label: '90+ exposure %', type: 'pct', hint: 'Balance aged ≥ 90 days ÷ balance at that snapshot', fn: (r) => { const t = sum(r, 'balance'); return t ? r.filter((x) => (x.age ?? 0) >= 90).reduce((a, x) => a + x.balance, 0) / t : 0; } },
      { id: 'billed', label: 'Billed ($)', type: 'money', hint: 'SUM billed amount', fn: (r) => sum(r, 'billed') },
    ] as Measure[],
    defaults: { rows: ['payer'], cols: ['as_of'], values: ['balance'], view: 'matrix', delta: true },
  },
  recoveries: {
    label: 'Recoveries', grain: 'One attributed recovery (payment / adjustment / patient) detected between snapshots',
    fields: [['client', 'Client', 'Who'], ['user', 'Credited analyst', 'Who'], ['type', 'Type', 'What'], ['basis', 'Attribution basis', 'What'], ['month', 'Month', 'When', true], ['date', 'Date', 'When', true]]
      .map(([key, label, group, date]) => ({ key: key as string, label: label as string, group: group as string, date: !!date })),
    measures: [
      { id: 'amount', label: 'Amount ($)', type: 'money', hint: 'SUM attributed amount', fn: (r) => sum(r, 'amount') },
      { id: 'n', label: 'Recoveries', type: 'int', hint: 'COUNT', fn: (r) => r.length },
      { id: 'claims', label: 'Claims (distinct)', type: 'int', hint: 'COUNT DISTINCT claim', fn: (r) => distinct(r, 'claim_id') },
    ] as Measure[],
    defaults: { rows: ['user'], cols: ['type'], values: ['amount'], view: 'matrix' },
  },
};

export interface PivotConfig { dataset: DatasetId; rows: string[]; cols: string[]; values: string[]; filters: Record<string, string[]>; sort: { by: 'label' | 'value'; dir: 1 | -1 }; topN: number; view: 'matrix' | 'bar' | 'stacked' | 'line' | 'table'; includeClosed: boolean; from?: string; to?: string; subtotals: boolean; delta?: boolean }
export const defaultConfig = (d: DatasetId): PivotConfig => ({ dataset: d, rows: [], cols: [], values: [], filters: {}, sort: { by: 'value', dir: -1 }, topN: 0, view: 'matrix', includeClosed: false, subtotals: true, ...DATASETS[d].defaults } as PivotConfig);

// ── dataset builders ──
export function claimRows(ecs: EClaim[], today: string, names: (id: string | null) => string): PRow[] {
  return ecs.map((x) => { const c = x.c; const tf = x.tfLeft; return {
    id: c.id, client: x.client?.name || '—', payer: c.payer || 'Unknown', provider: c.provider || '—', owner: c.assigned_to ? names(c.assigned_to) || '—' : 'Unassigned', visit: x.visit || 'Unknown',
    bucket: x.bucket?.label || '—', queue: x.stage || '—', family: x.family || '—', lifecycle: x.lifecycle || '—', status: c.status, priority: c.priority,
    rca: c.rca || '(none)', rca_detail: c.rca_detail || '(none)', end_action: c.end_action || '(none)', tf_risk: tf == null ? 'Not set' : tf < 0 ? 'Expired' : tf <= 30 ? '≤30 days' : tf <= 90 ? '31–90 days' : '>90 days',
    dos_month: (c.dos || '').slice(0, 7) || '—', touched: c.touch_count ? 'Worked' : 'Unworked', mix: c.closed_at ? 'Closed' : 'Open',
    balance: c.balance, billed: c.billed_amt, age: x.age ?? 0, touches: c.touch_count, denied: x.stage === 'Denied' ? 1 : 0, fu_due: x.fuDue && !x.snoozed ? 1 : 0, tags: x.tags || [],
  }; });
}
const weekOf = (d: string) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
export function workRows(w: WorkLog[], claimById: Map<string, EClaim>): PRow[] {
  return w.map((x) => { const e = claimById.get(x.claim_id); return { id: x.id, claim_id: x.claim_id, client: e?.client?.name || '—', user: x.user_name || '—', supervisor: x.supervisor_name || '—', payer: e?.c.payer || 'Unknown', visit: e?.visit || 'Unknown', date: x.work_date, week: weekOf(x.work_date), month: x.work_date.slice(0, 7),
    rca: x.rca || '(none)', rca_detail: x.rca_detail || '(none)', end_action: x.end_action || '(none)', end_sub: x.end_sub || '(none)', mode: x.mode || '(none)', bucket: x.bucket || '—', audit: x.audit_status, multi: x.multi_touch ? 'Repeat' : 'First', multi_n: x.multi_touch ? 1 : 0, balance: x.balance || 0, secs: x.time_spent_sec || 0 }; });
}
export function recoveryRows(r: Recovery[], clients: Client[]): PRow[] {
  const cn = new Map(clients.map((c) => [c.id, c.name]));
  return r.map((x) => ({ id: x.id, claim_id: x.claim_id, client: cn.get(x.client_id) || '—', user: x.user_name || 'Unattributed', type: x.type, basis: x.basis, month: x.occurred_on.slice(0, 7), date: x.occurred_on, amount: x.amount * (x.share ?? 1) }));
}
export interface PivotCtx { snapshots?: ClaimSnapshot[]; ecs: EClaim[]; work: WorkLog[]; recoveries: Recovery[]; profiles: Profile[]; clients: Client[]; today: string }
export function datasetRows(id: DatasetId, c: PivotCtx, includeClosed: boolean): PRow[] {
  const nm = (i: string | null) => c.profiles.find((p) => p.id === i)?.full_name || '';
  if (id === 'claims') return claimRows(c.ecs.filter((x) => includeClosed || x.open), c.today, nm);
  if (id === 'snapshots') return (c.snapshots || []).map((x) => ({ id: x.claim_id, as_of: x.as_of, client: c.clients.find((k) => k.id === x.client_id)?.name || '—', payer: x.payer || 'Unknown', provider: x.provider || '—', bucket: x.bucket || '—', balance: x.balance, billed: x.billed_amt, age: x.age_days ?? 0 }));
  if (id === 'work') return workRows(c.work, new Map(c.ecs.map((x) => [x.c.id, x])));
  return recoveryRows(c.recoveries, c.clients);
}

// ── compiler ──
export interface PNode { key: string; label: string; level: number; path: string[]; rows: PRow[]; cells: number[]; total: number[]; children: PNode[]; leaf: boolean }
export interface Matrix { colKeys: string[]; valueIds: string[]; columns: { key: string; label: string; vid: string; m: Measure }[]; tree: PNode[]; grand: number[]; grandCells: Record<string, number[]>; rowFields: string[]; colFields: string[]; rowCount: number; sourceRows: number; warnings: string[] }

const keyOf = (r: PRow, f: string) => String(r[f] ?? '—');
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
export function compile(all: PRow[], cfg: PivotConfig): Matrix {
  const ds = DATASETS[cfg.dataset]; const warnings: string[] = [];
  const dateField = cfg.dataset === 'claims' ? null : cfg.dataset === 'snapshots' ? 'as_of' : 'date';
  const filtered = all.filter((r) => Object.entries(cfg.filters).every(([f, v]) => !v.length || (f === 'tag' ? v.some((t) => (r.tags || []).includes(t)) : v.includes(keyOf(r, f)))) && (!dateField || ((!cfg.from || r[dateField] >= cfg.from) && (!cfg.to || r[dateField] <= cfg.to))));
  const measures = (cfg.values.length ? cfg.values : [ds.measures[0].id]).map((id) => ds.measures.find((m) => m.id === id)!).filter(Boolean);
  if (cfg.dataset === 'claims' && cfg.rows.length + cfg.cols.length === 0) warnings.push('Drag a field into Rows or Columns to break the numbers down.');
  const colKeys = cfg.cols.length ? [...new Set(filtered.map((r) => cfg.cols.map((f) => keyOf(r, f)).join(' › ')))].sort(natural) : ['All'];
  const columns: Matrix['columns'] = []; colKeys.forEach((ck) => measures.forEach((m) => columns.push({ key: ck + '|' + m.id, label: ck, vid: m.id, m })));
  const byCol = (rows: PRow[]) => { const m = new Map<string, PRow[]>(); rows.forEach((r) => { const k = cfg.cols.length ? cfg.cols.map((f) => keyOf(r, f)).join(' › ') : 'All'; (m.get(k) || m.set(k, []).get(k)!).push(r); }); return m; };
  const cellsFor = (rows: PRow[]) => { const m = byCol(rows); return columns.map((c) => c.m.fn(m.get(c.label) || [])); };
  const totalsFor = (rows: PRow[]) => measures.map((m) => m.fn(rows));
  const primary = 0;
  const build = (rows: PRow[], depth: number, path: string[]): PNode[] => {
    if (depth >= cfg.rows.length) return [];
    const f = cfg.rows[depth]; const g = new Map<string, PRow[]>(); rows.forEach((r) => { const k = keyOf(r, f); (g.get(k) || g.set(k, []).get(k)!).push(r); });
    let nodes: PNode[] = [...g].map(([k, rs]) => ({ key: [...path, k].join('›'), label: k, level: depth, path: [...path, k], rows: rs, cells: cellsFor(rs), total: totalsFor(rs), children: build(rs, depth + 1, [...path, k]), leaf: depth === cfg.rows.length - 1 }));
    nodes.sort((a, b) => (cfg.sort.by === 'label' ? natural(a.label, b.label) * cfg.sort.dir : (a.total[primary] - b.total[primary]) * cfg.sort.dir));
    if (depth === 0 && cfg.topN > 0 && nodes.length > cfg.topN) { warnings.push(`Showing top ${cfg.topN} of ${nodes.length} groups.`); nodes = nodes.slice(0, cfg.topN); }
    return nodes;
  };
  const tree = cfg.rows.length ? build(filtered, 0, []) : [{ key: 'all', label: 'All', level: 0, path: ['All'], rows: filtered, cells: cellsFor(filtered), total: totalsFor(filtered), children: [], leaf: true }];
  const shown = cfg.topN > 0 && cfg.rows.length ? tree.flatMap((n) => n.rows) : filtered;
  const gcol = byCol(shown); const grandCells: Record<string, number[]> = {};
  return { colKeys, valueIds: measures.map((m) => m.id), columns, tree, grand: totalsFor(shown), grandCells: Object.assign(grandCells, { all: columns.map((c) => c.m.fn(gcol.get(c.label) || [])) }), rowFields: cfg.rows, colFields: cfg.cols, rowCount: tree.length, sourceRows: filtered.length, warnings };
}
/** Last column key minus first, per measure — "what changed between snapshots". Only meaningful when columns are ordered (dates). */
export function deltaOf(m: Matrix, cells: number[]): number[] { const k = m.colKeys; if (k.length < 2) return m.valueIds.map(() => 0); const n = m.valueIds.length; return m.valueIds.map((_, j) => cells[(k.length - 1) * n + j] - cells[j]); }
export function flatten(m: Matrix, collapsed: Set<string>): PNode[] { const out: PNode[] = []; const walk = (n: PNode) => { out.push(n); if (!collapsed.has(n.key)) n.children.forEach(walk); }; m.tree.forEach(walk); return out; }

export const fmtVal = (v: number, t: MType) => (t === 'money' ? '$' + Math.round(v).toLocaleString('en-US') : t === 'pct' ? (v * 100).toFixed(1) + '%' : t === 'num1' ? v.toFixed(1) : Math.round(v).toLocaleString('en-US'));

/** Matrix → flat ReportResult so the existing CSV/XLSX/PDF exporters work unchanged. */
export function toReport(m: Matrix, cfg: PivotConfig, collapsed: Set<string> = new Set()) {
  const ds = DATASETS[cfg.dataset]; const lab = (f: string) => ds.fields.find((x) => x.key === f)?.label || f;
  const flat = flatten(m, new Set([...collapsed])).filter((n) => cfg.subtotals || n.leaf);
  const cols = [{ key: 'row', label: m.rowFields.map(lab).join(' › ') || 'All', type: 'text' as const }, ...m.columns.map((c, i) => ({ key: 'c' + i, label: (m.colKeys.length > 1 || m.colFields.length ? c.label + ' · ' : '') + c.m.label, type: (c.m.type === 'pct' ? 'pct' : c.m.type === 'money' ? 'money' : c.m.type === 'num1' ? 'num1' : 'int') as any })), ...(m.colKeys.length > 1 ? m.valueIds.map((id, i) => ({ key: 't' + i, label: 'Total · ' + ds.measures.find((x) => x.id === id)!.label, type: (ds.measures.find((x) => x.id === id)!.type === 'pct' ? 'pct' : ds.measures.find((x) => x.id === id)!.type === 'money' ? 'money' : 'int') as any })) : [])];
  const dl = !!cfg.delta && m.colKeys.length > 1; if (dl) m.valueIds.forEach((id, i) => { const md = ds.measures.find((x) => x.id === id)!; cols.push({ key: 'd' + i, label: 'Δ ' + md.label, type: (md.type === 'pct' ? 'pct' : md.type === 'money' ? 'money' : md.type === 'num1' ? 'num1' : 'int') as any }); });
  const rows = flat.map((n) => { const r: Record<string, any> = { row: '  '.repeat(n.level) + n.label }; m.columns.forEach((_, i) => (r['c' + i] = n.cells[i])); if (m.colKeys.length > 1) m.valueIds.forEach((_, i) => (r['t' + i] = n.total[i])); if (dl) deltaOf(m, n.cells).forEach((v, i) => (r['d' + i] = v)); return r; });
  const totals: Record<string, any> = {}; m.columns.forEach((_, i) => (totals['c' + i] = m.grandCells.all[i])); if (m.colKeys.length > 1) m.valueIds.forEach((_, i) => (totals['t' + i] = m.grand[i])); if (dl) deltaOf(m, m.grandCells.all).forEach((v, i) => (totals['d' + i] = v));
  return { columns: cols, rows, totals, summary: [{ label: 'Rows', value: String(m.sourceRows) }, ...m.valueIds.map((id, i) => ({ label: ds.measures.find((x) => x.id === id)!.label, value: fmtVal(m.grand[i], ds.measures.find((x) => x.id === id)!.type) }))] };
}

// ── drag & drop model (pure; the UI only translates pointer events into these calls) ──
export type Well = 'filters' | 'cols' | 'rows' | 'values';
export const wellItems = (c: PivotConfig, w: Well): string[] => (w === 'values' ? c.values : w === 'filters' ? Object.keys(c.filters) : c[w]);
const setWell = (c: PivotConfig, w: Well, keys: string[]): PivotConfig => {
  if (w === 'values') return { ...c, values: keys };
  if (w === 'filters') return { ...c, filters: Object.fromEntries(keys.map((k) => [k, c.filters[k] ?? []])) };
  return { ...c, [w]: keys };
};
export function removeItem(c: PivotConfig, w: Well, key: string): PivotConfig { return setWell(c, w, wellItems(c, w).filter((k) => k !== key)); }
/** Move (or add) a field/measure into a well at `index` (null = end). Rows and Columns never hold the same field; measures only live in Values. */
export function moveItem(c: PivotConfig, o: { key: string; kind: 'f' | 'm'; from: Well | null; to: Well; index: number | null }): PivotConfig {
  if ((o.kind === 'm') !== (o.to === 'values')) return c;
  let next = c;
  if (o.from) next = removeItem(next, o.from, o.key);
  if (o.to === 'rows' || o.to === 'cols') { for (const w of ['rows', 'cols'] as Well[]) if (w !== o.to || !o.from) next = removeItem(next, w, o.key); }
  const list = wellItems(next, o.to).filter((k) => k !== o.key); const at = o.index == null ? list.length : Math.max(0, Math.min(o.index, list.length));
  list.splice(at, 0, o.key); return setWell(next, o.to, list);
}
