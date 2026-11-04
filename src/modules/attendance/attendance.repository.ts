import { Injectable, Inject } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';
import { PunchEvent, DailyTimesheet, WorkSchedule } from './domain';

export interface TimesheetFilter {
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

@Injectable()
export class AttendanceRepository {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {}

  /**
   * Lưu sự kiện chấm công vào bảng punch_events (100% Flat Schema)
   */
  async savePunch(event: PunchEvent): Promise<void> {
    const row = event.toRow();
    await this.qb
      .insertInto('punch_events')
      .values({
        id: row.id,
        employee_id: row.employee_id,
        punched_at: new Date(row.punched_at),
        work_date: row.work_date,
        type: row.type,
        latitude: row.latitude,
        longitude: row.longitude,
        accuracy_meters: row.accuracy_meters,
        distance_meters: row.distance_meters,
        is_within_office: row.is_within_office,
        note: row.note,
        created_at: new Date()
      })
      .execute();
  }

  /**
   * Lấy danh sách các lần chấm công trong ngày của nhân viên, sắp xếp thời gian tăng dần
   */
  async findPunches(employeeId: string, workDate: string): Promise<PunchEvent[]> {
    const rows = await this.qb
      .selectFrom('punch_events')
      .selectAll()
      .where('employee_id', '=', employeeId)
      .where('work_date', '=', workDate)
      .orderBy('punched_at', 'asc')
      .execute();

    return rows.map(r =>
      PunchEvent.fromRow({
        id: r.id,
        employee_id: r.employee_id,
        punched_at: r.punched_at instanceof Date ? r.punched_at.toISOString() : String(r.punched_at),
        work_date: r.work_date,
        type: r.type,
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        accuracy_meters: Number(r.accuracy_meters),
        distance_meters: Number(r.distance_meters),
        is_within_office: Boolean(r.is_within_office),
        note: r.note ?? null
      })
    );
  }

  /**
   * Lưu hoặc cập nhật bảng công nhật vào bảng timesheet_entries on conflict (employee_id, work_date)
   */
  async saveTimesheet(timesheet: DailyTimesheet): Promise<void> {
    const row = timesheet.toRow();
    const now = new Date();
    await this.qb
      .insertInto('timesheet_entries')
      .values({
        id: row.id,
        employee_id: row.employee_id,
        work_date: row.work_date,
        shift_type: row.shift_type,
        shift_start_time: row.shift_start_time,
        shift_end_time: row.shift_end_time,
        shift_allowance_pct: row.shift_allowance_pct,
        actual_check_in: row.actual_check_in ? new Date(row.actual_check_in) : null,
        actual_check_out: row.actual_check_out ? new Date(row.actual_check_out) : null,
        work_hours: row.work_hours,
        work_units: row.work_units,
        ot_hours: row.ot_hours,
        late_minutes: row.late_minutes,
        early_minutes: row.early_minutes,
        status: row.status,
        is_locked: row.is_locked,
        check_in_status: row.check_in_status,
        check_out_status: row.check_out_status,
        day_status: row.day_status,
        created_at: now,
        updated_at: now
      })
      .onConflict(oc =>
        oc.columns(['employee_id', 'work_date']).doUpdateSet(eb => ({
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
          is_locked: eb.ref('excluded.is_locked'),
          check_in_status: eb.ref('excluded.check_in_status'),
          check_out_status: eb.ref('excluded.check_out_status'),
          day_status: eb.ref('excluded.day_status'),
          updated_at: now
        }))
      )
      .execute();
  }

  /**
   * Cập nhật trạng thái ngày công (day_status) cho timesheet_entries
   */
  async updateDayStatus(employeeId: string, workDate: string, dayStatus: string): Promise<void> {
    await this.qb
      .updateTable('timesheet_entries')
      .set({
        day_status: dayStatus as any,
        updated_at: new Date()
      })
      .where('employee_id', '=', employeeId)
      .where('work_date', '=', workDate)
      .execute();
  }

