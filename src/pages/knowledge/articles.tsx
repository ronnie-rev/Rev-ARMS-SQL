import { useMemo, useState } from 'react';
import { Stat } from '../../components/ui';
import { useStore } from '../../store';
import { RCM_ARTICLES, type Article } from '../../lib/rcmcontent';
import { ageDays, money } from '../../lib/utils';

/** Built-in articles overlaid with admin-authored ones (same title = replacement). */
export function useArticles(): Article[] {
  const config = useStore((s) => s.config);
  return useMemo(() => {
    const custom: Article[] = config.filter((o) => o.category === 'kb_article' && o.active).map((o) => ({ id: o.id, section: (o.meta.section as Article['section']) || 'SOP', title: o.value, summary: String(o.meta.summary || ''), body: String(o.meta.body || ''), tags: String(o.meta.tags || '') }));
    const titles = new Set(custom.map((c) => c.title.toLowerCase()));
    return [...RCM_ARTICLES.filter((a) => !titles.has(a.title.toLowerCase())).map((a) => ({ ...a, builtin: true })), ...custom];
  }, [config]);
}

export function Body({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trimEnd()).filter(Boolean); const out: JSX.Element[] = []; let rows: string[][] = [];
  const flush = (k: number) => { if (rows.length) { const [head, ...rest] = rows; out.push(<div key={'t' + k} className="overflow-auto"><table className="tbl w-full text-[12.5px]"><thead><tr>{head.map((c, i) => <th key={i}>{c}</th>)}</tr></thead><tbody>{rest.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j === 0 ? 'font-semibold whitespace-nowrap' : ''}>{c}</td>)}</tr>)}</tbody></table></div>); rows = []; } };
  lines.forEach((l, i) => {
    if (l.startsWith('|')) { rows.push(l.split('|').slice(1, l.endsWith('|') ? -1 : undefined).map((c) => c.trim())); return; } flush(i);
    if (l.startsWith('# ')) out.push(<div key={i} className="label mt-3">{l.slice(2)}</div>);
    else if (l.startsWith('- ')) out.push(<div key={i} className="flex gap-2 text-[13px]"><span className="muted">•</span><span>{l.slice(2)}</span></div>);
    else if (/^\d+\.\s/.test(l)) out.push(<div key={i} className="flex gap-2 text-[13px]"><b className="text-brand-400 w-5 shrink-0">{l.match(/^\d+/)![0]}.</b><span>{l.replace(/^\d+\.\s/, '')}</span></div>);
    else out.push(<p key={i} className="text-[13px]">{l}</p>);
  });
  flush(lines.length); return <div className="space-y-1.5">{out}</div>;
}

export function LiveKpis() {
  const { claims, workLog, qaReviews, inScope } = useStore();
  const k = useMemo(() => {
    const open = claims.filter((c) => !c.closed_at && inScope(c.client_id)); const tot = open.reduce((a, c) => a + (c.balance || 0), 0); const over = (d: number) => open.filter((c) => (ageDays(c, undefined as any) ?? 0) > d).reduce((a, c) => a + (c.balance || 0), 0);
    const closed = claims.filter((c) => c.closed_at && inScope(c.client_id)); const touches = workLog.filter((w) => !w.legacy && inScope(w.client_id)); const rework = touches.length ? touches.filter((w) => w.multi_touch).length / touches.length : 0;
    const done = qaReviews.filter((r) => r.score != null); const qa = done.length ? done.reduce((a, r) => a + (r.score || 0), 0) / done.length : null;
    return { tot, p90: tot ? over(90) / tot : 0, p120: tot ? over(120) / tot : 0, tpc: closed.length ? closed.reduce((a, c) => a + (c.touch_count || 0), 0) / closed.length : 0, rework, qa };
  }, [claims, workLog, qaReviews, inScope]);
  const col = (ok: boolean) => (ok ? '#22c55e' : '#f59e0b');
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
      <Stat label="A/R > 90 days" value={(k.p90 * 100).toFixed(1) + '%'} color={col(k.p90 < 0.2)} sub={`Target < 20% · open ${money(k.tot)}`} />
      <Stat label="A/R > 120 days" value={(k.p120 * 100).toFixed(1) + '%'} color={col(k.p120 < 0.12)} sub="Target < 12%" />
      <Stat label="Touches per resolved claim" value={k.tpc.toFixed(1)} color={col(k.tpc < 3)} sub="Target < 3" />
      <Stat label="Rework touches" value={(k.rework * 100).toFixed(0) + '%'} color={col(k.rework < 0.35)} sub="Target < 35%" />
      <Stat label="Avg QA score" value={k.qa == null ? '—' : k.qa.toFixed(1) + '%'} color={col((k.qa ?? 0) >= 90)} sub="Target ≥ 90%" />
    </div>
  );
}

