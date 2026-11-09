import { ROLE_META, type Role } from './roles';
import { inferVisitType } from './engine/visit';
import { addDays, format, subDays } from 'date-fns';
import { defaultConfig } from './defaults';
import { defaultTemplates } from './pms';
import { RCA_TREE, END_ACTION_TREE, MODES } from './taxonomy';
import type { TableName } from './types';
import { ageDays, bucketFor, bucketsFrom, uid } from './utils';
import { fingerprint, normClaimNo } from './engine/normalize';
import { backfillUids } from './engine/uid';
import { RULE_TEMPLATES } from './engine/rules';
import { STARTER_LIMITS } from './engine/limits';

type Row = Record<string, any>;
export const DEMO_USERS = [
  { name: 'Alex Morgan', email: 'admin@arms.demo', role: 'sr_mgmt', emp: 'A001' },
  { name: 'Priya Nair', email: 'priya@arms.demo', role: 'manager', emp: 'S101' },
  { name: 'Rajat Mehta', email: 'rajat@arms.demo', role: 'tl_prod_qa', emp: 'S102' },
  { name: 'Sana Iqbal', email: 'sana@arms.demo', role: 'user_prod', emp: 'E201' },
  { name: 'Vikram Rao', email: 'vikram@arms.demo', role: 'user_prod', emp: 'E202' },
  { name: 'Neha Kapoor', email: 'neha@arms.demo', role: 'sme_prod_qa', emp: 'E203' },
  { name: 'Arjun Patel', email: 'arjun@arms.demo', role: 'user_prod_qa', emp: 'E204' },
  { name: 'Meera Das', email: 'meera@arms.demo', role: 'user_prod', emp: 'E205' },
  { name: 'Dana Whitfield', email: 'dana@arms.demo', role: 'tl_qa', emp: 'Q301' },
  { name: 'Practice Manager (Dr. Ramineni)', email: 'client@ramineni.demo', role: 'client', emp: 'C401' },
  { name: 'Karan Shah', email: 'karan@arms.demo', role: 'sme_qa', emp: 'Q302' },
  { name: 'Jordan Blake', email: 'jordan@arms.demo', role: 'sys_admin', emp: 'A002' },
  { name: 'Lena Fischer', email: 'lena@qa-partner.demo', role: 'qa_ext', emp: 'X501' },
] as const;

// Which end action tends to resolve which root-cause category (seeds a learnable signal for next-best-action).
const GOOD: Record<string, string> = {
  'Coding': 'Claim Submitted', 'Billing Error': 'Claim Submitted', 'Additional Information Requested': 'Documentation Submitted', 'Claim is in Process': 'Claim Follow Up Required',
  'Authorization': 'Claim Appealed', 'Eligibility or Benefits': 'Claim Submitted', 'Demographics Issue': 'Claim Submitted', 'No Response': 'Claim Follow Up Required',
  'Bundling or Inclusive Service': 'Claim Appealed', 'NPI or Non Par or Out of Network': 'Sent To Credentialing/Provider Enrollment', 'No Referral': 'Claim Escalation',
};

function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296); }

