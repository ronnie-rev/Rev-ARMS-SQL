import type { Claim, Client, ImportBatch } from '../types';
import { fingerprint, normClaimNo } from './normalize';
import { keyOf, type MatchResult } from './match';
import type { CollapseOut, Row } from './rows';
import { MANAGED_FLAGS, type ImportSettings } from './settings';

export type LogAction = 'CREATED' | 'UPDATED' | 'REOPENED' | 'REKEYED' | 'CLOSED' | 'MISSING' | 'SKIPPED' | 'DEDUPED' | 'AGGREGATED' | 'FLAGGED';
export interface LogDraft { row_no: number | null; claim_id: string | null; claim_key: string | null; action: LogAction; code: string; severity: 'info' | 'warn' | 'error'; message: string; before?: Record<string, any> | null; after?: Record<string, any> | null }
export interface Guardrail { id: string; level: 'block' | 'warn' | 'info'; title: string; detail: string; hard?: boolean }
export interface Change { claim: Claim; next: Claim; changes: Record<string, [any, any]>; kind: 'UPDATED' | 'REOPENED' | 'REKEYED'; row: Row; delta: number }
export interface PlanInput {
  rows: Row[]; matches: MatchResult[]; existing: Claim[]; client: Client; settings: ImportSettings; mode: 'snapshot' | 'merge';
  batchId: string; now: string; asOf: string | null; fileHash?: string | null; priorBatches: ImportBatch[];
  pre: { skipped: Row[]; dups: CollapseOut['dropped']; aggregated: CollapseOut['aggregated']; conflicts: Row[]; badDateRows: number; totalRows: number; conv?: import('./convert').ConvertReport };
  knownPayers: Set<string>;
}
export interface Plan {
  creates: Claim[]; /** claims absent from this file that now wait for a human decision (paid / written off / restore) */ reviews: { claim: Claim; next: Claim }[]; /** claims that were pending review but are back on the file */ reappeared: { claim: Claim; next: Claim }[]; changes: Change[]; unchanged: { claim: Claim; next: Claim }[]; closes: { claim: Claim; next: Claim; reason: string; amount: number }[]; misses: { claim: Claim; next: Claim }[];
  log: LogDraft[]; guardrails: Guardrail[]; asks: MatchResult[]; stats: Record<string, number>; totalBalance: number; priorBalance: number; unknownPayers: { name: string; count: number }[];
}

export const SNAP_FIELDS = ['claim_no', 'claim_key', 'aliases', 'fingerprint', 'payer', 'provider', 'provider_type', 'cpt', 'billed_amt', 'balance', 'pms_status', 'denial_codes', 'denial_date', 'paid_amt', 'allowed_amt', 'patient_resp', 'last_billed', 'dos', 'patient_name', 'account_id', 'flags', 'missing_count', 'missing_since', 'encounter_no', 'closed_at', 'closed_reason', 'resolution', 'status', 'as_of', 'last_batch', 'custom'] as const;
const snap = (c: Claim) => Object.fromEntries(SNAP_FIELDS.map((k) => [k, (c as any)[k] ?? null]));
const empty = (v: any) => v == null || v === '';
const eq = (a: any, b: any) => (typeof a === 'number' || typeof b === 'number' ? Math.abs((a || 0) - (b || 0)) < 0.005 : (a ?? '') === (b ?? ''));
const FIELDS = ['patient_name', 'account_id', 'dos', 'last_billed', 'payer', 'provider', 'provider_type', 'cpt', 'billed_amt', 'balance', 'pms_status', 'denial_codes', 'denial_date', 'paid_amt', 'allowed_amt', 'patient_resp'] as const;

