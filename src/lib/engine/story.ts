import type { EClaim } from '../../hooks';
import type { Claim } from '../types';

/** One-paragraph plain-English summary of where a claim stands (deterministic; built from the claim's own fields). */
export function claimStory(c: Claim, ec: Pick<EClaim, 'age' | 'tfLeft' | 'bucket'>, owner?: string): string {
  const bits: string[] = [];
  bits.push(`Billed ${c.billed_amt ? '$' + c.billed_amt.toFixed(2) : ''} to ${c.payer || 'the payer'} for DOS ${c.dos ? c.dos.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3/$1') : 'unknown'}; $${c.balance.toFixed(2)} outstanding${ec.age != null ? `, ${ec.age} days old (${ec.bucket?.label || '—'} bucket)` : ''}.`);
  if (c.denial_codes) bits.push(`The remit shows ${c.denial_codes}.`); else if (c.pms_status) bits.push(`PMS status: ${c.pms_status}.`);
  if (c.touch_count > 0) bits.push(`Worked ${c.touch_count} time${c.touch_count > 1 ? 's' : ''}${c.rca ? `; root cause “${c.rca}${c.rca_detail ? ' › ' + c.rca_detail : ''}”` : ''}${c.end_action ? `; last action “${c.end_action}${c.end_sub ? ' › ' + c.end_sub : ''}”` : ''}.`);
  else bits.push('Not worked yet.');
  if (c.next_fu) bits.push(`Next follow-up ${c.next_fu}.`);
  if (ec.tfLeft != null) bits.push(ec.tfLeft <= 0 ? `Timely-filing window passed ${-ec.tfLeft} days ago.` : ec.tfLeft <= 45 ? `Only ${ec.tfLeft} days of timely filing remain.` : '');
  bits.push(owner ? `Owner: ${owner}.` : 'No owner assigned.');
  const flags = (c.flags || []).filter((f) => !f.startsWith('chk:') && !f.startsWith('ign:')); if (flags.length) bits.push(`Flags: ${flags.join(', ').replace(/_/g, ' ')}.`);
  return bits.filter(Boolean).join(' ').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$2/$3/$1');
}
