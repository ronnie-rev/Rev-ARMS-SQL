import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Search, Star } from 'lucide-react';
import { useStore } from '../store';
import { cn, moneyShort, sum } from '../lib/utils';

/** Workspace scope: choose one, several or all practices. "My clients" = admin-assigned coverage + your pins. */
export function ScopeSwitcher() {
  const { clients, clientScope, setClientScope, claims, pinnedClients, togglePin, myClientIds, me } = useStore();
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; window.addEventListener('mousedown', h); return () => window.removeEventListener('mousedown', h); }, [open]);
  const active = clients.filter((c) => c.active); const mine = myClientIds().filter((id) => active.some((c) => c.id === id));
  const stats = useMemo(() => { const m = new Map<string, { ar: number; n: number }>(); claims.forEach((c) => { if (c.closed_at) return; const e = m.get(c.client_id) || { ar: 0, n: 0 }; e.ar += c.balance; e.n++; m.set(c.client_id, e); }); return m; }, [claims]);
  const sel = clientScope.length ? active.filter((c) => clientScope.includes(c.id)) : [];
  const label = !sel.length ? 'All clients' : sel.length === 1 ? sel[0].name : `${sel.length} clients`;
  const toggle = (id: string) => setClientScope(clientScope.includes(id) ? clientScope.filter((x) => x !== id) : [...clientScope, id]);
  const list = active.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(pinnedClients.includes(b.id) || mine.includes(b.id)) - Number(pinnedClients.includes(a.id) || mine.includes(a.id)) || a.name.localeCompare(b.name));
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 h-8 pl-2 pr-2.5 rounded-lg border hair hover:border-[color:var(--line2)] transition text-[13px] font-medium" style={{ background: 'var(--panel)', boxShadow: 'var(--sh1)' }}>
        <span className="flex -space-x-1.5">{(sel.length ? sel : active).slice(0, 3).map((c) => <span key={c.id} className="w-4 h-4 rounded-full ring-2" style={{ background: c.color, ['--tw-ring-color' as any]: 'var(--panel)' }} />)}</span>
        <span className="max-w-[160px] truncate">{label}</span><ChevronDown size={13} className="muted" /></button>
      {open && (
        <div className="absolute right-0 top-10 w-[340px] panel z-50 animate-pop overflow-hidden" style={{ boxShadow: 'var(--sh3)' }}>
          <div className="p-3 border-b hair"><div className="relative"><Search size={13} className="absolute left-2.5 top-2.5 muted" /><input autoFocus className="input !pl-8" placeholder="Find a client…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="flex gap-1.5 mt-2"><button className={cn('chip border', !clientScope.length ? 'bg-brand-500 text-white border-transparent' : 'panel2 muted')} onClick={() => setClientScope([])}>All</button>
              <button disabled={!mine.length} className={cn('chip border', mine.length && clientScope.length === mine.length && mine.every((i) => clientScope.includes(i)) ? 'bg-brand-500 text-white border-transparent' : 'panel2 muted', !mine.length && 'opacity-40')} onClick={() => setClientScope(mine)}>My clients ({mine.length})</button>
              {clientScope.length > 0 && <button className="chip panel2 muted ml-auto" onClick={() => setClientScope([])}>Clear</button>}</div></div>
          <div className="max-h-[320px] overflow-auto p-1.5">{list.map((c) => { const on = clientScope.includes(c.id); const st = stats.get(c.id); return (
            <div key={c.id} onClick={() => toggle(c.id)} className={cn('flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer group', on ? 'bg-brand-500/10' : 'hover:bg-[var(--panel2)]')}>
              <span className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0', on ? 'bg-brand-500 border-transparent' : 'hair')}>{on && <Check size={11} className="text-white" />}</span>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} /><div className="min-w-0 flex-1"><div className="text-[13px] font-medium truncate">{c.name}</div><div className="text-[11px] muted">{c.pms}{st ? ` · ${moneyShort(st.ar)} · ${st.n} claims` : ''}</div></div>
              <button title={pinnedClients.includes(c.id) ? 'Unpin from My clients' : 'Pin to My clients'} onClick={(e) => { e.stopPropagation(); togglePin(c.id); }} className={cn('shrink-0', pinnedClients.includes(c.id) || (me()?.client_ids || []).includes(c.id) ? 'text-amber-400' : 'muted opacity-0 group-hover:opacity-100')}><Star size={14} fill={pinnedClients.includes(c.id) || (me()?.client_ids || []).includes(c.id) ? 'currentColor' : 'none'} /></button></div>); })}
            {list.length === 0 && <div className="p-6 text-center text-sm muted">No client matches.</div>}</div>
          <div className="px-3 py-2 border-t hair text-[11px] muted flex justify-between"><span>{sum([...stats.entries()].filter(([id]) => !clientScope.length || clientScope.includes(id)).map(([, v]) => v.ar)) > 0 ? `${moneyShort(sum([...stats.entries()].filter(([id]) => !clientScope.length || clientScope.includes(id)).map(([, v]) => v.ar)))} open AR in scope` : ''}</span><span>Esc to close</span></div>
        </div>)}
      <span className="hidden"><Building2 size={1} /></span>
    </div>
  );
}
