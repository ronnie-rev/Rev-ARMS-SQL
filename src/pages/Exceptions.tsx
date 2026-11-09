import { useMemo, useState } from 'react';
import { isProducer } from '../lib/roles';
import { AlertOctagon, CheckCheck, EyeOff, GitMerge, RefreshCw, UserPlus } from 'lucide-react';
import { useStore, computeViolations } from '../store';
import { Avatar, Card, Chip, Empty, PageHeader, Tabs, toast, useConfirm } from '../components/ui';
import { PayerFixer } from '../components/PayerFixer';
import { dqSummary } from '../lib/engine/dqsummary';
import { CHECKS, groupLabel, sevOf, type Group } from '../lib/engine/checks';
import { FLAG_LABEL } from '../lib/engine/settings';
import { buildPayerIndex } from '../lib/engine/payers';
import { money, moneyShort, sum } from '../lib/utils';

const SEV = { high: '#ef4444', med: '#f59e0b', low: '#64748b' } as const;

export default function Exceptions() {
  const st = useStore(); const { claims, profiles, config, settings, clients, has, syncChecks, patchClaims, assign, mergeClaims, clearFlag, save } = st; const { confirm, node } = useConfirm();
  const [tab, setTab] = useState<'checks' | 'dups' | 'flags' | 'payers'>('checks'); const [sel, setSel] = useState<string | null>(null); const [grp, setGrp] = useState<Group | ''>(''); const [busy, setBusy] = useState(false); const [picked, setPicked] = useState<Set<string>>(new Set());
  const scope = st.clientFilter; const scopeArr = st.clientScope; const open = useMemo(() => claims.filter((c) => !c.closed_at && (!scopeArr.length || scopeArr.includes(c.client_id))), [claims, scopeArr]);
  const viol = useMemo(() => computeViolations({ config, clients, profiles, workLog: st.workLog, settings, claims, carcMap: st.carcMap }, open), [open, config, clients, profiles, st.workLog, settings, claims]); // eslint-disable-line react-hooks/exhaustive-deps
  const byCheck = useMemo(() => { const m = new Map<string, typeof viol>(); viol.forEach((v) => m.set(v.check_id, [...(m.get(v.check_id) || []), v])); return m; }, [viol]);
  const cm = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]); const cm2 = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]); const checkSettings = (settings.checks || {}) as any;
  const rows = sel ? (byCheck.get(sel) || []) : []; const ck = CHECKS.find((c) => c.id === sel);
  const assignable = profiles.filter((p) => p.active && isProducer(p.role));
  const ids = [...picked].filter((id) => rows.some((r) => r.claim_id === id));

  // duplicates: same fingerprint among open claims of a client
  const dupGroups = useMemo(() => { const m = new Map<string, typeof open>(); open.forEach((c) => c.fingerprint && m.set(c.client_id + c.fingerprint, [...(m.get(c.client_id + c.fingerprint) || []), c])); return [...m.values()].filter((g) => g.length > 1); }, [open]);
  const flagCounts = useMemo(() => { const m = new Map<string, typeof open>(); open.forEach((c) => (c.flags || []).filter((f) => FLAG_LABEL[f]).forEach((f) => m.set(f, [...(m.get(f) || []), c]))); return [...m].sort((a, b) => b[1].length - a[1].length); }, [open]);
  const payerIdx = useMemo(() => buildPayerIndex(config.filter((o) => o.category === 'payer' && o.active).map((o) => ({ value: o.value, aliases: o.meta.aliases }))), [config]);
  const unknownPayers = useMemo(() => { const m = new Map<string, number>(); open.forEach((c) => { if (c.payer && c.payer !== 'Unknown' && !payerIdx.canon(c.payer).known) m.set(c.payer, (m.get(c.payer) || 0) + 1); }); return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count); }, [open, payerIdx]);

  const dq = useMemo(() => dqSummary(open, viol), [open, viol]); const total = viol.length; const high = viol.filter((v) => v.severity === 'high').length;
  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2"><AlertOctagon className="text-amber-400" />Exceptions workbench</span>} sub="Claim-accounting & workflow consistency checks, duplicates, import flags and payer-name hygiene — all in one place." actions={has('run_rules') && <button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { const r = await syncChecks({ clientId: scope || undefined }); toast.ok(`Flags synced: +${r.flagged} / −${r.cleared} claims`); } finally { setBusy(false); } }}><RefreshCw size={14} />Sync flags to claims</button>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[['Open violations', total, '#6366f1'], ['High severity', high, '#ef4444'], ['Claims affected', new Set(viol.map((v) => v.claim_id)).size, '#f59e0b'], ['$ exposed', moneyShort(sum([...new Set(viol.map((v) => v.claim_id))].map((id) => cm.get(id)?.balance || 0))), '#06b6d4']].map(([l, v, c]) => <div key={l as string} className="panel p-3.5"><div className="label !mb-0" style={{ color: c as string }}>{l}</div><div className="text-2xl font-extrabold mt-0.5">{v}</div></div>)}</div>
      {dq.open > 0 && dq.claimsFlagged > 0 && <Card title="Data quality at a glance" className="mb-4"><div className="grid md:grid-cols-4 gap-3 text-[13px] mb-3"><div><div className="label">Clean claims</div><b className="text-lg" style={{ color: dq.cleanPct >= 90 ? '#16a34a' : dq.cleanPct >= 75 ? '#d97706' : '#dc2626' }}>{dq.cleanPct}%</b></div><div><div className="label">Claims with a violation</div><b className="text-lg">{dq.claimsFlagged.toLocaleString('en-US')}</b></div><div><div className="label">Open balance affected</div><b className="text-lg">{money(dq.balanceAtRisk)}</b></div><div><div className="label">Cleanest → messiest client</div><div className="text-[12px]">{dq.clients.length ? `${cm2.get(dq.clients[dq.clients.length - 1].client_id) || '—'} (${dq.clients[dq.clients.length - 1].cleanPct}%) → ${cm2.get(dq.clients[0].client_id) || '—'} (${dq.clients[0].cleanPct}%)` : '—'}</div></div></div>
        <div className="label mb-1">Rules costing the most dollars</div><div className="space-y-1">{dq.topChecks.map((t) => <button key={t.check_id} className="w-full flex justify-between text-left text-[13px] hover:bg-white/5 rounded px-1" onClick={() => { setTab('checks'); setSel(t.check_id); }}><span>{CHECKS.find((c) => c.id === t.check_id)?.title || t.check_id}{t.high > 0 && <Chip color="#ef4444" className="ml-1">{t.high} high</Chip>}</span><span className="muted">{t.claims} claims · {money(t.balance)}</span></button>)}</div></Card>}
      <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'checks', label: 'Quality checks', count: total }, { id: 'dups', label: 'Duplicates', count: dupGroups.length }, { id: 'flags', label: 'Import flags', count: flagCounts.reduce((a, f) => a + f[1].length, 0) }, { id: 'payers', label: 'Payer names', count: unknownPayers.length }]} /></div>

      {tab === 'checks' && (
        <div className="grid xl:grid-cols-5 gap-4">
          <Card className="xl:col-span-2" title="Checks" pad={false} actions={<select className="input !w-auto !py-1" value={grp} onChange={(e) => setGrp(e.target.value as any)}><option value="">All groups</option>{(Object.keys(groupLabel) as Group[]).map((g) => <option key={g} value={g}>{groupLabel[g]}</option>)}</select>}>
            <div className="px-2 pb-3 max-h-[620px] overflow-auto">{CHECKS.filter((c) => !grp || c.group === grp).map((c) => { const n = byCheck.get(c.id)?.length || 0; const off = checkSettings[c.id]?.enabled === false; return (
              <button key={c.id} onClick={() => { setSel(c.id); setPicked(new Set()); }} className={'w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 ' + (sel === c.id ? 'bg-brand-600/20 ring-1 ring-brand-500' : 'hover:bg-[var(--panel2)]') + (off ? ' opacity-40' : '')}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SEV[sevOf(c, checkSettings)] }} /><div className="flex-1 min-w-0"><div className="text-[13px] font-semibold truncate">{c.title}</div><div className="text-[10px] muted">{groupLabel[c.group]}</div></div><span className={'text-sm font-bold tabular-nums ' + (n ? '' : 'muted')}>{off ? 'off' : n}</span></button>); })}</div>
          </Card>
          <Card className="xl:col-span-3" title={ck ? ck.title : 'Select a check'} actions={ck && <Chip color={SEV[sevOf(ck, checkSettings)]}>{sevOf(ck, checkSettings)}</Chip>}>
            {!ck ? <Empty title="Pick a check on the left" sub="Each one explains why it matters and lets you act on every claim it finds." /> : (
              <div>
                <p className="text-xs muted mb-3">{ck.help}</p>
                {picked.size > 0 && <div className="panel2 p-2 mb-3 flex gap-2 flex-wrap items-center"><b className="text-sm px-1">{ids.length} selected</b>
                  {has('assign') && <select className="input !w-auto" value="" onChange={async (e) => { if (!e.target.value) return; await assign(ids, e.target.value); toast.ok('Assigned'); setPicked(new Set()); }}><option value="">Assign to…</option>{assignable.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>}
                  {has('bulk_edit') && <select className="input !w-auto" value="" onChange={async (e) => { if (!e.target.value) return; await patchClaims(ids, { priority: e.target.value }, `Priority → ${e.target.value} (from exception “${ck.title}”)`); setPicked(new Set()); }}><option value="">Set priority…</option>{['Low', 'Normal', 'High', 'Critical'].map((p) => <option key={p}>{p}</option>)}</select>}
                  {has('run_rules') && <button className="btn btn-sm" onClick={async () => { const rowsToSave = ids.map((id) => cm.get(id)!).map((c) => ({ ...c, flags: [...new Set([...(c.flags || []), 'ign:' + ck.id])] })); await save('claims', rowsToSave as any); toast.ok('Ignored for these claims'); setPicked(new Set()); }}><EyeOff size={13} />Ignore for selected</button>}</div>}
                <div className="max-h-[520px] overflow-auto"><table className="grid"><thead><tr><th style={{ width: 28 }}><input type="checkbox" checked={rows.length > 0 && rows.every((r) => picked.has(r.claim_id))} onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.claim_id)) : new Set())} /></th><th>Claim</th><th>Payer</th><th style={{ textAlign: 'right' }}>Balance</th><th>Why</th><th>Owner</th></tr></thead><tbody>
                  {rows.slice(0, 300).map((v) => { const c = cm.get(v.claim_id); if (!c) return null; const o = profiles.find((p) => p.id === c.assigned_to); return (
                    <tr key={v.claim_id} className="cursor-pointer" onClick={() => st.openClaim(c.id)}><td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={picked.has(c.id)} onChange={() => setPicked((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} /></td><td className="font-semibold whitespace-nowrap">{c.claim_no}</td><td>{c.payer}</td><td style={{ textAlign: 'right' }}>{money(c.balance)}</td><td className="text-xs muted max-w-[300px]">{v.message}</td><td>{o ? <span className="flex items-center gap-1.5 text-xs"><Avatar name={o.full_name} size={18} />{o.full_name.split(' ')[0]}</span> : <span className="text-amber-500 text-xs">—</span>}</td></tr>); })}</tbody></table>
                  {rows.length === 0 && <Empty icon={<CheckCheck />} title="All clear" sub="No claims violate this check." />}</div>
              </div>)}
          </Card>
        </div>)}

      {tab === 'dups' && (dupGroups.length === 0 ? <Card><Empty icon={<GitMerge />} title="No duplicate charges" sub="No two open claims share the same patient, DOS, CPT and amount." /></Card> : (
        <div className="space-y-3">{dupGroups.slice(0, 40).map((g, i) => (
          <Card key={i} title={`${g[0].patient_name} · DOS ${g[0].dos} · ${g[0].cpt || ''} · ${money(g[0].billed_amt)}`} actions={<Chip color="#ef4444">{g.length} claims</Chip>}>
            <div className="grid md:grid-cols-2 gap-2">{g.map((c) => (<div key={c.id} className="panel2 p-3 text-[13px]"><div className="flex justify-between"><button className="font-bold text-brand-400" onClick={() => st.openClaim(c.id)}>{c.claim_no}</button><span>{money(c.balance, true)}</span></div><div className="text-xs muted">{c.payer} · {c.touch_count} touches · {c.status}</div>
              {has('merge_claims') && g.length === 2 && <button className="btn btn-sm mt-2" onClick={async () => { const other = g.find((x) => x.id !== c.id)!; if (!(await confirm(`Keep ${c.claim_no} and merge ${other.claim_no} into it? Notes, touches and history move over; ${other.claim_no} is remembered as an alias so future files still match.`))) return; try { await mergeClaims(c.id, other.id); toast.ok('Merged'); } catch (e: any) { toast.err(e.message); } }}><GitMerge size={12} />Keep this, merge other into it</button>}</div>))}</div>
            {g.length > 2 && <div className="text-xs muted mt-2">3+ claims share this charge — open them individually to decide.</div>}
            <button className="btn btn-ghost btn-sm mt-2" onClick={async () => { await save('claims', g.map((c) => ({ ...c, flags: [...new Set([...(c.flags || []), 'ign:dup_charge'])] })) as any); }}><EyeOff size={12} />Not duplicates (legitimate repeat charges)</button>
          </Card>))}</div>))}

      {tab === 'flags' && (flagCounts.length === 0 ? <Card><Empty title="No import flags" /></Card> : (
        <div className="grid md:grid-cols-2 gap-3">{flagCounts.map(([f, l]) => { const m = FLAG_LABEL[f]; return (
          <Card key={f} title={<span className="flex items-center gap-2">{m.label}<Chip color={m.tone === 'red' ? '#ef4444' : m.tone === 'amber' ? '#f59e0b' : m.tone === 'blue' ? '#6366f1' : '#64748b'}>{l.length}</Chip></span>} actions={has('run_rules') && <button className="btn btn-sm" onClick={async () => { await clearFlag(l.map((c) => c.id), f); toast.ok('Cleared'); }}>Clear all</button>}>
            <p className="text-xs muted mb-2">{m.help}</p><div className="flex gap-1.5 flex-wrap">{l.slice(0, 14).map((c) => <button key={c.id} className="chip panel2 hover:border-brand-500" onClick={() => st.openClaim(c.id)}>{c.claim_no}</button>)}{l.length > 14 && <span className="text-xs muted self-center">+{l.length - 14}</span>}</div></Card>); })}</div>))}

      {tab === 'payers' && <Card title="Payer names not in the directory" pad={false}><div className="px-4 pb-4">{unknownPayers.length === 0 ? <Empty title="All payer names are known" /> : <PayerFixer names={unknownPayers} />}</div></Card>}
      {node}<span className="hidden"><UserPlus size={1} /></span>
    </div>
  );
}
