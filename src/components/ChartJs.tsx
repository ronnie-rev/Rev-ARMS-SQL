import { Chart as ChartJS, BarController, BarElement, CategoryScale, Filler, Legend, LineController, LineElement, LinearScale, PointElement, RadarController, RadialLinearScale, Tooltip } from 'chart.js';
import { Chart } from 'react-chartjs-2';
import type { ChartData, ChartOptions, ChartType } from 'chart.js';
import { PALETTE } from './chartPalette';
void PALETTE;

ChartJS.register(BarController, BarElement, CategoryScale, Filler, Legend, LineController, LineElement, LinearScale, PointElement, RadarController, RadialLinearScale, Tooltip);
const css = (v: string, d: string) => (typeof window === 'undefined' ? d : getComputedStyle(document.documentElement).getPropertyValue(v).trim() || d);


/** Thin wrapper over Chart.js (MIT). Loaded lazily by `LazyChart` so the library only downloads when a chart is opened. */
export default function ChartJsView({ type, data, options, height = 260 }: { type: ChartType; data: ChartData<any, any, any>; options?: ChartOptions<any>; height?: number }) {
  const grid = css('--line', 'rgba(148,163,184,.25)'); const text = css('--muted', '#64748b');
  const base: ChartOptions<any> = { responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, color: text, font: { size: 11 } } }, tooltip: { mode: 'index', intersect: false } }, interaction: { mode: 'index', intersect: false },
    scales: type === 'radar' ? { r: { grid: { color: grid }, angleLines: { color: grid }, pointLabels: { color: text, font: { size: 11 } }, ticks: { display: false } } } : { x: { grid: { color: grid }, ticks: { color: text, font: { size: 10 } } }, y: { grid: { color: grid }, ticks: { color: text, font: { size: 10 } }, beginAtZero: true } } };
  const merge = (a: any, b: any): any => { if (!b) return a; const o = { ...a }; for (const k of Object.keys(b)) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' ? merge(a[k], b[k]) : b[k]; return o; };
  return <div style={{ height }} role="img" aria-label="chart"><Chart type={type} data={data} options={merge(base, options)} /></div>;
}
