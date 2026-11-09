import { useMemo, useState } from 'react';
import { isLead, isProducer } from '../lib/roles';
import { Copy, FlaskConical, Play, Plus, Trash2, Workflow } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, Empty, Field, PageHeader, Tabs, toast, useConfirm } from '../components/ui';
import { JsonBar, type JsonSpec } from '../components/SampleBar';
import { OPS, RULE_FIELDS, RULE_TEMPLATES } from '../lib/engine/rules';
import { CHECKS, checkParams, groupLabel, sevOf, type Group } from '../lib/engine/checks';
import { relTime, uid } from '../lib/utils';
import type { AutoRule, RuleAction, RuleCondition } from '../lib/types';

const TRIG: Record<AutoRule['trigger'], string> = { import: 'After each import', touch: 'When a touch is saved', daily: 'Daily (on first sign-in)', manual: 'Manual only' };
const ACTIONS: { type: RuleAction['type']; label: string }[] = [{ type: 'priority', label: 'Set priority' }, { type: 'status', label: 'Set status' }, { type: 'assign', label: 'Assign to pool' }, { type: 'next_fu_in', label: 'Follow-up in N days' }, { type: 'flag', label: 'Add flag' }, { type: 'unflag', label: 'Remove flag' }, { type: 'note', label: 'Add note' }, { type: 'notify', label: 'Notify' }, { type: 'suggest_rca', label: 'Auto-code root cause from denial codes' }, { type: 'close', label: 'Close (adjust)' }];
const blank = (): AutoRule => ({ id: uid(), name: 'New rule', description: '', enabled: false, trigger: 'import', client_id: null, match: 'all', conditions: [{ field: 'balance', op: 'gt', value: 1000 }], actions: [{ type: 'priority', value: 'High' }], stop: false, sort: 99 });

