import { describe, expect, it } from 'vitest';
import { buildIndex, lookupCode, makeSearcher, parseCode } from '../src/lib/kbsearch';
import { RCM_ARTICLES } from '../src/lib/rcmcontent';

const load = async () => { const m = await Promise.all([import('../src/lib/kb/scen.json'), import('../src/lib/kb/codes.json'), import('../src/lib/kb/playbooks.json'), import('../src/lib/kb/learn.json')]); return Object.assign({}, ...m.map((x: any) => x.default)) as any; };

describe('knowledge search', () => {
  it('recognises codes typed any way', () => {
    expect(parseCode('co-50')).toEqual({ kind: 'carc', num: '50', group: 'CO' }); expect(parseCode('PR 1')).toEqual({ kind: 'carc', num: '1', group: 'PR' }); expect(parseCode('197')).toEqual({ kind: 'carc', num: '197' }); expect(parseCode('n115')).toEqual({ kind: 'rarc', code: 'N115' }); expect(parseCode('MA130')).toEqual({ kind: 'rarc', code: 'MA130' }); expect(parseCode('timely filing')).toBeNull(); expect(parseCode('co')).toBeNull();
  });
  it('looks codes up with meaning, plain English, action and the matching denial guide', async () => {
    const kb = await load(); const h = lookupCode(kb, 'co50')!; expect(h.carc!.code).toBe('50'); expect(h.carc!.desc.toLowerCase()).toContain('medical necessity'); expect(h.carc!.cause).toBe('Necessity'); expect(h.carc!.action.length).toBeGreaterThan(3); expect(h.scenario?.code).toMatch(/50/); expect(h.groupLabel).toBeTruthy();
    const r = lookupCode(kb, 'N115')!; expect(r.rarc!.desc).toMatch(/LCD/); expect(lookupCode(kb, 'zzz')).toBeNull(); expect(lookupCode(kb, '999')).toBeNull();
  });
  it('finds guides, procedures, codes and glossary terms from plain words, with a balanced mix', async () => {
    const kb = await load(); const s = makeSearcher(buildIndex(kb, RCM_ARTICLES)); const tf = s('timely filing'); expect(tf.length).toBeGreaterThan(3); expect(tf.some((x) => x.kind === 'denial')).toBe(true); expect(tf.some((x) => x.kind === 'howto')).toBe(true);
    expect(s('how do i read an era').some((x) => /ERA|835|remit/i.test(x.title))).toBe(true); expect(s('x')).toEqual([]); const all = s('claim', 30); for (const k of ['denial', 'howto', 'code', 'term']) expect(all.filter((x) => x.kind === k).length).toBeLessThanOrEqual(6);
    expect(s('local coverage determination').some((x) => x.kind === 'code')).toBe(true);
  });
});
