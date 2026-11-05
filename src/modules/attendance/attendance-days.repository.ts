import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';
import type { LeaveType } from '../requests/domain/leave-types';
import type {
  AttendanceDay,
  AttendanceDayStatus,
  Benefits,
  DayFacts,
  ExplanationFacts,
  ExplanationStatus,
  ScheduleFacts,
  ShiftFacts
} from './domain/attendance-day';
import type { DetectedCase } from './domain/explanation-detect';
import type {
  CheckInStatus,
  CheckOutStatus,
  DayStatus,
  ScheduleStatus,
  ScheduleType
} from './domain/work-schedule';

/** Dòng ngày đọc từ DB: đủ trường của `AttendanceDay` cộng cờ khoá kỳ. */
export interface AttendanceDayRecord extends AttendanceDay {
  isLocked: boolean;
}

/** Hồ sơ nhân sự mà `buildDay` cần, đọc một lần cho cả khoảng ngày. */
export interface EmployeeFacts {
  employeeId: string;
  type: string;
  startDate: string | null;
  resignedOn: string | null;
  defaultShift: ShiftFacts;
}

type Window = { start: string; end: string };

/** Ca mặc định khi hồ sơ không ghi ca (như ensureDefaultSchedule). */
const FALLBACK_SHIFT = { start: '08:00', end: '17:00' };

/** Mã quyền lợi của loại nhân sự mà chấm công cần. */
const BENEFIT_CODES = ['paidLeave', 'paidHoliday', 'isat'] as const;

/** Phụ cấp ca mặc định theo loại ca, như recordPunch đang làm. */
const SHIFT_ALLOWANCE_PCT: Record<ShiftFacts['type'], number> = { NORMAL: 0, FLEX: 10, NIGHT: 30 };

/** CUSTOM (và mọi giá trị lạ) coi như ca thường, giống attendance.service. */
function shiftTypeOf(raw: string | null): ShiftFacts['type'] {
  return raw === 'FLEX' || raw === 'NIGHT' ? raw : 'NORMAL';
}

