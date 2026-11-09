import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useStore } from '../../store';
import { Card, Chip } from '../../components/ui';
import Library from '../Library';
import type { Kb } from '../../lib/kb';

type Sec = 'codes' | 'deadlines' | 'payers' | 'tables';
const SECS: [Sec, string][] = [['codes', 'Denial & remark codes'], ['deadlines', 'Deadlines & appeal levels'], ['payers', 'Payers'], ['tables', 'Code tables & glossary']];

function Codes({ kb, go }: { kb: Kb; go: (p: Record<string, string>) => void }) {
  const [q, setQ] = useState(''); const [kind, setKind] = useState<'carc' | 'rarc'>('carc'); const [grp, setGrp] = useState('');
  const t = q.trim().toLowerCase(); const carc = kb.CARC.filter((r) => (!grp || (r[4] || '').startsWith(grp)) && (!t || r.join(' ').toLowerCase().includes(t))); const rarc = kb.RARC.filter((r) => !t || r.join(' ').toLowerCase().includes(t));
  return (
    <div className="space-y-3"><div className="flex flex-wrap gap-2 items-center"><div className="seg"><button className={kind === 'carc' ? 'on' : ''} onClick={() => setKind('carc')}>Adjustment reasons (CARC) · {kb.CARC.length}</button><button className={kind === 'rarc' ? 'on' : ''} onClick={() => setKind('rarc')}>Remarks (RARC) · {kb.RARC.length}</button></div>
      {kind === 'carc' && <select className="input !w-auto" value={grp} onChange={(e) => setGrp(e.target.value)}><option value="">All groups</option>{kb.GROUPS.map((g) => <option key={g[0]} value={g[0]}>{g[0]} — {g[1]}</option>)}</select>}
      <div className="relative ml-auto"><Search size={14} className="absolute left-2.5 top-2.5 muted" /><input className="input !pl-8 !w-72" placeholder="Filter by code or words…" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
      <Card pad={false}><div className="max-h-[68vh] overflow-auto"><table className="tbl w-full text-[13px]"><thead className="sticky top-0 bg-[var(--panel)]"><tr><th>Code</th><th>Meaning</th>{kind === 'carc' && <th>Usually</th>}<th>First move</th></tr></thead><tbody>
        {kind === 'carc' ? carc.map((r) => <tr key={r[0]} className="cursor-pointer hover:bg-white/5" onClick={() => go({ tab: 'find', q: r[0] })}><td className="font-semibold whitespace-nowrap">{r[0]}{r[4] && <div className="text-[10.5px] muted font-normal">{r[4]}</div>}</td><td>{r[1]}</td><td className="muted">{r[2]}</td><td>{r[3]}</td></tr>) : rarc.map((r) => <tr key={r[0]} className="cursor-pointer hover:bg-white/5" onClick={() => go({ tab: 'find', q: r[0] })}><td className="font-semibold">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody></table></div></Card></div>
  );
}

function Deadlines({ kb }: { kb: Kb }) {
  const { payerLimits, clients, has } = useStore(); const cn = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name || '—' : 'All clients');
  return (
    <div className="space-y-4">
      <Card title="Your filing & appeal limits" actions={has('manage_payer_rules') && <Link to="/admin?tab=limits" className="btn btn-sm">Edit limits</Link>} pad={false}>{payerLimits.length === 0 ? <div className="p-5 text-sm muted">No payer limits are set up yet. Add each payer’s timely-filing and appeal limits under <b>Admin → Filing limits</b> — the Deadline radar, claim chips and alerts all run from that one table.</div> : <div className="max-h-80 overflow-auto"><table className="tbl w-full text-[13px]"><thead className="sticky top-0 bg-[var(--panel)]"><tr><th>Payer</th><th>Plan</th><th>Client</th><th className="text-right">File within</th><th className="text-right">Appeal within</th><th className="text-right">Corrected claim</th></tr></thead><tbody>{[...payerLimits].sort((a, b) => a.payer.localeCompare(b.payer)).map((l) => <tr key={l.id}><td className="font-medium">{l.payer}</td><td className="muted">{l.plan_type || 'any'}</td><td className="muted">{cn(l.client_id)}</td><td className="text-right">{l.tfl_days != null ? `${l.tfl_days} d` : '—'}</td><td className="text-right">{l.afl_days != null ? `${l.afl_days} d` : '—'}</td><td className="text-right">{l.ccfl_days != null ? `${l.ccfl_days} d` : '—'}</td></tr>)}</tbody></table></div>}</Card>
      <p className="text-[12px] muted max-w-3xl">Filing and appeal limits come from each payer’s contract or the program rules and change over time. The standard ladders below are a guide for the program type; always confirm the limit on the denial letter or in the contract.</p>
      <div className="grid lg:grid-cols-2 gap-4">{kb.LADDERS.map(([name, rows, note]) => <Card key={name} title={name} pad={false}><div className="overflow-x-auto"><table className="tbl w-full text-[12.5px]"><thead><tr><th>Level</th><th>Who</th><th>File within</th><th>Decision in</th></tr></thead><tbody>{rows.map((r) => <tr key={r[0]}><td className="font-medium">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td className="muted">{r[3]}</td></tr>)}</tbody></table></div>{note && <div className="px-4 py-2 text-[12px] muted border-t hair">{note}</div>}</Card>)}</div>
    </div>
  );
}

function Payers({ kb }: { kb: Kb }) {
  return (
    <div className="space-y-5">
      <Library embedded only={['payers']} />
      <div className="grid lg:grid-cols-2 gap-4">{kb.PLAYBOOK.map(([name, codes, how, tip]) => <Card key={name} title={name}><div className="flex flex-wrap gap-1 mb-2">{codes.map((c) => <Chip key={c} color="#3b82ec">{c}</Chip>)}</div><p className="text-[13px]"><b>How they adjudicate.</b> {how}</p><p className="text-[13px] mt-2"><b>What works.</b> {tip}</p></Card>)}</div>
      <div className="grid lg:grid-cols-3 gap-4">{kb.PAYER_TOP.map((p) => <Card key={p.p} title={`${p.p} — top issues`}><ul className="space-y-3">{p.d.map((x) => <li key={x[0]} className="text-[12.5px]"><b>{x[0]}</b><div className="muted">{x[1]}</div><div>→ {x[2]}</div></li>)}</ul></Card>)}</div>
      <div className="grid lg:grid-cols-2 gap-4"><Card title="Medicare — how claims are processed" pad={false}><div className="divide-y hair">{kb.MEDICARE.map((m) => <details key={m[0]} className="px-4 py-2.5"><summary className="cursor-pointer text-[13px] font-medium">{m[0]}</summary><p className="text-[12.5px] muted mt-1.5">{m[1]}</p></details>)}</div></Card><Card title="UnitedHealthcare — what to know" pad={false}><div className="divide-y hair">{kb.UHC.map((m) => <details key={m[0]} className="px-4 py-2.5"><summary className="cursor-pointer text-[13px] font-medium">{m[0]}</summary><p className="text-[12.5px] muted mt-1.5">{m[1]}</p></details>)}</div></Card></div>
      <p className="text-[11.5px] muted">Payer behaviour changes. Treat these notes as a starting point and confirm in the payer’s current provider manual or contract.</p>
    </div>
  );
}

function Tables({ kb, table, q0 }: { kb: Kb; table: string; q0: string }) {
  const names = Object.keys(kb.REFDB); const [t, setT] = useState(names.includes(table) ? table : names[0]); const [q, setQ] = useState(q0); const rows = (kb.REFDB[t] || []).filter((r) => !q.trim() || r.join(' ').toLowerCase().includes(q.trim().toLowerCase()));
  const terms = useMemo(() => kb.CONCEPTS.filter((c) => q.trim().length >= 2 && `${c[1]} ${c[2]}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6), [kb, q]);
  return (
    <div className="space-y-3"><div className="flex flex-wrap gap-2 items-center"><select className="input !w-auto" value={t} onChange={(e) => setT(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</select><div className="relative ml-auto"><Search size={14} className="absolute left-2.5 top-2.5 muted" /><input className="input !pl-8 !w-72" placeholder="Filter this table…" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
      <Card pad={false}><div className="max-h-[64vh] overflow-auto"><table className="tbl w-full text-[13px]"><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j === 0 ? 'font-semibold whitespace-nowrap align-top' : ''}>{c}</td>)}</tr>)}{rows.length === 0 && <tr><td className="muted p-4">No rows match.</td></tr>}</tbody></table></div></Card>
      {terms.length > 0 && <Card title="Also in the glossary" pad={false}><div className="divide-y hair">{terms.map((c) => <div key={c[1]} className="px-4 py-2 text-[13px]"><b>{c[1]}</b> <span className="muted">— {c[2]}</span></div>)}</div></Card>}
    </div>
  );
}

export function Reference({ kb, sec, setSec, table, q, go }: { kb: Kb; sec: string; setSec: (s: string) => void; table: string; q: string; go: (p: Record<string, string>) => void }) {
  const cur = (SECS.find(([k]) => k === sec)?.[0] || 'codes') as Sec;
  return (
    <div className="space-y-4"><div className="seg">{SECS.map(([k, l]) => <button key={k} className={cur === k ? 'on' : ''} onClick={() => setSec(k)}>{l}</button>)}</div>
      {cur === 'codes' && <Codes kb={kb} go={go} />}{cur === 'deadlines' && <Deadlines kb={kb} />}{cur === 'payers' && <Payers kb={kb} />}{cur === 'tables' && <Tables kb={kb} table={table} q0={q} />}</div>
  );
}
