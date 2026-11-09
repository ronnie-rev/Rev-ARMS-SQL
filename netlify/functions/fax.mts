// Send a fax from ClaimsIQ. Credentials live only in Netlify environment variables.
//   POST   ?action=send      (signed-in staff)  body: { to, pdfBase64, subject, pages, claimId, appealId, clientId }
//   GET    ?action=ping      (signed-in manager+)  → which provider is configured and which server settings are present (names only)
//   POST   ?action=callback  (provider webhook)  → updates the delivery status in fax_log;  protect with FAX_CALLBACK_SECRET
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, plus the selected provider's keys (see Admin → Fax setup). Provider/from-number/limits come from the fax_cfg setting.
import { PROVIDERS, envReport, parseCallback, sendFax, type FaxProvider } from '../../src/lib/fax/adapters';
import { MAX_FAX_BYTES, normalizeFax, resolveFaxCfg } from '../../src/lib/engine/fax';

const env = (k: string) => (globalThis as any).Netlify?.env?.get?.(k) ?? process.env[k];
const SB = () => String(env('SUPABASE_URL')).replace(/\/$/, ''); const KEY = () => env('SUPABASE_SERVICE_ROLE_KEY')!;
const H = (extra: Record<string, string> = {}) => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json', ...extra });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const SEND_ROLES = ['sr_mgmt', 'manager', 'tl_prod_qa', 'tl_qa', 'sme_prod_qa', 'sme_qa', 'user_prod_qa', 'user_prod']; const ADMIN_ROLES = ['sr_mgmt', 'manager', 'sys_admin'];
async function rest<T = any>(path: string, init?: RequestInit): Promise<T> { const r = await fetch(`${SB()}/rest/v1/${path}`, { ...init, headers: { ...H(), ...(init?.headers as any) } }); if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`); const t = await r.text(); return (t ? JSON.parse(t) : null) as T; }
async function caller(req: Request): Promise<{ id: string; role: string; name: string; scope: string; clients: string[] } | null> {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /i, ''); if (!jwt) return null;
  const u = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${jwt}` } }); if (!u.ok) return null; const { id } = (await u.json()) as { id: string };
  const p = (await rest<any[]>(`profiles?id=eq.${id}&active=eq.true&select=role,full_name,client_scope,client_ids`))?.[0]; return p ? { id, role: p.role, name: p.full_name, scope: p.client_scope as string, clients: (p.client_ids || []) as string[] } : null;
}
export default async (req: Request) => {
  const url = new URL(req.url); const action = url.searchParams.get('action') || 'send';
  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY')) return json({ error: 'Fax is not configured on the server (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' }, 500);
  const cfg = resolveFaxCfg(((await rest<any[]>('app_settings?key=eq.fax_cfg&select=value'))?.[0]?.value) || null); const provider = cfg.provider as FaxProvider;
  if (action === 'callback') {
    const secret = env('FAX_CALLBACK_SECRET'); if (secret && url.searchParams.get('secret') !== secret) return json({ error: 'forbidden' }, 403);
    const ct = req.headers.get('content-type') || ''; const body = ct.includes('json') ? await req.json() : Object.fromEntries((await req.formData()).entries()); const ev = parseCallback(provider, body); if (!ev) return json({ ok: true, ignored: true });
    await rest(`fax_log?provider=eq.${provider}&provider_id=eq.${encodeURIComponent(ev.providerId)}`, { method: 'PATCH', body: JSON.stringify({ status: ev.status, error: ev.error ?? null, delivered_at: ev.status === 'sent' ? new Date().toISOString() : null }) }); return json({ ok: true });
  }
  const me = await caller(req); if (!me) return json({ error: 'Sign in again' }, 401);
  if (action === 'ping') { if (!ADMIN_ROLES.includes(me.role)) return json({ error: 'forbidden' }, 403); return json({ enabled: cfg.enabled, provider, label: PROVIDERS[provider]?.label, env: envReport(provider, process.env as any), callback: `${url.origin}/.netlify/functions/fax?action=callback${env('FAX_CALLBACK_SECRET') ? '&secret=…' : ''}` }); }
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405); if (!SEND_ROLES.includes(me.role)) return json({ error: 'Your role cannot send faxes' }, 403); if (!cfg.enabled) return json({ error: 'Fax sending is switched off (Admin → Fax setup)' }, 409);
  const b: any = await req.json().catch(() => null); const to = normalizeFax(b?.to); if (!to) return json({ error: 'That is not a valid fax number' }, 400); if (typeof b?.pdfBase64 !== 'string') return json({ error: 'No document attached' }, 400);
  if (me.scope === 'assigned') { const cid = b.clientId || (b.claimId ? (await rest<any[]>(`claims?id=eq.${encodeURIComponent(b.claimId)}&select=client_id`))?.[0]?.client_id : null); if (cid && !me.clients.includes(cid)) return json({ error: 'You are not assigned to that client' }, 403); if (!cid && (b.claimId || b.appealId)) return json({ error: 'Claim not found' }, 404); }
  const pdf = Uint8Array.from(Buffer.from(b.pdfBase64, 'base64')); if (pdf.length < 100 || pdf.length > MAX_FAX_BYTES) return json({ error: `Document must be under ${Math.round(MAX_FAX_BYTES / 1e6)} MB` }, 413); if (!(Number(b.pages) >= 1 && Number(b.pages) <= cfg.maxPages)) return json({ error: `Faxes are limited to ${cfg.maxPages} pages` }, 413);
  const recent = await rest<any[]>(`fax_log?sent_by=eq.${me.id}&created_at=gte.${new Date(Date.now() - 20 * 60000).toISOString()}&select=id`); if ((recent || []).length >= 30) return json({ error: 'Too many faxes in a short time — wait a few minutes' }, 429);
  const row = { id: crypto.randomUUID(), appeal_id: b.appealId || null, claim_id: b.claimId || null, client_id: b.clientId || null, to_number: to, subject: String(b.subject || '').slice(0, 200), pages: Number(b.pages), provider, provider_id: null as string | null, status: 'queued', error: null as string | null, sent_by: me.id, sent_by_name: me.name };
  const cb = provider === 'phaxio' ? `${url.origin}/.netlify/functions/fax?action=callback${env('FAX_CALLBACK_SECRET') ? `&secret=${env('FAX_CALLBACK_SECRET')}` : ''}` : undefined;
  const res = await sendFax(provider, { to, pdf, subject: row.subject, fromNumber: cfg.fromNumber ? normalizeFax(cfg.fromNumber) || cfg.fromNumber : undefined, callbackUrl: cb, tag: row.id }, process.env as any);
  row.provider_id = res.providerId || null; row.status = res.ok ? (provider === 'mock' ? 'sent' : 'queued') : 'failed'; row.error = res.error || null;
  await rest('fax_log', { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=minimal' } });
  await rest('audit_log', { method: 'POST', body: JSON.stringify({ kind: res.ok ? 'fax_sent' : 'fax_failed', actor_name: me.name, entity: 'fax_log', entity_id: row.id, summary: `Fax to ${to} (${row.pages} pages) ${res.ok ? 'queued' : 'failed: ' + res.error}`, meta: { claim_id: row.claim_id } }), headers: { Prefer: 'return=minimal' } }).catch(() => {});
  return res.ok ? json({ ok: true, row }) : json({ ok: false, error: res.error, row }, 502);
};
