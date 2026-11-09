// Expected reimbursement: what a claim SHOULD bring in. Precedence (per client, configurable): contract / custom fee schedule (CPT-level allowable)
// → payer flat % of billed → client GCR (gross collection rate). Pure and unit-tested; recalculated on import and whenever setup changes.
import type { Claim, Client, FeeRate, FeeSchedule } from '../types';

export type ExpectedSrc = 'fee_schedule' | 'payer_pct' | 'gcr' | 'manual';
export const SRC_LABEL: Record<ExpectedSrc, string> = { fee_schedule: 'Fee schedule', payer_pct: 'Payer %', gcr: 'Client GCR', manual: 'Manual' };
export type Method = 'auto' | 'fee_schedule' | 'payer_pct' | 'gcr';
export interface ClientReimb { method: Method; gcr_pct: number | null; /** canonical payer (lower-case) → % of billed */ payer_pct: Record<string, number> }
export interface ReimbCfg { precedence: Exclude<ExpectedSrc, 'manual'>[]; defaults: { gcr_pct: number | null }; underpay: { minDollars: number; minPct: number; lookbackDays: number; systemicCount: number } }
export const DEFAULT_REIMB_CFG: ReimbCfg = { precedence: ['fee_schedule', 'payer_pct', 'gcr'], defaults: { gcr_pct: null }, underpay: { minDollars: 10, minPct: 5, lookbackDays: 180, systemicCount: 5 } };
export const resolveReimbCfg = (raw?: Partial<ReimbCfg> | null): ReimbCfg => { const r = (raw || {}) as Partial<ReimbCfg>; const d = DEFAULT_REIMB_CFG; return { ...d, ...r, defaults: { ...d.defaults, ...(r.defaults || {}) }, underpay: { ...d.underpay, ...(r.underpay || {}) }, precedence: r.precedence?.length ? r.precedence : d.precedence }; };
export const clientReimb = (c: Pick<Client, 'settings'> | undefined | null): ClientReimb => { const r = ((c?.settings as any)?.reimb || {}) as Partial<ClientReimb>; return { method: r.method || 'auto', gcr_pct: r.gcr_pct ?? null, payer_pct: r.payer_pct || {} }; };
export const validateClientReimb = (r: ClientReimb): string[] => { const e: string[] = []; const ok = (n: number | null | undefined) => n == null || (Number.isFinite(n) && n > 0 && n <= 200); if (!ok(r.gcr_pct)) e.push('GCR must be a % between 0 and 200'); for (const [p, v] of Object.entries(r.payer_pct)) if (!ok(v)) e.push(`Payer % for ${p} must be between 0 and 200`); if (r.method === 'gcr' && r.gcr_pct == null) e.push('Method “client GCR” needs a GCR %'); return e; };

const norm = (s: string | null | undefined) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export type RatesIndex = Map<string, Map<string, number>>;     // schedule id → cpt → amount
export const buildRatesIndex = (rates: Pick<FeeRate, 'schedule_id' | 'cpt' | 'amount'>[]): RatesIndex => { const m: RatesIndex = new Map(); for (const r of rates) { let x = m.get(r.schedule_id); if (!x) m.set(r.schedule_id, (x = new Map())); const k = r.cpt.trim().toUpperCase(); if (!x.has(k)) x.set(k, r.amount); } return m; };
export const cptCodes = (cpt: string | null | undefined): string[] => [...new Set((cpt || '').toUpperCase().split(/[,;\s/|]+/).map((x) => x.replace(/-\w{2}$/, '').trim()).filter((x) => /^[A-Z0-9]{4,5}$/.test(x)))];