/** Apply one file row to an existing claim under the per-field overwrite policy. Workflow fields (status, RCA, owner, notes…) are never touched here. */
export function applyRow(c: Claim, r: Row, s: ImportSettings, ctx: { batchId: string; now: string; asOf: string | null; matchedBy: string; flags: string[] }): { next: Claim; changes: Record<string, [any, any]>; delta: number; reopened: boolean; rekeyed: boolean; flags: string[] } {
  const next: Claim = { ...c, custom: { ...(c.custom || {}), ...(r.custom || {}) } }; const changes: Record<string, [any, any]> = {}; const flags = new Set<string>(ctx.flags);
  if (r.custom?.visit_src !== 'file' && c.custom?.visit_type && c.custom.visit_type !== 'Unknown') { next.custom.visit_type = c.custom.visit_type; next.custom.visit_src = c.custom.visit_src; }
  if (c.custom?.roles && !r.custom?.roles) next.custom.roles = c.custom.roles;
  const prevBal = c.balance;
  for (const f of FIELDS) {
    const pol = s.overwrite[f] || 'never'; const incoming = (r as any)[f]; const cur = (c as any)[f];
    if (pol === 'never' || empty(incoming)) continue;
    if (f === 'balance' || f === 'billed_amt' || f === 'paid_amt' || f === 'allowed_amt' || f === 'patient_resp') { if (!eq(cur, incoming)) { (next as any)[f] = incoming; changes[f] = [cur, incoming]; } continue; }
    if (pol === 'fill') {
      if (empty(cur)) { (next as any)[f] = incoming; changes[f] = [cur, incoming]; }
      else if (f === 'dos' && !eq(cur, incoming)) flags.add('dos_conflict');
      continue;
    }
    if (!eq(cur, incoming)) { (next as any)[f] = incoming; changes[f] = [cur, incoming]; if (f === 'payer') flags.add('payer_changed'); }
  }
  const delta = Math.round((next.balance - prevBal) * 100) / 100;
  if (delta > 0.005) flags.add('balance_up');
  if (next.balance < -0.005) flags.add('credit_balance');
  if (next.billed_amt > 0 && next.balance > next.billed_amt * 1.01) flags.add('bal_gt_billed');
  // identity maintenance: adopt the PMS's current number, remember the old one so earlier files still map here
  const newKey = r.key; const oldKey = keyOf(c, s); let rekeyed = false;
  if (r.claim_no && newKey && newKey !== oldKey && !r.generated) {
    next.aliases = [...new Set([...(c.aliases || []), ...(oldKey ? [oldKey] : [])])]; next.claim_no = r.claim_no; next.claim_key = newKey; changes.claim_no = [c.claim_no, r.claim_no]; rekeyed = true; flags.add('rekeyed');
  } else next.claim_key = oldKey || newKey;
  next.fingerprint = fingerprint(next) || c.fingerprint || null;
  const reopened = !!c.closed_at;
  if (reopened) {
    next.closed_at = null; next.closed_reason = null; next.resolution = null; next.resolved_by = null; next.resolved_at = null; next.resolution_note = null; next.missing_since = null; flags.add('reopened');
    if (next.status && ['Adjusted', 'Billed to Patient', 'Resolved – Paid'].includes(next.status)) next.status = next.touch_count > 0 ? 'In Progress' : 'New';
    changes.closed_at = [c.closed_at, null];
  }
  next.missing_count = 0; next.last_batch = ctx.batchId; next.as_of = ctx.asOf; next.updated_at = ctx.now;
  const keep = (c.flags || []).filter((f) => !(MANAGED_FLAGS as readonly string[]).includes(f));
  next.flags = [...keep, ...flags];
  return { next, changes, delta, reopened, rekeyed, flags: [...flags] };
}

