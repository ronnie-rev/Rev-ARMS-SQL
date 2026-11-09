import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../netlify/functions/send-reports.mts';

const client = { id: 'c1', name: 'Clinic', active: true, aging_basis: 'dos', tf_days: 365 };
const claim = { id: 'x', client_id: 'c1', claim_no: 'SECRET-1', patient_name: 'PHI PERSON', dos: '2026-03-01', payer: 'Aetna', balance: 500, billed_amt: 500, closed_at: null, touch_count: 0, assigned_to: null, status: 'New', flags: [] };
const sched = { id: 's1', name: 'Weekly', client_id: 'c1', audience: 'client', cadence: 'weekly', day: new Date().getUTCDay(), hour_utc: 0, recipients: ['a@b.com'], active: true, last_sent_at: null };
const calls: { url: string; method: string; body?: string }[] = [];

beforeEach(() => {
  calls.length = 0; Object.assign(process.env, { SUPABASE_URL: 'https://sb.example', SUPABASE_SERVICE_ROLE_KEY: 'svc', RESEND_API_KEY: 'rk', REPORT_FROM: 'ar@x.com', REPORTS_SECRET: 's' }); delete process.env.REPORTS_DRY_RUN;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url); calls.push({ url: u, method: init?.method || 'GET', body: init?.body as string });
    const json = (d: any, st = 200) => new Response(JSON.stringify(d), { status: st, headers: { 'Content-Type': 'application/json' } });
    if (u.includes('api.resend.com')) return json({ id: 'm1' });
    if (u.includes('/rest/v1/report_schedules') && (init?.method === 'PATCH')) return new Response(null, { status: 204 });
    if (u.includes('/rest/v1/audit_log')) return new Response(null, { status: 201 });
    if (u.includes('report_schedules')) return json([sched]); if (u.includes('/clients')) return json([client]); if (u.includes('config_options')) return json([{ category: 'bucket', value: '0+', active: true, sort: 0, meta: { min: 0, max: null }, color: '' }]);
    if (u.includes('/claims')) return json([claim]); if (u.includes('import_batches')) return json([]); if (u.includes('recoveries')) return json([]);
    return json([], 404);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('send-reports function', () => {
  it('rejects manual calls with the wrong secret', async () => { expect((await handler(new Request('http://x/?secret=nope'))).status).toBe(403); });
  it('dry run renders but sends nothing', async () => {
    const r = await handler(new Request('http://x/?secret=s&dry=1&id=s1')); const t = await r.text();
    expect(t).toContain('DRY RUN'); expect(calls.some((c) => c.url.includes('resend'))).toBe(false);
  });
  it('sends a PHI-free email, stamps last_sent_at and audits it', async () => {
    const r = await handler(new Request('http://x/?secret=s&id=s1')); expect(await r.text()).toContain('sent to 1');
    const mail = calls.find((c) => c.url.includes('resend'))!; const body = JSON.parse(mail.body!); expect(body.to).toEqual(['a@b.com']); expect(body.html).not.toContain('PHI PERSON'); expect(body.html).not.toContain('SECRET-1'); expect(body.html).toContain('Clinic');
    expect(calls.some((c) => c.method === 'PATCH' && c.url.includes('report_schedules'))).toBe(true); expect(calls.some((c) => c.url.includes('audit_log') && c.method === 'POST')).toBe(true);
  });
  it('reports (not throws) when the email provider fails', async () => {
    (fetch as any).mockImplementationOnce(async () => new Response('[]', { status: 200 }));   // schedules
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { const s = String(u); if (s.includes('resend')) return new Response('boom', { status: 500 }); if (s.includes('audit_log')) return new Response(null, { status: 201 }); if (s.includes('report_schedules')) return new Response(JSON.stringify([sched]), { status: 200 }); return new Response('[]', { status: 200 }); }));
    const t = await (await handler(new Request('http://x/?secret=s&id=s1'))).text(); expect(t).toContain('FAILED');
  });
  it('does nothing when nothing is due', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ ...sched, last_sent_at: new Date().toISOString() }]), { status: 200 })));
    expect(await (await handler(new Request('http://x/'))).text()).toContain('nothing due');
  });
});
