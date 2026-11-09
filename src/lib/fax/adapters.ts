// Provider adapters for sending a fax from ClaimsIQ. Runs inside the Netlify function (credentials never reach the browser). Pure request builders + a thin fetch wrapper,
// unit-tested with a mocked fetch. Add a provider by adding an entry to PROVIDERS and a case in sendFax.
export type FaxProvider = 'mock' | 'phaxio' | 'documo' | 'srfax';
export const PROVIDERS: Record<FaxProvider, { label: string; env: string[]; fromRequired: boolean; docs: string; note: string }> = {
  mock: { label: 'Test mode (no real fax)', env: [], fromRequired: false, docs: '', note: 'Simulates sending and delivery so you can test the whole workflow safely.' },
  phaxio: { label: 'Phaxio (Sinch)', env: ['PHAXIO_API_KEY', 'PHAXIO_API_SECRET'], fromRequired: false, docs: 'https://www.phaxio.com/docs/api/v2.1/faxes/create_and_send_fax', note: 'HIPAA-eligible with a BAA. Set the callback URL in Phaxio to <site>/.netlify/functions/fax?action=callback.' },
  documo: { label: 'Documo (mFax)', env: ['DOCUMO_API_KEY'], fromRequired: false, docs: 'https://docs.documo.com/', note: 'HIPAA-compliant with a BAA. Uses the account’s default fax number as the sender.' },
  srfax: { label: 'SRFax', env: ['SRFAX_ACCESS_ID', 'SRFAX_ACCESS_PWD', 'SRFAX_SENDER_EMAIL'], fromRequired: true, docs: 'https://www.srfax.com/api/', note: 'HIPAA-compliant with a BAA. “From number” is sent as the caller ID.' },
};
export interface SendReq { to: string; pdf: Uint8Array; subject?: string; fromNumber?: string; callbackUrl?: string; tag?: string }
export interface SendRes { ok: boolean; providerId?: string; status: 'queued' | 'sent' | 'failed'; error?: string }
type Env = Record<string, string | undefined>;
/** Which required environment variables are set (names only — values never leave the server). */
export const envReport = (p: FaxProvider, env: Env) => PROVIDERS[p].env.map((name) => ({ name, set: !!env[name] }));
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const blobOf = (u: Uint8Array) => new Blob([u as BlobPart], { type: 'application/pdf' });

export async function sendFax(provider: FaxProvider, r: SendReq, env: Env, f: typeof fetch = fetch): Promise<SendRes> {
  const missing = envReport(provider, env).filter((e) => !e.set).map((e) => e.name); if (missing.length) return { ok: false, status: 'failed', error: `Missing server setting${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}` };
  if (provider === 'srfax' && !r.fromNumber) return { ok: false, status: 'failed', error: 'SRFax needs a “From number” (caller ID) in Fax setup' };
  try {
    if (provider === 'mock') return { ok: true, providerId: 'mock-' + Date.now().toString(36), status: 'queued' };
    if (provider === 'phaxio') {
      const fd = new FormData(); fd.append('to', r.to); fd.append('file', blobOf(r.pdf), 'fax.pdf'); fd.append('api_key', env.PHAXIO_API_KEY!); fd.append('api_secret', env.PHAXIO_API_SECRET!); if (r.fromNumber) fd.append('caller_id', r.fromNumber); if (r.callbackUrl) fd.append('callback_url', r.callbackUrl); if (r.tag) fd.append('tag[ref]', r.tag);
      const res = await f('https://api.phaxio.com/v2.1/faxes', { method: 'POST', body: fd }); const j: any = await res.json().catch(() => ({})); if (!res.ok || j.success === false) return { ok: false, status: 'failed', error: j.message || `Phaxio error ${res.status}` }; return { ok: true, providerId: String(j.data?.id ?? ''), status: 'queued' };
    }
    if (provider === 'documo') {
      const fd = new FormData(); fd.append('recipientFax', r.to); fd.append('attachments', blobOf(r.pdf), 'fax.pdf'); fd.append('coverPage', 'false'); if (r.subject) fd.append('subject', r.subject.slice(0, 120));
      const res = await f('https://api.documo.com/v1/faxes', { method: 'POST', headers: { Authorization: env.DOCUMO_API_KEY! }, body: fd }); const j: any = await res.json().catch(() => ({})); if (!res.ok) return { ok: false, status: 'failed', error: j.message || j.error || `Documo error ${res.status}` }; return { ok: true, providerId: String(j.messageId ?? j.id ?? ''), status: 'queued' };
    }
    if (provider === 'srfax') {
      const body = { action: 'Queue_Fax', access_id: env.SRFAX_ACCESS_ID, access_pwd: env.SRFAX_ACCESS_PWD, sCallerID: (r.fromNumber || '').replace(/\D/g, ''), sSenderEmail: env.SRFAX_SENDER_EMAIL, sFaxType: 'SINGLE', sToFaxNumber: r.to.replace(/\D/g, ''), sFileName_1: 'fax.pdf', sFileContent_1: b64(r.pdf), sSubject: r.subject?.slice(0, 80) };
      const res = await f('https://www.srfax.com/SRF_SecWebSvc.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j: any = await res.json().catch(() => ({})); if (!res.ok || j.Status !== 'Success') return { ok: false, status: 'failed', error: String(j.Result || `SRFax error ${res.status}`) }; return { ok: true, providerId: String(j.Result), status: 'queued' };
    }
  } catch (e) { return { ok: false, status: 'failed', error: (e as Error).message }; }
  return { ok: false, status: 'failed', error: 'Unknown provider' };
}
/** Map a provider's webhook payload to our status vocabulary. */
export function parseCallback(provider: FaxProvider, body: any): { providerId: string; status: 'sent' | 'failed' | 'queued'; error?: string } | null {
  if (provider === 'phaxio') { const fax = body?.fax ? (typeof body.fax === 'string' ? JSON.parse(body.fax) : body.fax) : null; if (!fax?.id) return null; const st = String(fax.status || ''); return { providerId: String(fax.id), status: st === 'success' ? 'sent' : st === 'failure' ? 'failed' : 'queued', error: st === 'failure' ? fax.error_message || 'Delivery failed' : undefined }; }
  return null;
}
