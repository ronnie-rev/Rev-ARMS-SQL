import { useMemo } from 'react';
import { CheckCircle2, CircleAlert, Lightbulb, Plus, Send, Target, Timer } from 'lucide-react';
import { Card, Chip, toast } from '../ui';
import type { LetterModel } from './useLetter';
import { letterScore, type Strategy } from '../../lib/engine/appealintel';
import { fmtDate, money } from '../../lib/utils';

export const VERDICT_COLOR: Record<Strategy['verdict'], string> = { strong: '#16a34a', worth: '#65a30d', marginal: '#d97706', skip: '#dc2626', unknown: '#64748b' };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Strategy tab: should we appeal, what proof wins, how strong is the letter, where and when to send, when to chase. */
export function AppealStrategy({ s, m, claim, codes, amount, deadlineLeft, packet, setPacket, level }: { s: Strategy; m: LetterModel; claim: { claim_no: string; dos: string | null }; codes: string[]; amount: number; deadlineLeft: number | null; packet: { name: string; note?: string; done?: boolean }[]; setPacket: (p: { name: string; note?: string; done?: boolean }[]) => void; level: number }) {
  const score = useMemo(() => letterScore(m.shown, { claimNo: claim.claim_no, dos: claim.dos, codes, amount, enclosures: packet.filter((p) => p.done).length, deadlineLeft, npi: (m.provider as any)?.npi || null, memberId: m.facts.memberId || null }), [m.shown, claim, codes, amount, packet, deadlineLeft, m.facts.memberId]);
  const col = VERDICT_COLOR[s.verdict]; const sc = score.score >= 85 ? '#16a34a' : score.score >= 65 ? '#d97706' : '#dc2626';
  const inPacket = (item: string) => packet.some((p) => norm(p.name).includes(norm(item).slice(0, 18)));
  const addEvidence = (item: string, why: string) => { if (inPacket(item)) return; setPacket([...packet, { name: item, note: why, done: false }]); toast.ok('Added to the packet checklist'); };
  const insertAsk = () => { const ask = `<p>For these reasons, we respectfully request that you overturn the denial of this claim${codes[0] ? ` (${codes[0]})` : ''} and reprocess it for payment${amount > 0 ? ` of ${money(amount, true)}` : ''}. Please contact our office with any questions or if further documentation is needed.</p>`; const base = m.shown; m.setHtml(base.includes('<p>Sincerely,</p>') ? base.replace('<p>Sincerely,</p>', ask + '<p>Sincerely,</p>') : base + ask); m.bump(); toast.ok('Closing request added to the letter'); };
  const missing = score.checks.filter((c) => !c.ok);
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2" title={<span className="flex items-center gap-2"><Target size={15} />Should we appeal?</span>}>
        <div className="flex items-start gap-4 flex-wrap">
          <div className="rounded-xl px-4 py-3 text-white shrink-0" style={{ background: col }}><div className="text-[11px] opacity-80">Recommendation</div><div className="text-[17px] font-bold leading-tight">{s.headline}</div></div>
          <div className="grid grid-cols-3 gap-4 text-center flex-1 min-w-[260px]">
            <div><div className="text-2xl font-extrabold tabular-nums">{s.odds ? Math.round(s.odds.rate * 100) + '%' : '—'}</div><div className="text-[11px] muted">{s.odds ? `win rate · ${s.odds.n} similar` : 'no history yet'}</div></div>
            <div><div className="text-2xl font-extrabold tabular-nums" style={{ color: s.ev >= 0 ? '#16a34a' : '#dc2626' }}>{s.ev >= 0 ? '+' : '−'}{money(Math.abs(s.ev))}</div><div className="text-[11px] muted">expected value</div></div>
            <div><div className="text-2xl font-extrabold tabular-nums">{deadlineLeft == null ? '—' : deadlineLeft < 0 ? 'Closed' : deadlineLeft + 'd'}</div><div className="text-[11px] muted">appeal window</div></div>
          </div>
        </div>
        <ul className="mt-3 space-y-1 text-[13px]">{s.reasons.map((r) => <li key={r} className="flex gap-2"><Lightbulb size={14} className="shrink-0 mt-0.5 text-amber-500" />{r}</li>)}</ul>
        <div className="mt-3 rounded-lg p-3 text-[13px]" style={{ background: 'var(--panel2)' }}><b>Level {level} plan.</b> {s.levelAdvice}</div>
      </Card>
      <Card title="Letter strength" actions={<Chip color={sc}>{score.score >= 85 ? 'Ready' : score.score >= 65 ? 'Almost' : 'Needs work'}</Chip>}>
        <div className="flex items-center gap-3"><div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-extrabold text-white" style={{ background: sc }}>{score.score}</div><div className="text-[12px] muted">{missing.length ? `${missing.length} thing${missing.length > 1 ? 's' : ''} would make this harder to deny` : 'Covers everything reviewers look for'}</div></div>
        <ul className="mt-3 space-y-1.5 text-[12.5px]">{score.checks.map((c) => <li key={c.label} className="flex gap-1.5">{c.ok ? <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-green-600" /> : <CircleAlert size={14} className="shrink-0 mt-0.5 text-amber-500" />}<span>{c.label}{!c.ok && c.fix && <span className="muted"> — {c.fix}</span>}</span></li>)}</ul>
        {!score.checks.find((c) => c.label === 'Makes a specific request')?.ok && <button className="btn btn-sm mt-2" onClick={insertAsk}><Plus size={13} />Add closing request</button>}
      </Card>
      <Card className="lg:col-span-2" title={`Proof that wins: ${s.family}`}>
        <ul className="divide-y hair">{s.evidence.map((e) => <li key={e.item} className="py-2 flex items-center gap-3 text-[13px]"><div className="flex-1"><b className="font-medium">{e.item}</b><div className="muted text-[12px]">{e.why}</div></div>{inPacket(e.item) ? <Chip color="#16a34a">in packet</Chip> : <button className="btn btn-sm" onClick={() => addEvidence(e.item, e.why)}><Plus size={13} />Add to packet</button>}</li>)}</ul>
      </Card>
      <Card title={<span className="flex items-center gap-2"><Send size={15} />Send & follow up</span>}>
        <div className="text-[13px] space-y-2.5">
          <div><div className="label">Best channel</div><b>{s.channel.recommend}</b><div className="muted text-[12px]">{s.channel.why}</div></div>
          <div><div className="label flex items-center gap-1"><Timer size={12} />Expect an answer</div>{s.turnaround.avgDays != null ? <>~<b>{s.turnaround.avgDays} days</b> <span className="muted text-[12px]">({s.turnaround.n} decided appeals)</span></> : <span className="muted">No timing history yet</span>}</div>
          <div><div className="label">Chase on</div><b>{fmtDate(s.chase.date)}</b> <span className="muted text-[12px]">— set automatically when you press Mark sent</span></div>
        </div>
      </Card>
      {(s.template || s.similar.length > 0) && <Card className="lg:col-span-3" title="Your own history on this denial">
        {s.template && <div className="text-[13px] mb-2">This template has won <b>{s.template.won} of {s.template.n}</b> with this payer.</div>}
        {s.similar.length > 0 && <table className="tbl w-full text-sm"><thead><tr><th>Claim</th><th>Level</th><th>Outcome</th><th className="text-right">Recovered</th><th>Note</th></tr></thead><tbody>{s.similar.map((x) => <tr key={x.claim_no + x.level}><td>{x.claim_no}</td><td>L{x.level}</td><td><Chip color={x.outcome === 'lost' ? '#dc2626' : '#16a34a'}>{x.outcome}</Chip></td><td className="text-right">{money(x.recovered)}</td><td className="muted text-[12px]">{x.note}</td></tr>)}</tbody></table>}
      </Card>}
    </div>
  );
}
