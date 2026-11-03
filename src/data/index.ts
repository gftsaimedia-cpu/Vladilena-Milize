import { Kysely } from 'kysely';
import { AppDatabase, AppDialect } from './db-dialect';
import type { Schema } from './schema.generated';

export type { Schema } from './schema.generated';
export type { AppDatabase } from './db-dialect';
export { SettingsRepository } from './settings.repository';
export { AdvanceApprovalsRepository } from './advance-approvals.repository';
export { ParamVersionsRepository } from './param-versions.repository';
export type { ParamVersionRow } from './param-versions.repository';
export { AuditLogRepository } from './audit-log.repository';
export type { AuditCriteria, AuditLogRow } from './audit-log.repository';

/** Trình dựng truy vấn có kiểu (Kysely) trên kết nối của ứng dụng; kiểu bảng sinh từ migration (`npm run db:types`). */
export function createQueryBuilder(db: AppDatabase): Kysely<Schema> {
  return new Kysely<Schema>({ dialect: new AppDialect(db) });
}
export { flavorOf } from './flavor';
export { AdvisoryLocks } from './locks';
export type { SqlFlavor } from './flavor';
export {
  PayrollPeriodsRepository,
  PayrollRunsRepository,
  PayslipsRepository,
  SlipOverridesRepository
} from './payroll.repository';
export type { PeriodRow, RunRow, PayslipRow, PayslipFilter, SlipOverrideRow } from './payroll.repository';
export {
  StaffRolesRepository,
  StaffRepository,
  PunchesRepository,
  CorrectionsRepository,
  TimesheetsRepository,
  KpiScoresRepository
} from './records.repository';
export type { StaffRow, StaffRoleRow, CorrectionRow, TimesheetRow, KpiScoresRow, KpiLogRow } from './records.repository';
export { SheetApprovalsRepository, AttendanceSessionsRepository } from './attendance.repository';
export type { SheetApprovalRow, AttendanceSessionRow, PunchRequestRow, PunchRow, SheetApprovalFilter } from './attendance.repository';
export {
  RevisionedWrites,
  WorkShiftsRepository,
  LeaveLedgerRepository,
  ExplanationsRepository,
  PositionRepository
} from './catalog.repository';
export type {
  WorkShiftRow,
  LeaveLedgerRow,
  ExplanationRow,
  PositionTypeRow,
  PositionLevelRow,
  RevisionedUpdate
} from './catalog.repository';
export { PayEntriesRepository, AdvanceRequestsRepository } from './pay.repository';
export type { PayEntryRow, AdvanceRequestRow } from './pay.repository';
export { RequestV2Repository } from './request-v2.repository';
export type { RequestListFilter } from './request-v2.repository';
export { AttendanceV2Repository } from './attendance-v2.repository';
export type { TimesheetFilter } from './attendance-v2.repository';

