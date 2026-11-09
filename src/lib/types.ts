import type { Role } from './roles';
export { ROLE_LABEL } from './roles';
export type { Role } from './roles';

export interface PortalPerms { show_patient?: boolean; can_message?: boolean; can_download?: boolean; can_approve?: boolean }
export const PORTAL_DEFAULTS: Required<PortalPerms> = { show_patient: false, can_message: true, can_download: false, can_approve: true };
export const portalPerms = (p?: { portal?: PortalPerms } | null): Required<PortalPerms> => ({ ...PORTAL_DEFAULTS, ...(p?.portal || {}) });
/** Practices a client user may see (legacy single client_id ∪ client_ids). Staff: their working set, not a restriction. */
export const practiceIds = (p?: { client_id?: string | null; client_ids?: string[] } | null): string[] => [...new Set([...(p?.client_id ? [p.client_id] : []), ...(p?.client_ids || [])])];
export interface Profile {
  hire_date?: string | null; qa_lead?: boolean; portal?: PortalPerms; skills?: string[]; client_ids?: string[]; /** staff only: 'assigned' limits the user to client_ids (enforced by RLS, migration 0022) */ client_scope?: 'all' | 'assigned'; id: string; email: string; full_name: string; emp_code: string | null; role: Role;
  supervisor_id: string | null; daily_target: number; active: boolean; client_id?: string | null; created_at?: string;
}
export interface Client {
  id: string; name: string; code: string | null; pms: string; color: string;
  supervisor_id: string | null; aging_basis: 'dos' | 'billed'; tf_days: number | null;
  rca_allowed: string[] | null; active: boolean; settings: Record<string, unknown>;
}
export interface Provider { id: string; client_id: string; name: string; type: string; npi?: string | null; credentials?: string | null }

export type Category = 'lifecycle' | 'stage' | 'carc' | 'outcome' | 'playbook' | 'resource' | 'letter' | 'snippet' | 'kb_article' | 'rca' | 'rca_detail' | 'end_action' | 'end_sub' | 'mode' | 'status' | 'bucket' | 'payer' | 'field' | 'priority' | 'issue_bucket';
export interface ConfigOption {
  id: string; category: Category; value: string; parent: string | null; label: string | null;
  color: string | null; sort: number; active: boolean; meta: Record<string, any>;
}

export interface Claim {
  id: string; client_id: string; claim_no: string; account_id: string | null; patient_name: string | null;
  dos: string | null; last_billed: string | null; payer: string | null; provider: string | null; provider_type: string | null;
  cpt: string | null; billed_amt: number; balance: number; pms_status: string | null; denial_codes: string | null;
  status: string; rca: string | null; rca_detail: string | null; end_action: string | null; end_sub: string | null; mode: string | null;
  assigned_to: string | null; priority: string; next_fu: string | null; touch_count: number; last_touched_at: string | null;
  custom: Record<string, any>; first_batch: string | null; last_batch: string | null;
  closed_at: string | null; closed_reason: string | null; created_at: string; updated_at: string;
  claim_key?: string | null; aliases?: string[]; fingerprint?: string | null; flags?: string[]; missing_count?: number; resolution?: string | null; as_of?: string | null;
  /** permanent unique id (never changes) */ claim_uid?: string | null; encounter_no?: string | null; /** first file date the claim was absent from (pending review) */ missing_since?: string | null;
  resolved_by?: string | null; resolved_at?: string | null; resolution_note?: string | null;
  /** expected total allowed/collectible and where it came from */ expected_amt?: number | null; expected_src?: string | null; paid_amt?: number | null; allowed_amt?: number | null; patient_resp?: number | null; /** starts the appeal / corrected-claim clock */ denial_date?: string | null;
}

