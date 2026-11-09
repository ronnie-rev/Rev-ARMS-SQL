import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { useStore } from '../store';
import { Card, Chip } from './ui';
import { downloadFile, fmtDate, money } from '../lib/utils';
import { splitDenials } from '../lib/kb';
import { useClaimSearch } from '../lib/search';
import type { Claim } from '../lib/types';

const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Paste a list of claim / account / encounter numbers (from a client email, a payer list…) → status of each, exportable. */
export function BulkLookup() {
  const { claims, openClaim, profiles, has } = useStore(); const [text, setText] = useState(''); const { search } = useClaimSearch();
  const idx = useMemo(() => { const m = new Map<string, Claim>(); for (const c of claims) for (const k of [c.claim_no, c.account_id, c.encounter_no, ...(c.aliases || [])]) if (k && clean(String(k)).length >= 4) m.set(clean(String(k)), c); return m; }, [claims]);
  const keys = useMemo(() => [...new Set(text.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => clean(x).length >= 4))], [text]);
  const rows = keys.map((k) => ({ k, c: idx.get(clean(k)) })); const found = rows.filter((r) => r.c); const owner = (id: string | null) => profiles.find((p) => p.id === id)?.full_name || '—';
  const exp = () => downloadFile('lookup.csv', ['Searched,Found,Claim,Payer,Balance,Status,Owner,Closed', ...rows.map((r) => [r.k, r.c ? 'yes' : 'no', r.c?.claim_no || '', r.c?.payer || '', r.c?.balance ?? '', r.c?.status || '', owner(r.c?.assigned_to ?? null), r.c?.closed_at ? 'yes' : ''].join(','))].join('\n'), 'text/csv');
  return (
    <Card title="Bulk claim lookup" actions={rows.length > 0 && has('export') && <button className="btn btn-sm" onClick={exp}>CSV</button>}>
      <textarea className="input" rows={3} placeholder="Paste claim #s, account #s or encounter #s (any separator)" value={text} onChange={(e) => setText(e.target.value)} />
      {rows.length > 0 && <><div className="text-xs muted mt-2">{found.length} of {rows.length} found{found.length < rows.length && ` · ${rows.length - found.length} not in the tool`}</div>
        <div className="max-h-64 overflow-auto mt-1"><table className="tbl w-full text-sm"><tbody>{rows.map((r) => <tr key={r.k} className={r.c ? 'cursor-pointer' : ''} onClick={() => r.c && openClaim(r.c.id)}><td>{r.k}</td>{r.c ? <><td>{r.c.payer}</td><td className="text-right">{money(r.c.balance)}</td><td>{r.c.closed_at ? <Chip color="#64748b">closed</Chip> : r.c.status}</td><td className="muted">{owner(r.c.assigned_to)}</td></> : <td colSpan={4} className="text-xs"><span className="text-red-500">not found</span>{(() => { const alt = search(r.k, 2); return alt.length ? <span className="muted"> · did you mean {alt.map((a) => <button key={a.id} className="link ml-1" onClick={(e) => { e.stopPropagation(); openClaim(a.id); }}>{a.claim_no}</button>)}?</span> : null; })()}</td>}</tr>)}</tbody></table></div></>}
    </Card>
  );
}

/** One printable page to have in hand on a payer call: identifiers to quote, what to ask, and blanks for the reference number and rep. */
export function CallPrep() {
  const { claims, config } = useStore(); const [q, setQ] = useState(''); const c = useMemo(() => { const k = clean(q); return k.length >= 4 ? claims.find((x) => clean(x.claim_no) === k) || claims.find((x) => clean(x.claim_no).includes(k)) : undefined; }, [q, claims]);
  const pm = (config.find((o) => o.category === 'payer' && o.value.toLowerCase() === (c?.payer || '').toLowerCase())?.meta || {}) as Record<string, string>; const codes = splitDenials(c?.denial_codes);
  const asks = c ? [codes.length ? `Confirm the denial reason for ${codes.join(', ')} and which exact document or fix resolves it` : 'What is the current status — received, in process, paid or denied?', 'Was the claim processed under the same member ID, DOS and billed amount we have?', 'Payer claim # (ICN/DCN) and the date it was received', 'If paid: check/EFT number, date and amount. If denied: appeal level, deadline and where to send it', 'Can the rep reprocess or adjust on this call? If not, what is the expected turnaround?', 'Call reference # and rep’s name'] : [];
  return (
    <Card title="Payer call prep" actions={c && <button className="btn btn-sm" onClick={() => window.print()}><Printer size={13} />Print</button>}>
      <input className="input" placeholder="Claim number…" value={q} onChange={(e) => setQ(e.target.value)} />
      {q && !c && <div className="text-xs muted mt-2">No claim matches.</div>}
      {c && <div className="mt-3 text-[13px] space-y-2"><div className="grid grid-cols-2 gap-x-6 gap-y-0.5"><div><span className="muted text-[11px] mr-1">Payer</span><b>{c.payer}</b> {pm.phone && <span>· {pm.phone}</span>}</div><div><span className="muted text-[11px] mr-1">Claim</span><b>{c.claim_no}</b></div><div><span className="muted text-[11px] mr-1">DOS</span>{fmtDate(c.dos)}</div><div><span className="muted text-[11px] mr-1">Balance</span>{money(c.balance, true)}</div><div><span className="muted text-[11px] mr-1">CPT</span>{c.cpt || '—'}</div><div><span className="muted text-[11px] mr-1">Provider</span>{c.provider || '—'}</div>{c.custom?.rcm_icn && <div><span className="muted text-[11px] mr-1">Payer ICN</span>{c.custom.rcm_icn}</div>}{c.custom?.rcm_member_id && <div><span className="muted text-[11px] mr-1">Member ID</span>{c.custom.rcm_member_id}</div>}</div>
        <div className="label">Ask</div><ol className="list-decimal ml-5 space-y-1">{asks.map((a) => <li key={a}>{a}</li>)}</ol>
        <div className="grid grid-cols-3 gap-3 pt-2">{['Call ref #', 'Rep name', 'Next step / date'].map((l) => <div key={l} className="border-b pt-4 text-[11px] muted">{l}</div>)}</div></div>}
    </Card>
  );
}
