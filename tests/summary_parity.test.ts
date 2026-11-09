import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { computeSummary } from '../src/lib/engine/summary_server';

const DB = process.env.ARMS_TEST_DB || 'armstest3';
const psql = (sql: string) => execFileSync('su', ['postgres', '-c', `psql -d ${DB} -v ON_ERROR_STOP=1 -qAt`], { input: sql, encoding: 'utf8', timeout: 60000 }).trim();
let has = false; try { has = psql("select 1 from pg_proc where proname='claim_summary'") === '1'; } catch { has = false; }

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TODAY = '2026-06-30'; const BUCKETS = [{ label: '0-30', min: 0, max: 30 }, { label: '31-60', min: 31, max: 60 }, { label: '61-120', min: 61, max: 120 }, { label: '120+', min: 121, max: null }];
describe.skipIf(!has)('server claim_summary matches the browser engine', () => {
  it('same totals, buckets, statuses and payers on randomised claims', () => {
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const clients = [1, 2, 3].map((i) => ({ id: uuid(i), name: `PC${i}`, aging_basis: i === 2 ? 'billed' : 'dos' }));
    const payers = ['Aetna', 'Cigna', null, 'UHC']; const statuses = ['New', 'In Progress', 'Appealed'];
    const day = (back: number) => new Date(Date.parse(TODAY + 'T12:00:00Z') - back * 864e5).toISOString().slice(0, 10);
    const claims = Array.from({ length: 400 }, (_, i) => ({ id: uuid(100 + i), client_id: clients[Math.floor(rnd() * 3)].id, claim_no: 'T' + i, dos: rnd() < 0.05 ? null : day(Math.floor(rnd() * 400)), last_billed: rnd() < 0.3 ? null : day(Math.floor(rnd() * 300)), payer: payers[Math.floor(rnd() * 4)], status: statuses[Math.floor(rnd() * 3)], balance: Math.round(rnd() * 100000) / 100, assigned_to: null as string | null, next_fu: rnd() < 0.4 ? day(Math.floor(rnd() * 40) - 10) : null, flags: rnd() < 0.1 ? ['missing_review'] : [], closed_at: rnd() < 0.2 ? '2026-06-01T00:00:00Z' : null }));
    const q = (v: any) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
    psql(`truncate public.claims, public.clients cascade;\n${clients.map((c) => `insert into public.clients(id,name,aging_basis) values (${q(c.id)},${q(c.name)},${q(c.aging_basis)});`).join('\n')}\n${claims.map((c) => `insert into public.claims(id,client_id,claim_no,dos,last_billed,payer,status,balance,assigned_to,next_fu,flags,closed_at) values (${q(c.id)},${q(c.client_id)},${q(c.claim_no)},${q(c.dos)},${q(c.last_billed)},${q(c.payer)},${q(c.status)},${c.balance},null,${q(c.next_fu)},array[${c.flags.map(q).join(',')}]::text[],${q(c.closed_at)});`).join('\n')}`);
    const srv = JSON.parse(psql(`select public.claim_summary(null, '${TODAY}', '${JSON.stringify(BUCKETS)}'::jsonb)`));
    const loc = computeSummary(claims as any, clients.map((c) => ({ ...c })) as any, BUCKETS as any, TODAY);
    const strip = (s: any) => ({ open_claims: s.open_claims, open_balance: Number(s.open_balance), unassigned: s.unassigned, followups_due: s.followups_due, missing_review: s.missing_review, by_bucket: s.by_bucket.map((x: any) => [x.label, x.n, Number(x.balance)]), by_client: s.by_client.map((x: any) => [x.client_id, x.n, Number(x.balance)]), by_status: s.by_status.map((x: any) => [x.status, x.n, Number(x.balance)]).sort(), by_payer: s.by_payer.map((x: any) => [x.payer, x.n, Number(x.balance)]).sort() });
    expect(strip(srv)).toEqual(strip(loc));
    expect(srv.by_bucket.reduce((a: number, b: any) => a + b.n, 0)).toBe(srv.open_claims);
  });
});
