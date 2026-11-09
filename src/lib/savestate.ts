import { useSyncExternalStore } from 'react';
import type { DB } from './db/types';
// Global save tracking for multi-user use: every write is counted, retried on transient failures, and surfaced in the header ("Saving… / All changes saved / Not saved — retry").
interface S { pending: number; lastSaved: number | null; error: string | null }
let s: S = { pending: 0, lastSaved: null, error: null }; const subs = new Set<() => void>(); const emit = () => subs.forEach((f) => f());
const set = (p: Partial<S>) => { s = { ...s, ...p }; emit(); };
export const useSaveState = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => s);
export const clearSaveError = () => set({ error: null });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const transient = (e: any) => /fetch|network|timeout|502|503|504|failed to/i.test(String(e?.message || e));
async function run<T>(f: () => Promise<T>): Promise<T> {
  set({ pending: s.pending + 1 });
  try { for (let i = 0; ; i++) { try { const r = await f(); set({ pending: s.pending - 1, lastSaved: Date.now(), error: s.pending - 1 > 0 ? s.error : null }); return r; } catch (e) { if (i < 2 && transient(e)) { await sleep(600 * 2 ** i); continue; } throw e; } } }
  catch (e: any) { set({ pending: s.pending - 1, error: String(e?.message || e) }); throw e; }
}
export function wrapDb(db: DB): DB {
  return { ...db, upsert: (t, r, c) => run(() => db.upsert(t, r, c)), update: (t, i, p) => run(() => db.update(t, i, p)), remove: (t, i) => run(() => db.remove(t, i)) };
}
if (typeof window !== 'undefined') window.addEventListener('beforeunload', (e) => { if (s.pending > 0) { e.preventDefault(); e.returnValue = ''; } });