export interface WorkLog {
  id: string; claim_id: string; client_id: string; user_id: string | null; user_name: string | null; emp_code: string | null;
  supervisor_name: string | null; work_date: string; comment: string | null;
  rca: string | null; rca_detail: string | null; end_action: string | null; end_sub: string | null; mode: string | null;
  balance: number | null; age_days: number | null; bucket: string | null; next_fu: string | null; multi_touch: boolean;
  audit_status: 'pending' | 'pass' | 'fail' | 'na'; audit_remarks: string | null; audit_by: string | null; audited_at: string | null;
  legacy: boolean; created_at: string; time_spent_sec?: number | null; call_ref?: string | null; contact_name?: string | null; ack_at?: string | null;
}
export interface Note { id: string; claim_id: string; author_id: string | null; author_name: string | null; body: string; pinned: boolean; client_visible?: boolean; created_at: string }
export interface Activity { id: string; claim_id: string; actor_id: string | null; actor_name: string | null; kind: string; summary: string; meta: Record<string, any>; created_at: string }

export interface ImportTemplate {
  id: string; name: string; pms: string; kind: 'aging' | 'worklog'; builtin: boolean;
  mapping: Record<string, string[]>; options: Record<string, any>;
}
export interface ImportBatch {
  id: string; client_id: string | null; template_name: string | null; file_name: string | null; mode: string | null;
  total_rows: number; new_rows: number; updated_rows: number; dropped_rows: number; skipped_rows: number;
  total_balance: number; created_by: string | null; created_at: string; summary?: BatchSummary;
  status?: 'committed' | 'rolled_back' | 'failed'; as_of?: string | null; file_hash?: string | null; rolled_back_at?: string | null; rules?: Record<string, any>; guardrails?: any[];
}
export interface BatchSummary { buckets?: Record<string, { n: number; v: number }>; payers?: Record<string, number>; resolved?: { n: number; v: number }; total?: number; count?: number }
export interface ClientRequest { id: string; client_id: string; claim_id: string | null; author_id: string | null; author_name: string | null; kind: 'question' | 'documents' | 'escalation' | 'info' | 'approval'; amount?: number | null; decision?: string | null; body: string; status: 'open' | 'answered' | 'closed'; response: string | null; responded_by: string | null; responded_at: string | null; created_at: string }
export interface Invite { email: string; role: Role; client_id: string | null; client_ids?: string[]; portal?: PortalPerms; full_name: string | null }
export interface AllocationRule {
  id: string; name: string; client_id: string | null; criteria: { payers?: string[]; buckets?: string[]; minBalance?: number; statuses?: string[] };
  assignees: string[]; strategy: 'balanced' | 'round_robin' | 'by_balance' | 'skills'; active: boolean; sort: number;
}
export interface AppSettings { key: string; value: Record<string, any> }

export type TableName =
  | 'profiles' | 'clients' | 'providers' | 'config_options' | 'app_settings' | 'claims' | 'work_log'
  | 'claim_notes' | 'claim_activity' | 'import_templates' | 'import_batches' | 'allocation_rules' | 'client_requests' | 'invites'
  | 'notifications' | 'import_log' | 'audit_log' | 'automation_rules' | 'rule_runs' | 'recoveries' | 'report_schedules' | 'user_items' | 'claim_snapshots' | 'qa_reviews' | 'qa_config'
  | 'payer_limits' | 'fee_schedules' | 'fee_rates' | 'appeals' | 'payer_forms' | 'payer_form_files' | 'bulk_ops' | 'bulk_op_rows' | 'payer_alerts' | 'fax_log' | 'feedback';

