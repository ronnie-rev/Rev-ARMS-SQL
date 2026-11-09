import { usDate } from '../lib/utils';
import { DateRangeFilter } from '../components/DateRange';
import { useEffect, useMemo, useState } from 'react';
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, ChevronRight, Columns3, Download, Filter, GripVertical, Redo2, RotateCcw, Rows3, Save, Sigma, Sparkles, Table2, Undo2, X } from 'lucide-react';
import { useStore } from '../store';
import { useClaims } from '../hooks';
import { Card, Chip, Empty, Field, Modal, PageHeader, toast } from '../components/ui';
import { Multi } from '../components/Multi';
import { compile, DATASETS, datasetRows, defaultConfig, deltaOf, flatten, fmtVal, moveItem, removeItem, toReport, wellItems, type DatasetId, type PivotConfig, type PNode, type Well } from '../lib/engine/pivot';
import { parsePivotRequest } from '../lib/engine/pivot_nl';
import { pivotInsights } from '../lib/engine/pivotinsights';
import { exportReport, type ExportFormat } from '../lib/export';
import { todayISO, uid } from '../lib/utils';

interface Saved { id: string; name: string; version: number; updated: string; cfg: PivotConfig }
const PALETTE = ['#5b5bd6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#ec4899', '#64748b', '#84cc16'];

/** The whole chip is the drag handle (click on its buttons still works because they stop the pointer-down). */
const chipCls = (accent?: boolean, over?: boolean) => `group flex items-center gap-1.5 rounded-lg border hair px-2.5 py-1.5 text-xs bg-[var(--panel)] select-none touch-none cursor-grab active:cursor-grabbing hover:border-brand-300 ${accent ? 'border-brand-400' : ''} ${over ? 'opacity-30' : ''}`;
const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();
function ListChip({ id, label, hint, onAdd }: { id: string; label: string; hint?: string; onAdd?: (w: Well) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} title={hint} className={chipCls(false, isDragging)}>
      <GripVertical size={12} className="muted shrink-0" /><span className="truncate flex-1">{label}</span>
      {onAdd && <span className="hidden group-hover:flex gap-0.5" onPointerDown={stop}>{(['rows', 'cols', 'filters'] as Well[]).map((w) => <button key={w} title={`Add to ${w}`} className="px-1 rounded hover:bg-black/10 uppercase text-[9px] font-semibold" onClick={() => onAdd(w)}>{w[0]}</button>)}</span>}
    </div>
  );
}
function WellChip({ id, label, onRemove }: { id: string; label: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ transform: CSS.Transform.toString(transform), transition }} className={chipCls(true, isDragging)}>
      <GripVertical size={12} className="muted shrink-0" /><span className="truncate flex-1">{label}</span>
      <button onPointerDown={stop} onClick={onRemove} aria-label={`Remove ${label}`} className="muted hover:text-red-500"><X size={12} /></button>
    </div>
  );
}
function WellBox({ well, title, icon, items, hint, children }: { well: Well | 'shelf'; title: string; icon: React.ReactNode; items: string[]; hint: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'well|' + well });
  return (
    <div ref={setNodeRef} className={`rounded-xl border hair p-2 min-h-[64px] transition-colors ${isOver ? 'bg-brand-500/10 border-brand-400' : 'bg-black/[.015] dark:bg-white/[.03]'}`}>
      <div className="label flex items-center gap-1.5 !mb-1.5">{icon}{title}</div>
      <SortableContext items={items} strategy={verticalListSortingStrategy}><div className="space-y-1.5">{children}</div></SortableContext>
      {items.length === 0 && <div className="text-[11px] muted px-1 py-2">{hint}</div>}
    </div>
  );
}
// Prefer a sortable item under the pointer (precise insert position); otherwise the well itself; otherwise the nearest item.
const collide: CollisionDetection = (args) => {
  const others = args.droppableContainers.filter((c) => c.id !== args.active.id);
  const hits = pointerWithin({ ...args, droppableContainers: others }); const items = hits.filter((h) => !String(h.id).startsWith('well|')); if (items.length) return items;
  const wh = hits.find((h) => String(h.id).startsWith('well|'));
  if (wh) { const w = String(wh.id).slice(5); const near = closestCenter({ ...args, droppableContainers: others.filter((c) => String(c.id).startsWith(w + '|')) }); return near.length ? near : [wh]; }
  const all = others; const ids = all.map((c) => String(c.id)); const pool = all.filter((c) => { const id = String(c.id); if (!id.startsWith('well|')) return true; const w = id.slice(5); return !ids.some((x) => x.startsWith(w + '|')); });   // items + EMPTY wells only
  return closestCenter({ ...args, droppableContainers: pool });
};