export type SeedSize = 'demo' | 'large';
export function buildSeed(size: SeedSize = 'demo'): Partial<Record<TableName, Row[]>> {
  const L = size === 'large';
  const r = rng(L ? 7 : 42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const wpick = <T,>(a: [T, number][]) => { const t = a.reduce((s, x) => s + x[1], 0); let v = r() * t; for (const [x, w] of a) { if ((v -= w) <= 0) return x; } return a[0][0]; };
  const iso = (d: Date) => format(d, 'yyyy-MM-dd');
  const now = new Date();

  const config = defaultConfig().map((c) => ({ ...c }));
  const buckets = bucketsFrom(config as any);
  const profiles: Row[] = DEMO_USERS.map((u) => ({
    id: 'demo-' + u.emp.toLowerCase(), email: u.email, full_name: u.name, emp_code: u.emp, role: u.role,
    supervisor_id: null as string | null, daily_target: ROLE_META[u.role as Role].produces ? 40 : 0, active: true, client_id: null, created_at: new Date().toISOString(),
    hire_date: u.emp === 'E205' ? iso(subDays(now, 18)) : u.emp === 'E204' ? iso(subDays(now, 70)) : ROLE_META[u.role as Role].produces ? iso(subDays(now, 400)) : null,
  }));
  const sup1 = profiles[1], sup2 = profiles[2], auditor = profiles[8];
  const coverage: Record<string, number[]> = { E201: [0, 1, 3], E202: [0, 1, 4], E203: [1, 2, 3], E204: [1, 2, 4], E205: [0, 1, 2, 3, 4], S101: [0, 2], S102: [1] };
  const specs = profiles.filter((p) => ROLE_META[p.role as Role].produces && (p as any).emp_code !== 'S102');
  specs.forEach((s, i) => { s.supervisor_id = i < 3 ? sup1.id : sup2.id; });

  const clientDefs = ([
    { name: 'Center for Plastic Surgery', code: 'CPS', pms: 'eCW', color: '#6366f1', sup: sup1, tf: 365, n: 300, payers: ['Aetna', 'BCBS of Texas', 'Cigna', 'UnitedHealthcare', 'Medicare', 'Humana', 'Tricare'] },
    { name: 'Dr. Ramineni', code: 'DRR', pms: 'Tebra', color: '#06b6d4', sup: sup2, tf: 180, n: 220, payers: ['Medicare', 'Aetna', 'UnitedHealthcare', 'Molina', 'Medicaid', 'Cigna', 'Anthem'] },
    { name: 'Summit Dermatology', code: 'SUM', pms: 'ModMed', color: '#f59e0b', sup: sup1, tf: 365, n: 200, payers: ['UnitedHealthcare', 'Cigna', 'BCBS of Texas', 'Aetna', 'Oscar', 'Humana'] },
    { name: 'Lone Star Orthopedics', code: 'LSO', pms: 'athenaOne', color: '#10b981', sup: sup2, tf: 180, n: 950, payers: ['Medicare', 'BCBS of Texas', 'Aetna', 'UnitedHealthcare', 'Tricare', 'Cigna'] },
    { name: 'Bayview Cardiology', code: 'BAY', pms: 'AdvancedMD', color: '#ec4899', sup: sup1, tf: 120, n: 800, payers: ['Medicare', 'Humana', 'Anthem', 'Aetna', 'Molina', 'Oscar', 'Medicaid'] },
  ] as any[]).slice(0, L ? 5 : 3).map((c: any, i: number) => (L ? { ...c, n: [1500, 1150, 950, 900, 800][i] } : c)) as { name: string; code: string; pms: string; color: string; sup: Row; tf: number; n: number; payers: string[] }[];
  const clients = clientDefs.map((c) => ({
    id: uid(), name: c.name, code: c.code, pms: c.pms, color: c.color, supervisor_id: c.sup.id, aging_basis: 'dos', tf_days: c.tf, rca_allowed: null, active: true, settings: {},
  }));
  profiles[9].client_id = clients[1].id;
  profiles.forEach((p) => { const idx = coverage[(p as any).emp_code]; if (idx) (p as any).client_ids = idx.filter((i) => clients[i]).map((i) => clients[i].id); });

  // payer directory (config 'payer') — contact intel + timely filing
  const payerNames = [...new Set(clientDefs.flatMap((c) => c.payers))];
  const tfMap: Record<string, number> = { Medicare: 365, Medicaid: 180, Aetna: 180, Cigna: 180, UnitedHealthcare: 90, Humana: 180, Tricare: 365, Molina: 120, Anthem: 180, Oscar: 90, 'BCBS of Texas': 180 };
  payerNames.forEach((p, i) => config.push({ id: uid(), category: 'payer', value: p, parent: null, label: null, color: null, sort: i, active: true,
    meta: { tf_days: tfMap[p] ?? null, phone: `1-800-555-0${100 + i}`, portal: `https://provider.${p.toLowerCase().replace(/[^a-z]/g, '')}.example`, appeal_days: 60, tips: i % 2 ? 'Use portal for status; call only for escalations.' : 'IVR: press 3 then 2 for provider claims status; have NPI + TIN ready.' } } as any));

  const providers = clients.flatMap((c, i) => [
    { id: uid(), client_id: c.id, name: ['Dr. Hale', 'Dr. Ramineni', 'Dr. Okafor', 'Dr. Whitaker', 'Dr. Chen'][i], type: 'Main Surgeon' },
    { id: uid(), client_id: c.id, name: ['K. Brandt, PA', 'S. Lund, PA', 'M. Vega, PA', 'T. Rowe, PA', 'L. Park, PA'][i], type: 'Physician Assistant-PA' },
  ]);

  const first = ['Maria', 'James', 'Linda', 'Robert', 'Patricia', 'Michael', 'Barbara', 'William', 'Susan', 'David', 'Karen', 'Thomas', 'Nancy', 'Daniel', 'Lisa', 'Paul'];
  const last = ['Garcia', 'Smith', 'Johnson', 'Lee', 'Brown', 'Davis', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Clark', 'Lewis', 'Walker', 'Young'];
  const cpts = ['99213', '99214', '19318', '15830', '11042', '17000', '12032', '19357', '15877', '99203', '11102', '88305', '17311'];
  const comments = ['Called payer rep; claim reprocessing, ref# ', 'Denial reviewed; corrected claim needed', 'Records sent via portal per payer request', 'Payer states no claim on file; resubmitting', 'Escalated to supervisor for review', 'Appeal drafted and sent with op notes', 'Waiting on EOB from primary'];

  const batchCount = L ? 6 : 8;
  const batchIds = clients.map(() => Array.from({ length: batchCount }, () => uid()));
  const recoveries: Row[] = [];
  const claims: Row[] = []; const workLog: Row[] = []; const notes: Row[] = []; const activity: Row[] = [];
  const rcaCats = Object.keys(RCA_TREE);
  const eaKeys = Object.keys(END_ACTION_TREE).filter((k) => k !== 'Adjustments' && k !== 'Billed To Patient');
  const endMeta = Object.fromEntries(config.filter((c) => c.category === 'end_action').map((c) => [c.value, c.meta]));

  const touch = (c: Row, client: any, user: Row, when: Date, t: number, good: number) => {
    const rca = pick(rcaCats); const rcaD = pick(RCA_TREE[rca]);
    const ea = r() < good && GOOD[rca] ? GOOD[rca] : pick(eaKeys);
    const subs = END_ACTION_TREE[ea]; const sub = subs.length ? pick(subs) : null;
    const fuDays = (endMeta[ea] as any)?.fu_days ?? 7;
    const age = ageDays({ dos: c.dos, last_billed: c.last_billed }, { aging_basis: 'dos' }) ?? 0;
    const mode = pick(MODES); const day = Math.round((now.getTime() - when.getTime()) / 864e5);
    const wl: Row = {
      id: uid(), claim_id: c.id, client_id: client.id, user_id: user.id, user_name: user.full_name, emp_code: user.emp_code, supervisor_name: user.supervisor_id === sup1.id ? sup1.full_name : sup2.full_name,
      work_date: iso(when), comment: pick(comments) + (mode === 'Call' ? Math.floor(1000 + r() * 8999) : ''), rca, rca_detail: rcaD, end_action: ea, end_sub: sub, mode, balance: c.balance, age_days: age,
      bucket: bucketFor(age, buckets)?.label ?? null, next_fu: fuDays ? iso(addDays(when, fuDays)) : null, multi_touch: t > 0,
      audit_status: day > 8 ? wpick<string>([['pass', 7], ['fail', 1], ['pending', 2]]) : 'pending', audit_remarks: null, audit_by: null, audited_at: null, legacy: false, created_at: when.toISOString(),
      time_spent_sec: 120 + Math.floor(r() * 600), call_ref: mode === 'Call' ? 'REF' + Math.floor(100000 + r() * 899999) : null, contact_name: mode === 'Call' ? pick(['Jo', 'Marcus', 'Elena', 'Priyanka', 'Sam']) : null, ack_at: null,
    };
    if (wl.audit_status === 'fail') { wl.audit_remarks = pick(['End action does not match comment', 'Missing reference number in comment', 'Root cause detail incorrect']); wl.audit_by = auditor.id; wl.audited_at = when.toISOString(); }
    else if (wl.audit_status === 'pass') { wl.audit_by = auditor.id; wl.audited_at = when.toISOString(); }
    workLog.push(wl);
    Object.assign(c, { rca, rca_detail: rcaD, end_action: ea, end_sub: sub, mode, status: (endMeta[ea] as any)?.status ?? 'In Progress', next_fu: wl.next_fu, touch_count: t + 1, last_touched_at: when.toISOString() });
    activity.push({ id: uid(), claim_id: c.id, actor_id: user.id, actor_name: user.full_name, kind: 'touch', summary: `${ea}${sub ? ' · ' + sub : ''} — ${rcaD}`, meta: {}, created_at: when.toISOString() });
    return wl;
  };

  clientDefs.forEach((cd, ci) => {
    const client = clients[ci];
    const prov = providers.filter((p) => p.client_id === client.id);
    const total = Math.round(cd.n * 1.4);
    for (let i = 0; i < total; i++) {
      const closedHist = i >= cd.n;                       // resolved history that feeds learning
      const dosAge = closedHist ? 60 + Math.floor(r() * 300) : Math.floor(Math.pow(r(), L ? 1.35 : 1.7) * (L ? 560 : 430)) + 3;
      const dos = subDays(now, dosAge);
      const billed = Math.round((80 + Math.pow(r(), 2.2) * 6500) * 100) / 100;
      const bal = r() < 0.12 ? Math.round(billed * (0.2 + r() * 0.5) * 100) / 100 : billed;
      const pv = pick(prov); const id = uid(); const cptv = pick(cpts);
      const assigned = closedHist || r() < (L ? 0.86 : 0.72) ? pick(specs) : null;
      const c: Row = {
        id, client_id: client.id, claim_no: `${cd.code}-${String(100000 + ci * 50000 + i * 7 + Math.floor(r() * 5))}`,
        account_id: `AC${Math.floor(10000 + r() * 89999)}`, patient_name: `${pick(last).toUpperCase()}, ${pick(first).toUpperCase()}`,
        dos: iso(dos), last_billed: iso(addDays(dos, 2 + Math.floor(r() * 12))), payer: wpick(cd.payers.map((p, k) => [p, 8 - k] as [string, number])),
        provider: pv.name, provider_type: pv.type, cpt: cptv, billed_amt: billed, balance: bal,
        pms_status: wpick<string>([['Billed Primary', 6], ['Billed Secondary', 2], ['Denied', 3], ['Pending', 3], ['Partially Paid', 2], ['Rejected by clearinghouse', 1.2], ['Unbilled', 0.8]]), denial_codes: r() < 0.4 ? pick(['CO-16', 'CO-45', 'CO-50', 'CO-97', 'PR-1', 'CO-197', 'CO-29']) : null,
        status: 'New', rca: null, rca_detail: null, end_action: null, end_sub: null, mode: null, assigned_to: assigned?.id ?? null, priority: bal > 3000 ? 'High' : 'Normal',
        next_fu: null, touch_count: 0, last_touched_at: null, custom: { visit_type: inferVisitType(cptv), visit_src: 'inferred' }, first_batch: batchIds[ci][0], last_batch: batchIds[ci][batchCount - 1], closed_at: null, closed_reason: null,
        created_at: subDays(now, closedHist ? 90 : 49).toISOString(), updated_at: now.toISOString(),
      };
      c.claim_key = normClaimNo(c.claim_no).key; c.aliases = []; c.fingerprint = fingerprint(c as any) || null; c.flags = []; c.missing_count = 0; c.resolution = null; c.as_of = null;
      if (assigned) activity.push({ id: uid(), claim_id: id, actor_id: sup1.id, actor_name: sup1.full_name, kind: 'assign', summary: `Assigned to ${assigned.full_name}`, meta: {}, created_at: subDays(now, closedHist ? 60 : 20).toISOString() });
      const touches = closedHist ? wpick<number>([[1, 3], [2, 4], [3, 2]]) : assigned && r() < 0.7 ? wpick<number>([[1, 5], [2, 3], [3, 2], [4, 1]]) : 0;
      let day = closedHist ? 55 + Math.floor(r() * 25) : 20 + Math.floor(r() * (L ? 100 : 3));
      let lastWl: Row | null = null;
      for (let t = 0; t < touches; t++) {
        day = Math.max(closedHist ? 25 : 0, day - 1 - Math.floor(r() * (closedHist ? 12 : 7)));
        const forceGood = closedHist && t === touches - 1;
        lastWl = touch(c, client, assigned!, subDays(now, day), t, closedHist ? (forceGood ? 0.8 : 0.4) : 0.3);
        if (t === 0 && r() < 0.5) {
          notes.push({ id: uid(), claim_id: id, author_id: assigned!.id, author_name: assigned!.full_name, body: lastWl.comment, pinned: false, client_visible: ci === 1 && r() < 0.5, created_at: subDays(now, day).toISOString() });
        }
      }
      if (closedHist) {
        const closeAt = subDays(now, Math.max(2, day - 2));
        const paid = r() < 0.75; const was = c.balance;
        Object.assign(c, { closed_at: closeAt.toISOString(), closed_reason: 'Dropped off aging report (paid / adjusted)', status: paid ? 'Resolved – Paid' : 'Adjusted', balance: 0, resolution: paid ? 'paid' : 'adjusted' });
        recoveries.push({ id: uid(), claim_id: id, client_id: client.id, batch_id: null, user_id: assigned!.id, user_name: assigned!.full_name, amount: was, type: paid ? 'payment' : 'adjustment', basis: 'last_touch', share: 1, touch_id: lastWl?.id ?? null, window_days: 45, occurred_on: iso(closeAt), created_at: closeAt.toISOString() });
        activity.push({ id: uid(), claim_id: id, actor_id: null, actor_name: 'Import', kind: 'balance', summary: `Balance decreased ${was.toFixed(2)} via import`, meta: { delta: -was }, created_at: closeAt.toISOString() });
        if (r() < 0.45) {   // closed through the supervisor review queue: who decided, when, with which end action and note
          const deciderP = r() < 0.5 ? sup1 : sup2; const closeD = iso(closeAt);
          Object.assign(c, { closed_reason: `${paid ? 'Paid' : 'Written off / adjusted'} — resolved after dropping off the aging file`, resolved_by: deciderP.id, resolved_at: closeAt.toISOString(), resolution_note: paid ? pick(['Confirmed payment in the PMS — EFT posted', 'Check received, ref in notes', 'Payer portal shows paid']) : pick(['Timely filing exceeded — approved by client', 'Contractual adjustment per EOB', 'Patient balance written off per policy']), end_action: paid ? 'Claim Paid' : 'Adjustments', custom: { ...c.custom, lifecycle: paid ? 'CLS' : 'WOF', resolution_basis: 'missing_review', resolved_balance: was } });
          activity.push({ id: uid(), claim_id: id, actor_id: null, actor_name: 'Import', kind: 'review', summary: 'Absent from the aging file — waiting for a supervisor/manager to mark it paid, written off or restore it', meta: {}, created_at: subDays(closeAt, 3).toISOString() });
          activity.push({ id: uid(), claim_id: id, actor_id: deciderP.id, actor_name: deciderP.full_name, kind: 'close', summary: `Resolved on ${closeD.slice(5, 7)}/${closeD.slice(8, 10)}/${closeD.slice(0, 4)}: ${paid ? 'Paid' : 'Written off / adjusted'} — ${paid ? `paid $${was.toFixed(2)}` : `adjusted $${was.toFixed(2)}`} · ${c.resolution_note}`, meta: { outcome: paid ? 'paid' : 'written_off', by: deciderP.full_name, basis: 'missing_review' }, created_at: closeAt.toISOString() });
        } else activity.push({ id: uid(), claim_id: id, actor_id: null, actor_name: 'Import', kind: 'close', summary: 'Dropped off aging report — closed (payment or adjustment posted)', meta: {}, created_at: closeAt.toISOString() });
      } else if (touches === 0 && r() < 0.06) c.priority = 'Critical';
      claims.push(c);
    }
  });

  // permanent UIDs (sequential per client) + encounter numbers + a realistic missing-from-file review queue
  claims.forEach((c, i) => { c.encounter_no = `ENC-${String(c.claim_no).replace(/\D/g, '').slice(-6)}${i % 11 === 0 ? 'A' : ''}`; });
  { const need = backfillUids(claims as any, clients as any); const m = new Map(need.map((c) => [c.id, c.claim_uid])); claims.forEach((c) => { c.claim_uid = m.get(c.id) || c.claim_uid || null; }); }
  { const openC = claims.filter((c) => !c.closed_at); const n = L ? 140 : 24; const lastDay = iso(subDays(now, 3));
    for (let i = 0; i < n; i++) { const c = openC[Math.floor(r() * openC.length)]; if (!c || (c.flags || []).includes('missing_review')) continue; c.flags = [...(c.flags || []), 'missing_review']; c.missing_count = 1 + Math.floor(r() * 2); c.missing_since = iso(subDays(now, 3 + Math.floor(r() * 18)));
      activity.push({ id: uid(), claim_id: c.id, actor_id: null, actor_name: 'Import', kind: 'review', summary: 'Absent from the aging file — waiting for a supervisor/manager to mark it paid, written off or restore it', meta: {}, created_at: new Date(c.missing_since + 'T10:00:00Z').toISOString() }); }
    void lastDay; }

  // import history with PHI-free snapshots for trend + insight engine
  const batches: Row[] = [];
  clients.forEach((client, ci) => {
    const open = claims.filter((x) => x.client_id === client.id && !x.closed_at);
    const latest: Record<string, { n: number; v: number }> = {}; const payers: Record<string, number> = {};
    open.forEach((x) => { const b = bucketFor(ageDays(x as any, { aging_basis: 'dos' }), buckets)?.label || '?'; latest[b] = latest[b] || { n: 0, v: 0 }; latest[b].n++; latest[b].v += x.balance; payers[x.payer] = (payers[x.payer] || 0) + x.balance; });
    for (let k = 0; k < batchCount; k++) {
      const back = batchCount - 1 - k; const bk: Record<string, { n: number; v: number }> = {}; let tot = 0, cnt = 0;
      buckets.forEach((b, i) => { const L = latest[b.label] || { n: 0, v: 0 }; const f = Math.max(0.5, 1 - back * 0.025 * (i / buckets.length - 0.35) + (r() - 0.5) * 0.05); bk[b.label] = { n: Math.round(L.n * f), v: Math.round(L.v * f) }; tot += bk[b.label].v; cnt += bk[b.label].n; });
      const resolved = { n: 8 + Math.floor(r() * 18), v: Math.round(tot * (0.02 + r() * 0.03)) };
      batches.push({ id: batchIds[ci][k], client_id: client.id, template_name: ['eClinicalWorks (eCW)', 'Tebra (Kareo)', 'ModMed (EMA)', 'athenaOne', 'AdvancedMD'][ci], file_name: `${clientDefs[ci].code}_AR_Aging_wk${k + 1}.xlsx`, mode: 'snapshot',
        total_rows: cnt, new_rows: k === 0 ? cnt : 10 + Math.floor(r() * 25), updated_rows: k === 0 ? 0 : 20 + Math.floor(r() * 60), dropped_rows: k === 0 ? 0 : resolved.n, skipped_rows: 0, total_balance: tot, created_by: profiles[0].id,
        created_at: subDays(now, back * 7 + 1).toISOString(), summary: { buckets: bk, payers: k === batchCount - 1 ? payers : undefined, total: tot, count: cnt, resolved: k === 0 ? undefined : resolved } });
    }
  });

  // per-claim snapshot history (demo): each claim is present from its DOS until it closed, aged as of each weekly batch
  const snapshots: Row[] = [];
  clients.forEach((client, ci) => {
    for (let k = 0; k < batchCount; k++) {
      const back = batchCount - 1 - k; const at = subDays(now, back * 7 + 1); const day = iso(at);
      for (const x of claims.filter((c) => c.client_id === client.id)) {
        if (x.closed_at && new Date(x.closed_at) <= at) continue; if (x.dos && x.dos > day) continue;
        const a = Math.max(0, (ageDays(x as any, { aging_basis: 'dos' }) ?? 0) - back * 7);
        snapshots.push({ id: uid(), batch_id: batchIds[ci][k], claim_id: x.id, client_id: client.id, as_of: day, balance: x.balance, billed_amt: x.billed_amt, payer: x.payer, provider: x.provider, age_days: a, bucket: bucketFor(a, buckets)?.label ?? null, created_at: at.toISOString() });
      }
    }
  });

  const reqClaim = claims.find((c) => c.client_id === clients[1].id && !c.closed_at)!;
  const requests: Row[] = [
    { id: uid(), client_id: clients[1].id, claim_id: claims.find((c) => c.client_id === clients[1].id && !c.closed_at)!.id, author_id: profiles[9].id, author_name: profiles[9].full_name, kind: 'documents', body: 'Payer asked for op notes on this one — we uploaded them to the shared drive yesterday. Can you confirm you can see them?', status: 'open', response: null, responded_by: null, responded_at: null, created_at: subDays(now, 1).toISOString() },
    { id: uid(), client_id: clients[1].id, claim_id: null, author_id: profiles[9].id, author_name: profiles[9].full_name, kind: 'question', body: 'Why did Molina AR go up this month? Are we seeing a denial pattern?', status: 'open', response: null, responded_by: null, responded_at: null, created_at: subDays(now, 2).toISOString() },
    { id: uid(), client_id: clients[1].id, claim_id: null, author_id: profiles[9].id, author_name: profiles[9].full_name, kind: 'info', body: 'Dr. Ramineni’s credentialing with Oscar became effective on the 1st.', status: 'answered', response: 'Thanks — we have flagged the Oscar claims for resubmission under the new effective date.', responded_by: sup2.id, responded_at: subDays(now, 5).toISOString(), created_at: subDays(now, 6).toISOString() },
  ];


  // QA program seed: reviews on older touches (varied results, errors, acks/disputes) + a queued backlog
  const qaReviews: Row[] = []; {
    const crit = ['rca', 'action', 'resolution', 'documentation', 'followup', 'evidence', 'deadline', 'compliance'];
    const weights: Record<string, number> = { rca: 15, action: 15, resolution: 15, documentation: 15, followup: 10, evidence: 10, deadline: 10, compliance: 10 };
    const catFor: Record<string, string> = { rca: 'wrong_rca', action: 'wrong_action', resolution: 'wrong_path', documentation: 'incomplete_note', followup: 'bad_followup', evidence: 'missing_ref', deadline: 'missed_deadline', compliance: 'unauthorized_adj' };
    const sevFor: Record<string, string> = { wrong_rca: 'major', wrong_action: 'major', wrong_path: 'major', incomplete_note: 'minor', bad_followup: 'minor', missing_ref: 'minor', missed_deadline: 'critical', unauthorized_adj: 'critical' };
    const bias: Record<string, number> = { E201: 0.05, E202: 0.09, E203: 0.12, E204: 0.16, E205: 0.22 };
    const pool = workLog.filter((w) => !w.legacy);
    const target = L ? 900 : 120;
    for (let n = 0, i = 0; n < target && i < pool.length * 3; i++) {
      const w = pool[Math.floor(r() * pool.length)]; if (!w || qaReviews.some((q) => q.work_log_id === w.id)) continue; n++;
      const ageD = Math.round((now.getTime() - new Date(w.created_at).getTime()) / 864e5); const queued = ageD <= 4 && r() < 0.8; const base = bias[w.emp_code] ?? 0.1;
      const row: Row = { id: uid(), work_log_id: w.id, claim_id: w.claim_id, client_id: w.client_id, analyst_id: w.user_id, reviewer_id: queued ? null : auditor.id, form_id: 'ar_touch', form_version: 1, status: 'queued', sample_source: wpick<string>([['random', 6], ['risk', 3], ['new_hire', w.emp_code === 'E205' ? 8 : 0.2], ['critical', 1]]), risk: Math.round(r() * 70), answers: {}, errors: [], score: null, result: null, comments: null, coaching: null, is_calibration: false, calibration_group: null, analyst_ack_at: null, dispute_note: null, dispute_outcome: null, resolved_by: null, resolved_at: null, review_seconds: null, queued_at: subDays(now, Math.max(0, ageD - 1)).toISOString(), reviewed_at: null, created_at: w.created_at, updated_at: w.created_at };
      if (!queued) {
        const answers: Record<string, string> = {}; const errors: Row[] = []; let earned = 0, max = 0, critical = false;
        for (const k of crit) { const bad = r() < base * (k === 'documentation' || k === 'evidence' ? 1.6 : 1) * (k === 'compliance' || k === 'deadline' ? 0.25 : 1); answers[k] = bad ? 'fail' : r() < 0.05 ? 'na' : 'pass'; if (answers[k] === 'na') continue; max += weights[k]; if (!bad) earned += weights[k]; else { const cat = catFor[k]; if (sevFor[cat] === 'critical' || k === 'compliance') critical = true; errors.push({ criterion: k, category: cat, severity: k === 'compliance' ? 'critical' : sevFor[cat], note: pick(['Detail does not match the denial code', 'No reference number captured', 'Next step not the most collectible path', 'Follow-up date too far out', 'Comment lacks who/what/when']) }); } }
        const score = max ? Math.round((earned / max) * 1000) / 10 : 100; const reviewedAt = new Date(new Date(w.created_at).getTime() + (1 + Math.floor(r() * 3)) * 864e5);
        const afterDays = (now.getTime() - reviewedAt.getTime()) / 864e5; const st = reviewedAt > now ? 'completed' : afterDays > 6 ? wpick<string>([['acknowledged', 7], ['disputed', 1], ['resolved', 1.2]]) : wpick<string>([['completed', 6], ['acknowledged', 3], ['disputed', 0.5]]);
        Object.assign(row, { answers, errors, score, result: critical ? 'critical' : score >= 85 ? 'pass' : 'fail', status: st, reviewed_at: (reviewedAt > now ? now : reviewedAt).toISOString(), review_seconds: 90 + Math.floor(r() * 300), comments: errors.length ? 'See flagged criteria.' : 'Clean touch.', coaching: errors.length ? pick(['Always capture the call reference # before closing the touch.', 'Re-check the CARC before choosing the resolution path.', 'Tie follow-up date to the payer turnaround in the Knowledge hub.', 'Write the note so someone else can act on it without opening the claim.']) : null });
        if (st !== 'completed') row.analyst_ack_at = row.reviewed_at;
        if (st === 'disputed' || st === 'resolved') row.dispute_note = 'The payer rep confirmed this path on the call; evidence is in the claim notes.';
        if (st === 'resolved') Object.assign(row, { dispute_outcome: r() < 0.45 ? 'overturned' : 'upheld', resolved_by: auditor.id, resolved_at: row.reviewed_at });
      }
      qaReviews.push(row);
    }

    // guaranteed coverage for every QA tab: a queued backlog from the most recent touches, plus calibration pairs scored by two reviewers
    const reviewed = new Set(qaReviews.map((q) => q.work_log_id));
    const recent = [...pool].sort((a, b) => b.created_at.localeCompare(a.created_at)).filter((w) => !reviewed.has(w.id)).slice(0, L ? 40 : 15);
    recent.forEach((w, i) => qaReviews.push({ id: uid(), work_log_id: w.id, claim_id: w.claim_id, client_id: w.client_id, analyst_id: w.user_id, reviewer_id: null, form_id: 'ar_touch', form_version: 1, status: 'queued', sample_source: (['risk', 'random', 'critical', 'new_hire'] as const)[i % 4], risk: 20 + ((i * 17) % 70), answers: {}, errors: [], score: null, result: null, comments: null, coaching: null, is_calibration: false, calibration_group: null, analyst_ack_at: null, dispute_note: null, dispute_outcome: null, resolved_by: null, resolved_at: null, review_seconds: null, queued_at: w.created_at, reviewed_at: null, created_at: w.created_at, updated_at: w.created_at }));
    const second = profiles.find((p) => p.emp_code === 'S101')!;
    qaReviews.filter((q) => q.score != null && q.status !== 'queued').slice(0, L ? 24 : 8).forEach((q) => {
      const g = uid(); q.is_calibration = true; q.calibration_group = g; const ans: Record<string, string> = { ...q.answers }; const keys = Object.keys(ans); const flip = keys[Math.floor(r() * keys.length)];
      if (r() < 0.45) ans[flip] = ans[flip] === 'pass' ? 'fail' : 'pass';
      const errs = (q.errors as Row[]).filter((e) => ans[e.criterion] === 'fail'); let earned = 0, max = 0; for (const k of keys) { if (ans[k] === 'na') continue; max += weights[k]; if (ans[k] === 'pass') earned += weights[k]; }
      const score = max ? Math.round((earned / max) * 1000) / 10 : 100;
      qaReviews.push({ ...q, id: uid(), reviewer_id: second.id, answers: ans, errors: errs, score, result: ans.compliance === 'fail' ? 'critical' : score >= 85 ? 'pass' : 'fail', status: 'completed', is_calibration: true, calibration_group: g, analyst_ack_at: null, dispute_note: null, dispute_outcome: null, resolved_by: null, resolved_at: null });
    });
  }
  return {
    profiles, clients, providers, config_options: config, claims, work_log: workLog, claim_notes: notes, claim_activity: activity,
    import_templates: defaultTemplates(), import_batches: batches, allocation_rules: [], client_requests: requests, invites: [],
    automation_rules: RULE_TEMPLATES.filter((t) => t.enabled).map((t, i) => ({ ...t, id: uid(), sort: i, created_at: new Date().toISOString() })), rule_runs: [], recoveries,
    report_schedules: [{ id: uid(), name: 'Weekly client summary — Dr. Ramineni', client_id: clients[1].id, audience: 'client', cadence: 'weekly', day: 1, hour_utc: 13, recipients: ['client@ramineni.demo'], active: true, last_sent_at: null }],
    import_log: [], audit_log: [], claim_snapshots: snapshots, qa_reviews: qaReviews, payer_limits: STARTER_LIMITS.map((l) => ({ ...l, id: uid() })), fee_schedules: [], appeals: [], payer_forms: [], bulk_ops: [], payer_alerts: [], fax_log: [],
    app_settings: [{ key: 'branding', value: { appName: 'ClaimsIQ', accent: '#6366f1' } }, { key: 'sla', value: { staleDays: 14, requireNextFu: true } }, { key: 'model', value: { forecast: [0.35, 0.35, 0.3], minSupport: 3, maskPhi: false } }],
  };
}
