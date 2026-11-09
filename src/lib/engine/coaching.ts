// Coaching signals per person from the touch log: output vs target, consistency, thin documentation, repeated actions and QA — with a plain-language nudge for the lead.
import type { WorkLog } from '../types';

export interface CoachRow { id: string; name: string; touches: number; perDay: number; target: number; attain: number; lowDays: number; thinNotes: number; loops: number; qa: number | null; fails: number; flags: { level: 'high' | 'med'; msg: string }[]; sample: string[] }
export function coaching(log: WorkLog[], people: { id: string; full_name: string; daily_target: number }[], from: string, to: string, workdays: number): CoachRow[] {
  const inR = log.filter((w) => w.work_date >= from && w.work_date <= to);
  return people.map((p) => {
    const mine = inR.filter((w) => w.user_id === p.id).sort((a, b) => a.work_date.localeCompare(b.work_date)); const n = mine.length; const tgt = p.daily_target || 40;
    const byDay = new Map<string, number>(); for (const w of mine) byDay.set(w.work_date, (byDay.get(w.work_date) || 0) + 1);
    const days = [...new Set(inR.map((w) => w.work_date))].sort().slice(-5); const lowDays = days.filter((d) => (byDay.get(d) || 0) < tgt * 0.7).length;
    const thin = mine.filter((w) => !w.comment || w.comment.trim().length < 12).length;
    const lastAct = new Map<string, string>(); let loops = 0; for (const w of mine) { if (w.end_action) { if (lastAct.get(w.claim_id) === w.end_action) loops++; lastAct.set(w.claim_id, w.end_action); } }
    const aud = mine.filter((w) => w.audit_status === 'pass' || w.audit_status === 'fail'); const fails = aud.filter((w) => w.audit_status === 'fail').length; const qa = aud.length >= 5 ? Math.round(((aud.length - fails) / aud.length) * 100) : null;
    const perDay = workdays ? n / workdays : 0; const attain = tgt ? Math.round((perDay / tgt) * 100) : 0; const flags: CoachRow['flags'] = [];
    if (n && attain < 70) flags.push({ level: 'high', msg: `Averaging ${perDay.toFixed(0)} touches/day vs a target of ${tgt} (${attain}%). Check blockers: queue quality, payer hold times, training.` });
    if (lowDays >= 3) flags.push({ level: 'high', msg: `Under 70% of target on ${lowDays} of the last ${days.length} working days.` });
    if (n >= 10 && thin / n > 0.3) flags.push({ level: 'med', msg: `${Math.round((thin / n) * 100)}% of touches have almost no comment — hard for the next person to pick up.` });
    if (n >= 10 && loops / n > 0.15) flags.push({ level: 'med', msg: `${loops} touches repeat the same action as last time on a claim — coach on escalation paths.` });
    if (qa != null && qa < 85) flags.push({ level: 'high', msg: `QA pass rate ${qa}% (${fails} fails of ${aud.length}).` });
    return { id: p.id, name: p.full_name, touches: n, perDay: Math.round(perDay * 10) / 10, target: tgt, attain, lowDays, thinNotes: thin, loops, qa, fails, flags, sample: mine.filter((w) => w.audit_status === 'fail' || !w.comment).slice(-3).map((w) => w.claim_id) };
  }).filter((r) => r.touches > 0).sort((a, b) => b.flags.filter((f) => f.level === 'high').length - a.flags.filter((f) => f.level === 'high').length || a.attain - b.attain);
}
