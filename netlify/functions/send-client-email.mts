// Sends a staff-authored email to a client contact. The caller must present a valid Supabase session token
// belonging to a staff profile (role != client). Env: SUPABASE_URL, SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY),
// RESEND_API_KEY, REPORT_FROM.
const env = (k: string) => (globalThis as any).Netlify?.env?.get?.(k) ?? process.env[k];
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const url = (env('SUPABASE_URL') || env('VITE_SUPABASE_URL'))?.replace(/\/$/, ''); const anon = env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY');
  if (!url || !anon || !env('RESEND_API_KEY') || !env('REPORT_FROM')) return json({ error: 'Email is not configured on the server' }, 501);
  const auth = req.headers.get('authorization') || '';
  const h = { apikey: anon, Authorization: auth };
  const u = await fetch(`${url}/auth/v1/user`, { headers: h }); if (!u.ok) return json({ error: 'Not signed in' }, 401);
  const user = await u.json();
  const p = await fetch(`${url}/rest/v1/profiles?id=eq.${user.id}&select=role,active`, { headers: h }); const prof = (await p.json())?.[0];
  if (!prof || prof.role === 'client' || prof.active === false) return json({ error: 'Staff only' }, 403);
  const b = await req.json().catch(() => null) as { to?: string[]; subject?: string; text?: string; replyTo?: string } | null;
  const to = (b?.to || []).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 10);
  if (!to.length || !b?.subject || !b?.text) return json({ error: 'to, subject and text are required' }, 400);
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env('REPORT_FROM'), to, subject: b.subject.slice(0, 200), text: b.text.slice(0, 20000), reply_to: b.replyTo && /^[^@\s]+@[^@\s]+$/.test(b.replyTo) ? b.replyTo : undefined }) });
  if (!r.ok) return json({ error: 'Provider rejected: ' + (await r.text()).slice(0, 200) }, 502);
  return json({ ok: true });
};
