import { normPayer } from './normalize';

export interface PayerRow { value: string; aliases?: string }
export interface PayerIndex { canon(name: string | null | undefined): { name: string; known: boolean; how: 'exact' | 'alias' | 'normalised' | 'prefix' | 'none' } }

/** Resolve free-text payer names to the directory's canonical spelling: exact → alias → noise-stripped form → unique prefix. */
export function buildPayerIndex(rows: PayerRow[]): PayerIndex {
  const exact = new Map<string, string>(), alias = new Map<string, string>(), norm = new Map<string, string>();
  for (const r of rows) {
    exact.set(r.value.toLowerCase(), r.value); const n = normPayer(r.value); if (n) norm.set(n, r.value);
    String(r.aliases || '').split(/[,;\n]/).map((a) => a.trim()).filter(Boolean).forEach((a) => { alias.set(a.toLowerCase(), r.value); const na = normPayer(a); if (na && !norm.has(na)) norm.set(na, r.value); });
  }
  return {
    canon(name) {
      const s = (name || '').trim(); if (!s) return { name: 'Unknown', known: false, how: 'none' };
      const l = s.toLowerCase(); if (exact.has(l)) return { name: exact.get(l)!, known: true, how: 'exact' }; if (alias.has(l)) return { name: alias.get(l)!, known: true, how: 'alias' };
      const n = normPayer(s); if (n && norm.has(n)) return { name: norm.get(n)!, known: true, how: 'normalised' };
      if (n.length >= 5) { const hits = [...norm].filter(([k]) => k.startsWith(n) || n.startsWith(k)); const uniq = [...new Set(hits.map((h) => h[1]))]; if (uniq.length === 1 && hits[0][0].length >= 5) return { name: uniq[0], known: true, how: 'prefix' }; }
      return { name: s, known: false, how: 'none' };
    },
  };
}
