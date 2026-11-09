// Import a practice's Appeal Forge setup (payers' appeal addresses, practices' letterhead data, providers, senders) into ClaimsIQ without overwriting anything already filled in.
import type { Client, ConfigOption, Provider } from '../types';
export interface ForgePayer { insuranceName: string; appealAddress?: string; appealCity?: string; appealState?: string; appealZip?: string; appealFax?: string; appealPhone?: string; portalUrl?: string; timelyFilingDays?: string; secondLevelNote?: string }
export interface ForgeClient { name: string; code?: string; address1?: string; address2?: string; city?: string; state?: string; zip?: string; phone?: string; fax?: string; groupNPI?: string; taxId?: string; logo?: string; legalName?: string }
export interface ForgeProvider { practice?: string; name: string; role?: string; npi?: string; credentials?: string }
export interface ForgeSender { name: string; title?: string; practice?: string; email?: string; phone?: string }
export interface ForgeSetup { payers?: ForgePayer[]; clients?: ForgeClient[]; providers?: ForgeProvider[]; senders?: ForgeSender[] }
export interface SetupPlan { payers: { create: ConfigOption[]; update: ConfigOption[]; unchanged: number }; clients: { update: Client[]; create: Client[]; unmatched: string[] }; providers: { create: Provider[]; skipped: number; unmatched: number }; senders: number }
const key = (s: string | null | undefined) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const fillMissing = <T extends Record<string, any>>(cur: T, add: Record<string, any>): { next: T; changed: boolean } => { const next: any = { ...cur }; let changed = false; for (const [k, v] of Object.entries(add)) if (v != null && String(v).trim() !== '' && (next[k] == null || String(next[k]).trim() === '')) { next[k] = v; changed = true; } return { next, changed }; };
/** What would change, without touching anything: fills blanks only, never overwrites values you already entered. */
export function planForgeSetup(data: ForgeSetup, cur: { payers: ConfigOption[]; clients: Client[]; providers: Provider[] }, o: { createClients?: boolean; uid: () => string; palette?: string[] }): SetupPlan {
  const plan: SetupPlan = { payers: { create: [], update: [], unchanged: 0 }, clients: { update: [], create: [], unmatched: [] }, providers: { create: [], skipped: 0, unmatched: 0 }, senders: 0 };
  const byPayer = new Map(cur.payers.map((p) => [key(p.value), p]));
  for (const p of data.payers || []) {
    if (!p.insuranceName?.trim()) continue; const meta = { appeal_address: p.appealAddress, appeal_city_state_zip: [p.appealCity, [p.appealState, p.appealZip].filter(Boolean).join(' ')].filter(Boolean).join(', '), appeal_fax: p.appealFax, appeal_phone: p.appealPhone, appeal_portal: p.portalUrl, tf_days: p.timelyFilingDays ? Number(p.timelyFilingDays) || undefined : undefined, appeal_note: p.secondLevelNote };
    const ex = byPayer.get(key(p.insuranceName));
    if (!ex) { plan.payers.create.push({ id: o.uid(), category: 'payer', value: p.insuranceName.trim(), parent: null, sort: cur.payers.length + plan.payers.create.length, active: true, color: null, meta: Object.fromEntries(Object.entries(meta).filter(([, v]) => v != null && String(v).trim() !== '')) } as any); continue; }
    const r = fillMissing(ex.meta as Record<string, any>, meta); if (r.changed) plan.payers.update.push({ ...ex, meta: r.next }); else plan.payers.unchanged++;
  }
  const clientByName = new Map<string, Client>(); for (const c of cur.clients) { clientByName.set(key(c.name), c); if (c.code) clientByName.set(key(c.code), c); }
  const matched = new Map<string, Client>();
  for (const c of data.clients || []) {
    let ex = clientByName.get(key(c.name)) || (c.code ? clientByName.get(key(c.code)) : undefined); const lh = { name: c.legalName || c.name, address: [c.address1, c.address2, [c.city, c.state, c.zip].filter(Boolean).join(', ')].filter(Boolean).join(', '), phone: c.phone, fax: c.fax, npi: c.groupNPI, taxId: c.taxId };
    if (!ex) { if (o.createClients) { const nc: Client = { id: o.uid(), name: c.name, code: c.code || null, pms: 'Standard', color: (o.palette || ['#6366f1'])[plan.clients.create.length % (o.palette || ['#6366f1']).length], supervisor_id: null, aging_basis: 'dos', tf_days: null, rca_allowed: null, active: true, settings: { letterhead: Object.fromEntries(Object.entries(lh).filter(([, v]) => v)) } }; plan.clients.create.push(nc); matched.set(key(c.name), nc); } else plan.clients.unmatched.push(c.name); continue; }
    matched.set(key(c.name), ex); const r = fillMissing(((ex.settings as any)?.letterhead || {}) as Record<string, any>, lh); if (r.changed) plan.clients.update.push({ ...ex, settings: { ...ex.settings, letterhead: r.next } });
  }
  const have = new Set(cur.providers.map((p) => `${p.client_id}|${key(p.name)}`));
  for (const p of data.providers || []) {
    const cl = matched.get(key(p.practice)); if (!cl) { plan.providers.unmatched++; continue; } const k = `${cl.id}|${key(p.name)}`; if (have.has(k)) { plan.providers.skipped++; continue; } have.add(k);
    plan.providers.create.push({ id: o.uid(), client_id: cl.id, name: p.name.trim(), type: p.role || 'Main Surgeon', npi: p.npi || null, credentials: p.credentials || null });
  }
  plan.senders = (data.senders || []).filter((s) => matched.has(key(s.practice))).length; return plan;
}
export function applySenders(data: ForgeSetup, clients: Client[]): Client[] {
  const out: Client[] = []; for (const c of clients) { const mine = (data.senders || []).filter((s) => key(s.practice) === key(c.name)); if (!mine.length) continue; const cur = ((c.settings as any).senders || []) as ForgeSender[]; const add = mine.filter((s) => !cur.some((x) => key(x.name) === key(s.name))); if (add.length) out.push({ ...c, settings: { ...c.settings, senders: [...cur, ...add] } }); } return out;
}
