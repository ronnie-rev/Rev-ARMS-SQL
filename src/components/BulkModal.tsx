import { useMemo, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { useStore } from '../store';
import { Chip, Field, Modal, toast } from './ui';
import { DateField } from './CalendarPicker';
import { BULK_LABEL, describeAction, previewBulk, resolveBulkCfg, type BulkAction, type BulkKind } from '../lib/engine/bulk';
import { usePhi } from '../hooks';
import { fmtDate, money, todayISO } from '../lib/utils';

/** Bulk change with a dry-run preview (what changes / what is skipped and why), a reason for big changes, and one-click undo afterwards. */
export function BulkModal({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone?: () => void }) {
  const st = useStore(); const cfg = resolveBulkCfg(st.settings.bulk_cfg); const phi = usePhi();
  const kinds = cfg.allowKinds.filter((k) => st.has(({ owner: 'assign', snooze: 'work_claims' } as Record<string, string>)[k] || 'bulk_edit'));
  const [kind, setKind] = useState<BulkKind>(kinds[0] || 'status'); const [value, setValue] = useState<string>(''); const [days, setDays] = useState<string>(''); const [only, setOnly] = useState<BulkAction['onlyIf'] | ''>(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const claims = useMemo(() => { const s = new Set(ids); return st.claims.filter((c) => s.has(c.id)); }, [ids, st.claims]);
  const action: BulkAction = { kind, value: value || null, onlyIf: only || undefined, ...(kind === 'next_fu' && days ? { offsetDays: +days } : {}) };
  const prev = useMemo(() => previewBulk(claims, action, { today: todayISO(), cfg, ownerIds: new Set(st.profiles.map((p) => p.id)), statuses: new Set(st.config.filter((o) => o.category === 'status').map((o) => o.value)), priorities: new Set(st.config.filter((o) => o.category === 'priority').map((o) => o.value)), has: st.has }), [claims, kind, value, days, only]); // eslint-disable-line react-hooks/exhaustive-deps
  const clientNames = useMemo(() => new Set(claims.map((c) => st.clients.find((x) => x.id === c.client_id)?.name).filter(Boolean) as string[]), [claims, st.clients]);
  const buckets = st.config.filter((o) => o.category === 'issue_bucket' && o.active && (!o.meta.client || clientNames.has(o.meta.client)));
  const opts = (cat: string) => st.config.filter((o) => o.category === cat && o.active).sort((a, b) => a.sort - b.sort);
  const apply = async () => { setBusy(true); try { const r = await st.applyBulk(ids, action, reason); toast.ok(`${r.changed.toLocaleString('en-US')} claims updated${r.blocked ? ` · ${r.blocked} skipped` : ''} — undo from Bulk history${cfg.undoHours ? ` for ${cfg.undoHours}h` : ''}`); onDone?.(); onClose(); } catch (e) { toast.err((e as Error).message); } finally { setBusy(false); } };
  const sample = prev.rows.filter((r) => r.status === 'change').slice(0, 8);
  const show = (v: any) => (Array.isArray(v) ? v.join(', ') || '—' : v == null || v === '' ? '—' : String(v));
  return (
    <Modal wide open onClose={onClose} title={`Bulk action · ${ids.length.toLocaleString('en-US')} claims · ${money(claims.reduce((a, c) => a + c.balance, 0))}`} footer={<button className="btn btn-primary" disabled={busy || prev.errors.length > 0 || prev.counts.change === 0 || (prev.needsReason && !reason.trim())} onClick={apply}>Apply to {prev.counts.change.toLocaleString('en-US')} claims</button>}>
      {kinds.length === 0 ? <p className="text-sm muted">Your role has no bulk actions enabled.</p> : <>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Action"><select className="input" value={kind} onChange={(e) => { setKind(e.target.value as BulkKind); setValue(''); setDays(''); }}>{kinds.map((k) => <option key={k} value={k}>{BULK_LABEL[k]}</option>)}</select></Field>
          <Field label="Value">
            {kind === 'owner' && <select className="input" value={value} onChange={(e) => setValue(e.target.value)}><option value="">Unassign</option>{st.profiles.filter((p) => p.active && p.role !== 'client').map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>}
            {kind === 'status' && <select className="input" value={value} onChange={(e) => setValue(e.target.value)}><option value="">— choose —</option>{opts('status').map((o) => <option key={o.id}>{o.value}</option>)}</select>}
            {kind === 'priority' && <select className="input" value={value} onChange={(e) => setValue(e.target.value)}><option value="">— choose —</option>{opts('priority').map((o) => <option key={o.id}>{o.value}</option>)}</select>}
            {(kind === 'next_fu' || kind === 'snooze') && <div className="flex gap-1"><DateField value={value || null} onChange={(d) => { setValue(d || ''); setDays(''); }} />{kind === 'next_fu' && <input type="number" className="input !w-24" placeholder="or +days" value={days} onChange={(e) => { setDays(e.target.value); setValue(''); }} />}</div>}
            {kind === 'bucket' && <select className="input" value={value} onChange={(e) => setValue(e.target.value)}><option value="">Remove from bucket</option>{buckets.map((b) => <option key={b.id} value={b.value}>{b.value}{b.meta.client ? ` · ${b.meta.client}` : ''}</option>)}</select>}
            {(kind === 'flag_add' || kind === 'flag_remove') && <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="flag name" />}
          </Field>
          <Field label="Only if"><select className="input" value={only || ''} onChange={(e) => setOnly((e.target.value || undefined) as BulkAction['onlyIf'])}><option value="">Any claim</option><option value="unassigned">Unassigned only</option><option value="assigned">Assigned only</option></select></Field>
        </div>
        <div className="mt-4 panel2 p-3">
          <div className="flex items-center gap-2 flex-wrap text-sm"><b>Preview</b><Chip color="#22c55e">{prev.counts.change} will change</Chip>{prev.counts.noop > 0 && <Chip color="#64748b">{prev.counts.noop} already set</Chip>}{prev.counts.blocked > 0 && <Chip color="#ef4444">{prev.counts.blocked} skipped</Chip>}</div>
          {prev.errors.map((e) => <div key={e} className="text-xs text-red-500 mt-1">{e}</div>)}
          {Object.entries(prev.blockedReasons).map(([r, n]) => <div key={r} className="text-xs muted mt-1">{n} skipped: {r}</div>)}
          {sample.length > 0 && <table className="tbl w-full text-xs mt-2"><thead><tr><th>Claim</th><th>Patient</th><th>Before</th><th>After</th></tr></thead><tbody>{sample.map((r) => <tr key={r.claim.id}><td className="font-mono">{r.claim.claim_no}</td><td>{phi(r.claim.patient_name)}</td><td>{Object.entries(r.before).map(([k, v]) => `${k.replace('custom_', '')}: ${k === 'assigned_to' ? st.profiles.find((p) => p.id === v)?.full_name || 'Unassigned' : k === 'next_fu' && v ? fmtDate(v) : show(v)}`).join('; ')}</td><td>{Object.entries(r.after).map(([k, v]) => `${k.replace('custom_', '')}: ${k === 'assigned_to' ? st.profiles.find((p) => p.id === v)?.full_name || 'Unassigned' : k === 'next_fu' && v ? fmtDate(v) : show(v)}`).join('; ')}</td></tr>)}</tbody></table>}
          {prev.counts.change > sample.length && <div className="text-[11px] muted mt-1">…and {prev.counts.change - sample.length} more</div>}
        </div>
        {prev.needsReason && <Field label={`Reason (required over ${cfg.reasonOver} claims)`} className="mt-3"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this change being made?" /></Field>}
        <p className="text-[11px] muted mt-3 flex items-center gap-1"><Undo2 size={11} />{describeAction(action, { owner: (id) => st.profiles.find((p) => p.id === id)?.full_name || '—' })}. Every change is logged on the claim{cfg.undoHours ? ` and can be undone for ${cfg.undoHours} hours` : ''}.</p></>}
    </Modal>
  );
}
