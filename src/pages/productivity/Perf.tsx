import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Bar, Card, Chip, Empty } from '../../components/ui';
import { useStore } from '../../store';
import { analystPerformance } from '../../lib/engine/performance';
import type { WorkLog } from '../../lib/types';

/** Composite performance = volume attainment × QA quality × rework, weights from QA settings. */
export function PerfTable({ rows, from, to }: { rows: WorkLog[]; from: string; to: string }) {
  const { profiles, qaReviews, qaConfig: cfg } = useStore();
  const days = useMemo(() => { let n = 0; for (let d = new Date(from + 'T12:00:00'); d <= new Date(to + 'T12:00:00'); d.setDate(d.getDate() + 1)) if (d.getDay() % 6) n++; return Math.max(1, n); }, [from, to]);
  const revs = useMemo(() => qaReviews.filter((r) => r.reviewed_at && r.reviewed_at.slice(0, 10) >= from && r.reviewed_at.slice(0, 10) <= to), [qaReviews, from, to]);
  const perf = useMemo(() => analystPerformance({ profiles, touches: rows.filter((w) => !w.legacy), reviews: revs, cfg, workdays: days }), [profiles, rows, revs, cfg, days]);
  return (
    <Card title="Performance & QA" actions={<Link className="btn btn-sm" to="/qa">Open QA Center</Link>} pad={false}>
      <table className="grid"><thead><tr><th>Analyst</th><th>Touches</th><th>Attainment</th><th>QA score</th><th>Reviews</th><th>Errors /100</th><th>Rework</th><th>Composite</th></tr></thead>
        <tbody>{perf.map((p) => <tr key={p.p.id}><td><span className="inline-flex items-center gap-2"><Avatar name={p.p.full_name} />{p.p.full_name}</span></td><td>{p.touches}</td><td><div className="flex items-center gap-2 w-32"><Bar value={Math.min(1, p.attain)} max={1} color={p.attain >= 1 ? '#22c55e' : '#f59e0b'} /><span className="text-xs">{Math.round(p.attain * 100)}%</span></div></td>
          <td>{p.qaScore == null ? '—' : <Chip color={p.qaScore >= cfg.kpi.qa_score ? '#22c55e' : '#f59e0b'}>{p.qaScore.toFixed(1)}%</Chip>}</td><td>{p.qaCount}</td><td>{p.errorsPer100 == null ? '—' : p.errorsPer100.toFixed(0)}</td><td>{Math.round(p.reworkPct * 100)}%</td><td><b>{p.composite == null ? '—' : p.composite.toFixed(0)}</b></td></tr>)}
          {perf.length === 0 && <tr><td colSpan={8}><Empty title="No analysts in scope" /></td></tr>}</tbody></table>
      <p className="text-[11px] muted p-4">Weights — volume {cfg.perf_weights.volume}% · quality {cfg.perf_weights.quality}% · rework {cfg.perf_weights.rework}% (QA Center → Settings → Performance mix).</p>
    </Card>
  );
}
