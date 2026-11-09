import { addDays, endOfMonth, format, startOfMonth, startOfYear, subMonths } from 'date-fns';
import { DateField } from './CalendarPicker';

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
export type RangeKey = 'today' | '7' | '14' | '30' | '90' | 'mtd' | 'last_month' | 'qtd' | 'ytd' | 'custom';
export const RANGE_LABEL: Record<RangeKey, string> = { today: 'Today', '7': 'Last 7 days', '14': 'Last 14 days', '30': 'Last 30 days', '90': 'Last 90 days', mtd: 'Month to date', last_month: 'Last month', qtd: 'Quarter to date', ytd: 'Year to date', custom: 'Custom range…' };
export function rangeFor(k: RangeKey, now = new Date()): { from: string; to: string } {
  const t = iso(now);
  switch (k) {
    case 'today': return { from: t, to: t };
    case '7': case '14': case '30': case '90': return { from: iso(addDays(now, -(Number(k) - 1))), to: t };
    case 'mtd': return { from: iso(startOfMonth(now)), to: t };
    case 'last_month': { const m = subMonths(now, 1); return { from: iso(startOfMonth(m)), to: iso(endOfMonth(m)) }; }
    case 'qtd': return { from: iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to: t };
    case 'ytd': return { from: iso(startOfYear(now)), to: t };
    default: return { from: t, to: t };
  }
}
export const matchRange = (from: string, to: string): RangeKey => (['today', '7', '14', '30', '90', 'mtd', 'last_month', 'qtd', 'ytd'] as RangeKey[]).find((k) => { const r = rangeFor(k); return r.from === from && r.to === to; }) || 'custom';

/** Preset dropdown + custom From → To calendars. Picking a preset fills the dates; editing a date switches to “Custom range”. */
export function DateRangeFilter({ from, to, onChange, presets = ['today', '7', '30', 'mtd', 'last_month', '90', 'ytd'], className = '' }: { from: string; to: string; onChange: (r: { from: string; to: string }) => void; presets?: RangeKey[]; className?: string }) {
  const cur = matchRange(from, to);
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <select className="input !w-auto" aria-label="Date range" value={cur} onChange={(e) => { const k = e.target.value as RangeKey; if (k !== 'custom') onChange(rangeFor(k)); else onChange({ from, to }); }}>
        {presets.map((k) => <option key={k} value={k}>{RANGE_LABEL[k]}</option>)}{!presets.includes(cur) && cur !== 'custom' && <option value={cur}>{RANGE_LABEL[cur]}</option>}<option value="custom">{RANGE_LABEL.custom}</option>
      </select>
      <DateField className="!w-[150px]" value={from} clearable={false} onChange={(d) => d && onChange({ from: d, to: d > to ? d : to })} />
      <span className="muted text-xs">to</span>
      <DateField className="!w-[150px]" value={to} clearable={false} min={from} onChange={(d) => d && onChange({ from: d < from ? d : from, to: d })} />
    </div>
  );
}
