import { useEffect, useState } from 'react';

// Ad-hoc metric help: rest the pointer on any number / % / amount for 2 s and a small note appears just below the cursor
// explaining what it is. Explicit text via data-tip wins; otherwise the label is inferred from the table header or card title.
const METRIC = /^[-+−]?[$€£]?\s?\d[\d,]*(\.\d+)?\s?(%|k|m|b|d|days?|x|pts?)?$|^\d+\s?\/\s?\d+$|^[-+−]?[$€£]?\d[\d,]*(\.\d+)?\s?[%kKmM]?\s?[·•]\s?.*$/i;
const DELAY = 2000; const SLOP = 6;

const GLOSSARY: [RegExp, string][] = [
  [/open claims|^claims|claim count|claims \(|^open$|^#/i, 'Number of distinct claims (each logical claim counted once).'],
  [/touches needed/i, 'Work touches the open claims will need in the period (about one per claim every 14 days).'],
  [/capacity/i, 'Touches the team can complete, from each analyst’s daily target.'],
  [/utili[sz]ation/i, 'Touches needed ÷ capacity. Above 110 % means the team is over-booked.'],
  [/touch/i, 'Logged work touches (calls, portal checks, resubmissions).'],
  [/per day/i, 'Average touches per working day in the selected range.'],
  [/attain/i, 'Touches done ÷ target for the period.'],
  [/qa score|avg score|average qa/i, 'Average QA scorecard result for reviewed touches (0–100).'],
  [/composite/i, 'Blend of volume, QA quality and rework using the weights in QA settings.'],
  [/rework|repeat/i, 'Share of touches that were repeat touches on the same claim.'],
  [/errors? ?\/ ?100|errors per/i, 'QA errors found per 100 reviews.'],
  [/dispute/i, 'Share of reviews the analyst has disputed.'],
  [/coverage/i, 'Reviewed touches ÷ all touches in the period.'],
  [/pass/i, 'Share of reviews scoring at or above the pass threshold.'],
  [/recover|collected|payment/i, 'Dollars posted as payments or adjustments after work was done.'],
  [/balance|outstanding|\bar\b|a\/r|\$|amount|billed/i, 'Dollars still owed on these claims (current balance).'],
  [/days|age|aging/i, 'Age in days from the aging basis (date of service or last billed).'],
  [/target/i, 'Goal set for this metric (Admin / QA settings).'],
  [/rate|%|share|pct/i, 'A percentage — the share of the total this row or card represents.'],
  [/assigned|owner|workload|load/i, 'Claims currently owned by this person or group.'],
  [/unassigned|unworked/i, 'Open claims with no owner or no touch yet.'],
  [/follow-?ups? due|fu due/i, 'Claims whose next follow-up date is today or earlier.'],
  [/timely|tf/i, 'Days left before the payer’s timely-filing limit.'],
];

const own = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim();
function findMetric(start: Element | null): Element | null { let el = start; for (let i = 0; el && i < 4; i++, el = el.parentElement) { const t = own(el); if (t.length > 40) return null; if (METRIC.test(t)) return el; } return null; }
function labelFor(m: Element): { label: string; ctx: string } {
  const cell = m.closest('td,th');
  if (cell) { const table = cell.closest('table'); const idx = (cell as HTMLTableCellElement).cellIndex; const th = table?.querySelectorAll('thead th')[idx]; const first = cell.parentElement?.querySelector('td,th'); const row = first && first !== cell ? own(first) : ''; return { label: th ? own(th) : '', ctx: row.length < 40 ? row : '' }; }
  for (let a: Element | null = m.parentElement, d = 0; a && d < 4; a = a.parentElement, d++) {
    const leaves = [...a.querySelectorAll('*')].filter((x) => x.children.length === 0 && x !== m && !m.contains(x) && !x.contains(m) && own(x).length >= 3 && own(x).length <= 40 && !/\d/.test(own(x)) && (x.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (leaves.length) return { label: own(leaves[leaves.length - 1]), ctx: '' };
  }
  return { label: '', ctx: '' };
}
/** The number under the pointer plus its neighbours, e.g. "119 claims · $238K" hovered on "238K" → { tok: "$238K", prev: "·", next: "" }. */
function tokenAt(x: number, y: number): { tok: string; prev: string; next: string; line: string } | null {
  const d = document as any; let node: Node | null = null; let off = 0;
  if (d.caretPositionFromPoint) { const c = d.caretPositionFromPoint(x, y); node = c?.offsetNode ?? null; off = c?.offset ?? 0; } else if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(x, y); node = r?.startContainer ?? null; off = r?.startOffset ?? 0; }
  if (!node || node.nodeType !== 3) return null; const text = node.textContent || ''; const parts: { t: string; a: number; b: number }[] = []; for (const m of text.matchAll(/\S+/g)) parts.push({ t: m[0], a: m.index!, b: m.index! + m[0].length });
  let k = parts.findIndex((p) => off >= p.a && off <= p.b); if (k < 0) return null;
  // the glyph must really be under the pointer (caret APIs snap to the nearest text)
  const rng = document.createRange(); rng.setStart(node, parts[k].a); rng.setEnd(node, parts[k].b); const r = rng.getBoundingClientRect(); if (x < r.left - 3 || x > r.right + 3 || y < r.top - 3 || y > r.bottom + 3) return null;
  const clean = (t: string) => t.replace(/^[(\[]+/, '').replace(/[·•|,;)\]]+$/g, ''); const nx = parts[k + 1]?.t || ''; return { tok: clean(parts[k].t), prev: parts.slice(Math.max(0, k - 2), k).map((p) => p.t).join(' '), next: nx.replace(/^[·•]$/, ''), line: text };
}
const NUM = /^[-+−]?[$€£]?\d[\d,]*(\.\d+)?(%|[kKmMbB]|d|x)?$/;

function byToken(t: { tok: string; prev: string; next: string; line: string }, el: Element): string | null {
  const { tok, prev, next, line } = t; if (!NUM.test(tok)) return null; const ln = line.toLowerCase();
  if (/^[$€£]/.test(tok)) return 'Dollar amount still owed (current balance) for this group or person.';
  if (/%$/.test(tok)) return /capacity/.test(ln) ? 'Share of weekly capacity already assigned: assigned touches ÷ capacity.' : /avg|rate|pass|score/.test(ln) ? 'Percentage for the metric named beside it.' : 'A percentage — this item’s share of its total.';
  if (/d$/.test(tok) || /age|oldest/.test(prev.toLowerCase())) return /oldest/.test(prev.toLowerCase()) ? 'Age in days of the oldest claim in this group.' : /avg/.test(prev.toLowerCase() + ln) ? 'Average age in days of these claims.' : 'Age in days from the aging basis (DOS or last billed).';
  if (/^claims?$/i.test(next)) return 'Number of distinct claims.';
  if (/^touch(es)?$/i.test(next) || /touches/.test(ln) && /capacity/.test(ln)) return 'Work touches (calls, portal checks, resubmissions) — assigned or planned.';
  if (/^(days?|d)$/i.test(next)) return 'Number of days.';
  if (/^\d+$/.test(tok) && el.closest('[class*="rounded-full"],[class*="chip"],.tag') && own(el) === tok) return 'Number of claims in this group (hover the row for its payer / client).';
  return null;
}

export function describe(target: Element | null, x = 0, y = 0): string | null {
  const explicit = target?.closest('[data-tip]'); if (explicit) return explicit.getAttribute('data-tip');
  const tk = tokenAt(x, y); if (tk && target) { const r = byToken(tk, target); if (r) return r; }
  const m = findMetric(target); if (!m) return null;
  const { label, ctx } = labelFor(m); const value = own(m);
  const g = GLOSSARY.find(([re]) => re.test(label) || (!label && re.test(value)))?.[1];
  const what = g || (/%/.test(value) ? 'A percentage for this metric.' : /\$/.test(value) ? 'A dollar amount.' : 'A count or measure for this metric.');
  return `${label ? label + ' — ' : ''}${what}${ctx ? ` (row: ${ctx})` : ''}`;
}

export function HoverHelp() {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined; let anchor = { x: 0, y: 0 }; let last: Element | null = null;
    const hide = () => { clearTimeout(timer); setTip(null); };
    const move = (e: MouseEvent) => {
      const same = e.target === last && Math.abs(e.clientX - anchor.x) < SLOP && Math.abs(e.clientY - anchor.y) < SLOP; if (same) return;
      hide(); last = e.target as Element; anchor = { x: e.clientX, y: e.clientY };
      const target = last; timer = setTimeout(() => { const text = describe(target, anchor.x, anchor.y); if (text) setTip({ x: anchor.x, y: anchor.y, text }); }, DELAY);
    };
    window.addEventListener('mousemove', move); window.addEventListener('mousedown', hide); window.addEventListener('keydown', hide); window.addEventListener('scroll', hide, true);
    return () => { clearTimeout(timer); window.removeEventListener('mousemove', move); window.removeEventListener('mousedown', hide); window.removeEventListener('keydown', hide); window.removeEventListener('scroll', hide, true); };
  }, []);
  if (!tip) return null;
  const left = Math.min(tip.x + 10, window.innerWidth - 260); const flip = tip.y + 90 > window.innerHeight;
  return <div role="tooltip" className="fixed z-[80] max-w-[240px] rounded-lg px-2.5 py-1.5 text-[11.5px] leading-snug shadow-xl pointer-events-none animate-in" style={{ left, top: flip ? tip.y - 56 : tip.y + 18, background: 'var(--ink)', color: 'var(--ink-fg)' }}>{tip.text}</div>;
}