export interface ImportLogRow { id: string; batch_id: string; client_id: string | null; row_no: number | null; claim_id: string | null; claim_key: string | null; action: string; code: string | null; severity: 'info' | 'warn' | 'error'; message: string | null; before: Record<string, any> | null; after: Record<string, any> | null; created_at: string }
export interface AuditEntry { id: string; actor_id: string | null; actor_name: string | null; actor_role: string | null; kind: string; entity: string | null; entity_id: string | null; summary: string; meta: Record<string, any>; created_at: string }
export interface RuleCondition { field: string; op: string; value?: any }
export interface RuleAction { type: 'assign' | 'priority' | 'status' | 'next_fu_in' | 'flag' | 'unflag' | 'note' | 'close' | 'notify' | 'suggest_rca'; value?: any; pool?: string[]; strategy?: 'balanced' | 'round_robin'; to?: 'owner' | 'supervisor' | 'admin' | 'all' }
export interface AutoRule { id: string; name: string; description: string | null; enabled: boolean; trigger: 'import' | 'touch' | 'daily' | 'manual'; client_id: string | null; match: 'all' | 'any'; conditions: RuleCondition[]; actions: RuleAction[]; stop: boolean; sort: number; created_at?: string }
export interface RuleRun { id: string; rule_id: string | null; rule_name: string | null; trigger: string | null; dry_run: boolean; matched: number; changed: number; actor_name: string | null; batch_id: string | null; sample: string[]; created_at: string }
export interface Notification { id: string; user_id: string | null; role: string | null; title: string; body: string | null; link: string | null; severity: 'info' | 'warn' | 'high'; read_by: string[]; created_at: string }
export interface Recovery { id: string; claim_id: string | null; client_id: string; batch_id: string | null; user_id: string | null; user_name: string | null; amount: number; type: 'payment' | 'adjustment' | 'patient' | 'unknown'; basis: string; share: number; touch_id: string | null; window_days: number | null; occurred_on: string; created_at: string }
export interface ReportSchedule { id: string; name: string; client_id: string | null; audience: 'client' | 'internal'; cadence: 'weekly' | 'monthly'; day: number; hour_utc: number; recipients: string[]; active: boolean; last_sent_at: string | null }

export type UserItemKind = 'report_preset' | 'pivot_view' | 'outreach' | 'capa' | 'academy';
export interface UserItem { id: string; kind: UserItemKind; owner_id: string | null; client_id: string | null; name: string | null; shared: boolean; body: Record<string, any>; created_at: string; updated_at: string }

export interface ClaimSnapshot { id: string; batch_id: string; claim_id: string; client_id: string; as_of: string; balance: number; billed_amt: number; payer: string | null; provider: string | null; age_days: number | null; bucket: string | null; created_at: string }

// ───── QA module ─────
export interface QaCriterion { id: string; label: string; weight: number; critical?: boolean; help?: string }
export interface QaForm { id: string; name: string; version: number; pass_threshold: number; criteria: QaCriterion[] }
export type QaErrorType = 'accuracy' | 'process' | 'documentation' | 'compliance' | 'financial' | 'communication';
export interface QaErrorCat { id: string; label: string; severity: 'critical' | 'major' | 'minor'; /** family used in trend reports */ type?: QaErrorType; /** multiplier on the severity points (default 1) */ weight?: number; /** any occurrence forces a critical result */ autofail?: boolean }
export interface QaScoring { model: 'criteria' | 'deduction' | 'hybrid'; severityPoints: { critical: number; major: number; minor: number }; floor: number }
export interface QaConfig {
  sample_rate_pct: number; min_per_analyst_week: number; new_hire_days: number; new_hire_rate_pct: number; risk_weighted: boolean; force_actions: string[]; force_min_balance: number; calibration_pct: number;
  forms: QaForm[]; error_cats: QaErrorCat[]; dispute_window_days: number; scoring?: QaScoring;
  /** who reviews: the in-house team now, an outsourced QA department later (role “QA Analyst (External)”) or both */ reviewer_source?: 'internal' | 'external' | 'both'; external_partner?: string;
  kpi: { qa_score: number; max_error_rate_pct: number; review_tat_days: number; max_dispute_pct: number; min_coverage_pct: number; touches_per_day: number; max_rework_pct: number };
  perf_weights: { volume: number; quality: number; rework: number };
}
export type QaStatus = 'queued' | 'in_review' | 'completed' | 'acknowledged' | 'disputed' | 'resolved';
export interface QaError { criterion: string; category: string; severity: 'critical' | 'major' | 'minor'; note: string }
export interface QaReview {
  id: string; work_log_id: string; claim_id: string | null; client_id: string | null; analyst_id: string | null; reviewer_id: string | null; form_id: string | null; form_version: number; status: QaStatus;
  sample_source: string; risk: number | null; answers: Record<string, 'pass' | 'fail' | 'na'>; errors: QaError[]; score: number | null; result: 'pass' | 'fail' | 'critical' | null; comments: string | null; coaching: string | null;
  is_calibration: boolean; calibration_group: string | null; analyst_ack_at: string | null; dispute_note: string | null; dispute_outcome: 'upheld' | 'overturned' | null; resolved_by: string | null; resolved_at: string | null;
  review_seconds: number | null; queued_at: string; reviewed_at: string | null; created_at: string; updated_at: string;
}

