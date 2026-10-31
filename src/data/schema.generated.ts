// Sinh tự động bởi scripts/docs/gen-db-types.js (npm run db:types) từ migrations/postgres/*.sql. Đừng sửa tay.
import type { ColumnType } from 'kysely';

/** Cột có giá trị mặc định / tự sinh: đọc ra T, có thể bỏ khi INSERT. */
export type Generated<T> = ColumnType<T, T | undefined, T>;

export interface AdvanceRequestsTable {
  id: Generated<number>;
  username: string;
  month: string;
  amount: number;
  cap: number;
  note: string | null;
  status: Generated<string>;
  granted: number | null;
  rev: Generated<number>;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
}

export interface AiFindingActionsTable {
  id: Generated<number>;
  finding_id: string;
  digest: string;
  month: string;
  rule_id: string;
  action: string;
  by: string;
  at: string;
  note: string;
}

export interface AiReviewRunsTable {
  id: Generated<number>;
  month: string;
  run_id: number | null;
  rules_json: string;
  thresholds_hash: string;
  params_hash: string;
  findings_total: number | null;
  summary_json: string | null;
  by: string;
  at: string;
}

export interface AttendanceDaysTable {
  username: string;
  date: string;
  entry_json: string;
  updated_at: string;
}

export interface AttendanceSessionsTable {
  id: Generated<number>;
  username: string;
  date: string;
  state: string;
  entry_json: string;
  version: Generated<number>;
  legacy_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogTable {
  id: Generated<number>;
  at: string;
  actor: string;
  actor_roles: string | null;
  action: string;
  entity_kind: string;
  entity_id: string;
  subject: string | null;
  month: string | null;
  before_json: string | null;
  after_json: string | null;
  reason: string | null;
  sensitivity: Generated<string>;
  request_id: string | null;
  prev_hash: string;
  hash: string;
  subject_uuid: string | null;
  actor_uuid: string | null;
}

export interface BenefitTypesTable {
  code: string;
  label: string | null;
}

export interface CorrectionsTable {
  id: Generated<number>;
  username: string;
  date: string;
  req_in: string;
  req_out: string;
  reason: string;
  status: Generated<string>;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
  created_at: string;
  context_json: string | null;
  session_id: number | null;
  session_version: number | null;
}

export interface ExplanationsTable {
  id: Generated<number>;
  username: string;
  date: string;
  kind: string;
  session_id: number | null;
  prompt: Generated<string>;
  rule_id: string | null;
  requested_by: string;
  requested_at: string;
  status: Generated<string>;
  answer: string | null;
  answered_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  rev: Generated<number>;
}

export interface KpiScoreLogTable {
  id: Generated<number>;
  username: string;
  month: string;
  field: string;
  old_value: number | null;
  new_value: number | null;
  by: string;
  at: string;
  reason: string | null;
}

export interface KpiScoresTable {
  username: string;
  month: string;
  wework: number | null;
  user_score: number | null;
  peer: number | null;
  manager: number | null;
  self_score: number | null;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
}

export interface LeaveLedgerTable {
  id: Generated<number>;
  staff_uuid: string;
  username: string;
  kind: string;
  on_date: string;
  days: number;
  created_at: string;
  updated_at: string;
}

export interface ParamVersionsTable {
  id: Generated<number>;
  key: string;
  effective_month: string;
  value_json: string;
  reason: string;
  basis: string | null;
  ack_json: string | null;
  created_by: string;
  created_at: string;
  batch_id: string | null;
}

export interface PayEntriesTable {
  id: Generated<number>;
  username: string;
  month: string;
  direction: string;
  amount: number;
  label: string;
  slip_line: string | null;
  reason: string;
  tax_mode: string | null;
  tax_cap: number | null;
  insurance_base: number | null;
  flags_confirmed_by: string | null;
  flags_confirmed_at: string | null;
  status: Generated<string>;
  rev: Generated<number>;
  created_by: string;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface PayrollPeriodsTable {
  month: string;
  status: string;
  rev: Generated<number>;
  current_run_id: number | null;
  attendance_locked_by: string | null;
  attendance_locked_at: string | null;
  calculated_by: string | null;
  calculated_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  paid_ref: string | null;
  reopen_count: Generated<number>;
}

export interface PayrollRunsTable {
  id: Generated<number>;
  month: string;
  run_no: number;
  status: string;
  engine_version: string;
  params_hash: string;
  params_rev: number;
  params_json: string;
  switches_json: string;
  inputs_digest: string | null;
  slips_total: number | null;
  slips_error: number | null;
  created_by: string;
  created_at: string;
  finished_at: string | null;
}

export interface PayslipsTable {
  id: Generated<number>;
  run_id: number;
  username: string;
  status: string;
  rev: Generated<number>;
  error_code: string | null;
  error_detail: string | null;
  gross: number | null;
  insurance: number | null;
  tax: number | null;
  advance: number | null;
  net: number | null;
  staff_terms_json: string;
  snapshot_gz: Buffer;
  override_json: string | null;
  flags_json: string | null;
}

export interface PositionLevelsTable {
  id: Generated<number>;
  type_code: string;
  level_no: number;
  effective_month: string;
  name: string;
  base_salary: number;
  kpi_max: number | null;
  night_pct: number | null;
  reason: string | null;
  updated_by: string;
  updated_at: string;
  rev: Generated<number>;
}

export interface PositionTypeBenefitsTable {
  type_id: number;
  benefit: string;
  enabled: number;
}

export interface PositionTypesTable {
  id: Generated<number>;
  code: string;
  effective_month: string;
  name: string;
  workdays: number;
  flex_pct: number;
  night_pct: number;
  travel_pct: number;
  attendance_pct: number;
  regular_dows: string;
  makeup_dows: string;
  reason: string | null;
  updated_by: string;
  updated_at: string;
  rev: Generated<number>;
}

export interface PunchRequestsTable {
  username: string;
  request_id: string;
  operation: string;
  session_id: number | null;
  response_json: string;
  created_at: string | null;
}

export interface PunchesTable {
  id: Generated<number>;
  username: string;
  at: string;
  type: string;
  ip: string | null;
  auto: Generated<number>;
  context_json: string | null;
  session_id: number | null;
}

export interface SettingsTable {
  key: string;
  value_json: string;
}

export interface SheetApprovalsTable {
  username: string;
  date: string;
  item: string;
  fingerprint: string;
  status: Generated<string>;
  rev: Generated<number>;
  submitted_at: string;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
}

export interface SlipOverridesTable {
  username: string;
  month: string;
  values_json: string;
  updated_by: string | null;
  updated_at: string;
  reason: string | null;
  rev: Generated<number>;
}

export interface StaffTable {
  username: string;
  name: string;
  role: Generated<string>;
  type: Generated<string>;
  level: Generated<number>;
  night_pct: number | null;
  idorm: Generated<number>;
  shift_code: string | null;
  pass_hash: string;
  created_at: string;
  start_date: string | null;
  birthday: string | null;
  leave_adjust: Generated<number>;
  contract: string | null;
  insured: number | null;
  dependants: Generated<number>;
  job_title: string | null;
  tax_on: number | null;
  deduct_on: number | null;
  advance_on: number | null;
  locked_at: string | null;
  locked_by: string | null;
  session_version: Generated<number>;
  payroll_subject: number | null;
  uuid: string | null;
  family_name: string | null;
  given_name: string | null;
  contract_status: string | null;
  resigned_on: string | null;
  leave_balance: number | null;
  leave_balance_on: string | null;
}

export interface StaffRolesTable {
  id: Generated<number>;
  username: string;
  role: string;
  granted_by: string;
  granted_at: string;
  revoked_at: string | null;
}

export interface TimesheetsTable {
  username: string;
  month: string;
  days_json: Generated<string>;
  kpi_pct: number | null;
  kpi_amt: number | null;
  kpi_adm_pct: number | null;
  kpi_adm_amt: number | null;
  updated_at: string;
  rev: Generated<number>;
}

export interface WorkShiftsTable {
  code: string;
  preset: string;
  name: string;
  kind: string;
  sort: Generated<number>;
  deprecated: Generated<number>;
  updated_by: string | null;
  updated_at: string | null;
  rev: Generated<number>;
}

export interface Schema {
  advance_requests: AdvanceRequestsTable;
  ai_finding_actions: AiFindingActionsTable;
  ai_review_runs: AiReviewRunsTable;
  attendance_days: AttendanceDaysTable;
  attendance_sessions: AttendanceSessionsTable;
  audit_log: AuditLogTable;
  benefit_types: BenefitTypesTable;
  corrections: CorrectionsTable;
  explanations: ExplanationsTable;
  kpi_score_log: KpiScoreLogTable;
  kpi_scores: KpiScoresTable;
  leave_ledger: LeaveLedgerTable;
  param_versions: ParamVersionsTable;
  pay_entries: PayEntriesTable;
  payroll_periods: PayrollPeriodsTable;
  payroll_runs: PayrollRunsTable;
  payslips: PayslipsTable;
  position_levels: PositionLevelsTable;
  position_type_benefits: PositionTypeBenefitsTable;
  position_types: PositionTypesTable;
  punch_requests: PunchRequestsTable;
  punches: PunchesTable;
  settings: SettingsTable;
  sheet_approvals: SheetApprovalsTable;
  slip_overrides: SlipOverridesTable;
  staff: StaffTable;
  staff_roles: StaffRolesTable;
  timesheets: TimesheetsTable;
  work_shifts: WorkShiftsTable;
}
