import type { TableName } from '../types';
import type { DB, Row } from './types';

const KEY = 'arms:demo:v2';
type Tables = Partial<Record<TableName, Row[]>>;

const IDB = 'arms-demo'; const STORE = 'kv';
const hasIdb = () => typeof indexedDB !== 'undefined';
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((res) => {
    try {
      const open = indexedDB.open(IDB, 1); open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => res(undefined);
      open.onsuccess = () => { const tx = open.result.transaction(STORE, mode); const rq = fn(tx.objectStore(STORE)); tx.oncomplete = () => { res(rq.result); open.result.close(); }; tx.onerror = tx.onabort = () => { res(undefined); open.result.close(); }; };
    } catch { res(undefined); }
  });
}
/** Demo data lives in IndexedDB (localStorage's ~5 MB quota cannot hold thousands of claims); old localStorage data is migrated once. */
async function loadSaved(): Promise<Tables | null> {
  if (hasIdb()) { const v = await idb<Tables>('readonly', (s) => s.get(KEY) as IDBRequest<Tables>); if (v) return v; }
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export async function localReset() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } if (hasIdb()) await idb('readwrite', (s) => s.delete(KEY)); }
export const SEED_KEY = 'arms:seedsize';
export const seedSize = (): 'demo' | 'large' => { try { return localStorage.getItem(SEED_KEY) === 'large' ? 'large' : 'demo'; } catch { return 'demo'; } };

const UNIQUE: Partial<Record<TableName, string[]>> = {
  claims: ['client_id', 'claim_no'], config_options: ['category', 'parent', 'value'], app_settings: ['key'], import_templates: ['name'], invites: ['email'],
};

const pk = (t: TableName, r: Row) => (t === 'app_settings' ? r.key : t === 'invites' ? r.email : t === 'payer_form_files' ? r.form_id : r.id);

export async function createLocalDB(seed: () => Tables): Promise<DB> {
  let data: Tables = (await loadSaved()) || seed();
  let timer: any;
  const flush = () => { if (hasIdb()) void idb('readwrite', (s) => s.put(data, KEY)); else { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* quota */ } } };
  const persist = () => { clearTimeout(timer); timer = setTimeout(flush, 400); };
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { clearTimeout(timer); flush(); });
  persist();
  const tbl = (t: TableName) => (data[t] ||= []);
  const keyOf = (t: TableName, r: Row, oc?: string) => {
    const cols = oc ? oc.split(',') : UNIQUE[t] || ['id'];
    return cols.map((c) => String(r[c] ?? '')).join('||');
  };
  return {
    mode: 'local',
    async list(t) { return tbl(t).map((r) => ({ ...r })); },
    async find(t, where = {}, opts = {}) {
      let r = tbl(t).filter((x) => Object.entries(where).every(([k, v]) => x[k] === v));
      if (opts.order) { const o = opts.order; r = [...r].sort((a, b) => (a[o] < b[o] ? -1 : a[o] > b[o] ? 1 : 0) * (opts.desc ? -1 : 1)); }
      return (opts.limit ? r.slice(0, opts.limit) : r).map((x) => ({ ...x }));
    },
    async upsert(t, rows, oc) {
      const arr = tbl(t);
      const idx = new Map(arr.map((r, i) => [keyOf(t, r, oc), i]));
      const idIdx = new Map(arr.map((r, i) => [r.id, i]));
      for (const r of rows) {
        const k = keyOf(t, r, oc);
        const i = idx.get(k) ?? (r.id !== undefined ? idIdx.get(r.id) : undefined);
        if (i !== undefined) arr[i] = { ...arr[i], ...r };
        else { arr.push({ ...r }); idx.set(k, arr.length - 1); if (r.id) idIdx.set(r.id, arr.length - 1); }
      }
      persist();
    },
    async update(t, ids, patch) {
      const s = new Set(ids);
      for (const r of tbl(t)) {
        const key = pk(t, r);
        if (s.has(key)) Object.assign(r, patch);
      }
      persist();
    },
    async remove(t, ids) {
      const s = new Set(ids);
      data[t] = tbl(t).filter((r) => !s.has(pk(t, r)));
      if (t === 'claims') {
        for (const child of ['work_log', 'claim_notes', 'claim_activity', 'recoveries'] as TableName[]) data[child] = tbl(child).filter((r) => !s.has(r.claim_id));
      }
      if (t === 'clients') {
        for (const child of ['claims', 'work_log', 'providers', 'recoveries', 'import_batches', 'import_log'] as TableName[]) data[child] = tbl(child).filter((r) => !s.has(r.client_id));
      }
      if (t === 'import_batches') data.import_log = tbl('import_log').filter((r) => !s.has(r.batch_id));
      persist();
    },
  };
}
