import { useState } from 'react';
import { useStore } from '../../store';
import { Card, Field, toast } from '../../components/ui';
import { BULK_LABEL, DEFAULT_BULK_CFG, resolveBulkCfg, validateBulkCfg, type BulkCfg, type BulkKind } from '../../lib/engine/bulk';
import { resolvePriorityCfg, validatePriorityCfg, type PriorityCfg } from '../../lib/engine/priority';

/** Bulk-action guardrails (what is allowed, size limits, undo window). */
export function BulkRules() {
  const { settings, setSetting } = useStore(); const [d, setD] = useState<BulkCfg>(resolveBulkCfg(settings.bulk_cfg)); const errs = validateBulkCfg(d);
  const toggle = (k: BulkKind) => setD({ ...d, allowKinds: d.allowKinds.includes(k) ? d.allowKinds.filter((x) => x !== k) : [...d.allowKinds, k] });
  return (
    <Card title="Bulk action rules" actions={<><button className="btn btn-sm" onClick={() => setD(DEFAULT_BULK_CFG)}>Reset</button><button className="btn btn-primary btn-sm" disabled={errs.length > 0} onClick={async () => { await setSetting('bulk_cfg', d as any); toast.ok('Saved'); }}>Save</button></>}>
      <div className="label">Allowed actions</div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mb-4">{(Object.keys(BULK_LABEL) as BulkKind[]).map((k) => <label key={k} className="flex gap-2 text-sm"><input type="checkbox" checked={d.allowKinds.includes(k)} onChange={() => toggle(k)} />{BULK_LABEL[k]}</label>)}</div>
      <div className="grid md:grid-cols-4 gap-4">
        <Field label="Max claims per action"><input type="number" className="input" value={d.maxRows} onChange={(e) => setD({ ...d, maxRows: +e.target.value })} /></Field>
        <Field label="Require a reason above"><input type="number" className="input" value={d.reasonOver} onChange={(e) => setD({ ...d, reasonOver: +e.target.value })} /></Field>
        <Field label="Undo window (hours)" hint="0 = no undo"><input type="number" className="input" value={d.undoHours} onChange={(e) => setD({ ...d, undoHours: +e.target.value })} /></Field>
        <Field label="Protected flags (comma)" hint="cannot be removed in bulk"><input className="input" value={d.protectFlags.join(', ')} onChange={(e) => setD({ ...d, protectFlags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
      </div>
      {errs.map((e) => <div key={e} className="text-xs text-red-500 mt-2">{e}</div>)}
    </Card>
  );
}

const W: Record<string, string> = { deadline: 'Deadline criticality (TFL/AFL/CCFL)', value: 'Dollar value at stake', age: 'Age', followup: 'Follow-up overdue', stale: 'Not touched recently', winProb: 'Payer win probability' };
/** Weights behind the worklist's smart priority order. */
export function PriorityRules() {
  const { settings, setSetting } = useStore(); const [d, setD] = useState<PriorityCfg>(resolvePriorityCfg(settings.priority_cfg)); const errs = validatePriorityCfg(d);
  return (
    <Card title="Smart priority (worklist order)" actions={<button className="btn btn-primary btn-sm" disabled={errs.length > 0} onClick={async () => { await setSetting('priority_cfg', d as any); toast.ok('Saved'); }}>Save</button>}>
      <p className="text-xs muted mb-3">Each claim’s score is the sum of these parts (points = weight × how strong the signal is). Allocation rules can add a ± boost per rule (Control → Allocation).</p>
      <div className="grid md:grid-cols-3 gap-4">{Object.keys(d.weights).map((k) => <Field key={k} label={W[k] || k} hint="max points"><input type="number" className="input" value={(d.weights as any)[k]} onChange={(e) => setD({ ...d, weights: { ...d.weights, [k]: +e.target.value } })} /></Field>)}
        <Field label="Value that earns full points ($)"><input type="number" className="input" value={d.valueCap} onChange={(e) => setD({ ...d, valueCap: +e.target.value })} /></Field>
        <Field label="Max rule boost (±)"><input type="number" className="input" value={d.ruleBoostMax} onChange={(e) => setD({ ...d, ruleBoostMax: +e.target.value })} /></Field></div>
      <div className="label mt-4">Share of deadline points by countdown tier</div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">{(Object.keys(d.tierPoints) as (keyof PriorityCfg['tierPoints'])[]).map((t) => <Field key={t} label={t}><input type="number" step="0.05" className="input" value={d.tierPoints[t]} onChange={(e) => setD({ ...d, tierPoints: { ...d.tierPoints, [t]: +e.target.value } })} /></Field>)}</div>
      {errs.map((e) => <div key={e} className="text-xs text-red-500 mt-2">{e}</div>)}
    </Card>
  );
}
