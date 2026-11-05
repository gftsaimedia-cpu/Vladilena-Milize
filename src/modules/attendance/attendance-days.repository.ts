import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';
import type { LeaveType } from '../requests/domain/leave-types';
import type { AttendanceDay, AttendanceDayStatus, ExplanationStatus } from './domain/attendance-day';
import type { DetectedCase } from './domain/explanation-detect';
import type { CheckInStatus, CheckOutStatus, DayStatus } from './domain/work-schedule';

/** Dòng ngày đọc từ DB: đủ trường của `AttendanceDay` cộng cờ khoá kỳ. */
export interface AttendanceDayRecord extends AttendanceDay {
  isLocked: boolean;
}

/** Số dòng mỗi câu INSERT, để không vượt giới hạn tham số của PostgreSQL. */
const UPSERT_CHUNK = 200;

@Injectable()
export class AttendanceDaysRepository {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {}

  /** Bản chạy mọi truy vấn trên `trx` (giao dịch đang mở của người gọi) thay vì pool. */
  withTransaction(trx: Kysely<DB>): AttendanceDaysRepository {
    return new AttendanceDaysRepository(trx);
  }

  /**
   * Ghi các dòng ngày. Dòng đã có thì cập nhật tại chỗ (giữ `id`, `created_at`) và chỉ khi chưa khoá kỳ;
   * dòng đã khoá không bao giờ bị ghi đè.
   */
  async upsertDays(days: readonly AttendanceDay[], now: Date): Promise<void> {
    for (let i = 0; i < days.length; i += UPSERT_CHUNK) {
      const chunk = days.slice(i, i + UPSERT_CHUNK);
      await this.qb
        .insertInto('timesheet_entries')
        .values(chunk.map(day => valuesOf(day, now)))
        .onConflict(oc =>
          oc
            .columns(['employee_id', 'work_date'])
            .doUpdateSet(eb => ({
              shift_type: eb.ref('excluded.shift_type'),
              shift_start_time: eb.ref('excluded.shift_start_time'),
              shift_end_time: eb.ref('excluded.shift_end_time'),
              shift_allowance_pct: eb.ref('excluded.shift_allowance_pct'),
              actual_check_in: eb.ref('excluded.actual_check_in'),
              actual_check_out: eb.ref('excluded.actual_check_out'),
              work_hours: eb.ref('excluded.work_hours'),
              work_units: eb.ref('excluded.work_units'),
              ot_hours: eb.ref('excluded.ot_hours'),
              late_minutes: eb.ref('excluded.late_minutes'),
              early_minutes: eb.ref('excluded.early_minutes'),
              status: eb.ref('excluded.status'),
              check_in_status: eb.ref('excluded.check_in_status'),
              check_out_status: eb.ref('excluded.check_out_status'),
              day_status: eb.ref('excluded.day_status'),
              leave_type: eb.ref('excluded.leave_type'),
              source_request_id: eb.ref('excluded.source_request_id'),
              cases_json: eb.ref('excluded.cases_json'),
              explanation_status: eb.ref('excluded.explanation_status'),
              explanation_request_id: eb.ref('excluded.explanation_request_id'),
              pay_units: eb.ref('excluded.pay_units'),
              deduction_minutes: eb.ref('excluded.deduction_minutes'),
              counts_as_workday: eb.ref('excluded.counts_as_workday'),
              counts_as_day_off: eb.ref('excluded.counts_as_day_off'),
              makeup_minutes: eb.ref('excluded.makeup_minutes'),
              updated_at: now
            }))
            .where('timesheet_entries.is_locked', '=', false)
        )
        .execute();
    }
  }

  /** Các dòng ngày của một nhân sự trong [from, to] (gồm cả hai đầu), theo `work_date` tăng. */
  async listDays(employeeId: string, from: string, to: string): Promise<AttendanceDayRecord[]> {
    const rows = await this.qb
      .selectFrom('timesheet_entries')
      .selectAll()
      // DATE đọc qua to_char để pg không đổi thành Date theo múi giờ máy.
      .select(sql<string>`to_char(work_date, 'YYYY-MM-DD')`.as('work_date_text'))
      .where('employee_id', '=', employeeId)
      .where('work_date', '>=', from)
      .where('work_date', '<=', to)
      .orderBy('work_date', 'asc')
      .execute();

    return rows.map(row => ({
      employeeId: row.employee_id,
      workDate: row.work_date_text,
      status: row.status as AttendanceDayStatus,
      shift:
        row.shift_type === null || row.shift_start_time === null || row.shift_end_time === null
          ? null
          : {
              type: row.shift_type as 'NORMAL' | 'FLEX' | 'NIGHT',
              start: row.shift_start_time,
              end: row.shift_end_time,
              allowancePct: Number(row.shift_allowance_pct ?? 0)
            },
      checkIn: row.actual_check_in,
      checkOut: row.actual_check_out,
      workHours: Number(row.work_hours),
      lateMinutes: Number(row.late_minutes),
      earlyMinutes: Number(row.early_minutes),
      leaveType: row.leave_type as LeaveType | null,
      sourceRequestId: row.source_request_id,
      cases: JSON.parse(row.cases_json) as DetectedCase[],
      explanationStatus: row.explanation_status as ExplanationStatus,
      explanationRequestId: row.explanation_request_id,
      payUnits: Number(row.pay_units) === 1 ? 1 : 0,
      deductionMinutes: Number(row.deduction_minutes),
      countsAsWorkday: row.counts_as_workday,
      countsAsDayOff: row.counts_as_day_off,
      makeupMinutes: Number(row.makeup_minutes),
      dayStatus: row.day_status as DayStatus,
      checkInStatus: row.check_in_status as CheckInStatus,
      checkOutStatus: row.check_out_status as CheckOutStatus,
      isLocked: row.is_locked
    }));
  }
}

function valuesOf(day: AttendanceDay, now: Date) {
  return {
    id: randomUUID(),
    employee_id: day.employeeId,
    work_date: day.workDate,
    // Ngày không có ca thì bốn cột ca là NULL.
    shift_type: day.shift?.type ?? null,
    shift_start_time: day.shift?.start ?? null,
    shift_end_time: day.shift?.end ?? null,
    shift_allowance_pct: day.shift?.allowancePct ?? null,
    actual_check_in: day.checkIn,
    actual_check_out: day.checkOut,
    work_hours: day.workHours,
    // Cột cũ ghi cho khớp (spec 6): công = số công tính lương, OT do payslip đo từ khung nên luôn 0.
    work_units: day.payUnits,
    ot_hours: 0,
    late_minutes: day.lateMinutes,
    early_minutes: day.earlyMinutes,
    status: day.status,
    check_in_status: day.checkInStatus,
    check_out_status: day.checkOutStatus,
    day_status: day.dayStatus,
    leave_type: day.leaveType,
    source_request_id: day.sourceRequestId,
    cases_json: JSON.stringify(day.cases),
    explanation_status: day.explanationStatus,
    explanation_request_id: day.explanationRequestId,
    pay_units: day.payUnits,
    deduction_minutes: day.deductionMinutes,
    counts_as_workday: day.countsAsWorkday,
    counts_as_day_off: day.countsAsDayOff,
    makeup_minutes: day.makeupMinutes,
    created_at: now,
    updated_at: now
  };
}
