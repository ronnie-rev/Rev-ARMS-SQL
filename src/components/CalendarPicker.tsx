import { useEffect, useRef, useState } from 'react';
import { addDays, addMonths, endOfMonth, format, getDay, parseISO, startOfMonth } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/** eCW-style month calendar: arrows, month + year dropdowns, Su–Sa grid, orange selected day, "Today" button. */
export function CalendarPanel({ value, onChange, min }: { value?: string | null; onChange: (d: string) => void; min?: string }) {
  const sel = value ? parseISO(value) : null; const [view, setView] = useState(() => startOfMonth(sel || new Date())); const today = iso(new Date());
  const lead = getDay(view); const days = endOfMonth(view).getDate(); const y0 = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => y0 - 3 + i); if (!years.includes(view.getFullYear())) years.push(view.getFullYear()); years.sort();
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => addDays(view, i))];
  return (
    <div className="cal w-[260px] rounded-xl overflow-hidden border" style={{ borderColor: 'var(--line2)', background: 'var(--panel)', boxShadow: 'var(--sh3)' }}>
      <div className="cal-head flex items-center gap-1.5 px-2 py-2">
        <button type="button" aria-label="Previous month" className="cal-arrow" onClick={() => setView(addMonths(view, -1))}><ChevronLeft size={16} /></button>
        <select aria-label="Month" className="cal-sel" value={view.getMonth()} onChange={(e) => setView(new Date(view.getFullYear(), Number(e.target.value), 1))}>{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
        <select aria-label="Year" className="cal-sel" value={view.getFullYear()} onChange={(e) => setView(new Date(Number(e.target.value), view.getMonth(), 1))}>{years.map((y) => <option key={y}>{y}</option>)}</select>
        <button type="button" aria-label="Next month" className="cal-arrow ml-auto" onClick={() => setView(addMonths(view, 1))}><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[12px] font-bold px-2 pt-2 pb-1">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="grid grid-cols-7 text-center text-[13px] px-2 pb-1">{cells.map((d, i) => { if (!d) return <div key={i} />; const k = iso(d); const on = value === k; const off = !!min && k < min; return <button key={k} type="button" disabled={off} onClick={() => onChange(k)} className={`h-8 rounded-md tabular-nums ${on ? 'cal-on' : off ? 'opacity-30' : 'hover:bg-[var(--panel2)]'} ${k === today && !on ? 'font-extrabold underline' : ''}`}>{d.getDate()}</button>; })}</div>
      <div className="flex justify-end px-2 pb-2"><button type="button" className="cal-today" onClick={() => onChange(today)}>Today</button></div>
    </div>
  );
}

/** Button that shows the date and opens the calendar as a popover. */
export function DateField({ value, onChange, disabled, min, placeholder = 'Pick a date', clearable = true, className = '' }: { value?: string | null; onChange: (d: string | null) => void; disabled?: boolean; min?: string; placeholder?: string; clearable?: boolean; className?: string }) {
  const [open, setOpen] = useState(false); const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 }); const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }; window.addEventListener('keydown', h, true); return () => window.removeEventListener('keydown', h, true); }, [open]);
  const toggle = () => { if (disabled) return; const r = ref.current!.getBoundingClientRect(); const x = Math.min(r.left, window.innerWidth - 276); const below = window.innerHeight - r.bottom > 330; setPos({ x: Math.max(8, x), y: below ? r.bottom + 6 : Math.max(8, r.top - 326) }); setOpen(!open); };
  return (
    <span className={`relative inline-block ${className}`}>
      <button ref={ref} type="button" disabled={disabled} onClick={toggle} className="input flex items-center gap-2 text-left !min-h-[30px]"><CalendarDays size={13} className="muted shrink-0" /><span className={value ? '' : 'muted'}>{value ? format(parseISO(value), 'MM/dd/yyyy') : placeholder}</span>{clearable && value && !disabled && <span role="button" aria-label="Clear date" className="ml-auto muted hover:text-red-500" onClick={(e) => { e.stopPropagation(); onChange(null); }}><X size={12} /></span>}</button>
      {open && <><div className="fixed inset-0 z-[60]" onMouseDown={() => setOpen(false)} /><div className="fixed z-[61] animate-pop" style={{ left: pos.x, top: pos.y }}><CalendarPanel value={value} min={min} onChange={(d) => { onChange(d); setOpen(false); }} /></div></>}
    </span>
  );
}
