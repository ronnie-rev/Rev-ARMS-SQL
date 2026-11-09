import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Searchable multi-select popover used by report and pivot filters. */
export function Multi({ label, options, value, onChange }: { label: string; options: { v: string; l: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState('');
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }; window.addEventListener('keydown', h, true); return () => window.removeEventListener('keydown', h, true); }, [open]);
  const shown = options.filter((o) => o.l.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="relative">
      <div className="label">{label}</div>
      <button type="button" className="input flex items-center justify-between text-left" onClick={() => setOpen(!open)}><span className="truncate">{value.length ? `${value.length} selected` : 'All'}</span><ChevronDown size={13} /></button>
      {open && <><div className="fixed inset-0 z-30" onClick={() => setOpen(false)} /><div className="absolute z-40 mt-1 w-64 panel p-2 shadow-xl max-h-72 overflow-auto">
        <input className="input mb-2" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="flex gap-2 text-[11px] mb-1"><button className="underline" onClick={() => onChange(options.map((o) => o.v))}>All</button><button className="underline" onClick={() => onChange([])}>Clear</button></div>
        {shown.map((o) => <label key={o.v} className="flex items-center gap-2 py-1 text-xs cursor-pointer"><input type="checkbox" checked={value.includes(o.v)} onChange={() => onChange(value.includes(o.v) ? value.filter((x) => x !== o.v) : [...value, o.v])} />{o.l}</label>)}
        {!shown.length && <div className="text-xs muted p-2">No matches</div>}
      </div></>}
    </div>
  );
}
