import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { moneyShort, num } from '../lib/utils';

const Hatch = () => <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--line2)" strokeWidth="1.2" /></pattern></defs>;
const tip = { contentStyle: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, fontSize: 12, boxShadow: 'var(--sh2)', color: 'var(--text)' }, cursor: { fill: 'transparent' }, labelStyle: { color: 'var(--text)', fontWeight: 700 } };

export function BucketBars({ data, money = true, onClick, height = 240 }: { data: { name: string; value: number; count: number; color: string }[]; money?: boolean; onClick?: (name: string) => void; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -10, bottom: 0 }} barCategoryGap="22%">
        <Hatch />
        <XAxis dataKey="name" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => (money ? moneyShort(v) : num(v))} />
        <Tooltip {...tip} formatter={(v: any, _n: any, p: any) => [money ? `${moneyShort(v)} · ${p.payload.count} claims` : num(v), 'Balance']} />
        <Bar isAnimationActive={false} dataKey="value" radius={[14, 14, 14, 14]} background={{ fill: 'url(#hatch)', radius: 14 }} onClick={(d: any) => onClick?.(d.name)} cursor={onClick ? 'pointer' : undefined}>
          {data.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.92} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, onClick, height = 220 }: { data: { name: string; value: number; color: string }[]; onClick?: (n: string) => void; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="94%" paddingAngle={5} cornerRadius={10} stroke="none" onClick={(d: any) => onClick?.(d.name)} cursor={onClick ? 'pointer' : undefined}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip {...tip} formatter={(v: any) => num(v)} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><div className="text-xl font-extrabold">{num(total)}</div><div className="text-[10px] muted uppercase tracking-wider">claims</div></div>
    </div>
  );
}

export function HBars({ data, color = '#6366f1', money = true, onClick, height }: { data: { name: string; value: number }[]; color?: string; money?: boolean; onClick?: (n: string) => void; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height || Math.max(120, data.length * 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <Hatch /><XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={150} tickLine={false} axisLine={false} interval={0} tickFormatter={(s: string) => (s.length > 24 ? s.slice(0, 23) + '…' : s)} />
        <Tooltip {...tip} formatter={(v: any) => (money ? moneyShort(v) : num(v))} />
        <Bar isAnimationActive={false} dataKey="value" fill={color} radius={[10, 10, 10, 10]} barSize={12} background={{ fill: 'url(#hatch)', radius: 10 }} onClick={(d: any) => onClick?.(d.name)} cursor={onClick ? 'pointer' : undefined} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Trend({ data, keys, height = 220 }: { data: Record<string, any>[]; keys: { key: string; color: string; name?: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>{keys.map((k) => <linearGradient key={k.key} id={'g' + k.key} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={k.color} stopOpacity={0.45} /><stop offset="100%" stopColor={k.color} stopOpacity={0} /></linearGradient>)}</defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? moneyShort(v).replace('$', '') : String(v))} />
        <Tooltip {...tip} />
        {keys.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />}
        {keys.map((k) => <Area isAnimationActive={false} key={k.key} type="monotone" dataKey={k.key} name={k.name || k.key} stroke={k.color} strokeWidth={2} fill={`url(#g${k.key})`} />)}
      </AreaChart>
    </ResponsiveContainer>
  );
}
export { LineChart, Line };

/** payer × bucket heat matrix — each cell drills into the worklist */
export function Heatmap({ rows, cols, cell, onCell, colorFor }: {
  rows: string[]; cols: { label: string; color: string }[]; cell: (r: string, c: string) => { v: number; n: number }; onCell?: (r: string, c: string) => void; colorFor?: string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => cols.map((c) => cell(r, c.label).v)));
  return (
    <div className="overflow-auto">
      <table className="grid">
        <thead><tr><th>Payer</th>{cols.map((c) => <th key={c.label} style={{ textAlign: 'center' }}><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: c.color }} />{c.label}</th>)}<th style={{ textAlign: 'right' }}>Total</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const tot = cols.reduce((s, c) => s + cell(r, c.label).v, 0);
            return (
              <tr key={r}>
                <td className="font-semibold whitespace-nowrap">{r}</td>
                {cols.map((c) => {
                  const { v, n } = cell(r, c.label);
                  const a = v ? 0.12 + (v / max) * 0.78 : 0;
                  return (
                    <td key={c.label} style={{ textAlign: 'center', background: v ? `rgba(239,68,68,${a * 0.75})` : undefined, cursor: v && onCell ? 'pointer' : undefined }}
                      onClick={() => v && onCell?.(r, c.label)} title={v ? `${n} claims` : ''}>
                      {v ? moneyShort(v) : <span className="muted">·</span>}
                    </td>
                  );
                })}
                <td style={{ textAlign: 'right' }} className="font-bold">{moneyShort(tot)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
