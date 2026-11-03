import type { Schema } from './schema.generated';

/**
 * Kiểu tương thích cho các repository cũ của V1 trong quá trình chuyển đổi sang V2.
 * Cho phép mã cũ biên dịch trong khi các bảng vật lý đã được DROP khỏi PostgreSQL schema.
 */
export type LegacySchema = Schema & {
  attendance_days: any;
  attendance_sessions: any;
  punches: any;
  timesheets: any;
  sheet_approvals: any;
  punch_requests: any;
  corrections: any;
  explanations: any;
  leave_ledger: any;
  advance_requests: any;
  advance_approval_months: any;
  advance_approval_entries: any;
};
