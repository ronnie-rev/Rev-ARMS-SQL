import type { Kb } from './index';
import type { ConfigOption } from '../types';

/** Turns the reference dictionary (≈300 CARC rows) into editable Admin → Denial codes rows. Skips codes already present. */
export function kbCarcRows(kb: Kb, have: Set<string>, startSort: number): Omit<ConfigOption, 'id'>[] {
  const groups = new Map(kb.GROUPS.map((g) => [g[0], g[1]])); const out: Omit<ConfigOption, 'id'>[] = []; const seen = new Set(have);
  [...kb.CARC, ...kb.CARC2].forEach((r) => {
    const n = String(r[0]).trim(); const prefix = /^(CO|PR|OA|PI|CR)/.exec(String(r[4] || ''))?.[1] || 'CO'; const code = /^\d{1,3}$/.test(n) ? `${prefix}-${n}` : /^[A-Z]{1,2}\d{1,4}$/.test(n) ? n : '';
    if (!code || seen.has(code)) return; seen.add(code);
    out.push({ category: 'carc', value: code, parent: null, label: null, color: null, sort: startSort + out.length, active: true, meta: { meaning: String(r[1] || '') + (r[2] ? ` — ${r[2]}` : ''), rca: '', rca_detail: '', action: String(r[3] || ''), family: groups.get(prefix) || 'Reference' } });
  });
  return out;
}
