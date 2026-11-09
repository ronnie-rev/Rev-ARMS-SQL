import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { Card, Chip, toast, useConfirm } from '../../components/ui';
import { LIFECYCLE_DEFAULTS, REQ_LABEL, lifecycleDefs, type Req } from '../../lib/engine/lifecycle';
import type { ConfigOption } from '../../lib/types';
import { uid } from '../../lib/utils';

const CORE = new Set(LIFECYCLE_DEFAULTS.map((d) => d.code));
const REQS = Object.keys(REQ_LABEL) as Req[];
export const validCode = (c: string) => /^[A-Z][A-Z0-9]{1,5}$/.test(c);

/** Edit the native lifecycle: labels, colours, which fields a move INTO a status must capture, and which statuses close a claim. */
export function LifecycleEditor() {
  const st = useStore(); const { confirm, node } = useConfirm();
  const rows = st.config.filter((o) => o.category === 'lifecycle').sort((a, b) => a.sort - b.sort); const custom = rows.length > 0;
  const live = lifecycleDefs(st.config);
  const seed = async () => { await st.save('config_options', LIFECYCLE_DEFAULTS.map((d, i) => ({ id: uid(), category: 'lifecycle', value: d.code, parent: null, label: d.label, color: d.color, sort: i, active: true, meta: { hint: d.hint, terminal: !!d.terminal, requires: d.requires || [] } })) as ConfigOption[]); toast.ok('Lifecycle is now editable'); };
  const reset = async () => { if (!(await confirm('Reset the lifecycle to the 18 built-in statuses? Your edits and custom statuses are removed (claims keep their current code).'))) return; await st.del('config_options', rows.map((r) => r.id)); };
  const upd = (r: ConfigOption, patch: Partial<ConfigOption>, meta?: Record<string, any>) => st.save('config_options', [{ ...r, ...patch, meta: { ...r.meta, ...(meta || {}) } }]);
  const move = async (i: number, d: -1 | 1) => { const a = rows[i], b = rows[i + d]; if (!a || !b) return; await st.save('config_options', [{ ...a, sort: b.sort }, { ...b, sort: a.sort }]); };
  const addRow = async () => { const code = (window.prompt('Status code (2–6 capitals/digits, e.g. QA1)') || '').trim().toUpperCase(); if (!code) return; if (!validCode(code)) return toast.err('Use 2–6 capital letters / digits, starting with a letter'); if (rows.some((r) => r.value === code)) return toast.err('That code exists'); await st.save('config_options', [{ id: uid(), category: 'lifecycle', value: code, parent: null, label: code, color: '#64748b', sort: rows.length, active: true, meta: { hint: '', terminal: false, requires: [] } }] as ConfigOption[]); };
  const inUse = (code: string) => st.claims.filter((c) => c.custom?.lifecycle === code).length;
  if (!custom) return (
    <Card title="Native claim lifecycle">
      <p className="text-[13px] muted mb-4">The app uses the 18 built-in statuses (NEW → … → CLS / WOF / REO) with guarded transitions. Customize to rename them, recolour, change which fields a move requires (e.g. make “Denied” require a reason), mark terminal states, or add your own.</p>
      <div className="flex flex-wrap gap-2 mb-4">{live.map((d) => <Chip key={d.code} color={d.color}>{d.code} · {d.label}</Chip>)}</div>
      <button className="btn btn-primary" onClick={seed}>Customize lifecycle</button>{node}
    </Card>);
  return (
    <div className="space-y-4">
      <Card title={`Lifecycle statuses · ${rows.length}`} actions={<><button className="btn btn-sm" onClick={addRow}><Plus size={13} />Add status</button><button className="btn btn-sm" onClick={reset}><RotateCcw size={13} />Reset to defaults</button></>} pad={false}>
        <div className="overflow-auto"><table className="tbl w-full"><thead><tr><th /><th>Code</th><th>Label</th><th>Colour</th><th>Meaning</th><th>Closes claim</th><th>Move INTO it requires</th><th>Active</th><th>Claims</th><th /></tr></thead><tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={r.active ? '' : 'opacity-50'}>
              <td className="whitespace-nowrap"><button className="btn btn-ghost btn-sm !px-1" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={12} /></button><button className="btn btn-ghost btn-sm !px-1" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown size={12} /></button></td>
              <td className="font-bold">{r.value}{!CORE.has(r.value) && <span className="tag ml-1">custom</span>}</td>
              <td><input className="input !w-44" defaultValue={r.label || ''} onBlur={(e) => e.target.value.trim() && e.target.value !== r.label && upd(r, { label: e.target.value.trim() })} /></td>
              <td><input type="color" className="w-9 h-8 rounded-lg border hair bg-transparent" value={r.color || '#64748b'} onChange={(e) => upd(r, { color: e.target.value })} /></td>
              <td><input className="input !w-64" defaultValue={r.meta.hint || ''} onBlur={(e) => upd(r, {}, { hint: e.target.value })} /></td>
              <td><input type="checkbox" checked={!!r.meta.terminal} onChange={(e) => upd(r, {}, { terminal: e.target.checked })} /></td>
              <td><div className="flex flex-wrap gap-1 max-w-[300px]">{REQS.map((q) => { const on = ((r.meta.requires as Req[]) || []).includes(q); return <button key={q} className={`tag ${on ? '!bg-[rgb(var(--b500)/.14)] !text-[rgb(var(--b600))] dark:!text-[rgb(var(--b300))]' : ''}`} onClick={() => upd(r, {}, { requires: on ? (r.meta.requires as Req[]).filter((x) => x !== q) : [...((r.meta.requires as Req[]) || []), q] })}>{REQ_LABEL[q]}</button>; })}</div></td>
              <td><input type="checkbox" checked={r.active} disabled={CORE.has(r.value) && ['NEW', 'CLS', 'WOF', 'REO'].includes(r.value)} onChange={(e) => upd(r, { active: e.target.checked })} /></td>
              <td className="muted tabular-nums">{inUse(r.value) || '—'}</td>
              <td>{!CORE.has(r.value) && <button className="btn btn-ghost btn-sm btn-danger" onClick={async () => { if (inUse(r.value)) return toast.err(`${inUse(r.value)} claims use ${r.value} — move them first`); if (await confirm(`Delete ${r.value}?`)) await st.del('config_options', [r.id]); }}><Trash2 size={13} /></button>}</td></tr>))}</tbody></table></div>
        <div className="p-4 text-[12px] muted space-y-1"><div>• Built-in codes can be renamed, recoloured and re-ordered, but not deleted — automatic derivation (e.g. “Appeal” end action → APL) relies on them. NEW, CLS, WOF and REO can’t be deactivated.</div><div>• Fixed transition guards still apply on top of “requires”: DEN→APL (reason, method, due date), PAY→CLS (evidence), CLS→REO (reason + evidence), and terminal states can only be reopened.</div></div>
      </Card>{node}
    </div>
  );
}
