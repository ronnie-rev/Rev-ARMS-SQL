// Knowledge hub search: recognises denial / remark codes typed any which way ("co50", "CO-50", "50", "n115"), and searches guides, procedures, codes and glossary together.
import Fuse from 'fuse.js';
import type { Kb, Scenario } from './kb';
import { scenarioIndex } from './kb';
import type { Article } from './rcmcontent';

export type CodeQuery = { kind: 'carc'; num: string; group?: string } | { kind: 'rarc'; code: string };
/** "co-50" / "CO50" / "50" → CARC 50; "N115" / "MA130" / "M20" → RARC. Anything else is a normal text search. */
export function parseCode(q: string): CodeQuery | null {
  const t = q.trim().toUpperCase().replace(/\s+/g, ''); let m: RegExpExecArray | null;
  if ((m = /^(CO|PR|OA|PI|CR)[-_]?(\d{1,3})$/.exec(t))) return { kind: 'carc', num: String(+m[2]), group: m[1] };
  if (/^\d{1,3}$/.test(t)) return { kind: 'carc', num: String(+t) };
  if ((m = /^(MA|M|N)(\d{1,3})$/.exec(t))) return { kind: 'rarc', code: m[1] + m[2] };
  return null;
}
export interface CodeHit { carc?: { code: string; desc: string; cause: string; action: string; group: string }; rarc?: { code: string; desc: string; action: string }; scenario?: Scenario; groupLabel?: string }
export function lookupCode(kb: Kb, q: string): CodeHit | null {
  const c = parseCode(q); if (!c) return null; const idx = scenarioIndex(kb);
  if (c.kind === 'rarc') { const r = kb.RARC.find((x) => x[0].toUpperCase() === c.code); return r ? { rarc: { code: r[0], desc: r[1], action: r[2] || '' } } : null; }
  const row = kb.CARC.find((x) => String(+x[0]) === c.num) || null; if (!row) return null;
  const grp = c.group || (idx.get(`CO-${c.num}`) ? 'CO' : idx.get(`PR-${c.num}`) ? 'PR' : ''); const sc = (c.group && idx.get(`${c.group}-${c.num}`)) || idx.get(`CO-${c.num}`) || idx.get(`PR-${c.num}`) || idx.get(`OA-${c.num}`) || undefined;
  const groupLabel = c.group ? kb.GROUPS.find((g) => g[0] === c.group)?.[1] : undefined;
  return { carc: { code: row[0], desc: row[1], cause: row[2], action: row[3], group: row[4] || grp }, scenario: sc, groupLabel };
}

export type KbKind = 'denial' | 'howto' | 'code' | 'term';
export interface KbItem { id: string; kind: KbKind; title: string; sub: string; text: string; go: Record<string, string> }
export const KIND_LABEL: Record<KbKind, string> = { denial: 'Denial guide', howto: 'How-to', code: 'Code', term: 'Glossary' };

export function buildIndex(kb: Kb, articles: Article[]): KbItem[] {
  const out: KbItem[] = [];
  for (const s of kb.SCEN) out.push({ id: 'd:' + s.code, kind: 'denial', title: `${s.code} — ${s.t}`, sub: s.cat, text: [s.what, ...s.causes, s.action].join(' '), go: { tab: 'denials', code: s.code } });
  for (const g of kb.GUIDES) out.push({ id: 'g:' + g.t, kind: 'howto', title: g.t, sub: 'Guide', text: [g.why, ...g.steps, ...(g.checklist || []), ...(g.pitfalls || [])].join(' '), go: { tab: 'howto', item: 'g:' + g.t } });
  for (const a of articles) out.push({ id: 'a:' + a.id, kind: 'howto', title: a.title, sub: a.section, text: `${a.summary} ${a.tags || ''} ${a.body}`, go: { tab: 'howto', item: 'a:' + a.id } });
  for (const r of kb.CARC) out.push({ id: 'c:' + r[0], kind: 'code', title: `CARC ${r[0]} — ${r[1]}`, sub: r[4] || 'Adjustment reason', text: `${r[2]} ${r[3]}`, go: { tab: 'find', q: r[0] } });
  for (const r of kb.RARC) out.push({ id: 'r:' + r[0], kind: 'code', title: `RARC ${r[0]} — ${r[1].slice(0, 90)}`, sub: 'Remark code', text: `${r[1]} ${r[2] || ''}`, go: { tab: 'find', q: r[0] } });
  for (const [g, t, d] of kb.CONCEPTS) out.push({ id: 't:' + t, kind: 'term', title: t, sub: g, text: d, go: { tab: 'reference', sec: 'tables', table: 'Glossary', q: t } });
  return out;
}
const STOP = new Set('a an and are as at be by can do does for from how i if in is it its my of on or our should so that the their this to was we what when where which who why will with you your about into than then there these those'.split(' '));
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9/#.+-]+/g, ' ').split(' ').filter(Boolean);
/** Natural-language friendly search: drops filler words ("how do I read an ERA" → read, era), matches word prefixes ("read" finds "reading"), ranks title hits first and needs at least half of the meaningful words. Falls back to fuzzy matching for typos. */
export function makeSearcher(items: KbItem[]) {
  const prep = items.map((it) => ({ it, title: it.title.toLowerCase(), sub: it.sub.toLowerCase(), tw: words(it.title), bw: new Set(words(`${it.sub} ${it.text}`)) }));
  const fuse = new Fuse(items, { keys: [{ name: 'title', weight: 3 }, { name: 'sub', weight: 0.5 }], threshold: 0.32, ignoreLocation: true, minMatchCharLength: 3 });
  return (q: string, limit = 14): KbItem[] => {
    const t = q.trim(); if (t.length < 2) return []; let toks = words(t).filter((w) => !STOP.has(w)); if (!toks.length) toks = words(t); if (!toks.length) return [];
    const need = Math.ceil(toks.length / 2); const hit = (set: Set<string>, tok: string) => { if (set.has(tok)) return true; for (const w of set) if (w.startsWith(tok) || (tok.length > 4 && w.length > 4 && tok.startsWith(w))) return true; return false; };
    const scored: { it: KbItem; s: number }[] = [];
    for (const p of prep) { let matched = 0, s = 0; for (const tok of toks) { const inTitle = p.tw.some((w) => w === tok || w.startsWith(tok)); const inTitleSub = !inTitle && p.title.includes(tok); const inBody = hit(p.bw, tok); if (inTitle) { s += 5; matched++; } else if (inTitleSub) { s += 3; matched++; } else if (inBody) { s += 1; matched++; } } if (matched >= need) scored.push({ it: p.it, s: s * (matched / toks.length) }); }
    let hits = scored.sort((a, b) => b.s - a.s).map((x) => x.it); if (!hits.length) hits = fuse.search(t).map((r) => r.item);
    const per: Record<string, number> = {}; const out: KbItem[] = []; for (const h of hits) { per[h.kind] = (per[h.kind] || 0) + 1; if (per[h.kind] <= 6) out.push(h); if (out.length >= limit) break; } return out;
  };
}
