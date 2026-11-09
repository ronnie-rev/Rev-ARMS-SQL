// Executive narrative: turns the huddle numbers into a few plain-English sentences a client or manager can read in 20 seconds.
import type { Huddle2 } from './huddle2';
const $ = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export function huddleNarrative(h: Huddle2, scope = 'the team'): string[] {
  const k = h.kpis; const out: string[] = [];
  const pace = k.recoveredLastMonthToDate > 0 ? Math.round(((k.recoveredMTD - k.recoveredLastMonthToDate) / k.recoveredLastMonthToDate) * 100) : null;
  out.push(`${scope[0].toUpperCase() + scope.slice(1)} recovered ${$(k.recoveredMTD)} this month${pace == null ? '' : pace >= 0 ? `, ${pace}% ahead of last month's pace` : `, ${-pace}% behind last month's pace`}; ${k.touches} touches yesterday against a target of ${k.target} (${k.attain}%).`);
  const risks: string[] = [];
  if (k.filing7) risks.push(`${k.filing7} claim${k.filing7 > 1 ? 's' : ''} (${$(k.filing7Amt)}) hit filing limits within 7 days`);
  if (k.overdue) risks.push(`${k.overdue} follow-ups are overdue`);
  if (k.unassigned) risks.push(`${k.unassigned} claims (${$(k.unassignedBalance)}) have no owner`);
  if (h.blockers.length) risks.push(`${h.blockers.length} payer${h.blockers.length > 1 ? 's are' : ' is'} behaving unusually (${h.blockers[0].title})`);
  out.push(risks.length ? 'Watch: ' + risks.join('; ') + '.' : 'No filing, ownership or payer risks need escalation today.');
  const over = h.capacity.filter((c) => c.flag === 'overloaded').map((c) => c.name); const idle = h.capacity.filter((c) => c.flag === 'idle').map((c) => c.name);
  if (over.length && idle.length) out.push(`Rebalance: ${over.join(', ')} ${over.length > 1 ? 'are' : 'is'} overloaded while ${idle.join(', ')} ${idle.length > 1 ? 'have' : 'has'} room.`);
  if (h.focus[0]) out.push(`Biggest single focus: ${h.focus[0].claim_no} (${$(h.focus[0].balance)}) — ${h.focus[0].why}`);
  return out;
}
