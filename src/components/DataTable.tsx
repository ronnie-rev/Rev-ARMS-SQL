import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState, type VisibilityState } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download, Search } from 'lucide-react';
import Papa from 'papaparse';
import { Empty, SkeletonRows } from './ui';
import { downloadFile } from '../lib/utils';
import { downloadXlsx } from '../lib/xlsx';
import { useStore } from '../store';

export interface Col<T> {
  id: string; header: string; /** value used for sorting, filtering and export */ value: (r: T) => string | number | null | undefined;
  cell?: (r: T) => ReactNode; align?: 'left' | 'right'; width?: number; sortable?: boolean; hidden?: boolean;
}
interface Props<T> {
  data: T[]; columns: Col<T>[]; rowId: (r: T) => string; onRowClick?: (r: T) => void; selectable?: boolean; onSelection?: (rows: T[]) => void; pageSize?: number;
  exportName?: string; empty?: { title: string; sub?: string; icon?: ReactNode }; loading?: boolean; searchPlaceholder?: string; toolbar?: ReactNode; storageKey?: string;
}
/** Premium data table: sort, search, resize and hide columns, row selection, pagination, CSV export. Column layout is remembered per `storageKey`. */
export function DataTable<T>({ data, columns, rowId, onRowClick, selectable, onSelection, pageSize = 50, exportName, empty, loading, searchPlaceholder = 'Search…', toolbar, storageKey }: Props<T>) {
  const saved = useMemo(() => { try { return storageKey ? JSON.parse(localStorage.getItem('arms:dt:' + storageKey) || '{}') : {}; } catch { return {}; } }, [storageKey]);
  const [sorting, setSorting] = useState<SortingState>(saved.sorting || []); const [filter, setFilter] = useState(''); const [vis, setVis] = useState<VisibilityState>(saved.vis || Object.fromEntries(columns.filter((c) => c.hidden).map((c) => [c.id, false])));
  const [sizing, setSizing] = useState<Record<string, number>>(saved.sizing || {}); const [sel, setSel] = useState<Record<string, boolean>>({}); const [menu, setMenu] = useState(false);
  useEffect(() => { if (storageKey) try { localStorage.setItem('arms:dt:' + storageKey, JSON.stringify({ sorting, vis, sizing })); } catch { /* ignore */ } }, [storageKey, sorting, vis, sizing]);
  const defs = useMemo<ColumnDef<T>[]>(() => [
    ...(selectable ? [{ id: '_sel', size: 34, enableSorting: false, enableResizing: false, header: ({ table }: any) => <input type="checkbox" aria-label="Select all" checked={table.getIsAllPageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} />, cell: ({ row }: any) => <input type="checkbox" aria-label="Select row" checked={row.getIsSelected()} onClick={(e) => e.stopPropagation()} onChange={row.getToggleSelectedHandler()} /> } as ColumnDef<T>] : []),
    ...columns.map((c): ColumnDef<T> => ({ id: c.id, header: c.header, size: c.width || 140, minSize: 60, enableSorting: c.sortable !== false, accessorFn: (r) => c.value(r) ?? '', cell: ({ row }) => (c.cell ? c.cell(row.original) : String(c.value(row.original) ?? '—')), meta: { align: c.align } as any })),
  ], [columns, selectable]);
  const table = useReactTable({ data, columns: defs, state: { sorting, globalFilter: filter, columnVisibility: vis, columnSizing: sizing, rowSelection: sel }, getRowId: (r) => rowId(r), enableRowSelection: !!selectable, onSortingChange: setSorting, onGlobalFilterChange: setFilter, onColumnVisibilityChange: setVis, onColumnSizingChange: setSizing, onRowSelectionChange: setSel, columnResizeMode: 'onChange',
    globalFilterFn: (row, _id, v) => columns.some((c) => String(c.value(row.original) ?? '').toLowerCase().includes(String(v).toLowerCase())), getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize } } });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  useEffect(() => { onSelection?.(selected); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const canExport = useStore((st) => st.has('export'));
  const exportXlsx = () => void downloadXlsx(exportName || 'export', [{ name: exportName || 'Export', rows: table.getPrePaginationRowModel().rows.map((r) => Object.fromEntries(columns.map((c) => [c.header, (c.value(r.original) ?? '') as any]))) }]);
  const exportCsv = () => downloadFile(`${exportName || 'export'}.csv`, Papa.unparse(table.getPrePaginationRowModel().rows.map((r) => Object.fromEntries(columns.map((c) => [c.header, c.value(r.original) ?? ''])))));
  const rows = table.getRowModel().rows; const total = table.getFilteredRowModel().rows.length;
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 border-b hair flex-wrap">
        <div className="relative"><Search size={13} className="absolute left-2.5 top-[9px] muted" /><input className="input !pl-8 !py-1 !w-56" placeholder={searchPlaceholder} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search table" /></div>
        {toolbar}<span className="text-[11px] muted ml-1">{total.toLocaleString('en-US')} rows{selected.length ? ` · ${selected.length} selected` : ''}</span>
        <div className="ml-auto flex gap-1.5 relative">
          <button className="btn btn-sm" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}><Columns3 size={13} />Columns</button>
          {exportName && canExport && <><button className="btn btn-sm" onClick={exportCsv}><Download size={13} />CSV</button><button className="btn btn-sm" onClick={exportXlsx}><Download size={13} />Excel</button></>}
          {menu && <><div className="fixed inset-0 z-30" onMouseDown={() => setMenu(false)} /><div role="menu" className="absolute right-0 top-8 z-40 panel p-2 w-52 shadow-lg">{table.getAllLeafColumns().filter((c) => c.id !== '_sel').map((c) => <label key={c.id} className="flex gap-2 text-[13px] py-0.5 cursor-pointer"><input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />{String(c.columnDef.header)}</label>)}<button className="btn btn-sm w-full justify-center mt-1" onClick={() => { setSizing({}); setVis({}); setSorting([]); }}>Reset layout</button></div></>}
        </div>
      </div>
      {loading ? <SkeletonRows /> : rows.length === 0 ? <Empty icon={empty?.icon} title={filter ? 'No rows match your search' : empty?.title || 'Nothing here'} sub={filter ? undefined : empty?.sub} /> : (
        <div className="overflow-x-auto"><table className="tbl" style={{ width: Math.max(table.getTotalSize(), 0), minWidth: '100%', tableLayout: 'fixed' }}>
          <thead>{table.getHeaderGroups().map((hg) => <tr key={hg.id}>{hg.headers.map((h) => { const sorted = h.column.getIsSorted(); const right = (h.column.columnDef.meta as any)?.align === 'right'; return (
            <th key={h.id} style={{ width: h.getSize(), position: 'relative', textAlign: right ? 'right' : 'left' }} aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}>
              {h.column.getCanSort() ? <button className="inline-flex items-center gap-1 hover:text-[color:var(--text)]" onClick={h.column.getToggleSortingHandler()}>{flexRender(h.column.columnDef.header, h.getContext())}{sorted === 'asc' ? <ArrowUp size={11} /> : sorted === 'desc' ? <ArrowDown size={11} /> : <ChevronsUpDown size={11} className="opacity-40" />}</button> : flexRender(h.column.columnDef.header, h.getContext())}
              {h.column.getCanResize() && <div className="rs-handle" data-active={h.column.getIsResizing()} onMouseDown={h.getResizeHandler()} onTouchStart={h.getResizeHandler()} onDoubleClick={() => h.column.resetSize()} />}</th>); })}</tr>)}</thead>
          <tbody>{rows.map((r) => <tr key={r.id} className={onRowClick ? 'cursor-pointer' : undefined} data-selected={r.getIsSelected()} style={r.getIsSelected() ? { background: 'rgb(var(--b500) / .07)' } : undefined} onClick={() => onRowClick?.(r.original)}>{r.getVisibleCells().map((c) => <td key={c.id} className="truncate" style={{ textAlign: (c.column.columnDef.meta as any)?.align === 'right' ? 'right' : 'left' }}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</tr>)}</tbody></table></div>)}
      {total > pageSize && <div className="flex items-center justify-between px-3 py-2 border-t hair text-xs muted"><span>Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span><div className="flex gap-1.5"><button className="btn btn-sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</button><button className="btn btn-sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</button></div></div>}
    </div>
  );
}
