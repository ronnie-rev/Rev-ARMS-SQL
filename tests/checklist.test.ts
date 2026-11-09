import { describe, expect, it } from 'vitest';
import { codeMatches, matchChecklists, parseSteps, progress } from '../src/lib/engine/checklist';
const pb = (id: string, value: string, meta: any) => ({ id, category: 'playbook', value, active: true, sort: 0, meta } as any);
describe('checklists', () => {
  it('matches code patterns', () => { expect(codeMatches('CO-29', 'CO-29')).toBe(true); expect(codeMatches('29', 'PR-29')).toBe(true); expect(codeMatches('CO-*', 'CO-45')).toBe(true); expect(codeMatches('CO-*', 'PR-1')).toBe(false); expect(codeMatches('*', 'OA-23')).toBe(true); expect(codeMatches('CO-29', 'CO-290')).toBe(false); });
  it('prefers code-tied playbooks, then RCA detail', () => {
    const l = matchChecklists([pb('1', 'By RCA', { steps: 'a' }), pb('2', 'Untimely', { codes: 'CO-29', steps: '!Find proof\nAppeal' })], { codes: ['CO-29'], rcaDetail: 'By RCA' });
    expect(l.map((x) => x.id)).toEqual(['2', '1']); expect(l[0].steps[0]).toEqual({ text: 'Find proof', required: true });
  });
  it('code-tied playbooks never match by RCA alone; inactive skipped', () => { expect(matchChecklists([pb('1', 'X', { codes: 'CO-1', steps: 'a' }), { ...pb('2', 'Y', { steps: 'a' }), active: false }], { codes: [], rcaDetail: 'X' })).toEqual([]); });
  it('progress counts required', () => { const [c] = matchChecklists([pb('1', 'T', { codes: '*', steps: '!a\nb' })], { codes: ['CO-1'] }); expect(progress(c, [1])).toEqual({ done: 1, total: 2, requiredLeft: 1 }); expect(parseSteps('')).toEqual([]); });
});

import { BASE_CHECKLIST, scenarioChecklist } from '../src/lib/engine/checklist';
describe('knowledge-hub checklists', () => {
  it('turns a scenario into verify → decide → branch → resolve → document', () => {
    const c = scenarioChecklist({ code: 'CO-29', t: 'Timely filing', what: 'Filed late', causes: [], flow: { start: ['Pull submission date'], check: 'Is there proof?', yes: ['Appeal with proof'], no: ['Write off'] }, exceptions: ['Payer error'], action: 'Appeal', ask: ['What is the TFL?'] });
    const t = c.steps.map((s) => s.text); expect(t[0]).toContain('Filed late'); expect(t).toContain('If yes → Appeal with proof'); expect(t.at(-1)).toContain('Record call reference'); expect(c.steps.filter((s) => s.required).length).toBeGreaterThan(2);
  });
  it('baseline applies to every denial', () => { expect(BASE_CHECKLIST.steps.length).toBeGreaterThanOrEqual(5); });
});
