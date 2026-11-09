// Natural-language search → worklist filters. Deterministic keyword grammar (no external AI), so it is instant,
// private and PHI-safe. Anything it recognises is shown back as chips so the user can see how it was interpreted.
export interface NlqVocab { payers: string[]; clients: { id: string; name: string }[]; statuses: string[]; rcas: string[]; buckets: string[]; actions: string[] }
export interface NlqResult { params: Record<string, string>; chips: string[]; rest: string }

export function parseQuery(q: string, v: NlqVocab): NlqResult {
  let s = ' ' + q.toLowerCase().trim() + ' ';
  const params: Record<string, string> = {}; const chips: string[] = [];
  const take = (re: RegExp) => { const m = s.match(re); if (m) s = s.replace(re, ' '); return m; };
  const set = (k: string, val: string, chip: string) => { params[k] = val; chips.push(chip); };

  let m = take(/\b(?:over|older than|>|more than|above)\s*(\d{2,3})\s*(?:d|days?)?\b/) || take(/\b(\d{2,3})\s*\+\s*(?:d|days?)?\b/);
  if (m) set('minAge', m[1], `Age > ${m[1]}d`);
  m = take(/\b(?:under|younger than|<|less than|below)\s*(\d{2,3})\s*(?:d|days?)\b/);
  if (m) set('maxAge', m[1], `Age < ${m[1]}d`);
  m = take(/(?:\$|over \$|above \$|balance (?:over|>)\s*\$?)\s*(\d+(?:\.\d+)?)\s*(k)?\b/);
  if (m) { const n = Math.round(parseFloat(m[1]) * (m[2] ? 1000 : 1)); set('minBal', String(n), `Balance ≥ $${n.toLocaleString()}`); }
  if (take(/\bunassigned|no owner|unowned\b/)) set('view', 'unassigned', 'Unassigned');
  else if (take(/\bmy (?:claims|work|queue)\b|\bmine\b/)) set('view', 'mine', 'My work');
  else if (take(/\btimely|tf risk|filing\b/)) set('view', 'tf', 'Timely-filing risk');
  else if (take(/\bfollow[- ]?ups?|f\/u|due\b/)) set('view', 'fu', 'Follow-ups due');
  else if (take(/\bstale|cold|neglected\b/)) set('view', 'stale', 'Stale');
  else if (take(/\bnever worked|untouched|unworked\b/)) set('view', 'untouched', 'Never worked');
  else if (take(/\bclosed|resolved\b/)) set('view', 'closed', 'Closed out');
  if (take(/\bhigh value\b|\bbig(?:gest)?\b/) && !params.minBal) set('minBal', '2500', 'Balance ≥ $2,500');

  const byLen = <T,>(a: T[], f: (t: T) => string) => [...a].sort((x, y) => f(y).length - f(x).length);
  for (const p of byLen(v.payers, (x) => x)) { const k = p.toLowerCase(); if (k.length > 2 && s.includes(k)) { s = s.replace(k, ' '); set('payer', p, p); break; } }
  for (const c of byLen(v.clients, (x) => x.name)) if (s.includes(c.name.toLowerCase())) { s = s.replace(c.name.toLowerCase(), ' '); set('client', c.id, c.name); break; }
  for (const st of byLen(v.statuses, (x) => x)) if (s.includes(st.toLowerCase())) { s = s.replace(st.toLowerCase(), ' '); set('status', st, st); break; }
  for (const r of byLen(v.rcas, (x) => x)) { const k = r.toLowerCase(); if (s.includes(k) || (k.length > 5 && s.includes(k.split(/ or | /)[0] + ' ') && k.split(' ')[0].length > 5)) { s = s.replace(k, ' '); set('rca', r, r); break; } }
  for (const b of v.buckets) { const k = b.toLowerCase(); if (s.includes(' ' + k + ' ')) { s = s.replace(k, ' '); set('bucket', b, `Bucket ${b}`); break; } }
  if (take(/\bdenied|denials?\b/) && !params.rca) { /* hint only: handled via text search below */ }
  const rest = s.replace(/\b(show|me|find|all|claims?|with|for|the|in|of|from|and|by|that|are|is|a)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return { params, chips, rest };
}