export function buildPlan(inp: PlanInput): Plan {
  const { rows, matches, existing, client, settings: s, mode, batchId, now, asOf } = inp;
  const log: LogDraft[] = []; const plan: Plan = { creates: [], reviews: [], reappeared: [], changes: [], unchanged: [], closes: [], misses: [], log, guardrails: [], asks: [], stats: {}, totalBalance: 0, priorBalance: 0, unknownPayers: [] };
  const stat = (k: string, n = 1) => { plan.stats[k] = (plan.stats[k] || 0) + n; };
  const seen = new Set<string>(); const payerCount = new Map<string, number>();

  for (const sk of inp.pre.skipped) { log.push({ row_no: sk.n, claim_id: null, claim_key: null, action: 'SKIPPED', code: sk.skip!.code, severity: sk.skip!.code === 'TOTAL_ROW' || sk.skip!.code === 'HEADER_REPEAT' ? 'info' : 'error', message: sk.skip!.message }); stat('skipped'); stat('skip_' + sk.skip!.code); }
  for (const c of inp.pre.conflicts) { log.push({ row_no: c.n, claim_id: null, claim_key: c.key, action: 'SKIPPED', code: 'DUP_KEY_CONFLICT', severity: 'error', message: c.skip!.message }); stat('skipped'); }
  for (const d of inp.pre.dups) { log.push({ row_no: d.row.n, claim_id: null, claim_key: d.row.key, action: 'DEDUPED', code: d.code, severity: 'info', message: d.message }); stat('deduped'); }
  for (const a of inp.pre.aggregated) { log.push({ row_no: a.into.n, claim_id: null, claim_key: a.into.key, action: 'AGGREGATED', code: 'AGGREGATED_LINES', severity: 'info', message: `${a.parts} charge lines rolled into one claim (${a.into.balance})` }); stat('aggregated'); }

  for (const m of matches) {
    const r = m.row; seen.add(r.key); plan.totalBalance += r.balance || 0;
    const pn = r.payer || 'Unknown'; payerCount.set(pn, (payerCount.get(pn) || 0) + 1);
    if (m.ask) plan.asks.push(m);
    const rowFlags: string[] = []; if (r.generated) rowFlags.push('generated_id'); if (m.possibleDup) rowFlags.push('possible_duplicate');
    for (const iss of r.issues) if (iss.severity !== 'info') log.push({ row_no: r.n, claim_id: m.claim?.id ?? null, claim_key: r.key, action: 'FLAGGED', code: iss.code, severity: iss.severity, message: iss.message });

    if (!m.claim) {                                    // ── new claim
      const bal = r.balance || 0;
      if (Math.abs(bal) < 0.005 && s.zeroBalance === 'close') { log.push({ row_no: r.n, claim_id: null, claim_key: r.key, action: 'SKIPPED', code: 'ZERO_BALANCE_NEW', severity: 'info', message: 'New claim with zero balance — nothing to collect' }); stat('skipped'); stat('skip_ZERO_BALANCE_NEW'); continue; }
      if (bal < -0.005 && s.negativeBalance === 'skip') { log.push({ row_no: r.n, claim_id: null, claim_key: r.key, action: 'SKIPPED', code: 'NEGATIVE_SKIPPED', severity: 'warn', message: 'Credit balance skipped by policy' }); stat('skipped'); continue; }
      const flags = [...rowFlags]; if (m.reuse) flags.push('key_reuse'); if (bal < -0.005 && s.negativeBalance !== 'keep') flags.push('credit_balance');
      if ((r.billed_amt || 0) > 0 && bal > (r.billed_amt || 0) * 1.01) flags.push('bal_gt_billed');
      const claim = {
        id: crypto.randomUUID(), claim_uid: null, encounter_no: r.encounter_no, missing_since: null, resolved_by: null, resolved_at: null, resolution_note: null, client_id: client.id, claim_no: m.reuse ? `${r.claim_no}~${m.reuse}` : r.claim_no!, claim_key: m.reuse ? `${r.key}~${m.reuse}` : r.key, aliases: [], fingerprint: r.fp || null, flags, missing_count: 0, as_of: asOf, resolution: null,
        account_id: r.account_id, patient_name: r.patient_name, dos: r.dos, last_billed: r.last_billed, payer: r.payer || 'Unknown', provider: r.provider, provider_type: r.provider_type, cpt: r.cpt,
        billed_amt: r.billed_amt ?? bal, balance: bal, pms_status: r.pms_status, denial_codes: r.denial_codes, denial_date: r.denial_date, paid_amt: r.paid_amt, allowed_amt: r.allowed_amt, patient_resp: r.patient_resp, expected_amt: null, expected_src: null, status: 'New', rca: null, rca_detail: null, end_action: null, end_sub: null, mode: null,
        assigned_to: null, priority: 'Normal', next_fu: null, touch_count: 0, last_touched_at: null, custom: r.custom || {}, first_batch: batchId, last_batch: batchId, closed_at: null, closed_reason: null, created_at: now, updated_at: now,
      } as Claim;
      plan.creates.push(claim); stat('created');
      log.push({ row_no: r.n, claim_id: claim.id, claim_key: r.key, action: 'CREATED', code: m.reuse ? 'KEY_REUSED' : m.possibleDup ? 'CREATED_POSSIBLE_DUP' : 'CREATED', severity: m.possibleDup || m.reuse ? 'warn' : 'info', message: m.reuse || m.possibleDup ? `New claim — ${m.why}` : 'New claim', after: { balance: bal, payer: claim.payer } });
      continue;
    }
    // ── existing claim
    const c = m.claim;
    const wasClosed = !!c.closed_at;
    if (Math.abs(r.balance || 0) < 0.005 && s.zeroBalance === 'close' && !wasClosed) {          // paid down to zero → close
      const next: Claim = { ...c, balance: 0, closed_at: now, closed_reason: 'Zero balance in aging file (paid / adjusted)', resolution: c.resolution || 'unknown', missing_count: 0, last_batch: batchId, as_of: asOf, updated_at: now, flags: (c.flags || []).filter((f) => !(MANAGED_FLAGS as readonly string[]).includes(f)) };
      plan.closes.push({ claim: c, next, reason: 'zero balance', amount: c.balance }); stat('closed'); stat('closed_zero');
      log.push({ row_no: r.n, claim_id: c.id, claim_key: r.key, action: 'CLOSED', code: 'ZERO_BALANCE', severity: 'info', message: `Balance ${c.balance} → 0; closed`, before: snap(c), after: { balance: 0 } }); continue;
    }
    if (Math.abs(r.balance || 0) < 0.005 && wasClosed) { plan.unchanged.push({ claim: c, next: { ...c, last_batch: batchId, as_of: asOf, missing_count: 0 } }); stat('unchanged'); continue; }
    const res = applyRow(c, r, s, { batchId, now, asOf, matchedBy: m.kind, flags: rowFlags });
    if ((c.flags || []).includes('missing_review')) { res.next.missing_since = null; plan.reappeared.push({ claim: c, next: res.next }); stat('reappeared'); log.push({ row_no: r.n, claim_id: c.id, claim_key: r.key, action: 'UPDATED', code: 'REAPPEARED', severity: 'info', message: `Back on the aging file after ${c.missing_count || 1} missed file(s) — removed from the missing-review queue`, before: snap(c) }); }
    const viaFp = m.kind === 'fingerprint' && !r.generated;
    if (viaFp) { res.next.flags = [...new Set([...(res.next.flags || []), 'rekeyed'])]; }
    const material = Object.keys(res.changes).length > 0 || res.reopened || res.rekeyed || viaFp;
    const flagsChanged = (res.next.flags || []).join() !== (c.flags || []).join();
    if (!material && !flagsChanged) { plan.unchanged.push({ claim: c, next: res.next }); stat('unchanged'); continue; }
    if (!material) { plan.unchanged.push({ claim: c, next: res.next }); stat('unchanged'); continue; }
    const kind = res.reopened ? 'REOPENED' : res.rekeyed ? 'REKEYED' : 'UPDATED';
    plan.changes.push({ claim: c, next: res.next, changes: res.changes, kind, row: r, delta: res.delta }); stat(kind.toLowerCase());
    if (res.delta < -0.005) stat('balance_down'); if (res.delta > 0.005) stat('balance_up');
    const desc = Object.entries(res.changes).filter(([k]) => k !== 'closed_at').map(([k, [a, b]]) => `${k}: ${a ?? '∅'} → ${b ?? '∅'}`).join('; ');
    log.push({ row_no: r.n, claim_id: c.id, claim_key: r.key, action: kind, code: kind === 'REKEYED' ? 'REKEYED' : kind === 'REOPENED' ? 'REOPENED' : 'UPDATED', severity: kind === 'UPDATED' && res.delta <= 0.005 ? 'info' : 'warn', message: (kind === 'REKEYED' ? `Claim # ${c.claim_no} → ${r.claim_no} (${m.why}). ` : kind === 'REOPENED' ? 'Reappeared on aging; reopened. ' : '') + desc, before: snap(c), after: Object.fromEntries(Object.entries(res.changes).map(([k, v]) => [k, v[1]])) });
  }

  // ── absent claims (snapshot mode only)
  if (mode === 'snapshot') {
    const matchedIds = new Set(matches.filter((m) => m.claim).map((m) => m.claim!.id));
    const day = asOf || now.slice(0, 10); const cov = s.coverage?.payers?.length ? new Set(s.coverage.payers.map((x) => x.toLowerCase())) : null; const inScope = cov ? (c: Claim) => cov.has((c.payer || '').toLowerCase()) : null;
    for (const c of existing) {
      if (c.closed_at || matchedIds.has(c.id)) continue;
      if (inScope && !inScope(c)) { stat('out_of_scope'); continue; }
      const miss = (c.missing_count || 0) + 1; const inReview = (c.flags || []).includes('missing_review');
      if (miss < s.closeAfterMisses) {
        const next: Claim = { ...c, missing_count: miss, flags: [...new Set([...(c.flags || []), 'missing_once'])], updated_at: now };
        plan.misses.push({ claim: c, next }); stat('missing');
        log.push({ row_no: null, claim_id: c.id, claim_key: keyOf(c, s), action: 'MISSING', code: 'MISSING_ONCE', severity: 'warn', message: `Absent from file (${miss}/${s.closeAfterMisses}) — kept open`, before: snap(c) });
      } else if (s.missingPolicy === 'review') {
        // never close on absence alone: the file does not say WHY it dropped off (paid? written off? incomplete export?)
        const next: Claim = { ...c, missing_count: miss, missing_since: c.missing_since || day, flags: [...new Set([...(c.flags || []).filter((f) => f !== 'missing_once'), 'missing_review'])], last_batch: inReview ? c.last_batch : c.last_batch, updated_at: now };
        if (inReview) { plan.misses.push({ claim: c, next }); stat('still_missing'); }
        else { plan.reviews.push({ claim: c, next }); stat('review'); log.push({ row_no: null, claim_id: c.id, claim_key: keyOf(c, s), action: 'MISSING', code: 'MISSING_REVIEW', severity: 'warn', message: `Absent from file — needs a supervisor/manager decision (paid, written off or restore). Balance ${c.balance}`, before: snap(c) }); }
      } else {
        const next: Claim = { ...c, closed_at: now, closed_reason: 'Dropped off aging report (paid / adjusted)', resolution: c.resolution || 'unknown', resolved_at: now, missing_count: miss, last_batch: batchId, updated_at: now, flags: (c.flags || []).filter((f) => !(MANAGED_FLAGS as readonly string[]).includes(f)) };
        plan.closes.push({ claim: c, next, reason: 'dropped', amount: c.balance }); stat('closed'); stat('closed_dropped');
        log.push({ row_no: null, claim_id: c.id, claim_key: keyOf(c, s), action: 'CLOSED', code: 'DROPPED', severity: 'info', message: `Absent from file (${miss}/${s.closeAfterMisses}); closed — balance ${c.balance}`, before: snap(c) });
      }
    }
  }

  { const cov = s.coverage?.payers?.length ? new Set(s.coverage.payers.map((x) => x.toLowerCase())) : null; plan.priorBalance = sum(existing.filter((c) => !c.closed_at && (!cov || cov.has((c.payer || '').toLowerCase()))).map((c) => c.balance)); }
  plan.unknownPayers = [...payerCount].filter(([n]) => n !== 'Unknown' && !inp.knownPayers.has(n.toLowerCase())).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  plan.guardrails = guardrails(inp, plan);
  return plan;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export function guardrails(inp: PlanInput, plan: Plan): Guardrail[] {
  const { settings: s, mode, priorBatches } = inp; const g: Guardrail[] = []; const st = plan.stats;
  const validRows = inp.matches.length; const totalRows = inp.pre.totalRows; const skipped = (st.skipped || 0) - (st.skip_TOTAL_ROW || 0) - (st.skip_HEADER_REPEAT || 0) - (st.skip_ZERO_BALANCE_NEW || 0);
  if (validRows === 0) g.push({ id: 'NO_VALID_ROWS', level: 'block', hard: true, title: 'No importable rows', detail: 'Every row was skipped. Check the column mapping and header row.' });
  const invalidPct = totalRows ? (skipped / totalRows) * 100 : 0;
  if (invalidPct > s.maxInvalidPct) g.push({ id: 'INVALID_ROWS', level: 'block', title: `${Math.round(invalidPct)}% of rows are invalid`, detail: `More than ${s.maxInvalidPct}% of rows were rejected — usually a wrong column mapping or the wrong sheet.` });
  const badDatePct = totalRows ? (inp.pre.badDateRows / totalRows) * 100 : 0;
  if (badDatePct > s.maxBadDatePct) g.push({ id: 'BAD_DATES', level: 'block', title: `${Math.round(badDatePct)}% of dates could not be read`, detail: 'Check the date format / order (dd/mm vs mm/dd) or the mapped date column.' });
  const last = [...priorBatches].filter((b) => b.status !== 'rolled_back' && b.status !== 'failed').sort((a, b) => (b.as_of || b.created_at).localeCompare(a.as_of || a.created_at))[0];
  if (!inp.asOf) g.push({ id: 'NO_AS_OF', level: s.requireAsOf ? 'block' : 'warn', title: 'No “as of” date', detail: 'Tell ARMS the date this report reflects — it is used to order files and detect stale uploads.' });
  else if (last?.as_of) {
    if (inp.asOf < last.as_of) g.push({ id: 'STALE_FILE', level: s.blockStale ? 'block' : 'warn', title: `Older than the last import (${last.as_of})`, detail: `This file is as of ${inp.asOf}. Importing it would overwrite newer balances with older ones.` });
    else if (inp.asOf === last.as_of) g.push({ id: 'SAME_DAY', level: 'info', title: 'Another file for the same date', detail: `A file as of ${inp.asOf} was already imported; this one will overwrite it where values differ.` });
  }
  if (inp.fileHash && priorBatches.some((b) => b.file_hash === inp.fileHash && b.status !== 'rolled_back')) g.push({ id: 'SAME_FILE', level: s.blockSameFile ? 'block' : 'warn', title: 'This exact file was already imported', detail: 'Same content hash as a previous batch. Re-importing changes nothing but adds noise to the history.' });
  if (mode === 'snapshot') {
    const cov = s.coverage?.payers?.length ? new Set(s.coverage.payers.map((x) => x.toLowerCase())) : null;
    const open = inp.existing.filter((c) => !c.closed_at && (!cov || cov.has((c.payer || '').toLowerCase()))).length; const closing = (st.closed || 0) + (st.review || 0);
    const pct = open ? (closing / open) * 100 : 0;
    if (open >= 10 && pct > s.maxDropPct) g.push({ id: 'MASS_DROP', level: 'block', title: `${closing} open claims (${Math.round(pct)}%) are missing from this file`, detail: `More than ${s.maxDropPct}% of the open inventory is missing from this file. If it is a partial export, switch to “Merge only”.` });
    else if (closing > 0) g.push({ id: 'DROPS', level: 'info', title: s.missingPolicy === 'review' ? `${closing} claims are missing from this file and will wait for review` : `${closing} claims will close`, detail: s.missingPolicy === 'review' ? `${money(sum([...plan.reviews, ...plan.closes].map((c) => c.claim.balance)))} stays open until a supervisor/manager marks each one paid, written off or restores it.` : `${money(sum(plan.closes.map((c) => c.amount)))} left AR (paid / adjusted).` });
  }
  if (plan.priorBalance > 0 && mode === 'snapshot') {
    const after = sum(inp.existing.filter((c) => !c.closed_at && !plan.closes.some((x) => x.claim.id === c.id)).map((c) => c.balance)) ; void after;
    const delta = ((plan.totalBalance - plan.priorBalance) / plan.priorBalance) * 100;
    if (Math.abs(delta) > s.maxTotalDeltaPct) g.push({ id: 'TOTAL_SWING', level: 'block', title: `Total AR moves ${delta > 0 ? '+' : ''}${Math.round(delta)}%`, detail: `File total ${money(plan.totalBalance)} vs ${money(plan.priorBalance)} currently open (limit ±${s.maxTotalDeltaPct}%).` });
  }
  const unk = plan.creates.filter((x) => x.custom?.visit_type === 'Unknown').length;
  if (unk) g.push({ id: 'UNKNOWN_VISIT', level: s.requireVisitType ? 'block' : 'warn', title: `${unk} new claim${unk === 1 ? '' : 's'} with an Unknown visit type`, detail: s.requireVisitType ? 'Policy requires a visit type on every new claim. Add a Visit Type column, or relax this in Admin → Import rules to send them to triage.' : 'They will be created with status Validation Hold and listed in the triage queue until a visit type is set.' });
  if (plan.asks.length) g.push({ id: 'IDENTITY_ASK', level: 'warn', title: `${plan.asks.length} rows need an identity decision`, detail: 'These look like claims that were re-numbered or duplicated. Review them below; unresolved rows import as new claims.' });
  const rk = (st.rekeyed || 0); const matched = inp.matches.filter((m) => m.claim).length;
  if (matched >= 20 && rk / matched > 0.25) g.push({ id: 'REKEY_STORM', level: 'warn', title: `${Math.round((rk / matched) * 100)}% of matches were by fingerprint`, detail: 'Claim numbers look unstable in this export. Check you mapped the right “claim number” column (not an encounter / visit ID).' });
  const gen = inp.matches.filter((m) => m.row.generated).length;
  if (validRows && gen / validRows > 0.1) g.push({ id: 'GENERATED_IDS', level: 'warn', title: `${gen} rows had no claim number`, detail: 'ARMS generated stable IDs from patient + DOS + CPT + amount. Add the claim-number column to your export for exact matching.' });
  const up = st.balance_up || 0; if (matched >= 20 && up / matched > 0.2) g.push({ id: 'BALANCE_UP', level: 'warn', title: `${up} balances increased`, detail: 'An unusually high share of balances went up since the last file.' });
  if (plan.unknownPayers.length) g.push({ id: 'UNKNOWN_PAYERS', level: 'info', title: `${plan.unknownPayers.length} payer names not in the directory`, detail: plan.unknownPayers.slice(0, 6).map((p) => `${p.name} (${p.count})`).join(', ') + ' — add or alias them in Exceptions → Payers.' });
  if (inp.pre.conflicts.length) g.push({ id: 'DUP_KEYS', level: 'warn', title: `${inp.pre.conflicts.length} rows share a claim # with different values`, detail: 'Skipped by the duplicate policy. Switch to “aggregate” if these are charge lines.' });
  return g;
}
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export { normClaimNo };
