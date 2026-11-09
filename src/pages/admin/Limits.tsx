import { useMemo, useState } from 'react';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { useStore } from '../../store';
import { Card, Chip, Field, toast } from '../../components/ui';
import { SampleBar, type SampleSpec } from '../../components/SampleBar';
import { useLimits } from '../../hooks';
import { STARTER_LIMITS, limitInsights, validateLimitsCfg, type LimitsCfg } from '../../lib/engine/limits';
import { todayISO, uid } from '../../lib/utils';
import type { LimitBasis, PayerLimit } from '../../lib/types';

const H = ['payer', 'client', 'plan_type', 'tfl_days', 'afl_days', 'ccfl_days', 'tfl_basis', 'afl_basis', 'ccfl_basis', 'source', 'verified_on', 'notes'];
const num = (v: string) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };
const basis = (v: string, d: LimitBasis): LimitBasis => (['dos', 'last_billed', 'denial'].includes(v?.trim()) ? (v.trim() as LimitBasis) : d);

/** Central TFL / AFL / CCFL matrix + thresholds. Payer names are mapped to the directory spelling on import. */
export default function Limits() {
  const { payerLimits, clients, claims, settings, save, del, setSetting } = useStore(); const { cfg, idx, canon } = useLimits();
  const [draft, setDraft] = useState<LimitsCfg>(cfg); const [fresh, setFresh] = useState(''); const errs = validateLimitsCfg(draft);
  const cn = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name || '?' : 'All clients');
  const rows = useMemo(() => [...payerLimits].sort((a, b) => (a.id === fresh ? -1 : b.id === fresh ? 1 : 0) || a.payer.localeCompare(b.payer) || (a.client_id || '').localeCompare(b.client_id || '')), [payerLimits, fresh]);
  const insights = useMemo(() => limitInsights(claims.filter((c) => !c.closed_at), idx, cfg, todayISO()), [claims, idx, cfg]);
  const patch = (r: PayerLimit, p: Partial<PayerLimit>) => save('payer_limits', [{ ...r, ...p }]);
  const spec: SampleSpec = {
    name: 'filing_limits', headers: H, note: 'Blank client = applies to all clients. Basis: dos | last_billed | denial. Payer names are matched to the directory (aliases supported).',
    rows: [{ payer: 'Aetna', client: '', plan_type: '', tfl_days: '180', afl_days: '180', ccfl_days: '180', tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: 'Provider manual', verified_on: todayISO(), notes: '' }],
    current: () => rows.map((r) => ({ payer: r.payer, client: r.client_id ? cn(r.client_id) : '', plan_type: r.plan_type || '', tfl_days: String(r.tfl_days ?? ''), afl_days: String(r.afl_days ?? ''), ccfl_days: String(r.ccfl_days ?? ''), tfl_basis: r.tfl_basis, afl_basis: r.afl_basis, ccfl_basis: r.ccfl_basis, source: r.source || '', verified_on: r.verified_on || '', notes: r.notes || '' })),
    onImport: async (data) => {
      const out: PayerLimit[] = []; let skipped = 0;
      for (const d of data) {
        const payer = (d.payer || '').trim(); if (!payer) { skipped++; continue; }
        const cl = d.client?.trim() ? clients.find((c) => c.name.toLowerCase() === d.client.trim().toLowerCase()) : null; if (d.client?.trim() && !cl) { skipped++; continue; }
        const name = canon(payer) || payer; const plan = d.plan_type?.trim() || null;
        const ex = payerLimits.find((r) => r.payer === name && (r.client_id || null) === (cl?.id || null) && (r.plan_type || null) === plan);
        out.push({ id: ex?.id || uid(), payer: name, client_id: cl?.id || null, plan_type: plan, tfl_days: num(d.tfl_days), afl_days: num(d.afl_days), ccfl_days: num(d.ccfl_days), tfl_basis: d.tfl_basis?.trim() === 'last_billed' ? 'last_billed' : 'dos', afl_basis: basis(d.afl_basis, 'denial'), ccfl_basis: basis(d.ccfl_basis, 'denial'), source: d.source || null, notes: d.notes || null, verified_on: d.verified_on || null, active: true });
      }
      if (out.length) await save('payer_limits', out); return `${out.length} limits saved${skipped ? `, ${skipped} skipped (no payer / unknown client)` : ''}`;
    },
  };
  const loadStarter = async () => { const have = new Set(payerLimits.filter((r) => !r.client_id).map((r) => r.payer.toLowerCase())); const add = STARTER_LIMITS.filter((s) => !have.has(s.payer.toLowerCase())).map((s) => ({ ...s, id: uid() })); if (!add.length) return toast.info('Starter pack already loaded'); await save('payer_limits', add); toast.ok(`Added ${add.length} payers — verify each against the payer contract`); };
  const add = async () => { const id = uid(); try { await save('payer_limits', [{ id, payer: 'New payer', client_id: null, plan_type: null, tfl_days: 180, afl_days: 180, ccfl_days: 180, tfl_basis: 'dos', afl_basis: 'denial', ccfl_basis: 'denial', source: null, notes: null, verified_on: null, active: true } as PayerLimit]); setFresh(id); toast.ok('Row added at the top — set the payer name and days'); } catch (e) { toast.err('Could not add: ' + (e as Error).message); } };
  const T = (k: keyof LimitsCfg['tiers']) => <input type="number" className="input !w-20" value={draft.tiers[k]} onChange={(e) => setDraft({ ...draft, tiers: { ...draft.tiers, [k]: +e.target.value } })} />;
  const E = (k: keyof LimitsCfg['escalate']) => <input type="number" className="input !w-20" value={draft.escalate[k]} onChange={(e) => setDraft({ ...draft, escalate: { ...draft.escalate, [k]: +e.target.value } })} />;
  const D = (k: 'tfl' | 'afl' | 'ccfl') => <input type="number" className="input !w-24" placeholder="none" value={draft.defaults[k] ?? ''} onChange={(e) => setDraft({ ...draft, defaults: { ...draft.defaults, [k]: e.target.value ? +e.target.value : null } })} />;
  return (
    <div className="space-y-4">
      <Card title="Filing limits (TFL · AFL · CCFL)" actions={<><SampleBar spec={spec} /><button className="btn btn-sm" onClick={loadStarter}><Wand2 size={13} />Starter pack</button><button className="btn btn-primary btn-sm" onClick={add}><Plus size={13} />Add</button></>} pad={false}>
        <p className="text-xs muted p-3">Most specific wins: client+payer → payer → payer directory → client default → central default. Starter values are public guidance — verify against each contract. {rows.length} rows.</p>
        <div className="overflow-x-auto"><table className="tbl w-full text-sm"><thead><tr><th>Payer</th><th>Client</th><th>Plan</th><th>TFL</th><th>AFL</th><th>CCFL</th><th>TFL from</th><th>Source</th><th /></tr></thead><tbody>
          {rows.map((r) => <tr key={r.id} style={r.id === fresh ? { background: 'rgba(99,102,241,.10)' } : undefined}>
            <td><input className="input !py-1" autoFocus={r.id === fresh} defaultValue={r.payer} onBlur={(e) => e.target.value !== r.payer && patch(r, { payer: canon(e.target.value) || e.target.value })} /></td>
            <td><select className="input !py-1" value={r.client_id || ''} onChange={(e) => patch(r, { client_id: e.target.value || null })}><option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
            <td><input className="input !py-1 !w-24" defaultValue={r.plan_type || ''} onBlur={(e) => patch(r, { plan_type: e.target.value || null })} /></td>
            {(['tfl_days', 'afl_days', 'ccfl_days'] as const).map((k) => <td key={k}><input type="number" className="input !py-1 !w-20" defaultValue={r[k] ?? ''} onBlur={(e) => patch(r, { [k]: num(e.target.value) })} /></td>)}
            <td><select className="input !py-1" value={r.tfl_basis} onChange={(e) => patch(r, { tfl_basis: e.target.value as PayerLimit['tfl_basis'] })}><option value="dos">DOS</option><option value="last_billed">Last billed</option></select></td>
            <td><input className="input !py-1" defaultValue={r.source || ''} onBlur={(e) => patch(r, { source: e.target.value || null, verified_on: todayISO() })} />{r.verified_on && <span className="text-[10px] muted">verified {r.verified_on}</span>}</td>
            <td><button className="btn btn-sm" title="Delete" onClick={() => del('payer_limits', [r.id])}><Trash2 size={13} /></button></td></tr>)}</tbody></table></div>
      </Card>
      {insights.length > 0 && <Card title="Setup insights">{insights.map((i) => <div key={i.id} className="flex gap-2 py-1 text-sm"><Chip color={i.level === 'high' ? '#ef4444' : i.level === 'med' ? '#f59e0b' : '#3b82f6'}>{i.level}</Chip><div><b>{i.title}</b> <span className="muted">{i.detail}</span></div></div>)}</Card>}
      <Card title="Thresholds, escalation & digest" actions={<button className="btn btn-primary btn-sm" disabled={errs.length > 0} onClick={async () => { await setSetting('limits_cfg', draft as any); toast.ok('Saved'); }}>Save</button>}>
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Tier cut-offs (days left)" hint="critical < high < soon < watch"><div className="flex gap-2">{T('critical')}{T('high')}{T('warn')}{T('watch')}</div></Field>
          <Field label="Escalate at (days left)" hint="owner ≥ supervisor ≥ manager"><div className="flex gap-2">{E('owner')}{E('supervisor')}{E('manager')}</div></Field>
          <Field label="Fallback limits (days)" hint="when no payer row exists"><div className="flex gap-2">{D('tfl')}{D('afl')}{D('ccfl')}</div></Field>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.autoFlag} onChange={(e) => setDraft({ ...draft, autoFlag: e.target.checked })} />Flag at-risk / expired claims</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.autoPriority} onChange={(e) => setDraft({ ...draft, autoPriority: e.target.checked })} />Raise priority automatically</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.notify} onChange={(e) => setDraft({ ...draft, notify: e.target.checked })} />Send notifications</label>
          <Field label="Weekly digest day"><select className="input" value={draft.digest.weekday} onChange={(e) => setDraft({ ...draft, digest: { ...draft.digest, weekday: +e.target.value } })}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>
          <Field label="Digest horizon (days)"><input type="number" className="input !w-24" value={draft.digest.horizonDays} onChange={(e) => setDraft({ ...draft, digest: { ...draft.digest, horizonDays: +e.target.value } })} /></Field>
        </div>
        {errs.map((e) => <div key={e} className="text-xs text-red-500 mt-2">{e}</div>)}
      </Card>
    </div>
  );
}