function Compare({ dates, value, onApply }: { dates: string[]; value: string[]; onApply: (d: string[]) => void }) {
  const [a, setA] = useState(value[0] || dates[Math.max(0, dates.length - 2)] || ''); const [b, setB] = useState(value[value.length - 1] || dates[dates.length - 1] || '');
  if (!dates.length) return <div className="text-xs muted">No snapshots yet — each aging import records one.</div>;
  return <div className="panel p-3 flex flex-wrap items-end gap-3 text-xs"><div><div className="label">Compare</div><select className="input !w-auto" value={a} onChange={(e) => setA(e.target.value)}>{dates.map((d) => <option key={d}>{d}</option>)}</select></div><div className="pb-2">→</div><div><div className="label">with</div><select className="input !w-auto" value={b} onChange={(e) => setB(e.target.value)}>{dates.map((d) => <option key={d}>{d}</option>)}</select></div><button className="btn btn-sm" onClick={() => onApply([a, b].sort())}>Compare two snapshots</button><button className="btn btn-sm btn-ghost" onClick={() => onApply([])}>All snapshots</button><span className="muted ml-auto">{dates.length} snapshots on file</span></div>;
}

export default function Pivot() {
  const st = useStore(); const today = todayISO(); const ecs = useClaims(true);
  const [hist, setHist] = useState<PivotConfig[]>([defaultConfig('claims')]); const [at, setAt] = useState(0); const cfg = hist[at];
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); const [q, setQ] = useState(''); const [ask, setAsk] = useState(''); const [info, setInfo] = useState<{ explanation: string[]; clarify: string[] } | null>(null);
  const [drag, setDrag] = useState<string | null>(null); const [drill, setDrill] = useState<{ title: string; ids: string[] } | null>(null); const [saveOpen, setSaveOpen] = useState(false); const [name, setName] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const set = (next: PivotConfig) => { const h = [...hist.slice(0, at + 1), next].slice(-40); setHist(h); setAt(h.length - 1); };
  const patch = (p: Partial<PivotConfig>) => set({ ...cfg, ...p });
  const ds = DATASETS[cfg.dataset]; const lab = (k: string) => ds.fields.find((f) => f.key === k)?.label || (k === 'tag' ? 'Tag' : k);
  useEffect(() => { if (cfg.dataset === 'snapshots') void st.loadSnapshots(); }, [cfg.dataset]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => ({ ecs, work: st.workLog, recoveries: st.recoveries, profiles: st.profiles, clients: st.clients, today, snapshots: st.snapshots }), [ecs, st.workLog, st.recoveries, st.profiles, st.clients, today, st.snapshots]);
  const data = useMemo(() => datasetRows(cfg.dataset, ctx, cfg.includeClosed), [cfg.dataset, cfg.includeClosed, ctx]);
  const m = useMemo(() => compile(data, cfg), [data, cfg]);
  const findings = useMemo(() => { const mt = m.columns[0]?.m; if (!mt || !m.rowFields.length) return []; return pivotInsights(m, { measureLabel: mt.label, additive: mt.type === 'money' || mt.type === 'int', fmt: (v) => fmtVal(v, mt.type), drillFields: DATASETS[cfg.dataset].fields.filter((f) => !f.date).map((f) => ({ key: f.key, label: f.label })), usedFields: [...cfg.rows, ...cfg.cols] }); }, [m, cfg.dataset, cfg.rows, cfg.cols]);
  const flat = useMemo(() => flatten(m, collapsed).filter((n) => cfg.subtotals || n.leaf), [m, collapsed, cfg.subtotals]);
  const views: Saved[] = st.userItems.filter((x) => x.kind === 'pivot_view').map((x) => ({ id: x.id, name: x.name || 'View', version: x.body.version || 1, updated: x.updated_at, cfg: x.body.cfg }));
  const valuesOf = (f: string) => [...new Set(data.map((r) => String(r[f] ?? '—')))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((v) => ({ v, l: v }));
  const parse = (id: string) => { const [w, ...k] = id.split('|'); return { w, key: k.join('|') }; };
  const place = (key: string, kind: 'f' | 'm', to: Well) => set(moveItem(cfg, { key, kind, from: null, to, index: null }));
  const onEnd = (e: DragEndEvent) => {
    setDrag(null); const a = parse(String(e.active.id)); const from: Well | null = a.w === 'fld' || a.w === 'mea' ? null : (a.w as Well); const kind = a.w === 'mea' || from === 'values' ? 'm' : 'f';
    const over = e.over ? parse(String(e.over.id)) : null;
    if (!over || (over.w === 'well' && over.key === 'shelf')) { if (from) set(removeItem(cfg, from, a.key)); return; }
    const to = (over.w === 'well' ? over.key : over.w) as Well; if (!['rows', 'cols', 'filters', 'values'].includes(to)) return;
    let idx: number | null = over.w === 'well' ? null : wellItems(cfg, to).indexOf(over.key); if (idx === -1) idx = null;
    if (idx != null && from !== to) { const ev = e.activatorEvent as PointerEvent | undefined; const r = e.over!.rect; if (ev && typeof ev.clientY === 'number' && ev.clientY + e.delta.y > r.top + r.height / 2) idx += 1; }   // other well: insert before/after by pointer side
    const next = moveItem(cfg, { key: a.key, kind, from, to, index: idx });
    if (next !== cfg) set(next);
  };
  const runAsk = async () => { await st.loadSnapshots(); const sn = { ...ctx, snapshots: useStore.getState().snapshots }; const r = parsePivotRequest(ask, { claims: datasetRows('claims', sn, true), work: datasetRows('work', sn, false), recoveries: datasetRows('recoveries', sn, false), snapshots: datasetRows('snapshots', sn, false) }); set(r.config); setInfo(r); setCollapsed(new Set()); };
  const report = () => toReport(m, cfg, collapsed);
  const doExport = (f: ExportFormat) => exportReport(f, report(), { title: 'Pivot — ' + ds.label, subtitle: `Rows: ${cfg.rows.map(lab).join(' › ') || '—'} · Columns: ${cfg.cols.map(lab).join(' › ') || '—'}`, filters: Object.entries(cfg.filters).filter(([, v]) => v.length).map(([k, v]) => `${lab(k)}: ${v.join(', ')}`) }, today);
  const save = async () => { if (!name.trim()) return; await st.saveItem('pivot_view', { cfg, version: 1 }, { name: name.trim() }); setSaveOpen(false); setName(''); toast.ok('View saved'); };
  const shown = (cols: typeof m.columns, n: PNode, i: number) => fmtVal(n.cells[i], cols[i].m.type);
  const heat = (i: number, v: number) => { const max = Math.max(...m.tree.map((n) => n.cells[i] || 0), 1); return { background: `rgb(var(--b500) / ${Math.min(0.22, (v / max) * 0.22)})` }; };
  const chartRows = m.tree.slice(0, 20).map((n) => ({ name: n.label, ...Object.fromEntries(m.columns.map((c, i) => [c.label + (m.valueIds.length > 1 ? ' · ' + c.m.label : ''), n.cells[i]])), total: n.total[0] }));
  const series = m.columns.map((c) => c.label + (m.valueIds.length > 1 ? ' · ' + c.m.label : ''));
  const drillCols = cfg.dataset === 'claims' ? ['claim_no', 'payer', 'balance'] : [];
  const cellDrill = (n: PNode, ci: number | null) => { const col = ci == null ? null : m.columns[ci]; const rows = col ? n.rows.filter((r) => (m.colFields.length ? m.colFields.map((f) => String(r[f] ?? '—')).join(' › ') : 'All') === col.label) : n.rows; setDrill({ title: `${n.path.join(' › ')}${col && m.colFields.length ? ' · ' + col.label : ''}`, ids: rows.map((r) => r.id) }); };
  const wellChip = (key: string, w: Well) => <WellChip key={w + key} id={`${w}|${key}`} label={w === 'values' ? ds.measures.find((x) => x.id === key)?.label || key : lab(key)} onRemove={() => set(removeItem(cfg, w, key))} />;
  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2"><Table2 className="text-brand-400" />Pivot studio</span>} sub="Drag fields into Rows, Columns, Values and Filters" actions={<>
        <button className="btn btn-sm" disabled={at === 0} onClick={() => setAt(at - 1)}><Undo2 size={13} /></button><button className="btn btn-sm" disabled={at >= hist.length - 1} onClick={() => setAt(at + 1)}><Redo2 size={13} /></button>
        <button className="btn btn-sm" onClick={() => { set(defaultConfig(cfg.dataset)); setInfo(null); }}><RotateCcw size={13} />Reset</button><button className="btn btn-sm" onClick={() => setSaveOpen(true)}><Save size={13} />Save view</button></>} />
      <div className="panel p-3 mb-4 flex gap-2 items-center"><Sparkles size={15} className="text-brand-400 shrink-0" /><input className="input flex-1" value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask.trim() && runAsk()} placeholder="Describe a pivot: “payer and RCA category in rows; age groups in columns; sum outstanding AR and distinct claims; surgery only”" /><button className="btn btn-primary btn-sm" disabled={!ask.trim()} onClick={runAsk}>Build</button></div>
      {info && <div className="panel p-3 mb-4 text-xs space-y-1"><div className="label">How I read that</div>{info.explanation.map((x, i) => <div key={i}>• {x}</div>)}{info.clarify.map((x, i) => <div key={i} className="text-amber-600">? {x}</div>)}</div>}
      <DndContext sensors={sensors} collisionDetection={collide} onDragStart={(e: DragStartEvent) => setDrag(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setDrag(null)}>
        <div className="grid xl:grid-cols-[230px_1fr_270px] gap-4 items-start">
          <aside className="panel p-3 space-y-3 xl:sticky xl:top-4 max-h-[78vh] overflow-auto">
            <select className="input" value={cfg.dataset} onChange={(e) => { set(defaultConfig(e.target.value as DatasetId)); setCollapsed(new Set()); }}>{Object.entries(DATASETS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}</select>
            <div className="text-[11px] muted">Grain: {ds.grain}</div>
            <input className="input" placeholder="Search fields…" value={q} onChange={(e) => setQ(e.target.value)} />
            {[...new Set(ds.fields.map((f) => f.group))].map((g) => { const l = ds.fields.filter((f) => f.group === g && f.label.toLowerCase().includes(q.toLowerCase())); return l.length ? <div key={g}><div className="label">{g}</div><div className="space-y-1">{l.map((f) => <ListChip key={f.key} id={`fld|${f.key}`} label={f.label} onAdd={(w) => place(f.key, 'f', w)} />)}</div></div> : null; })}
            <div><div className="label flex items-center gap-1"><Sigma size={11} />Measures</div><div className="space-y-1">{ds.measures.filter((x) => x.label.toLowerCase().includes(q.toLowerCase())).map((x) => <ListChip key={x.id} id={`mea|${x.id}`} label={x.label} hint={x.hint} />)}</div></div>
          </aside>
          <main className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="seg">{([['matrix', 'Matrix'], ['bar', 'Bar'], ['stacked', 'Stacked'], ['line', 'Line'], ['table', 'Table']] as const).map(([k, l]) => <button key={k} className={cfg.view === k ? 'on' : ''} onClick={() => patch({ view: k })}>{l}</button>)}</div>
              <span className="text-[11px] muted ml-auto">{m.sourceRows.toLocaleString()} source rows · {ds.label} · as of {usDate(today)}</span>
              {(['csv', 'xlsx', 'pdf'] as ExportFormat[]).map((f) => <button key={f} className="btn btn-sm uppercase" onClick={() => doExport(f)}><Download size={12} />{f}</button>)}
            </div>
            {cfg.dataset === 'snapshots' && <Compare dates={[...new Set(st.snapshots.map((x) => x.as_of))].sort()} value={cfg.filters.as_of || []} onApply={(d) => patch({ cols: ['as_of'], delta: true, filters: { ...cfg.filters, as_of: d } })} />}
            {findings.length > 0 && <div className="panel2 p-3 rounded-lg text-[13px] space-y-1"><div className="label flex items-center gap-1.5"><Sparkles size={12} />What stands out</div>{findings.map((f, i) => <div key={i} className="flex gap-2 items-start"><span className="muted">•</span><span className="flex-1">{f.text}</span>{f.drillField && <button className="btn btn-sm" onClick={() => patch({ rows: [...cfg.rows, f.drillField!] })}>Drill in</button>}</div>)}</div>}
            {m.warnings.map((w, i) => <div key={i} className="text-xs text-amber-600">ⓘ {w}</div>)}
            {data.length === 0 ? <Card><Empty title="No data in this dataset yet" /></Card> : cfg.view === 'matrix' || cfg.view === 'table' ? (
              <Card pad={false}><div className="overflow-auto max-h-[68vh]"><table className="tbl w-full text-xs"><thead className="sticky top-0 z-10"><tr><th className="sticky left-0 bg-[var(--panel)] z-20">{cfg.rows.map(lab).join(' › ') || 'All'}</th>{m.columns.map((c, i) => <th key={i} className="text-right whitespace-nowrap">{m.colKeys.length > 1 || m.colFields.length ? c.label : ''}{m.valueIds.length > 1 || m.colKeys.length <= 1 ? <div className="font-normal muted">{c.m.label}</div> : null}</th>)}{m.colKeys.length > 1 && m.valueIds.map((id) => <th key={id} className="text-right">Total<div className="font-normal muted">{ds.measures.find((x) => x.id === id)!.label}</div></th>)}{cfg.delta && m.colKeys.length > 1 && m.valueIds.map((id) => <th key={'d' + id} className="text-right">Δ<div className="font-normal muted">{ds.measures.find((x) => x.id === id)!.label}</div></th>)}</tr></thead>
                <tbody>{flat.map((n) => (<tr key={n.key} className={n.leaf ? '' : 'font-semibold bg-black/[.02] dark:bg-white/[.03]'}>
                  <td className="sticky left-0 bg-[var(--panel)] whitespace-nowrap" style={{ paddingLeft: 8 + n.level * 16 }}>{n.children.length > 0 ? <button className="mr-1 align-middle" onClick={() => { const s = new Set(collapsed); s.has(n.key) ? s.delete(n.key) : s.add(n.key); setCollapsed(s); }}>{collapsed.has(n.key) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</button> : <span className="inline-block w-4" />}{n.label}</td>
                  {m.columns.map((c, i) => <td key={i} className="text-right tabular-nums cursor-pointer hover:underline" style={cfg.view === 'matrix' && c.m.type !== 'pct' ? heat(i, n.cells[i]) : undefined} onClick={() => cellDrill(n, i)}>{shown(m.columns, n, i)}</td>)}
                  {m.colKeys.length > 1 && m.valueIds.map((id, i) => <td key={id} className="text-right tabular-nums font-semibold cursor-pointer hover:underline" onClick={() => cellDrill(n, null)}>{fmtVal(n.total[i], ds.measures.find((x) => x.id === id)!.type)}</td>)}{cfg.delta && m.colKeys.length > 1 && deltaOf(m, n.cells).map((v, i) => <td key={'d' + i} className={`text-right tabular-nums font-semibold ${v < 0 ? 'text-green-600' : v > 0 ? 'text-red-500' : 'muted'}`}>{v > 0 ? '+' : ''}{fmtVal(v, ds.measures.find((x) => x.id === m.valueIds[i])!.type)}</td>)}</tr>))}
                  <tr className="font-bold border-t-2 hair"><td className="sticky left-0 bg-[var(--panel)]">Grand total</td>{m.columns.map((c, i) => <td key={i} className="text-right tabular-nums">{fmtVal(m.grandCells.all[i], c.m.type)}</td>)}{m.colKeys.length > 1 && m.valueIds.map((id, i) => <td key={id} className="text-right tabular-nums">{fmtVal(m.grand[i], ds.measures.find((x) => x.id === id)!.type)}</td>)}{cfg.delta && m.colKeys.length > 1 && deltaOf(m, m.grandCells.all).map((v, i) => <td key={'d' + i} className="text-right tabular-nums">{v > 0 ? '+' : ''}{fmtVal(v, ds.measures.find((x) => x.id === m.valueIds[i])!.type)}</td>)}</tr></tbody></table></div></Card>
            ) : (
              <Card title={ds.measures.find((x) => x.id === m.valueIds[0])?.label}><div style={{ height: 380 }}><ResponsiveContainer width="100%" height="100%">
                {cfg.view === 'line' ? <LineChart data={chartRows}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />{(m.colFields.length ? series : ['total']).slice(0, 10).map((s, i) => <Line key={s} dataKey={s} stroke={PALETTE[i % 10]} dot={false} strokeWidth={2} />)}</LineChart>
                  : <BarChart data={chartRows}><CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} /><XAxis dataKey="name" fontSize={11} interval={0} angle={-20} textAnchor="end" height={60} /><YAxis fontSize={11} /><Tooltip /><Legend />{(m.colFields.length ? series : ['total']).slice(0, 12).map((s, i) => <Bar key={s} dataKey={s} stackId={cfg.view === 'stacked' ? 's' : undefined} fill={PALETTE[i % 10]} radius={cfg.view === 'stacked' ? 0 : [3, 3, 0, 0]} onClick={(d: any) => d?.name && patch({ filters: { ...cfg.filters, [cfg.rows[0]]: [d.name] } })} />)}</BarChart>}</ResponsiveContainer></div>
                <div className="text-[11px] muted">Click a bar to cross-filter on {lab(cfg.rows[0] || '')}. Showing up to 20 groups.</div></Card>)}
            {views.length > 0 && <Card title="Saved views"><div className="flex flex-wrap gap-2">{views.map((v) => <span key={v.id} className="chip gap-1"><button onClick={() => { set(v.cfg); setCollapsed(new Set()); }}>{v.name}</button><button className="muted" onClick={() => st.delItem(v.id)}><X size={11} /></button></span>)}</div></Card>}
          </main>
          <aside className="panel p-3 space-y-2.5 xl:sticky xl:top-4">
            <WellBox well="filters" title="Filters" icon={<Filter size={11} />} items={wellItems(cfg, 'filters').map((k) => 'filters|' + k)} hint="Drag a field here to filter">{wellItems(cfg, 'filters').map((f) => <div key={f} className="space-y-1">{wellChip(f, 'filters')}<Multi label="" options={valuesOf(f)} value={cfg.filters[f]} onChange={(v) => patch({ filters: { ...cfg.filters, [f]: v } })} /></div>)}</WellBox>
            <WellBox well="cols" title="Columns" icon={<Columns3 size={11} />} items={cfg.cols.map((k) => 'cols|' + k)} hint="Drag fields here — order sets nesting">{cfg.cols.map((f) => wellChip(f, 'cols'))}</WellBox>
            <WellBox well="rows" title="Rows" icon={<Rows3 size={11} />} items={cfg.rows.map((k) => 'rows|' + k)} hint="Drag fields here — order sets nesting">{cfg.rows.map((f) => wellChip(f, 'rows'))}</WellBox>
            <WellBox well="values" title="Values" icon={<Sigma size={11} />} items={cfg.values.map((k) => 'values|' + k)} hint="Drag a measure here">{cfg.values.map((v) => wellChip(v, 'values'))}</WellBox>
            <WellBox well="shelf" title="Remove" icon={<X size={11} />} items={[]} hint="Drop here to remove"><span /></WellBox>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Field label="Sort by"><select className="input" value={cfg.sort.by + cfg.sort.dir} onChange={(e) => patch({ sort: { by: e.target.value.startsWith('label') ? 'label' : 'value', dir: e.target.value.endsWith('-1') ? -1 : 1 } })}><option value="value-1">Value ↓</option><option value="value1">Value ↑</option><option value="label1">A → Z</option><option value="label-1">Z → A</option></select></Field>
              <Field label="Top N"><input type="number" min={0} className="input" value={cfg.topN} onChange={(e) => patch({ topN: Number(e.target.value) || 0 })} /></Field>
              {cfg.dataset !== 'claims' && <div className="col-span-2"><div className="label">Date range</div><DateRangeFilter from={cfg.from || todayISO()} to={cfg.to || todayISO()} presets={['today', '7', '30', 'mtd', 'last_month', '90', 'ytd']} onChange={(r) => patch({ from: r.from, to: r.to })} />{(cfg.from || cfg.to) && <button className="underline text-[11px] muted mt-1" onClick={() => patch({ from: undefined, to: undefined })}>Clear dates</button>}</div>}
            </div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={cfg.subtotals} onChange={(e) => patch({ subtotals: e.target.checked })} />Show subtotals</label>
            {cfg.dataset === 'snapshots' && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!cfg.delta} onChange={(e) => patch({ delta: e.target.checked })} />Show Δ (last − first)</label>}
            {cfg.dataset === 'claims' && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={cfg.includeClosed} onChange={(e) => patch({ includeClosed: e.target.checked })} />Include closed claims</label>}
          </aside>
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>{drag ? (() => { const d = parse(drag); const isM = d.w === 'mea' || d.w === 'values'; return <div className="rounded-lg border border-brand-400 bg-[var(--panel)] px-3 py-1.5 text-xs shadow-xl cursor-grabbing flex items-center gap-1.5"><GripVertical size={12} className="muted" />{isM ? ds.measures.find((x) => x.id === d.key)?.label : lab(d.key)}</div>; })() : null}</DragOverlay>
      </DndContext>
      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save pivot view" footer={<><button className="btn" onClick={() => setSaveOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}><Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field></Modal>
      <Modal open={!!drill} onClose={() => setDrill(null)} wide title={`${drill?.title} — ${drill?.ids.length ?? 0} ${cfg.dataset === 'claims' ? 'claims' : 'rows'}`}>
        <div className="max-h-[60vh] overflow-auto"><table className="tbl w-full text-xs"><tbody>{drill?.ids.slice(0, 300).map((id) => { const e = cfg.dataset === 'claims' || cfg.dataset === 'snapshots' ? ecs.find((x) => x.c.id === id) : null; const w = cfg.dataset === 'work' ? st.workLog.find((x) => x.id === id) : null; return (
          <tr key={id} className={e ? 'cursor-pointer' : ''} onClick={() => e && st.openClaim(e.c.id)}>{e ? <><td className="font-mono">{e.c.claim_no}</td><td>{e.c.payer}</td><td>{e.stage}</td><td className="text-right tabular-nums">${Math.round(e.c.balance).toLocaleString()}</td></> : w ? <><td>{w.work_date}</td><td>{w.user_name}</td><td>{w.end_action}</td><td>{w.rca}</td></> : <td>{id}</td>}</tr>); })}</tbody></table>{(drill?.ids.length || 0) > 300 && <div className="text-xs muted p-2">First 300 shown — export includes everything.</div>}</div>
        {drillCols.length === 0 && null}
      </Modal>
    </div>
  );
}