export interface ExpectCtx { client?: Pick<Client, 'id' | 'settings'>; cfg: ReimbCfg; schedules: FeeSchedule[]; rates: RatesIndex; canon?: (payer: string) => string }
export interface Expected { amount: number; src: ExpectedSrc; detail: string; schedule?: string; missing?: string[] }
const specificity = (s: FeeSchedule, clientId: string, payer: string) => (s.client_id === clientId ? 2 : 0) + (s.payer && norm(s.payer) === payer ? 1 : 0);
/** fee schedules that apply to this claim, most specific (then newest) first */
export function schedulesFor(c: Claim, ctx: ExpectCtx): FeeSchedule[] {
  const payer = norm(ctx.canon ? ctx.canon(c.payer || '') : c.payer);
  return ctx.schedules.filter((s) => s.active && (!s.client_id || s.client_id === c.client_id) && (!s.payer || norm(s.payer) === payer) && (!c.dos || ((!s.effective_from || s.effective_from <= c.dos) && (!s.effective_to || s.effective_to >= c.dos))))
    .sort((a, b) => specificity(b, c.client_id, payer) - specificity(a, c.client_id, payer) || (b.effective_from || '').localeCompare(a.effective_from || ''));
}
export function expectedFor(c: Claim, ctx: ExpectCtx): Expected | null {
  const cr = clientReimb(ctx.client); const billed = c.billed_amt || 0; const payer = norm(ctx.canon ? ctx.canon(c.payer || '') : c.payer);
  const order: ExpectedSrc[] = cr.method === 'auto' ? (ctx.cfg.precedence as ExpectedSrc[]) : cr.method === 'fee_schedule' ? ['fee_schedule'] : cr.method === 'payer_pct' ? ['payer_pct', 'gcr'] : ['gcr'];
  let missing: string[] | undefined;
  for (const src of order) {
    if (src === 'fee_schedule') {
      const codes = cptCodes(c.cpt); if (!codes.length) continue;
      for (const s of schedulesFor(c, ctx)) {
        const m = ctx.rates.get(s.id); if (!m) continue; const found = codes.map((k) => [k, m.get(k)] as const); const miss = found.filter(([, v]) => v == null).map(([k]) => k);
        if (miss.length) { missing = [...(missing || []), ...miss]; continue; }
        const mult = s.pct != null && (s.kind === 'medicare_pct' || s.pct !== 100) ? s.pct / 100 : 1; const amt = Math.round(found.reduce((a, [, v]) => a + (v as number), 0) * mult * 100) / 100;
        return { amount: amt, src: 'fee_schedule', detail: `${s.name}: ${codes.join(' + ')}${mult !== 1 ? ` × ${s.pct}%` : ''}`, schedule: s.id };
      }
    } else if (src === 'payer_pct') { const p = cr.payer_pct[payer]; if (p && billed > 0) return { amount: Math.round(billed * p) / 100, src, detail: `${p}% of billed for this payer` }; }
    else if (src === 'gcr') { const g = cr.gcr_pct ?? ctx.cfg.defaults.gcr_pct; if (g && billed > 0) return { amount: Math.round(billed * g) / 100, src, detail: `${g}% client GCR of billed` }; }
  }
  return missing ? { amount: 0, src: 'fee_schedule', detail: `no rate for ${[...new Set(missing)].join(', ')}`, missing } as Expected : null;
}
/** Recompute the expected column. Returns only claims whose expected value or source changed. Manual overrides are left alone. */
export function recalcExpected(claims: Claim[], clients: Map<string, Pick<Client, 'id' | 'settings'>>, base: Omit<ExpectCtx, 'client'>, now: string): { changed: Claim[]; gaps: Map<string, number> } {
  const changed: Claim[] = []; const gaps = new Map<string, number>();
  for (const c of claims) {
    if (c.expected_src === 'manual') continue;
    const e = expectedFor(c, { ...base, client: clients.get(c.client_id) }); const amt = e && !e.missing ? e.amount : null; const src = e && !e.missing ? e.src : null;
    if (e?.missing) for (const k of e.missing) gaps.set(k, (gaps.get(k) || 0) + 1);
    if ((c.expected_amt ?? null) !== amt || (c.expected_src ?? null) !== src) changed.push({ ...c, expected_amt: amt, expected_src: src, updated_at: now });
  }
  return { changed, gaps };
}
