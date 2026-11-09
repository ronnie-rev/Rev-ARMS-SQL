import type { Claim, WorkLog } from '../types';
import { suggestFromCodes, type Carc } from './carc';
import { quality } from './notes';

/** Auto-QA pre-screen for one touch: a 0–100 risk score with reasons, so auditors review the riskiest work first. */
export function qaRisk(w: WorkLog, c: Claim | undefined, carc: Map<string, Carc>, terminalActions: Set<string>): { risk: number; reasons: string[] } {
  const r: string[] = []; let risk = 0; const add = (n: number, s: string) => { risk += n; r.push(s); };
  const text = (w.comment || '').trim();
  if (text.length < 25) add(30, 'Comment is very short');
  const q = quality(text, { mode: w.mode || undefined, nextFu: w.next_fu, terminal: !!w.end_action && terminalActions.has(w.end_action) });
  if (q.score < 50 && text.length >= 25) add(15, `Note quality ${q.score}/100 (${q.missing[0] || 'incomplete'})`);
  if (w.mode === 'Call' && !w.call_ref && !/ref/i.test(text)) add(20, 'Call with no reference #');
  if (/\b(paid|payment|check|eft)\b/i.test(text) && /appeal|escalat|corrected/i.test(w.end_action || '')) add(20, 'Comment mentions payment but end action is an appeal/rework');
  if (/\bdenied|denial\b/i.test(text) && w.rca === 'Claim is in Process') add(15, 'Comment says denied but root cause is “in process”');
  if (/in process|processing/i.test(text) && /^Adjustments/i.test(w.end_action || '')) add(25, 'Adjusting a claim the note says is still processing');
  if (c?.denial_codes) { const s = suggestFromCodes(c.denial_codes, carc); if (s && s.confidence >= 0.6 && w.rca && ![s.rca, 'Claim is in Process', 'No Response'].includes(w.rca)) add(25, `Root cause “${w.rca}” conflicts with denial code (suggests “${s.rca}”)`); }
  if (/^Adjustments/i.test(w.end_action || '') && (w.balance || 0) >= 500) add(20, `Adjustment on a ${(w.balance || 0) >= 2000 ? 'large ' : ''}balance ($${Math.round(w.balance || 0)}) — verify approval`);
  if (w.time_spent_sec != null && w.time_spent_sec > 0 && w.time_spent_sec < 20 && w.mode === 'Call') add(10, 'Call logged in under 20 seconds');
  if (!w.next_fu && w.end_action && !terminalActions.has(w.end_action)) add(10, 'No follow-up date');
  return { risk: Math.min(100, risk), reasons: r };
}