  /**
   * Tìm bảng công nhật theo mã nhân viên và ngày công
   */
  async findTimesheet(employeeId: string, workDate: string): Promise<DailyTimesheet | null> {
    const row = await this.qb
      .selectFrom('timesheet_entries')
      .selectAll()
      .where('employee_id', '=', employeeId)
      .where('work_date', '=', workDate)
      .executeTakeFirst();

    if (!row) return null;
    return DailyTimesheet.fromRow({
      id: row.id,
      employee_id: row.employee_id,
      work_date: row.work_date,
      shift_type: row.shift_type,
      shift_start_time: row.shift_start_time,
      shift_end_time: row.shift_end_time,
      shift_allowance_pct: Number(row.shift_allowance_pct),
      actual_check_in: row.actual_check_in
        ? row.actual_check_in instanceof Date
          ? row.actual_check_in.toISOString()
          : String(row.actual_check_in)
        : null,
      actual_check_out: row.actual_check_out
        ? row.actual_check_out instanceof Date
          ? row.actual_check_out.toISOString()
          : String(row.actual_check_out)
        : null,
      work_hours: Number(row.work_hours ?? 0),
      work_units: Number(row.work_units ?? 0),
      ot_hours: Number(row.ot_hours ?? 0),
      late_minutes: Number(row.late_minutes ?? 0),
      early_minutes: Number(row.early_minutes ?? 0),
      status: row.status,
      is_locked: Boolean(row.is_locked),
      check_in_status: row.check_in_status,
      check_out_status: row.check_out_status,
      day_status: row.day_status
    });
  }

  /**
   * Tìm bảng công nhật theo mã định danh (id / UUID)
   */
  async findTimesheetById(id: string): Promise<DailyTimesheet | null> {
    const row = await this.qb
      .selectFrom('timesheet_entries')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!row) return null;
    return DailyTimesheet.fromRow({
      id: row.id,
      employee_id: row.employee_id,
      work_date: row.work_date,
      shift_type: row.shift_type,
      shift_start_time: row.shift_start_time,
      shift_end_time: row.shift_end_time,
      shift_allowance_pct: Number(row.shift_allowance_pct),
      actual_check_in: row.actual_check_in
        ? row.actual_check_in instanceof Date
          ? row.actual_check_in.toISOString()
          : String(row.actual_check_in)
        : null,
      actual_check_out: row.actual_check_out
        ? row.actual_check_out instanceof Date
          ? row.actual_check_out.toISOString()
          : String(row.actual_check_out)
        : null,
      work_hours: Number(row.work_hours ?? 0),
      work_units: Number(row.work_units ?? 0),
      ot_hours: Number(row.ot_hours ?? 0),
      late_minutes: Number(row.late_minutes ?? 0),
      early_minutes: Number(row.early_minutes ?? 0),
      status: row.status,
      is_locked: Boolean(row.is_locked),
      check_in_status: row.check_in_status,
      check_out_status: row.check_out_status,
      day_status: row.day_status
    });
  }

  /**
   * Lấy danh sách bảng công nhật theo bộ lọc
   */
  async listTimesheets(filter: TimesheetFilter = {}): Promise<DailyTimesheet[]> {
    let query = this.qb.selectFrom('timesheet_entries').selectAll();

    if (filter.employeeId) {
      query = query.where('employee_id', '=', filter.employeeId);
    }
    if (filter.startDate) {
      query = query.where('work_date', '>=', filter.startDate);
    }
    if (filter.endDate) {
      query = query.where('work_date', '<=', filter.endDate);
    }
    if (filter.status) {
      query = query.where('status', '=', filter.status);
    }

    const rows = await query.orderBy('work_date', 'asc').orderBy('employee_id', 'asc').execute();

    return rows.map(row =>
      DailyTimesheet.fromRow({
        id: row.id,
        employee_id: row.employee_id,
        work_date: row.work_date,
        shift_type: row.shift_type,
        shift_start_time: row.shift_start_time,
        shift_end_time: row.shift_end_time,
        shift_allowance_pct: Number(row.shift_allowance_pct),
        actual_check_in: row.actual_check_in
          ? row.actual_check_in instanceof Date
            ? row.actual_check_in.toISOString()
            : String(row.actual_check_in)
          : null,
        actual_check_out: row.actual_check_out
          ? row.actual_check_out instanceof Date
            ? row.actual_check_out.toISOString()
            : String(row.actual_check_out)
          : null,
        work_hours: Number(row.work_hours ?? 0),
        work_units: Number(row.work_units ?? 0),
        ot_hours: Number(row.ot_hours ?? 0),
        late_minutes: Number(row.late_minutes ?? 0),
        early_minutes: Number(row.early_minutes ?? 0),
        status: row.status,
        is_locked: Boolean(row.is_locked),
        check_in_status: row.check_in_status,
        check_out_status: row.check_out_status,
        day_status: row.day_status
      })
    );
  }