// ───────── central rules (migration 0014) ─────────
export type LimitBasis = 'dos' | 'last_billed' | 'denial';
export interface PayerLimit { id: string; payer: string; client_id: string | null; plan_type: string | null; tfl_days: number | null; afl_days: number | null; ccfl_days: number | null; tfl_basis: 'dos' | 'last_billed'; afl_basis: LimitBasis; ccfl_basis: LimitBasis; source: string | null; notes: string | null; verified_on: string | null; active: boolean; created_at?: string; updated_at?: string }
export interface FeeSchedule { id: string; name: string; client_id: string | null; payer: string | null; kind: 'contract' | 'custom' | 'medicare_pct'; pct: number | null; effective_from: string | null; effective_to: string | null; active: boolean; notes: string | null; created_at?: string }
export interface FeeRate { id: string; schedule_id: string; cpt: string; modifier: string; amount: number }
export type AppealStatus = 'draft' | 'ready' | 'sent' | 'pending' | 'won' | 'partial' | 'lost' | 'withdrawn';
export type AppealKind = 'appeal' | 'reconsideration' | 'corrected_claim' | 'underpayment_dispute' | 'external_review';
export interface Appeal { id: string; claim_id: string; client_id: string; level: number; kind: AppealKind; status: AppealStatus; payer: string | null; template: string | null; form_id: string | null; due_on: string | null; filed_on: string | null; decided_on: string | null; method: string | null; tracking_no: string | null; amount_disputed: number | null; amount_recovered: number | null; reason: string | null; outcome_note: string | null; letter: Record<string, any>; form_values: Record<string, any>; attachments: { name: string; note?: string; done?: boolean }[]; created_by: string | null; created_at: string; updated_at: string }
export interface PayerForm { id: string; name: string; payer: string | null; client_id: string | null; kind: string; mode: 'acroform' | 'overlay'; field_map: Record<string, any>; pages: number | null; bytes: number | null; active: boolean; created_by: string | null; created_at: string; updated_at: string }
export interface BulkOp { id: string; label: string; action: Record<string, any>; filter_desc: string | null; actor_id: string | null; actor_name: string | null; claim_count: number; changed_count: number; status: 'applied' | 'undone' | 'partly_undone'; undo_until: string | null; undone_at: string | null; undone_by: string | null; undone_count: number | null; created_at: string }
export interface FaxLog { id: string; appeal_id: string | null; claim_id: string | null; client_id: string | null; to_number: string; subject: string | null; pages: number; provider: string; provider_id: string | null; status: 'queued' | 'sent' | 'failed' | 'test'; error: string | null; sent_by: string | null; sent_by_name: string | null; created_at: string; delivered_at: string | null }
export interface PayerAlert { id: string; payer: string; client_id: string | null; cpt: string | null; kind: string; metric: string | null; prev_value: number | null; curr_value: number | null; n: number | null; detail: Record<string, any>; dedupe_key: string; status: 'new' | 'ack' | 'dismissed'; detected_on: string; created_at: string }
