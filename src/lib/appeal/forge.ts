import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { EXTRA_ARCHETYPES } from './extra-archetypes';
import { mergeLibrary, type ForgeContent, type ForgeOverrides } from '../engine/appealforge';

let cache: Promise<ForgeContent> | null = null;
/** The 600 KB content library is loaded on demand, never on first paint. */
export const loadForgeContent = (): Promise<ForgeContent> => (cache ||= import('./forge-content.json').then((m) => { const c = (m.default || m) as unknown as ForgeContent; return { ...c, archetypes: [...c.archetypes, ...EXTRA_ARCHETYPES.filter((x) => !c.archetypes.some((y) => y.code === x.code))] }; }));
/** Library (built-in + this workspace's manager overrides), or null while loading. */
export function useForge(): { lib: ForgeContent | null; base: ForgeContent | null; overrides: ForgeOverrides } {
  const [base, setBase] = useState<ForgeContent | null>(null); const raw = useStore((s) => s.settings.appeal_lib) as ForgeOverrides | undefined;
  useEffect(() => { let on = true; void loadForgeContent().then((c) => on && setBase(c)); return () => { on = false; }; }, []);
  const overrides = useMemo<ForgeOverrides>(() => raw || {}, [raw]); const lib = useMemo(() => (base ? mergeLibrary(base, overrides) : null), [base, overrides]);
  return { lib, base, overrides };
}
export const letterheadOf = (client: { name: string; settings: Record<string, unknown> } | undefined) => ((client?.settings?.letterhead as Record<string, string | boolean | undefined>) || {}) as { name?: string; address?: string; phone?: string; fax?: string; npi?: string; taxId?: string; logo?: string; logoTextOnly?: boolean };
