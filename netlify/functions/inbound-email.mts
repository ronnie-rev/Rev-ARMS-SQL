// Email-to-claim. Point your inbound-email provider's webhook here (Postmark "Inbound", SendGrid Inbound Parse via JSON relay, Mailgun routes, or a Zapier/Make step):
//   POST /.netlify/functions/inbound-email?secret=<INBOUND_EMAIL_SECRET>
// The email is filed as a note on the matching claim (by claims+<UID>@your-inbox address, or a claim number in the subject/body).
// Anything we can't match safely goes to managers as a notification — it is never guessed. Attachments are NOT stored; only their names are noted.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INBOUND_EMAIL_SECRET
import { noteFromMail, routeMail, type ClaimRef, type InboundMail } from '../../src/lib/engine/inbound';

const env = (k: string) => (globalThis as any).Netlify?.env?.get?.(k) ?? process.env[k];
const SB = () => String(env('SUPABASE_URL')).replace(/\/$/, ''); const KEY = () => env('SUPABASE_SERVICE_ROLE_KEY')!;
const H = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function rest<T = any>(path: string, init?: RequestInit): Promise<T> { const r = await fetch(`${SB()}/rest/v1/${path}`, { ...init, headers: { ...H(), ...(init?.headers as any) } }); if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}`); return (r.status === 204 ? null : await r.json()) as T; }

/** Accept Postmark-style JSON, or a generic { from, to, subject, text, attachments } body. */
function parse(b: any): InboundMail {
  const addr = (x: any) => (typeof x === 'string' ? x : x?.Email || x?.email || '');
  const to = [b.To, b.to, b.OriginalRecipient, ...(b.ToFull || []).map(addr), ...(Array.isArray(b.to) ? b.to.map(addr) : [])].flat().filter(Boolean).map(String);
  return { from: String(b.From || b.from || b.FromFull?.Email || 'unknown'), to, subject: String(b.Subject || b.subject || ''), text: String(b.TextBody || b.text || b.body || b.StrippedTextReply || ''), attachments: (b.Attachments || b.attachments || []).map((a: any) => a.Name || a.name || a.filename).filter(Boolean) };
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY') || !env('INBOUND_EMAIL_SECRET')) return json({ error: 'Not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / INBOUND_EMAIL_SECRET)' }, 500);
  if (new URL(req.url).searchParams.get('secret') !== env('INBOUND_EMAIL_SECRET')) return json({ error: 'forbidden' }, 403);
  let mail: InboundMail; try { mail = parse(await req.json()); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const pool = await rest<ClaimRef[]>('claims?closed_at=is.null&select=id,claim_no,claim_uid,aliases,client_id&limit=50000');
  const r = routeMail(mail, pool); const now = new Date().toISOString();
  if (r.claim) {
    const body = noteFromMail(mail);
    await rest('claim_notes', { method: 'POST', body: JSON.stringify({ claim_id: r.claim.id, author_id: null, author_name: 'Email intake', body, pinned: false, client_visible: false }), headers: { Prefer: 'return=minimal' } });
    await rest('claim_activity', { method: 'POST', body: JSON.stringify({ claim_id: r.claim.id, actor_id: null, actor_name: 'Email intake', kind: 'email', summary: `Email received from ${mail.from}${mail.subject ? ` — ${mail.subject}` : ''}`, meta: { how: r.how } }), headers: { Prefer: 'return=minimal' } });
    return json({ ok: true, filed: r.claim.claim_no, how: r.how });
  }
  await rest('notifications', { method: 'POST', body: JSON.stringify({ user_id: null, role: 'manager', title: r.how === 'ambiguous' ? 'Email matches several claims' : 'Email could not be matched to a claim', body: `From ${mail.from}: ${mail.subject || '(no subject)'}${r.candidates.length ? ` — candidates: ${r.candidates.map((c) => c.claim_no).join(', ')}` : ''}`, link: null, severity: 'warn', read_by: [], created_at: now }), headers: { Prefer: 'return=minimal' } });
  return json({ ok: true, filed: null, how: r.how });
};
