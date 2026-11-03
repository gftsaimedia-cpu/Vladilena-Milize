// Sinh tự động bởi scripts/docs/gen-db-types.ts (npm run db:types) từ migrations/postgres/*.sql. Đừng sửa tay.
import type { ColumnType } from 'kysely';

/** Cột có giá trị mặc định / tự sinh: đọc ra T, có thể bỏ khi INSERT. */
export type Generated<T> = ColumnType<T, T | undefined, T>;

export interface AuditLogTable {
  id: Generated<number>;
  at: string;
  actor: string;
  actor_roles: Generated<string | null>;
  action: string;
  entity_kind: string;
  entity_id: string;
  subject: Generated<string | null>;
  month: Generated<string | null>;
  before_json: Generated<string | null>;
  after_json: Generated<string | null>;
  reason: Generated<string | null>;
  sensitivity: Generated<string>;
  request_id: Generated<string | null>;
  prev_hash: string;
  hash: string;
  subject_uuid: Generated<string | null>;
  actor_uuid: Generated<string | null>;
}

export interface BenefitTypesTable {
  code: string;
  label: Generated<string | null>;
}

export interface KpiScoreLogTable {
  id: Generated<number>;
  username: string;
  month: string;
  field: string;
  old_value: Generated<number | null>;
  new_value: Generated<number | null>;
  by: string;
  at: string;
  reason: Generated<string | null>;
}

export interface KpiScoresTable {
  username: string;
  month: string;
  wework: Generated<number | null>;
  user_score: Generated<number | null>;
  peer: Generated<number | null>;
  manager: Generated<number | null>;
  self_score: Generated<number | null>;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
}

export interface ParamVersionsTable {
  id: Generated<number>;
  key: string;
  effective_month: string;
  value_json: string;
  reason: string;
  basis: Generated<string | null>;
  ack_json: Generated<string | null>;
  created_by: string;
  created_at: string;
  batch_id: Generated<string | null>;
}

export interface PayEntriesTable {
  id: Generated<number>;
  username: string;
  month: string;
  direction: string;
  amount: number;
  label: string;
  slip_line: Generated<string | null>;
  reason: string;
  tax_mode: Generated<string | null>;
  tax_cap: Generated<number | null>;
  insurance_base: Generated<number | null>;
  flags_confirmed_by: Generated<string | null>;
  flags_confirmed_at: Generated<string | null>;
  status: Generated<string>;
  rev: Generated<number>;
  created_by: string;
  created_at: string;
  decided_by: Generated<string | null>;
  decided_at: Generated<string | null>;
  decision_note: Generated<string | null>;
}

export interface PayrollPeriodsTable {
  month: string;
  status: string;
  rev: Generated<number>;
  current_run_id: Generated<number | null>;
  attendance_locked_by: Generated<string | null>;
  attendance_locked_at: Generated<string | null>;
  calculated_by: Generated<string | null>;
  calculated_at: Generated<string | null>;
  reviewed_by: Generated<string | null>;
  reviewed_at: Generated<string | null>;
  approved_by: Generated<string | null>;
  approved_at: Generated<string | null>;
  paid_by: Generated<string | null>;
  paid_at: Generated<string | null>;
  paid_ref: Generated<string | null>;
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
  inputs_digest: Generated<string | null>;
  slips_total: Generated<number | null>;
  slips_error: Generated<number | null>;
  created_by: string;
  created_at: string;
  finished_at: Generated<string | null>;
}

export interface PayslipsTable {
  id: Generated<number>;
  run_id: number;
  username: string;
  status: string;
  rev: Generated<number>;
  error_code: Generated<string | null>;
  error_detail: Generated<string | null>;
  gross: Generated<number | null>;
  insurance: Generated<number | null>;
  tax: Generated<number | null>;
  advance: Generated<number | null>;
  net: Generated<number | null>;
  staff_terms_json: string;
  snapshot_gz: Buffer;
  override_json: Generated<string | null>;
  flags_json: Generated<string | null>;
  decided_by: Generated<string | null>;
  decided_at: Generated<string | null>;
  note: Generated<string | null>;
}

export interface PositionLevelsTable {
  id: Generated<number>;
  type_code: string;
  level_no: number;
  effective_month: string;
  name: string;
  base_salary: number;
  kpi_max: Generated<number | null>;
  night_pct: Generated<number | null>;
  reason: Generated<string | null>;
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
  reason: Generated<string | null>;
  updated_by: string;
  updated_at: string;
  rev: Generated<number>;
}

export interface PunchEventsTable {
  id: string;
  employee_id: string;
  punched_at: Date;
  work_date: string;
  type: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  distance_meters: number;
  is_within_office: boolean;
  note: Generated<string | null>;
  created_at: Date;
}

export interface SettingsTable {
  key: string;
  value_json: string;
}

export interface SlipOverridesTable {
  username: string;
  month: string;
  values_json: string;
  updated_by: Generated<string | null>;
  updated_at: string;
  reason: Generated<string | null>;
  rev: Generated<number>;
}

