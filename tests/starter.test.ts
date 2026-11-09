import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/lib/defaults';
import { validateOption } from '../src/lib/engine/adminvalidate';
import { LIST_SAMPLES } from '../src/lib/samples';

describe('starter content', () => {
  const cfg = defaultConfig() as any[];
  it('ships denial codes, articles, playbooks, letters and snippets', () => { const n = (c: string) => cfg.filter((o) => o.category === c).length; expect(n('carc')).toBeGreaterThanOrEqual(28); expect(n('kb_article')).toBeGreaterThanOrEqual(10); expect(n('playbook')).toBeGreaterThanOrEqual(57); expect(n('letter')).toBeGreaterThanOrEqual(13); expect(n('snippet')).toBeGreaterThanOrEqual(20); });
  it('every starter row passes the same validation the Admin editor applies', () => { const bad = cfg.map((o) => ({ o, e: validateOption(o, cfg) })).filter((x) => x.e.length).map((x) => `${x.o.category}:${x.o.value}: ${x.e[0].msg}`); expect(bad).toEqual([]); });
  it('every sample row passes validation', () => { for (const [cat, rows] of Object.entries(LIST_SAMPLES)) for (const r of rows) { const meta: Record<string, any> = {}; for (const [k, v] of Object.entries(r)) if (k.startsWith('meta.')) meta[k.slice(5)] = /^\d+$/.test(v) ? Number(v) : v; const o = { id: 'x', category: cat, value: r.value, parent: null, label: null, color: r.color || null, sort: 0, active: true, meta }; expect(validateOption(o as any, [o as any]).map((e) => e.msg), `${cat}:${r.value}`).toEqual([]); } });
});

import { kbCarcRows } from '../src/lib/kb/seedcarc';
import codes from '../src/lib/kb/codes.json';
describe('reference dictionary → Admin denial codes', () => {
  it('produces 150+ valid, unique rows without clobbering existing codes', () => { const rows = kbCarcRows(codes as any, new Set(['CO-45']), 0); expect(rows.length).toBeGreaterThan(150); expect(new Set(rows.map((r) => r.value)).size).toBe(rows.length); expect(rows.some((r) => r.value === 'CO-45')).toBe(false); const bad = rows.filter((r) => validateOption({ ...r, id: 'x' } as any, []).length); expect(bad.map((b) => b.value)).toEqual([]); });
});
