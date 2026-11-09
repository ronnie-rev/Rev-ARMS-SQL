import { useMemo, useState } from 'react';
import { AlertOctagon, Check, RotateCcw, Search, Wallet } from 'lucide-react';
import { useStore } from '../store';
import { Avatar, Card, Chip, Empty, Field, Modal, PageHeader, Stat, toast } from '../components/ui';
import { DateField } from '../components/CalendarPicker';
import { usePhi } from '../hooks';
import { fmtDate, money, todayISO } from '../lib/utils';
import { isMgmt } from '../lib/roles';
import { OUTCOME_HELP, OUTCOME_LABEL, suggest, validateDecision, type Decision, type Outcome } from '../lib/engine/resolution';
import { dropoffClusters, learnedHint, payerOutcomeRates, triagePlan } from '../lib/engine/missingintel';
import type { Claim } from '../lib/types';

const PAGE = 100;
const CONF_COLOR = { high: '#22c55e', medium: '#f59e0b', low: '#94a3b8' } as const;
const OUTCOMES: Outcome[] = ['paid', 'written_off', 'patient', 'duplicate', 'void', 'transferred', 'restore'];
const days = (iso: string | null | undefined) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 864e5)) : 0);

/** Claims that dropped off the latest aging file: a supervisor / manager decides what really happened. */
export default function Missing() {
  const { claims, clients, workLog, recoveries, config, settings, me, inScope, resolveMissing, openClaim } = useStore(); const phi = usePhi();
  const [client, setClient] = useState(''); const [payer, setPayer] = useState(''); const [q, setQ] = useState(''); const [sort, setSort] = useState<'balance' | 'oldest'>('balance'); const [sel, setSel] = useState<Set<string>>(new Set()); const [page, setPage] = useState(1);
  const [dlg, setDlg] = useState<{ ids: string[]; outcome: Outcome } | null>(null);
  const rows = useMemo(() => claims.filter((c) => !c.closed_at && (c.flags || []).includes('missing_review') && inScope(c.client_id)), [claims, inScope]);
  const byTouch = useMemo(() => { const m = new Map<string, typeof workLog>(); const ids = new Set(rows.map((r) => r.id)); for (const w of workLog) if (ids.has(w.claim_id)) { const l = m.get(w.claim_id); if (l) l.push(w); else m.set(w.claim_id, [w]); } return m; }, [rows, workLog]);
  const era = useMemo(() => { const m = new Map<string, number>(); const cut = new Date(Date.now() - 90 * 864e5).toISOString(); for (const r of recoveries) if (r.claim_id && r.created_at > cut && r.basis === 'era835') m.set(r.claim_id, (m.get(r.claim_id) || 0) + r.amount); return m; }, [recoveries]);
  const rates = useMemo(() => payerOutcomeRates(claims.filter((c) => c.closed_at && inScope(c.client_id))), [claims, inScope]);
  const sug = useMemo(() => new Map(rows.map((c) => { const b = suggest(c, { workLog: byTouch.get(c.id) || [], eraPaid: era.get(c.id) }); const h = learnedHint(c, b, rates); return [c.id, { ...b, outcome: h.outcome as Outcome, confidence: h.confidence, reason: h.note ? `${b.reason} · ${h.note}` : b.reason }]; })), [rows, byTouch, era, rates]);
  const clusters = useMemo(() => dropoffClusters(rows, new Set([...era.entries()].filter(([, v]) => v > 0).map(([k]) => k))), [rows, era]); const plan = useMemo(() => triagePlan(rows, sug), [rows, sug]);
  const payers = useMemo(() => [...new Set(rows.map((r) => r.payer || '—'))].sort(), [rows]);
  const list = useMemo(() => rows.filter((c) => (!client || c.client_id === client) && (!payer || (c.payer || '—') === payer) && (!q || `${c.claim_no} ${c.claim_uid || ''} ${c.encounter_no || ''} ${c.patient_name || ''}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => (sort === 'balance' ? b.balance - a.balance : (a.missing_since || '').localeCompare(b.missing_since || ''))), [rows, client, payer, q, sort]);
  const total = rows.reduce((a, c) => a + c.balance, 0); const oldest = rows.reduce((m, c) => Math.max(m, days(c.missing_since)), 0);
  const cn = (id: string) => clients.find((c) => c.id === id)?.name || '';
  const lastTouch = (c: Claim) => { const t = (byTouch.get(c.id) || []).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]; return t ? `${fmtDate(t.work_date)} · ${t.user_name || ''}` : '—'; };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const shown = list.slice(0, page * PAGE); const allOn = shown.length > 0 && shown.every((c) => sel.has(c.id));
  void me; void settings;
  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2"><AlertOctagon className="text-red-500" size={26} />Missing from file</span>} sub="These claims were on an earlier aging file but not the latest. They stay open until a supervisor or manager records what happened — paid, written off, moved to the patient, or restored if the export was incomplete." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Waiting for a decision" value={rows.length.toLocaleString('en-US')} color="#ef4444" icon={<AlertOctagon size={16} />} />
        <Stat label="Balance at stake" value={money(total)} color="#f59e0b" icon={<Wallet size={16} />} />
        <Stat label="Oldest in queue" value={`${oldest}d`} color={oldest > 14 ? '#ef4444' : '#64748b'} sub="since first missed" />
        <Stat label="Selected" value={sel.size} sub={sel.size ? money(rows.filter((c) => sel.has(c.id)).reduce((a, c) => a + c.balance, 0)) : 'tick rows to act in bulk'} />
      </div>
      {rows.length > 0 && <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card title="Where to start"><div className="space-y-2 text-[13px]"><div className="flex items-center gap-2 flex-wrap"><Chip color="#16a34a">{plan.quickWins.length} evidence-backed</Chip><span className="muted">{money(plan.quickWinBalance)} — a posted payment or recovery already explains these</span>{plan.quickWins.length > 0 && <button className="btn btn-sm" onClick={() => setSel(new Set(plan.quickWins))}>Select them</button>}</div><div className="flex items-center gap-2 flex-wrap"><Chip color="#d97706">{plan.needHuman.length} need a human</Chip><span className="muted">{money(plan.needHumanBalance)} — no evidence either way; check the PMS</span></div>{rates.size > 0 && <div className="text-[11.5px] muted">Suggestions also learn from how past {[...rates.values()].reduce((a, r) => a + r.n, 0)} drop-offs were decided, per payer.</div>}</div></Card>
        <Card title="Bulk drop-offs" pad={false}>{clusters.length === 0 ? <div className="px-5 py-4 text-sm muted">No payer lost 5+ claims on the same file — these look like individual cases.</div> : <div className="divide-y hair">{clusters.slice(0, 4).map((c) => <div key={c.key} className="px-5 py-2.5 text-[13px]"><div className="flex items-center gap-2 flex-wrap"><b>{c.payer}</b><span className="muted">{c.n} claims · {money(c.balance)} · first missing {fmtDate(c.since)}</span><button className="btn btn-sm ml-auto" onClick={() => setSel(new Set(c.ids))}>Select {c.n}</button></div><div className="text-[12px] muted">{c.verdict}</div></div>)}</div>}</Card>
      </div>}
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 muted" /><input className="input !pl-8 !w-64" placeholder="Claim #, UID, encounter, patient…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <select className="input !w-auto" value={client} onChange={(e) => { setClient(e.target.value); setPage(1); }}><option value="">All clients</option>{clients.filter((c) => rows.some((r) => r.client_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input !w-auto" value={payer} onChange={(e) => { setPayer(e.target.value); setPage(1); }}><option value="">All payers</option>{payers.map((p) => <option key={p}>{p}</option>)}</select>
        <select className="input !w-auto" value={sort} onChange={(e) => setSort(e.target.value as 'balance' | 'oldest')}><option value="balance">Largest balance first</option><option value="oldest">Oldest first</option></select>
        {sel.size > 0 && <div className="ml-auto flex gap-1.5 flex-wrap"><button className="btn btn-primary btn-sm" onClick={() => setDlg({ ids: [...sel], outcome: 'paid' })}><Check size={13} />Mark paid</button><button className="btn btn-sm" onClick={() => setDlg({ ids: [...sel], outcome: 'written_off' })}>Write off</button><button className="btn btn-sm" onClick={() => setDlg({ ids: [...sel], outcome: 'patient' })}>To patient</button><button className="btn btn-sm" onClick={() => setDlg({ ids: [...sel], outcome: 'restore' })}><RotateCcw size={13} />Restore</button></div>}
      </div>
      {list.length === 0 ? <Card><Empty title={rows.length ? 'Nothing matches the filters' : 'Nothing is waiting for review'} sub={rows.length ? undefined : 'After each snapshot import, claims that are no longer on the file appear here.'} /></Card> : (
        <Card pad={false}><div className="overflow-auto"><table className="grid"><thead><tr><th style={{ width: 34 }}><input type="checkbox" checked={allOn} aria-label="Select all shown" onChange={() => setSel((s) => { const n = new Set(s); shown.forEach((c) => (allOn ? n.delete(c.id) : n.add(c.id))); return n; })} /></th><th>Claim</th><th>Client · payer</th><th style={{ textAlign: 'right' }}>Balance</th><th>Missing since</th><th>Last worked</th><th>Suggestion</th><th /></tr></thead><tbody>
          {shown.map((c) => { const s = sug.get(c.id)!; return (
            <tr key={c.id} className={sel.has(c.id) ? 'bg-brand-500/5' : ''}>
              <td><input type="checkbox" checked={sel.has(c.id)} aria-label={`Select ${c.claim_no}`} onChange={() => toggle(c.id)} /></td>
              <td><button className="font-semibold text-brand-400 hover:underline" onClick={() => openClaim(c.id)}>{c.claim_no}</button><div className="text-[11px] muted">{c.claim_uid || ''}{c.encounter_no ? ` · Enc ${c.encounter_no}` : ''}</div><div className="text-[11px] muted">{phi(c.patient_name)} · DOS {fmtDate(c.dos)}</div></td>
              <td className="text-[12.5px]">{cn(c.client_id)}<div className="muted text-[11px]">{c.payer}</div></td>
              <td style={{ textAlign: 'right' }} className="tabular-nums font-semibold">{money(c.balance, true)}</td>
              <td className="text-[12.5px]">{fmtDate(c.missing_since)}<div className="muted text-[11px]">{days(c.missing_since)}d · missed {c.missing_count || 1} file(s)</div></td>
              <td className="text-[12px]"><span className="inline-flex items-center gap-1.5">{lastTouch(c) !== '—' && <Avatar name={lastTouch(c).split(' · ')[1]} size={18} />}{lastTouch(c)}</span><div className="muted text-[11px]">{c.status}{c.end_action ? ` · ${c.end_action}` : ''}</div></td>
              <td><span title={s.reason}><Chip color={CONF_COLOR[s.confidence]}>{OUTCOME_LABEL[s.outcome].split(' — ')[0].split(' / ')[0]}</Chip></span><div className="text-[11px] muted max-w-[200px]">{s.reason}</div></td>
              <td className="whitespace-nowrap text-right"><button className="btn btn-sm" onClick={() => setDlg({ ids: [c.id], outcome: s.outcome })}>Decide…</button></td>
            </tr>); })}
        </tbody></table></div>
          {list.length > shown.length && <div className="p-3 text-center"><button className="btn btn-sm" onClick={() => setPage((p) => p + 1)}>Show more ({list.length - shown.length} left)</button></div>}</Card>)}
      {dlg && <DecideModal ids={dlg.ids} initial={dlg.outcome} onClose={() => setDlg(null)} onDone={() => { setSel(new Set()); setDlg(null); }} resolve={resolveMissing} />}
      <span className="hidden">{config.length}</span>
    </div>
  );
}

function DecideModal({ ids, initial, onClose, onDone, resolve }: { ids: string[]; initial: Outcome; onClose: () => void; onDone: () => void; resolve: (d: Decision[]) => Promise<{ done: number; skipped: { claimId: string; reason: string }[] }> }) {
  const { claims, config, settings, me } = useStore(); const sel = useMemo(() => claims.filter((c) => ids.includes(c.id)), [claims, ids]); const single = sel.length === 1 ? sel[0] : null;
  const [outcome, setOutcome] = useState<Outcome>(initial); const [on, setOn] = useState(todayISO()); const [note, setNote] = useState('');
  const [paid, setPaid] = useState(single ? single.balance : 0); const [adj, setAdj] = useState(0); const [pat, setPat] = useState(0); const [dupOf, setDupOf] = useState('');
  const endActions = config.filter((o) => o.category === 'end_action' && o.active).sort((a, b) => Number(!!b.meta.terminal) - Number(!!a.meta.terminal) || a.sort - b.sort);
  const guess = (o: Outcome) => (o === 'paid' ? endActions.find((e) => /paid|payment/i.test(e.value))?.value : o === 'written_off' ? endActions.find((e) => e.value === 'Adjustments')?.value : o === 'patient' ? endActions.find((e) => e.value === 'Billed To Patient')?.value : undefined) || '';
  const [ea, setEa] = useState(guess(initial)); const [sub, setSub] = useState('');
  const subs = config.filter((o) => o.category === 'end_sub' && o.parent === ea && o.active); const limit = Number((settings.workflow as any)?.writeOffLimit ?? 1000); const canOverride = isMgmt(me()?.role);
  const total = sel.reduce((a, c) => a + c.balance, 0); const writeOff = outcome === 'written_off' ? (single ? (adj > 0 ? adj : single.balance) : total) : single ? adj : 0;
  const pick = (o: Outcome) => { setOutcome(o); setEa(guess(o)); setSub(''); if (single) { setPaid(o === 'paid' ? single.balance : 0); setAdj(o === 'written_off' ? single.balance : 0); setPat(o === 'patient' ? single.balance : 0); } };
  const decisions = (): Decision[] => sel.map((c) => ({ claimId: c.id, outcome, paid: single ? paid : outcome === 'paid' ? c.balance : 0, adjusted: single ? adj : outcome === 'written_off' ? c.balance : 0, patient: single ? pat : outcome === 'patient' ? c.balance : 0, endAction: ea || null, endSub: sub || null, resolvedOn: on, note, duplicateOf: dupOf || null }));
  const errs = useMemo(() => { const e: string[] = []; const ctx = { writeOffLimit: limit, canOverrideLimit: canOverride }; for (const d of decisions()) { const m = validateDecision(claims.find((c) => c.id === d.claimId), d, ctx); if (m && !e.includes(m)) e.push(m); } return e; }, [outcome, paid, adj, pat, on, note, ea, dupOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => { const r = await resolve(decisions()); if (r.done) toast.ok(`${r.done} claim${r.done === 1 ? '' : 's'} ${outcome === 'restore' ? 'restored to the worklist' : 'resolved and closed'}${r.skipped.length ? ` · ${r.skipped.length} skipped (${r.skipped[0].reason})` : ''}`); else toast.err(r.skipped[0]?.reason || 'Nothing changed'); if (r.done) onDone(); };
  return (
    <Modal open onClose={onClose} wide title={single ? `Resolve ${single.claim_no}` : `Resolve ${sel.length} claims`} footer={<><span className="mr-auto text-xs muted">{errs[0] ? <span className="text-red-500">{errs[0]}</span> : outcome === 'restore' ? 'Goes back to the worklist unchanged.' : `Closes ${sel.length} claim${sel.length === 1 ? '' : 's'} on ${fmtDate(on)} and records the end action, a work-log entry and the recovery.`}</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={errs.length > 0} onClick={go}>{outcome === 'restore' ? 'Restore' : 'Confirm & close'}</button></>}>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="space-y-2">{OUTCOMES.map((o) => <label key={o} className={`flex gap-2.5 items-start rounded-xl border p-2.5 cursor-pointer ${outcome === o ? 'border-brand-400 bg-brand-500/5' : 'border-black/10 dark:border-white/10'}`}><input type="radio" name="oc" className="mt-1" checked={outcome === o} onChange={() => pick(o)} /><span><b className="text-[13px]">{OUTCOME_LABEL[o]}</b><span className="block text-[11.5px] muted">{OUTCOME_HELP[o]}</span></span></label>)}</div>
        <div className="space-y-3">
          {outcome !== 'restore' && <><div className="grid grid-cols-2 gap-3"><Field label="Date resolved"><DateField value={on} onChange={(d) => d && setOn(d)} clearable={false} /></Field><Field label={single ? `Balance ${money(single.balance, true)}` : `${sel.length} claims · ${money(total)}`}>{single ? <span className="text-xs muted">Split it below if needed</span> : <span className="text-xs muted">Each claim uses its own balance</span>}</Field></div>
            {single && <div className="grid grid-cols-3 gap-2"><Field label="Paid $"><input className="input" type="number" min={0} step="0.01" value={paid} onChange={(e) => setPaid(Number(e.target.value))} /></Field><Field label="Adjusted $"><input className="input" type="number" min={0} step="0.01" value={adj} onChange={(e) => setAdj(Number(e.target.value))} /></Field><Field label="Patient $"><input className="input" type="number" min={0} step="0.01" value={pat} onChange={(e) => setPat(Number(e.target.value))} /></Field></div>}
            <div className="grid grid-cols-2 gap-3"><Field label="End action"><select className="input" value={ea} onChange={(e) => { setEa(e.target.value); setSub(''); }}><option value="">— keep current —</option>{endActions.map((o) => <option key={o.id} value={o.value}>{o.value}{o.meta.terminal ? ' (closes)' : ''}</option>)}</select></Field><Field label="Sub-category"><select className="input" value={sub} disabled={!subs.length} onChange={(e) => setSub(e.target.value)}><option value="">—</option>{subs.map((o) => <option key={o.id}>{o.value}</option>)}</select></Field></div>
            {outcome === 'duplicate' && <Field label="Duplicate of (claim #)"><input className="input" value={dupOf} onChange={(e) => setDupOf(e.target.value)} /></Field>}</>}
          <Field label={outcome === 'written_off' ? 'Reason (required)' : 'Note'} hint={writeOff > limit ? (canOverride ? `Over the $${limit.toLocaleString('en-US')} limit — you are approving as ${me()?.role === 'sr_mgmt' ? 'Sr. Management' : 'a manager'}.` : `Over the $${limit.toLocaleString('en-US')} limit — a manager must approve.`) : undefined}><textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={outcome === 'paid' ? 'Check / EFT #, where you confirmed it' : outcome === 'written_off' ? 'e.g. timely filing exceeded, approved by client' : 'Optional'} /></Field>
        </div>
      </div>
    </Modal>
  );
}
