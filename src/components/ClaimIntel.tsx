import { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, ExternalLink, Link2, Minus, PhoneCall } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { useClaims, useCollect, useIntel, usePhi, type EClaim } from '../hooks';
import { Chip } from './ui';
import { money } from '../lib/utils';

export function ClaimIntel({ ec }: { ec: EClaim }) {
  const intel = useIntel(); const all = useClaims(true); const config = useStore((s) => s.config); const openClaim = useStore((s) => s.openClaim);
  const phi = usePhi();
  const col = useCollect(useMemo(() => [ec], [ec]), intel).get(ec.c.id)!;
  const payer = config.find((o) => o.category === 'payer' && o.value.toLowerCase() === (ec.c.payer || '').toLowerCase());
  const related = useMemo(() => all.filter((x) => x.c.id !== ec.c.id && x.c.client_id === ec.c.client_id && ((ec.c.account_id && x.c.account_id === ec.c.account_id) || (ec.c.patient_name && x.c.patient_name === ec.c.patient_name))).slice(0, 6), [all, ec]);
  const pc = col.p >= 0.6 ? '#22c55e' : col.p >= 0.35 ? '#f59e0b' : '#ef4444';
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <div className="panel2 p-3">
        <div className="flex items-center justify-between"><div className="label !mb-0">Collectability</div><span className="text-lg font-extrabold" style={{ color: pc }}>{Math.round(col.p * 100)}%</span></div>
        <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: 'var(--line)' }}><div className="h-full" style={{ width: col.p * 100 + '%', background: pc }} /></div>
        <div className="text-[11px] muted mt-1.5">Expected recovery <b className="text-inherit">{money(col.expected)}</b> of {money(ec.c.balance)}</div>
        <ul className="mt-2 space-y-1">{col.factors.map((f, i) => (
          <li key={i} className="flex gap-1.5 text-[11px] items-start">{f.effect === 'up' ? <ArrowUpRight size={12} className="text-green-500 mt-0.5 shrink-0" /> : f.effect === 'down' ? <ArrowDownRight size={12} className="text-red-400 mt-0.5 shrink-0" /> : <Minus size={12} className="muted mt-0.5 shrink-0" />}<span>{f.label}</span></li>))}</ul>
      </div>
      <div className="space-y-3">
        <div className="panel2 p-3">
          <div className="flex items-center justify-between"><div className="label !mb-0">Payer</div><Link to={`/payers/${encodeURIComponent(ec.c.payer || 'Unknown')}`} className="text-[11px] text-brand-400 flex items-center gap-1">Intel <ExternalLink size={10} /></Link></div>
          <div className="font-semibold text-sm mt-1">{ec.c.payer}</div>
          {payer ? <div className="text-[11px] space-y-0.5 mt-1"><div className="flex items-center gap-1.5"><PhoneCall size={11} className="muted" />{payer.meta.phone || '—'}{payer.meta.portal && <a className="text-brand-400 ml-2 underline" href={payer.meta.portal} target="_blank" rel="noopener noreferrer">portal</a>}</div>
            <div className="muted">Timely filing {payer.meta.tf_days ?? '—'}d · appeals {payer.meta.appeal_days ?? '—'}d</div>{payer.meta.tips && <div className="italic muted">“{payer.meta.tips}”</div>}</div> : <div className="text-[11px] muted mt-1">No contact info yet — add it in Admin → Payers.</div>}
        </div>
        <div className="panel2 p-3"><div className="label flex items-center gap-1"><Link2 size={11} />Related claims</div>
          {related.length === 0 ? <div className="text-[11px] muted">None for this patient/account.</div> : <div className="space-y-1">{related.map((x) => (
            <button key={x.c.id} onClick={() => openClaim(x.c.id)} className="w-full flex justify-between items-center text-[11px] hover:bg-[var(--panel)] rounded px-1.5 py-1"><span><b>{x.c.claim_no}</b> <span className="muted">{phi(x.c.patient_name)}</span></span><span className="flex gap-1.5 items-center"><Chip color={x.bucket?.color}>{x.age}d</Chip>{money(x.c.balance)}</span></button>))}</div>}
        </div>
      </div>
    </div>
  );
}
