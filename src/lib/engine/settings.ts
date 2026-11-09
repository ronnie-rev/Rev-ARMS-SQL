export type OverwritePolicy = 'file' | 'fill' | 'never';

export interface ImportSettings {
  granularity: 'claim' | 'line';                    // claim: one row per claim (lines rolled up) · line: every charge line is its own record
  identity: 'auto' | 'ask' | 'strict';              // how to treat a re-numbered claim found by fingerprint
  encounterAsKey?: boolean;                         // no claim # but an encounter # → use the encounter as the identity (default on)
  splitOnPayer?: boolean;                           // same claim # under different payers → separate claims, never summed (default on)
  phiFree: boolean;                                 // workspace is PHI-free: patient name / DOB are discarded at import (never stored); identity uses account / encounter / DOS / CPT / amount
  missingKey: 'generate' | 'skip';                  // rows without a claim number
  duplicates: 'aggregate' | 'first' | 'last' | 'skip';  // same key, different values inside one file
  closeAfterMisses: number;                         // snapshot mode: a claim absent from N consecutive files is acted on (see missingPolicy)
  /** this file covers only these payers (empty = the whole practice): claims outside the scope are never treated as missing */ coverage?: { payers: string[] };
  missingPolicy: 'review' | 'auto_close';           // review: absent claims wait for a supervisor/manager to mark them paid / written off · auto_close: legacy silent close
  zeroBalance: 'close' | 'keep';
  negativeBalance: 'flag' | 'skip' | 'keep';
  maxDropPct: number; maxTotalDeltaPct: number; maxInvalidPct: number; maxBadDatePct: number;
  requireAsOf: boolean; blockStale: boolean; blockSameFile: boolean;
  dateOrder: 'auto' | 'mdy' | 'dmy';
  overwrite: Record<string, OverwritePolicy>;      // per field; workflow fields are never in this map = never overwritten
  attributionWindowDays: number;
  attributionMode: 'last_touch' | 'split_equal';
  stripPrefix: string[];                            // claim-number prefixes ignored when matching
  autoAliasPayers: boolean;
  requireVisitType: boolean;                        // Unknown visit type on NEW claims blocks approval (otherwise: triage queue)
}

export const DEFAULT_IMPORT: ImportSettings = {
  granularity: 'claim', identity: 'auto', phiFree: true, missingKey: 'generate', duplicates: 'aggregate', closeAfterMisses: 1, missingPolicy: 'review', zeroBalance: 'close', negativeBalance: 'flag',
  requireVisitType: false, maxDropPct: 40, maxTotalDeltaPct: 25, maxInvalidPct: 20, maxBadDatePct: 10, requireAsOf: true, blockStale: true, blockSameFile: true, dateOrder: 'auto',
  overwrite: { balance: 'file', billed_amt: 'file', payer: 'file', pms_status: 'file', denial_codes: 'file', denial_date: 'file', paid_amt: 'file', allowed_amt: 'file', patient_resp: 'file', last_billed: 'file', cpt: 'file', provider: 'file', provider_type: 'fill', dos: 'fill', patient_name: 'fill', account_id: 'fill' },
  attributionWindowDays: 45, attributionMode: 'last_touch', stripPrefix: [], autoAliasPayers: true,
};

/** Global (Admin → Import rules) ← client override (Clients → settings.import). Field-level merge for `overwrite`. */
export function resolveSettings(global?: Partial<ImportSettings> | null, client?: Partial<ImportSettings> | null): ImportSettings {
  const g = { ...DEFAULT_IMPORT, ...(global || {}), overwrite: { ...DEFAULT_IMPORT.overwrite, ...(global?.overwrite || {}) } };
  return { ...g, ...(client || {}), overwrite: { ...g.overwrite, ...(client?.overwrite || {}) } } as ImportSettings;
}

/** Flags the import owns and re-evaluates each time; everything else (rule/manual flags) is preserved. */
export const MANAGED_FLAGS = ['balance_up', 'credit_balance', 'reopened', 'missing_once', 'missing_review', 'key_reuse', 'payer_changed', 'dos_conflict', 'possible_duplicate', 'rekeyed', 'generated_id', 'bal_gt_billed'] as const;
export const FLAG_LABEL: Record<string, { label: string; tone: 'red' | 'amber' | 'blue' | 'slate'; help: string }> = {
  balance_up: { label: 'Balance increased', tone: 'amber', help: 'Balance went up since the last file — rebill, reversed payment, or data error.' },
  credit_balance: { label: 'Credit balance', tone: 'amber', help: 'Negative balance: overpayment / refund review.' },
  reopened: { label: 'Reopened', tone: 'blue', help: 'Was closed, reappeared on the aging report.' },
  missing_once: { label: 'Missing from last file', tone: 'amber', help: 'Absent from the latest file; will close if it stays absent.' },
  missing_review: { label: 'Missing — needs review', tone: 'red', help: 'Absent from the latest aging file. A supervisor/manager must mark it paid, written off, or restore it.' },
  key_reuse: { label: 'Claim # reused', tone: 'red', help: 'The PMS reused this claim number for a different patient/DOS — created as a separate claim, not merged.' },
  payer_changed: { label: 'Payer changed', tone: 'blue', help: 'Payer differs from the previous file (often a primary→secondary shift).' },
  dos_conflict: { label: 'DOS conflict', tone: 'red', help: 'File date of service differs from the stored one; stored value kept.' },
  possible_duplicate: { label: 'Possible duplicate', tone: 'red', help: 'Same patient, DOS and charge as another claim under a different number.' },
  rekeyed: { label: 'Claim # changed', tone: 'blue', help: 'PMS issued a new claim number; history was carried over.' },
  generated_id: { label: 'Generated ID', tone: 'slate', help: 'No claim number in file — ARMS generated a stable ID from patient/DOS/CPT/amount.' },
  bal_gt_billed: { label: 'Balance > billed', tone: 'amber', help: 'Balance exceeds the billed amount.' },
};