export interface StaffTable {
  username: string;
  name: string;
  role: Generated<string>;
  type: Generated<string>;
  level: Generated<number>;
  idorm: Generated<number>;
  pass_hash: string;
  created_at: string;
  start_date: Generated<string | null>;
  birthday: Generated<string | null>;
  contract: Generated<string | null>;
  insured: Generated<number | null>;
  dependants: Generated<number>;
  job_title: Generated<string | null>;
  tax_on: Generated<number | null>;
  deduct_on: Generated<number | null>;
  advance_on: Generated<number | null>;
  locked_at: Generated<string | null>;
  locked_by: Generated<string | null>;
  session_version: Generated<number>;
  payroll_subject: Generated<number | null>;
  uuid: Generated<string | null>;
  family_name: Generated<string | null>;
  given_name: Generated<string | null>;
  contract_status: Generated<string | null>;
  resigned_on: Generated<string | null>;
  leave_balance: Generated<number | null>;
  leave_balance_on: Generated<string | null>;
  shift_type: Generated<string>;
  shift_start_time: Generated<string>;
  shift_end_time: Generated<string>;
  shift_allowance_pct: Generated<number>;
  leave_total_days: Generated<number>;
  leave_used_days: Generated<number>;
}

export interface StaffRolesTable {
  id: Generated<number>;
  username: string;
  role: string;
  granted_by: string;
  granted_at: string;
  revoked_at: Generated<string | null>;
}

export interface SystemRequestsTable {
  id: string;
  employee_id: string;
  title: string;
  type: string;
  reason: string;
  status: Generated<string>;
  reviewed_by: Generated<string | null>;
  reviewed_at: Generated<Date | null>;
  review_note: Generated<string | null>;
  leave_type: Generated<string | null>;
  leave_start_date: Generated<string | null>;
  leave_end_date: Generated<string | null>;
  leave_days_count: Generated<number | null>;
  correction_date: Generated<string | null>;
  correction_punch_type: Generated<string | null>;
  correction_actual_time: Generated<string | null>;
  ot_date: Generated<string | null>;
  ot_start_time: Generated<string | null>;
  ot_end_time: Generated<string | null>;
  ot_hours: Generated<number | null>;
  advance_amount: Generated<number | null>;
  advance_period: Generated<string | null>;
  new_shift_type: Generated<string | null>;
  new_start_time: Generated<string | null>;
  new_end_time: Generated<string | null>;
  makeup_start_time: Generated<string | null>;
  makeup_end_time: Generated<string | null>;
  created_at: Date;
  updated_at: Date;
}

export interface TimesheetEntriesTable {
  id: string;
  employee_id: string;
  work_date: string;
  shift_type: string;
  shift_start_time: string;
  shift_end_time: string;
  shift_allowance_pct: number;
  actual_check_in: Generated<Date | null>;
  actual_check_out: Generated<Date | null>;
  work_hours: Generated<number>;
  work_units: Generated<number>;
  ot_hours: Generated<number>;
  late_minutes: Generated<number>;
  early_minutes: Generated<number>;
  status: string;
  is_locked: Generated<boolean>;
  check_in_status: Generated<string>;
  check_out_status: Generated<string>;
  day_status: Generated<string>;
  created_at: Date;
  updated_at: Date;
}

export interface WorkSchedulesTable {
  id: Generated<string>;
  employee_id: string;
  work_date: string;
  shift_type: string;
  planned_start_time: string;
  planned_end_time: string;
  approved_ot_hours: Generated<number>;
  schedule_type: Generated<string>;
  status: Generated<string>;
  source_request_id: Generated<string | null>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkShiftsTable {
  code: string;
  preset: string;
  name: string;
  kind: string;
  sort: Generated<number>;
  deprecated: Generated<number>;
  updated_by: Generated<string | null>;
  updated_at: Generated<string | null>;
  rev: Generated<number>;
}

export interface Schema {
  audit_log: AuditLogTable;
  benefit_types: BenefitTypesTable;
  kpi_score_log: KpiScoreLogTable;
  kpi_scores: KpiScoresTable;
  param_versions: ParamVersionsTable;
  pay_entries: PayEntriesTable;
  payroll_periods: PayrollPeriodsTable;
  payroll_runs: PayrollRunsTable;
  payslips: PayslipsTable;
  position_levels: PositionLevelsTable;
  position_type_benefits: PositionTypeBenefitsTable;
  position_types: PositionTypesTable;
  punch_events: PunchEventsTable;
  settings: SettingsTable;
  slip_overrides: SlipOverridesTable;
  staff: StaffTable;
  staff_roles: StaffRolesTable;
  system_requests: SystemRequestsTable;
  timesheet_entries: TimesheetEntriesTable;
  work_schedules: WorkSchedulesTable;
  work_shifts: WorkShiftsTable;
}
