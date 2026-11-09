import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Brain } from 'lucide-react';
import { useClaimInsights, useInsightIndex } from '../lib/useInsights';
import { INSIGHT_LABEL, TONE_COLOR, type InsightId } from '../lib/engine/insights';
import type { EClaim } from '../hooks';

/** What the claim brain noticed about this claim, with the reason on each chip. */
export function InsightChips({ ec }: { ec: EClaim }) {
  const list = useClaimInsights(ec); if (!list.length) return null;
  return <div className="flex items-start gap-1.5 flex-wrap text-[12px]"><Brain size={13} className="mt-1 muted" />{list.slice(0, 4).map((n) => <span key={n.id} className="chip" title={n.detail} style={{ background: TONE_COLOR[n.tone] + '16', color: TONE_COLOR[n.tone], borderColor: TONE_COLOR[n.tone] + '30' }}>{n.label}</span>)}<div className="basis-full muted text-[11.5px]">{list[0].detail}</div></div>;
}

/** My Day: how many of MY claims carry each signal, one click to the filtered Worklist. */
export function SignalsStrip({ mine }: { mine: EClaim[] }) {
  const idx = useInsightIndex(mine);
  const counts = useMemo(() => { const m = new Map<InsightId, number>(); for (const x of mine) for (const n of idx.get(x.c.id) || []) m.set(n.id, (m.get(n.id) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [mine, idx]);
  if (!counts.length) return null; const tone = (id: InsightId) => TONE_COLOR[[...idx.values()].flat().find((n) => n.id === id)?.tone || 'info'];
  return <div className="panel2 px-3 py-2 mb-4 flex gap-2 flex-wrap items-center text-[12.5px]"><Brain size={14} className="muted" /><b>Signals on your claims</b>{counts.map(([id, n]) => <Link key={id} to={`/worklist?view=mine&ins=${id}`} className="chip hover:opacity-80" style={{ background: tone(id) + '16', color: tone(id), borderColor: tone(id) + '30' }}>{INSIGHT_LABEL[id]} · {n}</Link>)}</div>;
}