  /**
   * Khóa bảng công nhật trong khoảng thời gian để chốt kỳ lương
   */
  async lockTimesheets(employeeId: string, startDate: string, endDate: string): Promise<number> {
    const result = await this.qb
      .updateTable('timesheet_entries')
      .set({ is_locked: true, updated_at: new Date() })
      .where('employee_id', '=', employeeId)
      .where('work_date', '>=', startDate)
      .where('work_date', '<=', endDate)
      .where('is_locked', '=', false)
      .executeTakeFirst();

    return Number(result.numUpdatedRows ?? 0);
  }

  /**
   * Lưu hoặc cập nhật lịch làm việc vào bảng work_schedules on conflict (employee_id, work_date)
   */
  async saveSchedule(schedule: WorkSchedule): Promise<void> {
    const row = schedule.toRow();
    const now = new Date();
    await this.qb
      .insertInto('work_schedules')
      .values({
        id: row.id,
        employee_id: row.employee_id,
        work_date: row.work_date,
        shift_type: row.shift_type,
        planned_start_time: row.planned_start_time,
        planned_end_time: row.planned_end_time,
        approved_ot_hours: row.approved_ot_hours,
        schedule_type: row.schedule_type,
        status: row.status,
        source_request_id: row.source_request_id,
        created_at: now,
        updated_at: now
      })
      .onConflict(oc =>
        oc.columns(['employee_id', 'work_date']).doUpdateSet(eb => ({
          shift_type: eb.ref('excluded.shift_type'),
          planned_start_time: eb.ref('excluded.planned_start_time'),
          planned_end_time: eb.ref('excluded.planned_end_time'),
          approved_ot_hours: eb.ref('excluded.approved_ot_hours'),
          schedule_type: eb.ref('excluded.schedule_type'),
          status: eb.ref('excluded.status'),
          source_request_id: eb.ref('excluded.source_request_id'),
          updated_at: now
        }))
      )
      .execute();
  }

  /**
   * Tìm lịch làm việc theo nhân viên và ngày công
   */
  async findSchedule(employeeId: string, workDate: string): Promise<WorkSchedule | null> {
    const row = await this.qb
      .selectFrom('work_schedules')
      .selectAll()
      .where('employee_id', '=', employeeId)
      .where('work_date', '=', workDate)
      .executeTakeFirst();

    if (!row) return null;
    return WorkSchedule.fromRow({
      id: row.id,
      employee_id: row.employee_id,
      work_date: row.work_date,
      shift_type: row.shift_type,
      planned_start_time: row.planned_start_time,
      planned_end_time: row.planned_end_time,
      approved_ot_hours: Number(row.approved_ot_hours ?? 0),
      schedule_type: row.schedule_type,
      status: row.status,
      source_request_id: row.source_request_id,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)
    });
  }

  /**
   * Tìm danh sách lịch làm việc theo khoảng ngày
   */
  async findSchedules(employeeId: string, startDate: string, endDate: string): Promise<WorkSchedule[]> {
    const rows = await this.qb
      .selectFrom('work_schedules')
      .selectAll()
      .where('employee_id', '=', employeeId)
      .where('work_date', '>=', startDate)
      .where('work_date', '<=', endDate)
      .orderBy('work_date', 'asc')
      .execute();

    return rows.map(row =>
      WorkSchedule.fromRow({
        id: row.id,
        employee_id: row.employee_id,
        work_date: row.work_date,
        shift_type: row.shift_type,
        planned_start_time: row.planned_start_time,
        planned_end_time: row.planned_end_time,
        approved_ot_hours: Number(row.approved_ot_hours ?? 0),
        schedule_type: row.schedule_type,
        status: row.status,
        source_request_id: row.source_request_id,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)
      })
    );
  }

  /**
   * Đảm bảo lịch làm việc tồn tại: nếu chưa có thì nạp từ ca mặc định của nhân viên trong staff
   */
  async ensureDefaultSchedule(employeeId: string, workDate: string): Promise<WorkSchedule> {
    const existing = await this.findSchedule(employeeId, workDate);
    if (existing) return existing;

    const staffRow = await this.qb
      .selectFrom('staff')
      .select(['uuid', 'shift_type', 'shift_start_time', 'shift_end_time'])
      .where('uuid', '=', employeeId)
      .executeTakeFirst();

    const shiftType = (staffRow?.shift_type as any) || 'NORMAL';
    const plannedStartTime = staffRow?.shift_start_time || '08:00';
    const plannedEndTime = staffRow?.shift_end_time || '17:00';

    const defaultSchedule = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType,
      plannedStartTime,
      plannedEndTime,
      scheduleType: 'REGULAR',
      status: 'PLANNED'
    });

    await this.saveSchedule(defaultSchedule);
    return defaultSchedule;
  }
}
