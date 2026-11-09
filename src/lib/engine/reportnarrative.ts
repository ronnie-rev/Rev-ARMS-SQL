// Executive summary generator: turns the numbers into the few plain-English paragraphs a client or leadership meeting actually reads.
import type { Appeal, Recovery } from '../types';
import type { EClaim } from './eclaim';

export interface Narrative { title: string; paragraphs: string[]; actions: string[]; text: string }
const $ = (n: number) => '$' + Math.round(n).toLocaleString('en-US'); const pct = (n: number) => Math.round(n * 100) + '%';
const BENIGN = /^(CO-?45|CO-?253|PR-?\d+|OA-?23)$/i; const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

export function buildNarrative(i: { ecs: EClaim[]; recoveries: Recovery[]; appeals: Appeal[]; today: string; scope?: string }): Narrative {
  const open = i.ecs.filter((x) => x.open); const bal = (xs: EClaim[]) => xs.reduce((s, x) => s + Math.max(0, x.c.balance), 0); const total = bal(open); const scope = i.scope || 'the portfolio'; const para: string[] = []; const actions: string[] = [];
  const over = (n: number) => bal(open.filter((x) => (x.age ?? 0) > n));
  para.push(total ? `${scope[0].toUpperCase() + scope.slice(1)} carries ${$(total)} in open A/R across ${open.length.toLocaleString('en-US')} claims. ${pct(over(90) / total)} (${$(over(90))}) is older than 90 days and ${pct(over(120) / total)} is older than 120 days.` : `There is no open A/R for ${scope}.`);
  const m0 = i.today.slice(0, 8) + '01'; const lm = addDays(m0, -1).slice(0, 8) + '01'; const dom = Number(i.today.slice(8, 10)); const lmEnd = lm.slice(0, 8) + String(dom).padStart(2, '0'); const sum = (xs: Recovery[]) => xs.reduce((s, r) => s + r.amount, 0);
  const mtd = sum(i.recoveries.filter((r) => r.occurred_on >= m0 && r.occurred_on <= i.today)); const prev = sum(i.recoveries.filter((r) => r.occurred_on >= lm && r.occurred_on <= lmEnd));
  if (mtd || prev) { const d = prev > 0 ? Math.round(((mtd - prev) / prev) * 100) : null; para.push(`Collections this month are ${$(mtd)}${d == null ? '' : d >= 0 ? `, ${d}% ahead of the same point last month (${$(prev)})` : `, ${-d}% behind the same point last month (${$(prev)})`}.`); if (d != null && d <= -15) actions.push('Collections are well behind last month — review the largest unworked balances and any payer-side delays first.'); }
  const byPayer = new Map<string, number>(); for (const x of open) byPayer.set(x.c.payer || 'Unknown', (byPayer.get(x.c.payer || 'Unknown') || 0) + Math.max(0, x.c.balance)); const top = [...byPayer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (top.length && total) { para.push(`The largest payers by open balance are ${top.map(([p, v]) => `${p} (${$(v)}, ${pct(v / total)})`).join(', ')}.`); if (top[0][1] / total >= 0.35) actions.push(`${top[0][0]} holds ${pct(top[0][1] / total)} of the book — a single payer problem would move the whole portfolio; agree a standing escalation contact there.`); }
  const codes = new Map<string, { n: number; v: number }>(); for (const x of open) for (const k of (x.c.denial_codes || '').split(/[,;\s]+/).filter(Boolean)) { if (BENIGN.test(k)) continue; const e = codes.get(k.toUpperCase()) || { n: 0, v: 0 }; e.n++; e.v += Math.max(0, x.c.balance); codes.set(k.toUpperCase(), e); }
  const tc = [...codes.entries()].sort((a, b) => b[1].v - a[1].v).slice(0, 3); if (tc.length) para.push(`The costliest open denial reasons are ${tc.map(([k, e]) => `${k} (${e.n} claims, ${$(e.v)})`).join(', ')}.`);
  const dec = i.appeals.filter((a) => ['won', 'partial', 'lost'].includes(a.status)); const won = dec.filter((a) => a.status !== 'lost'); const inPlay = i.appeals.filter((a) => ['draft', 'ready', 'sent', 'pending'].includes(a.status));
  if (i.appeals.length) { para.push(`${inPlay.length} appeal${inPlay.length === 1 ? ' is' : 's are'} in progress${dec.length >= 3 ? `; of ${dec.length} decided, ${won.length} were won (${pct(won.length / dec.length)}), recovering ${$(won.reduce((s, a) => s + (a.amount_recovered || 0), 0))}` : ''}.`); if (dec.length >= 5 && won.length / dec.length < 0.35) actions.push('Appeal win rate is under 35% — review which denial reasons and payers lose most, and strengthen the supporting documents before filing.'); }
  const tf = open.filter((x) => x.tfLeft != null && x.tfLeft >= 0 && x.tfLeft <= 30); if (tf.length) { para.push(`${tf.length} claim${tf.length === 1 ? ' is' : 's are'} within 30 days of a filing or appeal deadline, worth ${$(bal(tf))}.`); actions.push(`Work the ${tf.length} deadline-critical claim${tf.length === 1 ? '' : 's'} (${$(bal(tf))}) this week, starting with the nearest deadline.`); }
  const un = open.filter((x) => !x.c.assigned_to); if (un.length) { para.push(`${un.length} open claim${un.length === 1 ? ' has' : 's have'} no owner (${$(bal(un))}).`); actions.push('Assign the unowned claims — the allocation advisor suggests an owner for each.'); }
  if (total && over(120) / total >= 0.25) actions.push(`${pct(over(120) / total)} of A/R is past 120 days — decide pursue / appeal / write-off for the oldest high-value balances now, before collectability falls further.`);
  const title = `A/R summary — ${i.today}`; const text = [title, '', ...para, '', actions.length ? 'Recommended actions:' : '', ...actions.map((a) => '• ' + a)].join('\n').trim();
  return { title, paragraphs: para, actions, text };
}