export default function Rules() {
  const { autoRules, ruleRuns, clients, profiles, config, save, del, runRules, has, settings, setSetting } = useStore(); const { confirm, node } = useConfirm();
  const [tab, setTab] = useState<'rules' | 'runs' | 'checks' | 'templates'>('rules'); const [sel, setSel] = useState<string>(''); const [res, setRes] = useState<{ matched: number; changed: number; sample: string[]; dry: boolean } | null>(null); const [busy, setBusy] = useState(false);
  const rule = autoRules.find((r) => r.id === sel); const canEdit = has('manage_rules');
  const users = profiles.filter((p) => p.active && isProducer(p.role) || isLead(p.role));
  const statuses = config.filter((o) => o.category === 'status' && o.active).map((o) => o.value); const priorities = config.filter((o) => o.category === 'priority' && o.active).map((o) => o.value);
  const upd = (patch: Partial<AutoRule>) => rule && save('automation_rules', [{ ...rule, ...patch }] as any);
  const run = async (dry: boolean) => { if (!rule) return; setBusy(true); try { const r = await runRules('any', { ruleIds: [rule.id], dry }); const x = r.runs[0]; setRes({ matched: x?.matched ?? 0, changed: x?.changed ?? 0, sample: x?.sample ?? [], dry }); !dry && toast.ok(`Rule applied to ${x?.changed ?? 0} claims`); } catch (e: any) { toast.err(e.message); } finally { setBusy(false); } };
  const sorted = [...autoRules].sort((a, b) => a.sort - b.sort);
  const ruleSpec: JsonSpec = {
    name: 'rules', note: 'JSON: each rule has name, trigger, match, conditions[{field,op,value}] and actions[{type,value}]. Matched by name.',
    sample: { format: 'revrecover-rules', _help: 'trigger: import | touch | daily | manual · match: all | any · ops: eq, neq, gt, gte, lt, lte, in, contains · action types: assign, priority, status, next_fu_in, flag, unflag, note, close, notify, suggest_rca', rules: RULE_TEMPLATES.slice(0, 3).map(({ name, description, enabled, trigger, match, conditions, actions, stop }) => ({ name, description, enabled, trigger, match, conditions, actions, stop })) },
    current: () => ({ format: 'revrecover-rules', rules: sorted.map(({ name, description, enabled, trigger, client_id, match, conditions, actions, stop }) => ({ name, description, enabled, trigger, client: clients.find((c) => c.id === client_id)?.name || null, match, conditions, actions, stop })) }),
    onImport: async (j) => {
      const list: any[] = Array.isArray(j) ? j : j?.rules; if (!Array.isArray(list)) throw new Error('Expected { "rules": [ … ] } — download the sample to see the format');
      const TRIG = ['import', 'touch', 'daily', 'manual']; const ACT = ['assign', 'priority', 'status', 'next_fu_in', 'flag', 'unflag', 'note', 'close', 'notify', 'suggest_rca']; const out: AutoRule[] = []; const bad: string[] = []; let added = 0, updated = 0;
      list.forEach((r, i) => {
        const name = String(r?.name || '').trim(); if (!name) { bad.push(`rule ${i + 1}: missing name`); return; } if (!TRIG.includes(r.trigger)) { bad.push(`“${name}”: trigger must be ${TRIG.join(' / ')}`); return; }
        if (!Array.isArray(r.conditions) || !r.conditions.every((c: any) => c && c.field && c.op)) { bad.push(`“${name}”: every condition needs field and op`); return; } if (!Array.isArray(r.actions) || !r.actions.length || !r.actions.every((a: any) => ACT.includes(a?.type))) { bad.push(`“${name}”: actions must use ${ACT.join(', ')}`); return; }
        const ex = autoRules.find((x) => x.name.toLowerCase() === name.toLowerCase()); const cid = r.client ? clients.find((c) => c.name.toLowerCase() === String(r.client).toLowerCase())?.id ?? null : null;
        const next: AutoRule = { ...(ex || { id: uid(), sort: autoRules.length + out.length }), name, description: r.description ?? ex?.description ?? null, enabled: r.enabled ?? ex?.enabled ?? true, trigger: r.trigger, client_id: cid, match: r.match === 'any' ? 'any' : 'all', conditions: r.conditions, actions: r.actions, stop: !!r.stop } as AutoRule; out.push(next); ex ? updated++ : added++;
      });
      if (out.length) await save('automation_rules', out as any); if (!out.length && bad.length) throw new Error(bad[0]);
      return `Imported: ${added} added, ${updated} updated${bad.length ? `, ${bad.length} skipped (${bad[0]})` : ''}`;
    },
  };
  const setCond = (i: number, p: Partial<RuleCondition>) => upd({ conditions: rule!.conditions.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const setAct = (i: number, p: Partial<RuleAction>) => upd({ actions: rule!.actions.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const checkSettings = (settings.checks || {}) as any; const setCheck = (id: string, p: any) => setSetting('checks', { ...checkSettings, [id]: { ...(checkSettings[id] || {}), ...p } });

  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2"><Workflow className="text-brand-400" />Rules & checks</span>} sub="Automation across the whole claim lifecycle — reconciliation, accounting logic, workflow, routing — plus configurable consistency checks." actions={canEdit && <button className="btn btn-primary" onClick={async () => { const r = blank(); await save('automation_rules', [r] as any); setSel(r.id); setTab('rules'); }}><Plus size={14} />New rule</button>} />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'rules', label: 'Rules', count: autoRules.length }, { id: 'templates', label: 'Template gallery' }, { id: 'checks', label: 'Quality checks', count: CHECKS.length }, { id: 'runs', label: 'Run log', count: ruleRuns.length }]} /></div>

      {tab === 'rules' && (
        <div className="grid lg:grid-cols-5 gap-4">
          <Card title="Rules (run top → bottom)" className="lg:col-span-2" pad={false} actions={canEdit && <JsonBar spec={ruleSpec} />}>
            <div className="px-2 pb-3 max-h-[640px] overflow-auto">{sorted.map((r) => { const last = ruleRuns.filter((x) => x.rule_id === r.id && !x.dry_run).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]; return (
              <div key={r.id} onClick={() => { setSel(r.id); setRes(null); }} className={'px-3 py-2.5 rounded-lg cursor-pointer flex items-start gap-2 ' + (sel === r.id ? 'bg-brand-600/20 ring-1 ring-brand-500' : 'hover:bg-[var(--panel2)]')}>
                <input type="checkbox" checked={r.enabled} disabled={!canEdit} onClick={(e) => e.stopPropagation()} onChange={() => save('automation_rules', [{ ...r, enabled: !r.enabled }] as any)} className="mt-1" />
                <div className="min-w-0 flex-1"><div className={'text-[13px] font-semibold truncate ' + (r.enabled ? '' : 'muted')}>{r.name}</div><div className="flex gap-1.5 mt-1 flex-wrap"><Chip color="#6366f1">{TRIG[r.trigger]}</Chip>{r.client_id && <Chip color="#06b6d4">{clients.find((c) => c.id === r.client_id)?.name}</Chip>}{r.stop && <Chip color="#f59e0b">stops</Chip>}</div>{last && <div className="text-[10px] muted mt-1">Last run {relTime(last.created_at)} · {last.changed}/{last.matched} changed</div>}</div></div>); })}
              {sorted.length === 0 && <Empty icon={<Workflow />} title="No rules yet" sub="Start from the template gallery." />}</div>
          </Card>
          <Card className="lg:col-span-3" title={rule ? 'Edit rule' : 'Select a rule'}>
            {!rule ? <Empty title="Pick a rule on the left" /> : (
              <fieldset disabled={!canEdit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-3"><Field label="Name"><input className="input" key={rule.id} defaultValue={rule.name} onBlur={(e) => upd({ name: e.target.value })} /></Field>
                  <Field label="Runs"><select className="input" value={rule.trigger} onChange={(e) => upd({ trigger: e.target.value as any })}>{(Object.keys(TRIG) as AutoRule['trigger'][]).map((t) => <option key={t} value={t}>{TRIG[t]}</option>)}</select></Field>
                  <Field label="Client scope"><select className="input" value={rule.client_id || ''} onChange={(e) => upd({ client_id: e.target.value || null })}><option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                  <Field label="Description"><input className="input" key={rule.id + 'd'} defaultValue={rule.description || ''} onBlur={(e) => upd({ description: e.target.value })} /></Field></div>
                <div><div className="flex items-center gap-2 mb-2"><div className="label !mb-0">When</div><select className="input !w-auto !py-1" value={rule.match} onChange={(e) => upd({ match: e.target.value as any })}><option value="all">ALL of these are true</option><option value="any">ANY of these is true</option></select></div>
                  <div className="space-y-1.5">{rule.conditions.map((c, i) => { const f = RULE_FIELDS.find((x) => x.key === c.field) || RULE_FIELDS[0]; const noVal = ['is_empty', 'not_empty', 'is_true', 'is_false'].includes(c.op); const sugg = c.field === 'status' ? statuses : c.field === 'priority' ? priorities : c.field === 'payer' ? [...new Set(config.filter((o) => o.category === 'payer').map((o) => o.value))] : c.field === 'rca' ? config.filter((o) => o.category === 'rca').map((o) => o.value) : c.field === 'bucket' ? config.filter((o) => o.category === 'bucket').map((o) => o.value) : c.field === 'owner' ? users.map((u) => u.id) : []; return (
                    <div key={i} className="flex gap-2 items-center"><select className="input !w-52" value={c.field} onChange={(e) => { const nf = RULE_FIELDS.find((x) => x.key === e.target.value)!; setCond(i, { field: nf.key, op: OPS[nf.type][0].op, value: '' }); }}>{RULE_FIELDS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
                      <select className="input !w-36" value={c.op} onChange={(e) => setCond(i, { op: e.target.value })}>{OPS[f.type].map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}</select>
                      {!noVal && <><input className="input" list={'dl' + i} defaultValue={c.value ?? ''} key={c.field + c.op} onBlur={(e) => setCond(i, { value: f.type === 'number' ? Number(e.target.value) : e.target.value })} placeholder={f.hint || 'value'} /><datalist id={'dl' + i}>{sugg.map((s) => <option key={s} value={s} />)}</datalist></>}
                      <button className="btn btn-ghost btn-sm btn-danger" onClick={() => upd({ conditions: rule.conditions.filter((_, j) => j !== i) })}><Trash2 size={13} /></button></div>); })}</div>
                  <button className="btn btn-sm mt-2" onClick={() => upd({ conditions: [...rule.conditions, { field: 'balance', op: 'gt', value: 0 }] })}><Plus size={12} />Condition</button></div>
                <div><div className="label">Then</div>
                  <div className="space-y-1.5">{rule.actions.map((a, i) => (
                    <div key={i} className="flex gap-2 items-start"><select className="input !w-60" value={a.type} onChange={(e) => setAct(i, { type: e.target.value as any, value: undefined })}>{ACTIONS.map((x) => <option key={x.type} value={x.type}>{x.label}</option>)}</select>
                      {a.type === 'priority' && <select className="input" value={a.value || ''} onChange={(e) => setAct(i, { value: e.target.value })}><option value="">Select…</option>{priorities.map((p) => <option key={p}>{p}</option>)}</select>}
                      {a.type === 'status' && <select className="input" value={a.value || ''} onChange={(e) => setAct(i, { value: e.target.value })}><option value="">Select…</option>{statuses.map((p) => <option key={p}>{p}</option>)}</select>}
                      {a.type === 'next_fu_in' && <input type="number" className="input !w-28" defaultValue={a.value ?? 7} onBlur={(e) => setAct(i, { value: Number(e.target.value) })} />}
                      {(a.type === 'flag' || a.type === 'unflag' || a.type === 'note' || a.type === 'close') && <input className="input" defaultValue={a.value || ''} placeholder={a.type === 'note' ? 'Note text' : a.type === 'close' ? 'Closing reason' : 'flag_name'} onBlur={(e) => setAct(i, { value: e.target.value })} />}
                      {a.type === 'notify' && <><input className="input" defaultValue={a.value || ''} placeholder="Notification title" onBlur={(e) => setAct(i, { value: e.target.value })} /><select className="input !w-36" value={a.to || 'supervisor'} onChange={(e) => setAct(i, { to: e.target.value as any })}><option value="owner">Claim owner</option><option value="supervisor">Supervisor</option><option value="admin">Admins</option><option value="all">Everyone</option></select></>}
                      {a.type === 'assign' && <div className="flex-1"><div className="flex gap-1.5 flex-wrap mb-1">{users.map((u) => { const on = (a.pool || []).includes(u.id); return <button key={u.id} type="button" className={'chip ' + (on ? 'bg-brand-600 text-white' : 'panel2 muted')} onClick={() => setAct(i, { pool: on ? (a.pool || []).filter((x) => x !== u.id) : [...(a.pool || []), u.id] })}>{u.full_name.split(' ')[0]}</button>; })}</div>
                        <div className="flex gap-2"><select className="input !w-40" value={a.strategy || 'balanced'} onChange={(e) => setAct(i, { strategy: e.target.value as any })}><option value="balanced">Balance load</option><option value="round_robin">Round robin</option></select><label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={a.value === 'reassign'} onChange={(e) => setAct(i, { value: e.target.checked ? 'reassign' : '' })} />also reassign owned claims</label></div></div>}
                      <button className="btn btn-ghost btn-sm btn-danger" onClick={() => upd({ actions: rule.actions.filter((_, j) => j !== i) })}><Trash2 size={13} /></button></div>))}</div>
                  <button className="btn btn-sm mt-2" onClick={() => upd({ actions: [...rule.actions, { type: 'flag', value: '' }] })}><Plus size={12} />Action</button></div>
                <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={rule.stop} onChange={(e) => upd({ stop: e.target.checked })} />Stop — don’t apply later rules to claims this rule matches</label>
                <div className="flex items-center gap-2 pt-2 border-t hair flex-wrap">
                  <button className="btn" disabled={busy} onClick={() => run(true)}><FlaskConical size={14} />Dry-run on open claims</button>
                  {has('run_rules') && <button className="btn btn-primary" disabled={busy} onClick={async () => { if (await confirm(`Apply “${rule.name}” to all matching open claims now?`)) run(false); }}><Play size={14} />Run now</button>}
                  <button className="btn btn-ghost" onClick={async () => { const c = { ...rule, id: uid(), name: rule.name + ' (copy)', enabled: false }; await save('automation_rules', [c] as any); setSel(c.id); }}><Copy size={14} /></button>
                  <button className="btn btn-ghost btn-danger ml-auto" onClick={async () => { if (await confirm('Delete this rule?')) { await del('automation_rules', [rule.id]); setSel(''); } }}><Trash2 size={14} /></button></div>
                {res && <div className="panel2 p-3 text-sm"><b>{res.dry ? 'Dry-run: ' : 'Applied: '}</b>{res.matched} claims match, {res.changed} {res.dry ? 'would change' : 'changed'}.{res.sample.length > 0 && <div className="text-xs muted mt-1">e.g. {res.sample.join(', ')}</div>}</div>}
              </fieldset>)}
          </Card>
        </div>)}

      {tab === 'templates' && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{RULE_TEMPLATES.map((t) => (
          <Card key={t.name} title={t.name}><p className="text-xs muted mb-2">{t.description}</p><div className="flex gap-1.5 flex-wrap mb-3"><Chip color="#6366f1">{TRIG[t.trigger]}</Chip>{t.conditions.map((c, i) => <Chip key={i} color="#64748b">{c.field} {c.op} {String(c.value ?? '')}</Chip>)}</div>
            {canEdit && <button className="btn btn-sm" disabled={autoRules.some((r) => r.name === t.name)} onClick={async () => { const r = { ...t, id: uid(), sort: autoRules.length, enabled: false } as AutoRule; await save('automation_rules', [r] as any); setSel(r.id); setTab('rules'); toast.ok('Added (disabled) — review and enable'); }}>{autoRules.some((r) => r.name === t.name) ? 'Added' : 'Add to my rules'}</button>}</Card>))}</div>)}

      {tab === 'checks' && (
        <div className="space-y-4">{(Object.keys(groupLabel) as Group[]).map((g) => (
          <Card key={g} title={groupLabel[g]} pad={false}><div className="px-4 pb-3"><table className="grid"><thead><tr><th style={{ width: 50 }}>On</th><th>Check</th><th style={{ width: 120 }}>Severity</th><th>Thresholds</th></tr></thead><tbody>
            {CHECKS.filter((c) => c.group === g).map((c) => (<tr key={c.id}><td><input type="checkbox" disabled={!canEdit} checked={checkSettings[c.id]?.enabled !== false} onChange={(e) => setCheck(c.id, { enabled: e.target.checked })} /></td><td><div className="font-semibold text-[13px]">{c.title}</div><div className="text-[11px] muted">{c.help}</div></td>
              <td><select className="input" disabled={!canEdit} value={sevOf(c, checkSettings)} onChange={(e) => setCheck(c.id, { severity: e.target.value })}><option value="high">High</option><option value="med">Medium</option><option value="low">Low</option></select></td>
              <td>{(c.params || []).map((p) => <label key={p.key} className="text-[11px] muted flex items-center gap-1.5 mb-1">{p.label}<input type="number" disabled={!canEdit} className="input !w-20" defaultValue={checkParams(c, checkSettings)[p.key]} onBlur={(e) => setCheck(c.id, { params: { ...(checkSettings[c.id]?.params || {}), [p.key]: Number(e.target.value) } })} /></label>)}{!c.params && <span className="muted text-xs">—</span>}</td></tr>))}</tbody></table></div></Card>))}</div>)}

      {tab === 'runs' && <Card pad={false}><div className="px-4 pb-4 max-h-[600px] overflow-auto"><table className="grid"><thead><tr><th>When</th><th>Rule</th><th>Trigger</th><th style={{ textAlign: 'right' }}>Matched</th><th style={{ textAlign: 'right' }}>Changed</th><th>By</th><th>Sample</th></tr></thead><tbody>{[...ruleRuns].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200).map((r) => <tr key={r.id}><td className="whitespace-nowrap text-xs">{relTime(r.created_at)}</td><td className="font-semibold">{r.rule_name}</td><td className="text-xs">{r.trigger}</td><td style={{ textAlign: 'right' }}>{r.matched}</td><td style={{ textAlign: 'right' }}>{r.changed}</td><td className="text-xs muted">{r.actor_name}</td><td className="text-xs muted">{(r.sample || []).join(', ')}</td></tr>)}</tbody></table>{ruleRuns.length === 0 && <Empty title="No runs yet" />}</div></Card>}
      {node}
    </div>
  );
}
