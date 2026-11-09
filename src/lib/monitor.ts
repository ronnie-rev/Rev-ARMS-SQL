// Error reporting hook. PLACEHOLDER until a monitoring service is linked: set VITE_ERROR_WEBHOOK to any HTTPS endpoint that accepts JSON
// (e.g. a Sentry/Logtail/Slack relay) — or replace the body of reportError with the vendor SDK call. PHI must never be sent: only message, stack and route.
const HOOK = String(import.meta.env.VITE_ERROR_WEBHOOK || '');
export const monitoringLinked = !!HOOK;
export function reportError(err: unknown, ctx: Record<string, unknown> = {}) {
  const e = err instanceof Error ? err : new Error(String(err)); console.error('[ClaimsIQ]', e, ctx);
  if (!HOOK) return;
  try { void fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ app: 'claimsiq', build: typeof __BUILD__ === 'string' ? __BUILD__ : '', route: location.pathname, message: e.message, stack: (e.stack || '').split('\n').slice(0, 12).join('\n'), ...ctx }) }); } catch { /* never throw from the reporter */ }
}
if (typeof window !== 'undefined') { window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason, { kind: 'unhandledrejection' })); window.addEventListener('error', (ev) => reportError(ev.error || ev.message, { kind: 'error' })); }
