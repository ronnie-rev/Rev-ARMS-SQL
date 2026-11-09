import { describe, it, expect } from 'vitest';
import { loadKb, scenarioIndex, scenariosFor, routeFor, splitDenials, carcMeaning } from '../src/lib/kb';
describe('knowledge base', async () => {
  const kb = await loadKb(); const idx = scenarioIndex(kb);
  it('loads the imported content', () => { expect(kb.SCEN.length).toBeGreaterThan(150); expect(kb.CARC.length).toBeGreaterThan(150); expect(kb.GUIDES.length).toBeGreaterThan(10); expect(kb.CONCEPTS.length).toBeGreaterThan(40); expect(Object.keys(kb.REFDB).length).toBeGreaterThan(10); });
  it('every scenario has a usable flow', () => { for (const s of kb.SCEN) { expect(s.flow.start.length, s.code).toBeGreaterThan(0); expect(s.action.length, s.code).toBeGreaterThan(0); } });
  it('matches claim denial codes incl. grouped codes', () => {
    expect(splitDenials('co45, PR-1;CO50')).toEqual(['CO-45', 'PR-1', 'CO-50']);
    expect(scenariosFor(kb, idx, 'CO-50')[0]?.code).toBe('CO-50'); expect(scenariosFor(kb, idx, 'CO-140')[0]?.code).toBe('CO-31/140'); expect(scenariosFor(kb, idx, 'PR-2')[0]?.code).toBe('PR-1/2/3');
  });
  it('routes to the owning team', () => { expect(routeFor(kb, 'CO-4')?.teams.join()).toContain('Coding'); expect(routeFor(kb, 'CO-22')?.teams.length).toBeGreaterThan(0); });
  it('decodes CARC', () => expect(carcMeaning(kb, 'CO-45')?.desc).toBeTruthy());
  it('triage tree only points at real nodes or scenarios', () => { const codes = new Set(kb.SCEN.map((s) => s.code)); const bad: string[] = []; for (const [k, n] of Object.entries(kb.TRI)) for (const [, to] of n.a) { if (to.startsWith('@')) { if (to !== '@rej' && !codes.has(to.slice(1)) && !idx.has(to.slice(1))) bad.push(k + '→' + to); } else if (!kb.TRI[to]) bad.push(k + '→' + to); } expect(bad).toEqual([]); });
});
