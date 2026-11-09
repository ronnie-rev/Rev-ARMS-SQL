import { useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip, PageHeader, Stat, toast, useConfirm } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { AppealBuilder } from '../components/AppealBuilder';
import { detectUnderpayments, systemicUnderpay, UNDER_LABEL } from '../lib/engine/underpay';
import { resolveReimbCfg, SRC_LABEL, type ExpectedSrc } from '../lib/engine/reimb';
import { fmtDate, money, todayISO } from '../lib/utils';

/** Money that was paid but not denied: paid vs contract allowable / expected reimbursement. */
export default function Underpay() {
  const { claims, clients, appeals, settings, inScope, has } = useStore(); const cfg = resolveReimbCfg(settings.reimb_cfg); const [client, setClient] = useState(''); const [dlg, setDlg] = useState<string | null>(null); const [hideWO, setHideWO] = useState(true);
  const all = useMemo(() => detectUnderpayments(claims.filter((c) => inScope(c.client_id)), cfg, todayISO()), [claims, cfg, inScope]);
  const list = useMemo(() => all.filter((u) => (!client || u.claim.client_id === client) && (!hideWO || !u.writtenOff)), [all, client, hideWO]);
  const sys = useMemo(() => systemicUnderpay(list, cfg), [list, cfg]);
  const disputed = useMemo(() => new Set(appeals.filter((a) => a.kind === 'underpayment_dispute').map((a) => a.claim_id)), [appeals]);
  const total = list.reduce((a, u) => a + u.variance, 0); const withExpected = claims.filter((c) => c.expected_amt != null && !c.closed_at).length;
  const { createAppeal } = useStore(); const { confirm, node: confirmNode } = useConfirm(); const [busy, setBusy] = useState(false);
  const byPayer = useMemo(() => { const m = new Map<string, { n: number; amt: number; hi: typeof list }>(); for (const u of list) { const k = u.claim.payer || 'Unknown'; const e = m.get(k) || { n: 0, amt: 0, hi: [] }; e.n++; e.amt += u.variance; if (u.confidence === 'high' && !disputed.has(u.claim.id) && !u.writtenOff) e.hi.push(u); m.set(k, e); } return [...m.entries()].sort((a, b) => b[1].amt - a[1].amt).slice(0, 8); }, [list, disputed]);
  const draftAll = async (payer: string, items: typeof list) => {
    if (!(await confirm(`Create ${items.length} draft underpayment disputes for ${payer} (${money(items.reduce((a, u) => a + u.variance, 0))})? You can edit and send each from Appeals.`))) return;
    setBusy(true); try { for (const u of items.slice(0, 50)) await createAppeal({ claim_id: u.claim.id, kind: 'underpayment_dispute', level: 1, template: null, form_id: null, due_on: null, reason: `Paid ${money(u.received)} against ${money(u.expected)} expected`, amount_disputed: u.variance, letter: {} } as any); toast.ok(`${Math.min(50, items.length)} drafts created — see Appeals`); } finally { setBusy(false); }
  };
  const cn = (id: string) => clients.find((c) => c.id === id)?.name || '';
  return (
    <div className="space-y-4">
      <PageHeader title="Underpayments" sub="Paid below contract or expected reimbursement" actions={<select className="input !py-1 !w-auto" value={client} onChange={(e) => setClient(e.target.value)}><option value="">All clients</option>{clients.filter((c) => inScope(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Stat label="Claims short-paid" value={list.length} color="#f97316" /><Stat label="Money at stake" value={money(total)} color="#ef4444" /><Stat label="High confidence" value={list.filter((u) => u.confidence === 'high').length} sub="from a fee schedule" color="#22c55e" /><Stat label="Open claims with expected $" value={withExpected.toLocaleString('en-US')} color="#6366f1" /></div>
      {sys.length > 0 && <Card title="Systemic — same payer & CPT keeps short-paying">{sys.slice(0, 6).map((s) => <div key={s.payer + s.cpt} className="flex gap-2 py-1 text-sm"><Chip color="#ef4444">{s.n}×</Chip><div><b>{s.payer}</b> · CPT {s.cpt} <span className="muted">— {money(s.total)} short, avg {s.avgPct}% below expected{s.clients > 1 ? ` across ${s.clients} clients` : ''}. Raise a contract-level dispute.</span></div></div>)}</Card>}
      {has('work_claims') && byPayer.length > 0 && <Card title="Recoverable by payer — one-click draft disputes" pad={false}><div className="overflow-x-auto"><table className="tbl w-full text-sm"><thead><tr><th>Payer</th><th className="text-right">Claims</th><th className="text-right">Short by</th><th className="text-right">High confidence, not yet disputed</th><th /></tr></thead><tbody>{byPayer.map(([payer, e]) => <tr key={payer}><td>{payer}</td><td className="text-right">{e.n}</td><td className="text-right font-medium text-red-500">{money(e.amt)}</td><td className="text-right">{e.hi.length} · {money(e.hi.reduce((a, u) => a + u.variance, 0))}</td><td>{e.hi.length > 0 && <button className="btn btn-sm" disabled={busy} onClick={() => draftAll(payer, e.hi)}>Draft {Math.min(50, e.hi.length)} disputes</button>}</td></tr>)}</tbody></table></div></Card>}
      {confirmNode}
      <Card pad={false} actions={<label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={hideWO} onChange={(e) => setHideWO(e.target.checked)} />Hide written-off</label>}>
        <DataTable data={list} rowId={(u) => u.claim.id} exportName="underpayments" storageKey="underpay" empty={{ icon: <Scale size={28} />, title: withExpected ? 'No underpayments found' : 'No expected reimbursement yet', sub: withExpected ? 'Paid amounts match what was expected.' : 'Set fee schedules, payer % or a client GCR in Admin → Reimbursement, then post ERAs.' }} columns={[
          { id: 'claim', header: 'Claim', value: (u) => u.claim.claim_no, cell: (u) => <span className="font-mono text-xs">{u.claim.claim_no}</span>, width: 130 }, { id: 'client', header: 'Client', value: (u) => cn(u.claim.client_id), width: 150 }, { id: 'payer', header: 'Payer', value: (u) => u.claim.payer || '', width: 150 }, { id: 'dos', header: 'DOS', value: (u) => u.claim.dos || '', cell: (u) => fmtDate(u.claim.dos), width: 100 },
          { id: 'exp', header: 'Expected', value: (u) => u.expected, align: 'right', width: 120, cell: (u) => <span title={u.evidence.join('\n')}>{money(u.expected)} <span className="text-[10px] muted">{SRC_LABEL[u.claim.expected_src as ExpectedSrc]}</span></span> }, { id: 'rec', header: 'Received', value: (u) => u.received, align: 'right', width: 100, cell: (u) => money(u.received) },
          { id: 'short', header: 'Short', value: (u) => u.variance, align: 'right', width: 130, cell: (u) => <span className="font-semibold text-red-500">{money(u.variance)} <span className="text-[10px]">({u.pct}%)</span></span> },
          { id: 'kind', header: 'Kind', value: (u) => UNDER_LABEL[u.kind], width: 190, cell: (u) => <Chip color={u.confidence === 'high' ? '#22c55e' : '#f59e0b'}>{UNDER_LABEL[u.kind]}</Chip> },
          { id: 'act', header: '', sortable: false, value: () => '', width: 100, cell: (u) => (disputed.has(u.claim.id) ? <Chip color="#6366f1">Disputed</Chip> : has('work_claims') ? <button className="btn btn-sm btn-primary" onClick={() => setDlg(u.claim.id)}>Dispute</button> : null) },
        ]} />
      </Card>
      {dlg && <AppealBuilder claimId={dlg} kind="underpayment_dispute" onClose={() => setDlg(null)} />}
    </div>
  );
}