/** Thêm `item` vào danh sách của khoá `key` trong map. */
function pushTo<T>(map: Map<string, T[]>, key: string, item: T): void {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
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

  /**
   * Gom mọi nguồn của các ngày `dates` cho một nhân sự: hồ sơ, quyền lợi theo tháng và `DayFacts` mỗi ngày
   * (theo thứ tự `dates`). Mỗi loại nguồn một truy vấn cho cả khoảng ngày, không truy vấn từng ngày.
   */
  async loadSources(
    employeeId: string,
    dates: readonly string[]
  ): Promise<{ employee: EmployeeFacts; benefitsByMonth: Map<string, Benefits>; days: DayFacts[] }> {
    const staff = await this.qb
      .selectFrom('staff')
      .select(['uuid', 'type', 'start_date', 'resigned_on', 'shift_type', 'shift_start_time', 'shift_end_time'])
      .where('uuid', '=', employeeId)
      .executeTakeFirst();
    if (!staff || !staff.uuid) throw new Error(`Không tìm thấy nhân sự ${employeeId}`);

    const shiftType = shiftTypeOf(staff.shift_type);
    const employee: EmployeeFacts = {
      employeeId: staff.uuid,
      type: staff.type,
      startDate: staff.start_date ?? null,
      resignedOn: staff.resigned_on ?? null,
      defaultShift: {
        type: shiftType,
        start: staff.shift_start_time || FALLBACK_SHIFT.start,
        end: staff.shift_end_time || FALLBACK_SHIFT.end,
        allowancePct: SHIFT_ALLOWANCE_PCT[shiftType]
      }
    };

    const months = [...new Set(dates.map(date => date.slice(0, 7)))].sort();
    const benefitsByMonth = await this.loadBenefits(staff.type, months);
    if (dates.length === 0) return { employee, benefitsByMonth, days: [] };

    const sorted = [...dates].sort();
    const from = sorted[0];
    const to = sorted[sorted.length - 1];

    const schedules = await this.loadSchedules(employeeId, from, to);
    const punches = await this.loadPunches(employeeId, from, to);
    const otWindows = await this.loadOtWindows(employeeId, from, to);
    const makeupWindows = await this.loadMakeupWindows(employeeId, from, to);
    const explanations = await this.loadExplanations(employeeId, from, to);
    const holidays = await this.loadHolidays(from, to);

    const days = dates.map<DayFacts>(date => ({
      date,
      schedule: schedules.get(date) ?? null,
      punches: punches.get(date) ?? [],
      otWindows: otWindows.get(date) ?? [],
      makeupWindows: makeupWindows.get(date) ?? [],
      explanation: explanations.get(date) ?? null,
      isHoliday: holidays.has(date)
    }));
    return { employee, benefitsByMonth, days };
  }

  /** Quyền lợi của loại nhân sự theo từng tháng: phiên bản mới nhất có `effective_month <= tháng`. Không có phiên bản → tắt hết. */
  private async loadBenefits(typeCode: string, months: readonly string[]): Promise<Map<string, Benefits>> {
    const result = new Map<string, Benefits>();
    if (months.length === 0) return result;

    const versions = await this.qb
      .selectFrom('position_types')
      .select(['id', 'effective_month'])
      .where('code', '=', typeCode)
      .where('effective_month', '<=', months[months.length - 1])
      .orderBy('effective_month', 'desc')
      .execute();

    const enabledByType = new Map<number, Set<string>>();
    if (versions.length > 0) {
      const rows = await this.qb
        .selectFrom('position_type_benefits')
        .select(['type_id', 'benefit', 'enabled'])
        .where(
          'type_id',
          'in',
          versions.map(v => v.id)
        )
        .where('benefit', 'in', [...BENEFIT_CODES])
        .execute();
      for (const row of rows) {
        if (Number(row.enabled) !== 1) continue;
        const set = enabledByType.get(Number(row.type_id)) ?? new Set<string>();
        set.add(row.benefit);
        enabledByType.set(Number(row.type_id), set);
      }
    }

    for (const month of months) {
      // `versions` sắp mới nhất trước, nên dòng đầu thoả điều kiện là phiên bản đang hiệu lực của tháng.
      const version = versions.find(v => v.effective_month <= month);
      const enabled = version ? enabledByType.get(Number(version.id)) : undefined;
      result.set(month, {
        paidLeave: enabled?.has('paidLeave') ?? false,
        paidHoliday: enabled?.has('paidHoliday') ?? false,
        isat: enabled?.has('isat') ?? false
      });
    }
    return result;
  }

  private async loadSchedules(employeeId: string, from: string, to: string): Promise<Map<string, ScheduleFacts>> {
    const rows = await this.qb
      .selectFrom('work_schedules as ws')
      .leftJoin('system_requests as sr', 'sr.id', 'ws.source_request_id')
      .select([
        sql<string>`to_char(ws.work_date, 'YYYY-MM-DD')`.as('work_date'),
        sql<string>`to_char(ws.planned_start_time, 'HH24:MI')`.as('planned_start_time'),
        sql<string>`to_char(ws.planned_end_time, 'HH24:MI')`.as('planned_end_time'),
        'ws.schedule_type',
        'ws.status',
        'ws.shift_type',
        'ws.source_request_id',
        'sr.type as request_type',
        'sr.leave_type'
      ])
      .where('ws.employee_id', '=', employeeId)
      .where('ws.work_date', '>=', from)
      .where('ws.work_date', '<=', to)
      .execute();

    const byDate = new Map<string, ScheduleFacts>();
    for (const row of rows) {
      byDate.set(row.work_date, {
        scheduleType: row.schedule_type as ScheduleType,
        status: row.status as ScheduleStatus,
        shiftType: row.shift_type,
        start: row.planned_start_time,
        end: row.planned_end_time,
        sourceRequestId: row.source_request_id,
        requestType: row.request_type ?? null,
        leaveType: (row.leave_type as LeaveType | null) ?? null
      });
    }
    return byDate;
  }

  /** Các lần chấm của cả khoảng, theo thời điểm tăng dần. */
  private async loadPunches(
    employeeId: string,
    from: string,
    to: string
  ): Promise<Map<string, DayFacts['punches'][number][]>> {
    const rows = await this.qb
      .selectFrom('punch_events')
      .select([sql<string>`to_char(work_date, 'YYYY-MM-DD')`.as('work_date'), 'type', 'punched_at'])
      .where('employee_id', '=', employeeId)
      .where('work_date', '>=', from)
      .where('work_date', '<=', to)
      .orderBy('punched_at', 'asc')
      .execute();

    const byDate = new Map<string, DayFacts['punches'][number][]>();
    for (const row of rows) {
      pushTo(byDate, row.work_date, { type: row.type as 'IN' | 'OUT', at: row.punched_at });
    }
    return byDate;
  }

  /** Khung OT của đơn đã duyệt; đơn chưa duyệt, bị từ chối hay đã huỷ không tính. */
  private async loadOtWindows(employeeId: string, from: string, to: string): Promise<Map<string, Window[]>> {
    const rows = await this.qb
      .selectFrom('system_requests')
      .select([sql<string>`to_char(ot_date, 'YYYY-MM-DD')`.as('ot_date'), 'ot_start_time', 'ot_end_time'])
      .where('employee_id', '=', employeeId)
      .where('type', '=', 'OVERTIME')
      .where('status', '=', 'APPROVED')
      .where('ot_date', '>=', from)
      .where('ot_date', '<=', to)
      .where('ot_start_time', 'is not', null)
      .where('ot_end_time', 'is not', null)
      .orderBy('ot_start_time', 'asc')
      .execute();

    const byDate = new Map<string, Window[]>();
    for (const row of rows) {
      pushTo(byDate, row.ot_date, { start: row.ot_start_time as string, end: row.ot_end_time as string });
    }
    return byDate;
  }

  /** Khung làm bù của đơn nghỉ-có-bù đã duyệt. */
  private async loadMakeupWindows(employeeId: string, from: string, to: string): Promise<Map<string, Window[]>> {
    const rows = await this.qb
      .selectFrom('makeup_slots as ms')
      .innerJoin('system_requests as sr', 'sr.id', 'ms.request_id')
      .select([sql<string>`to_char(ms.work_date, 'YYYY-MM-DD')`.as('work_date'), 'ms.start_time', 'ms.end_time'])
      .where('sr.employee_id', '=', employeeId)
      .where('sr.status', '=', 'APPROVED')
      .where('ms.work_date', '>=', from)
      .where('ms.work_date', '<=', to)
      .orderBy('ms.start_time', 'asc')
      .execute();

    const byDate = new Map<string, Window[]>();
    for (const row of rows) {
      pushTo(byDate, row.work_date, { start: row.start_time, end: row.end_time });
    }
    return byDate;
  }

  /** Giải trình của từng ngày: đơn chưa huỷ có `created_at` mới nhất (spec 5). */
  private async loadExplanations(
    employeeId: string,
    from: string,
    to: string
  ): Promise<Map<string, ExplanationFacts>> {
    const rows = await this.qb
      .selectFrom('system_requests')
      .select([
        'id',
        'status',
        sql<string>`to_char(explanation_date, 'YYYY-MM-DD')`.as('explanation_date'),
        'actual_check_in',
        'actual_check_out'
      ])
      .where('employee_id', '=', employeeId)
      .where('type', '=', 'EXPLANATION')
      .where('status', '<>', 'CANCELLED')
      .where('explanation_date', '>=', from)
      .where('explanation_date', '<=', to)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .execute();

    const byDate = new Map<string, ExplanationFacts>();
    for (const row of rows) {
      // Đã sắp mới nhất trước: dòng đầu của mỗi ngày thắng.
      if (byDate.has(row.explanation_date)) continue;
      byDate.set(row.explanation_date, {
        requestId: row.id,
        status: row.status as ExplanationFacts['status'],
        checkIn: row.actual_check_in,
        checkOut: row.actual_check_out
      });
    }
    return byDate;
  }

  private async loadHolidays(from: string, to: string): Promise<Set<string>> {
    const rows = await this.qb
      .selectFrom('company_holidays')
      .select(sql<string>`to_char(holiday_date, 'YYYY-MM-DD')`.as('holiday_date'))
      .where('holiday_date', '>=', from)
      .where('holiday_date', '<=', to)
      .execute();
    return new Set(rows.map(row => row.holiday_date));
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
