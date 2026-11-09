import { CoverageGaps } from '../components/CoverageGaps';
import { AllocationAdvisor } from '../components/AllocationAdvisor';
import { useMemo, useState } from 'react';
import { isProducer } from '../lib/roles';
import { Play, Save, Shuffle, Trash2, Wand2 } from 'lucide-react';
import { useStore } from '../store';
import { useBuckets, useClaims, type EClaim } from '../hooks';
import { Avatar, Bar, Card, Field, PageHeader, Tabs, toast, useConfirm } from '../components/ui';
import { AllocationBoard, CoverageMatrix } from './allocation/Board';
import { money, moneyShort, num, sum, uid } from '../lib/utils';
import type { AllocationRule } from '../lib/types';
import { SampleBar, type SampleSpec } from '../components/SampleBar';

import { allocate, matches, type Criteria, type Strategy } from '../lib/engine/alloc';
export { allocate, matches };

function SmartAllocate() {
  const { profiles, clients, rules, save, del, assign } = useStore();
  const ruleSpec: SampleSpec = {
    name: 'allocation_rules', headers: ['name', 'client', 'payers', 'buckets', 'min_balance', 'statuses', 'assignees', 'strategy', 'active'], note: 'Matched by rule name. Lists separated by ;  assignees = full names. strategy: balanced | round_robin | by_balance | skills.',
    rows: [{ name: 'Big Aetna balances', client: '', payers: 'Aetna; Cigna', buckets: '91-120; 121-180', min_balance: '1000', statuses: 'New; In Progress', assignees: 'Sana Iqbal; Vikram Rao', strategy: 'balanced', active: 'yes' }],
    current: () => rules.map((r) => ({ name: r.name, client: clients.find((c) => c.id === r.client_id)?.name || '', payers: (r.criteria.payers || []).join('; '), buckets: (r.criteria.buckets || []).join('; '), min_balance: String(r.criteria.minBalance ?? ''), statuses: (r.criteria.statuses || []).join('; '), assignees: r.assignees.map((a) => profiles.find((p) => p.id === a)?.full_name || '').join('; '), strategy: r.strategy, active: r.active ? 'yes' : 'no' })),
    onImport: async (rows) => {
      const list = (v?: string) => (v || '').split(/[;|]/).map((x) => x.trim()).filter(Boolean); const out: AllocationRule[] = []; const bad: string[] = []; let added = 0, updated = 0;
      rows.forEach((r, i) => {
        const name = (r.name || '').trim(); if (!name) return; const team = list(r.assignees).map((n) => profiles.find((p) => p.full_name.toLowerCase() === n.toLowerCase())?.id); if (!team.length || team.some((t) => !t)) { bad.push(`row ${i + 2} “${name}”: assignees must be existing users’ full names`); return; }
        const strat = (r.strategy || 'balanced') as AllocationRule['strategy']; if (!['balanced', 'round_robin', 'by_balance', 'skills'].includes(strat)) { bad.push(`row ${i + 2}: unknown strategy “${r.strategy}”`); return; }
        const cl = r.client ? clients.find((c) => c.name.toLowerCase() === r.client.toLowerCase()) : null; if (r.client && !cl) { bad.push(`row ${i + 2}: unknown client “${r.client}”`); return; }
        const ex = rules.find((x) => x.name.toLowerCase() === name.toLowerCase()); const next: AllocationRule = { ...(ex || { id: uid(), sort: rules.length + out.length }), name, client_id: cl?.id ?? null, criteria: { payers: list(r.payers), buckets: list(r.buckets), minBalance: r.min_balance ? Number(r.min_balance) : undefined, statuses: list(r.statuses) }, assignees: team as string[], strategy: strat, active: r.active ? /^(y|yes|true|1)$/i.test(r.active) : true }; out.push(next); ex ? updated++ : added++;
      });
      if (out.length) await save('allocation_rules', out as any); if (!out.length && bad.length) throw new Error(bad[0]);
      return `Imported: ${added} added, ${updated} updated${bad.length ? `, ${bad.length} skipped (${bad[0]})` : ''}`;
    },
  };
  const claims = useClaims();
  const buckets = useBuckets();
  const { confirm, node } = useConfirm();
  const open = useMemo(() => claims.filter((x) => x.open), [claims]);
  const staff = profiles.filter((p) => p.active && isProducer(p.role));
  const workload = staff.map((p) => { const l = open.filter((x) => x.c.assigned_to === p.id); return { p, n: l.length, v: sum(l.map((x) => x.c.balance)), worked: l.filter((x) => x.c.touch_count > 0).length, due: l.filter((x) => x.fuDue).length }; });
  const maxV = Math.max(1, ...workload.map((w) => w.v));
  const unassigned = open.filter((x) => !x.c.assigned_to);

  const [clientId, setClientId] = useState('');
  const [cr, setCr] = useState<Criteria>({ buckets: [], payers: [], minBalance: 0 });
  const [onlyUn, setOnlyUn] = useState(true);
  const [strategy, setStrategy] = useState<Strategy>('balanced');
  const [team, setTeam] = useState<string[]>([]);
  const [ruleName, setRuleName] = useState('');
  const skillMap = useMemo(() => new Map(profiles.map((p) => [p.id, p.skills || []])), [profiles]);
  const payers = useMemo(() => [...new Set(open.map((x) => x.c.payer || 'Unknown'))].sort(), [open]);
  const pool = useMemo(() => open.filter((x) => matches(x, cr, clientId || null) && (!onlyUn || !x.c.assigned_to)), [open, cr, clientId, onlyUn]);
  const plan = useMemo(() => (team.length ? allocate(pool, team, strategy, open, skillMap) : new Map<string, string>()), [pool, team, strategy, open]);
  const preview = team.map((id) => { const ids = [...plan].filter(([, u]) => u === id).map(([c]) => c); const l = pool.filter((x) => ids.includes(x.c.id)); return { id, n: l.length, v: sum(l.map((x) => x.c.balance)) }; });
  const toggle = <T,>(arr: T[] | undefined, v: T) => (arr || []).includes(v) ? (arr || []).filter((x) => x !== v) : [...(arr || []), v];

  const apply = async () => {
    const byUser = new Map<string, string[]>();
    plan.forEach((u, c) => byUser.set(u, [...(byUser.get(u) || []), c]));
    for (const [u, ids] of byUser) await assign(ids, u);
    toast.ok(`Allocated ${plan.size} claims`);
  };
  const saveRule = async () => {
    if (!ruleName.trim() || !team.length) return toast.err('Name the rule and pick at least one assignee');
    await save('allocation_rules', [{ id: uid(), name: ruleName.trim(), client_id: clientId || null, criteria: cr, assignees: team, strategy, active: true, sort: rules.length }]);
    setRuleName(''); toast.ok('Rule saved');
  };
  const runRules = async () => {
    let total = 0;
    for (const r of rules.filter((x) => x.active).sort((a, b) => a.sort - b.sort)) {
      const un = open.filter((x) => !x.c.assigned_to && matches(x, r.criteria, r.client_id));
      const m = allocate(un, r.assignees, r.strategy, open, skillMap); const by = new Map<string, string[]>();
      m.forEach((u, c) => by.set(u, [...(by.get(u) || []), c]));
      for (const [u, ids] of by) { await assign(ids, u); total += ids.length; }
    }
    toast.ok(`Rules assigned ${total} unassigned claims`);
  };
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const reassign = async () => {
    const ids = open.filter((x) => x.c.assigned_to === from).map((x) => x.c.id);
    if (!ids.length || !to) return;
    if (await confirm(`Move ${ids.length} claims to ${profiles.find((p) => p.id === to)?.full_name}?`)) { await assign(ids, to); toast.ok('Reassigned'); }
  };

  return (
    <div>
      <PageHeader title="Allocation" sub={`${num(unassigned.length)} unassigned claims · ${moneyShort(sum(unassigned.map((x) => x.c.balance)))} waiting for an owner`} actions={<button className="btn btn-primary" onClick={runRules} disabled={!rules.some((r) => r.active)}><Play size={14} />Run saved rules</button>} />
      <div className="grid xl:grid-cols-5 gap-4">
        <Card title="Team workload" className="xl:col-span-2">
          <div className="space-y-3.5">
            {workload.map((w) => (
              <div key={w.p.id}>
                <div className="flex items-center gap-2"><Avatar name={w.p.full_name} size={26} /><div className="flex-1 min-w-0"><div className="text-sm font-semibold">{w.p.full_name} <span className="muted text-[11px] font-normal">{w.p.emp_code}</span></div>
                  <div className="text-[11px] muted">{w.n} claims · {moneyShort(w.v)} · {w.worked} worked{w.due ? ` · ${w.due} F/U due` : ''}</div></div></div>
                <div className="mt-1.5"><Bar value={w.v} max={maxV} color="#6366f1" h={6} /></div>
              </div>))}
            {workload.length === 0 && <div className="muted text-sm">Add AR specialists in Admin → Users.</div>}
          </div>
          <div className="mt-5 pt-4 border-t hair"><div className="label">Reassign (e.g. leave / attrition)</div>
            <div className="flex gap-2"><select className="input" value={from} onChange={(e) => setFrom(e.target.value)}><option value="">From…</option>{staff.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)}><option value="">To…</option>{staff.filter((p) => p.id !== from).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
              <button className="btn" onClick={reassign}><Shuffle size={14} /></button></div></div>
        </Card>
        <Card title={<span className="flex items-center gap-2"><Wand2 size={15} className="text-brand-400" />Smart allocate</span>} className="xl:col-span-3">
          <div className="grid md:grid-cols-3 gap-3 mb-3">
            <Field label="Client"><select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Min balance"><input type="number" className="input" value={cr.minBalance || ''} onChange={(e) => setCr({ ...cr, minBalance: Number(e.target.value) })} placeholder="0" /></Field>
            <Field label="Strategy"><select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}><option value="balanced">Balance claim count</option><option value="by_balance">Balance dollars</option><option value="round_robin">Round robin</option><option value="skills">Match payer skills, then balance</option></select></Field>
          </div>
          <div className="label">Buckets</div>
          <div className="flex gap-1.5 flex-wrap mb-3">{buckets.map((b) => <button key={b.label} onClick={() => setCr({ ...cr, buckets: toggle(cr.buckets, b.label) })} className="chip" style={cr.buckets?.includes(b.label) ? { background: b.color, color: '#fff' } : { background: b.color + '22', color: b.color }}>{b.label}</button>)}<span className="text-[11px] muted self-center">{cr.buckets?.length ? '' : 'all'}</span></div>
          <div className="label">Payers</div>
          <div className="flex gap-1.5 flex-wrap mb-3 max-h-20 overflow-auto">{payers.map((p) => <button key={p} onClick={() => setCr({ ...cr, payers: toggle(cr.payers, p) })} className={'chip ' + (cr.payers?.includes(p) ? 'bg-brand-600 text-white' : 'panel2 muted')}>{p}</button>)}</div>
          <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" checked={onlyUn} onChange={(e) => setOnlyUn(e.target.checked)} />Only unassigned claims (otherwise reshuffle everything matching)</label>
          <div className="label">Assign to</div>
          <div className="grid md:grid-cols-2 gap-2 mb-4">{staff.map((p) => { const pv = preview.find((x) => x.id === p.id); return (
            <label key={p.id} className={'panel2 p-2.5 flex items-center gap-2 cursor-pointer ' + (team.includes(p.id) ? '!border-brand-500' : '')}>
              <input type="checkbox" checked={team.includes(p.id)} onChange={() => setTeam(toggle(team, p.id))} /><Avatar name={p.full_name} size={22} /><span className="text-sm font-semibold flex-1">{p.full_name}</span>
              {pv && <span className="text-xs text-brand-400 font-semibold">+{pv.n} · {moneyShort(pv.v)}</span>}</label>); })}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn btn-primary" disabled={!plan.size} onClick={apply}>Allocate {num(plan.size)} claims ({money(sum(pool.map((x) => x.c.balance)))})</button>
            <input className="input !w-44" placeholder="Rule name" value={ruleName} onChange={(e) => setRuleName(e.target.value)} /><button className="btn" onClick={saveRule}><Save size={14} />Save as rule</button>
            <span className="text-xs muted">{num(pool.length)} claims match</span>
          </div>
        </Card>
      </div>
      {(
        <Card title="Saved allocation rules" className="mt-4" actions={<SampleBar spec={ruleSpec} />}>
          <table className="grid"><thead><tr><th>Rule</th><th>Scope</th><th>Strategy</th><th>Assignees</th><th title="Added to the smart-priority score of matching claims (−30…+30)">Priority boost</th><th>Active</th><th /></tr></thead><tbody>
            {rules.map((r) => (<tr key={r.id}><td className="font-semibold">{r.name}</td>
              <td className="text-xs muted">{clients.find((c) => c.id === r.client_id)?.name || 'All clients'}{r.criteria.buckets?.length ? ' · ' + r.criteria.buckets.join(', ') : ''}{r.criteria.payers?.length ? ' · ' + r.criteria.payers.length + ' payers' : ''}{r.criteria.minBalance ? ` · ≥${money(r.criteria.minBalance)}` : ''}</td>
              <td className="text-xs">{r.strategy.replace('_', ' ')}</td><td className="text-xs">{r.assignees.map((a) => profiles.find((p) => p.id === a)?.full_name.split(' ')[0]).join(', ')}</td>
              <td><input type="number" className="input !py-1 !w-16" defaultValue={(r.criteria as any).boost ?? 0} onBlur={(e) => { const v = Math.max(-30, Math.min(30, +e.target.value || 0)); if (v !== ((r.criteria as any).boost ?? 0)) void save('allocation_rules', [{ ...r, criteria: { ...r.criteria, boost: v } }]); }} /></td>
              <td><input type="checkbox" checked={r.active} onChange={() => save('allocation_rules', [{ ...r, active: !r.active }])} /></td>
              <td><button className="btn btn-ghost btn-sm btn-danger" onClick={() => del('allocation_rules', [r.id])}><Trash2 size={13} /></button></td></tr>))}</tbody></table>
        </Card>
      )}
      {node}
    </div>
  );
}

export default function Allocation() {
  const [tab, setTab] = useState<'smart' | 'board' | 'coverage' | 'advisor'>('board');
  return (
    <div>
      {tab !== 'smart' && <PageHeader title="Allocation" sub="Drag claims onto people, set practice coverage, or auto-balance" />}
      <div className="mb-5"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'board', label: 'Board (drag & drop)' }, { id: 'advisor', label: 'Advisor' }, { id: 'coverage', label: 'Client coverage' }, { id: 'smart', label: 'Smart allocate & rules' }]} /></div>
      {tab === 'coverage' && <div className="mb-4"><CoverageGaps /></div>}
      {tab === 'advisor' && <AllocationAdvisor />}
      {tab === 'board' && <AllocationBoard />}{tab === 'coverage' && <CoverageMatrix />}{tab === 'smart' && <SmartAllocate />}
    </div>
  );
}
