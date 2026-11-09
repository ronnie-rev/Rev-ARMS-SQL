import { lazy, Suspense } from 'react';
import type { ChartData, ChartOptions, ChartType } from 'chart.js';
const Impl = lazy(() => import('./ChartJs'));
export { PALETTE } from './chartPalette';
/** Chart.js chart that downloads only when shown. */
export function LazyChart(p: { type: ChartType; data: ChartData<any, any, any>; options?: ChartOptions<any>; height?: number }) {
  return <Suspense fallback={<div className="panel2 animate-pulse" style={{ height: p.height ?? 260 }} />}><Impl {...p} /></Suspense>;
}
