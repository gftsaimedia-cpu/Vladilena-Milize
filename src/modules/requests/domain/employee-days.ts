import type { SystemRequest } from './system-request';
import type { ClockWindow, ShiftSpan } from './time-window';
import { addDays, workingDays } from './working-days';

/** Một dòng `work_schedules` đã đọc thành chữ: ngày 'YYYY-MM-DD', giờ 'HH:mm'; `onLeave` khi status = 'ON_LEAVE'. */
export interface ScheduleDay {
  date: string;
  startTime: string;
  endTime: string;
  onLeave: boolean;
}

export interface ShiftTimes {
  startTime: string;
  endTime: string;
}

export interface EmployeeDaysInput {
  regularDows: readonly number[];
  holidays: readonly string[];
  defaultShift: ShiftTimes;
  schedules: readonly ScheduleDay[];
  activeRequests: readonly SystemRequest[];
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Đơn đang chờ hoặc đã duyệt: chỉ những đơn này chặn hay đổi lịch (§5). */
const isActive = (r: SystemRequest): boolean => r.status === 'PENDING' || r.status === 'APPROVED';

const covers = (start: string | null, end: string | null, date: string): boolean =>
  start !== null && start <= date && date <= (end ?? start);

/**
 * Lịch của một nhân sự quanh khoảng ngày của đơn: ngày làm việc, ca từng ngày (§5.2), ngày đang nghỉ (§5.3)
 * và các khung OT/làm bù đã đăng ký. Chỉ đọc dữ liệu đã nạp, không đụng DB.
 */
export class EmployeeDays {
  private readonly holidaySet: ReadonlySet<string>;
  private readonly scheduleByDate: ReadonlyMap<string, ScheduleDay>;
  private readonly active: readonly SystemRequest[];

  constructor(
    private readonly input: EmployeeDaysInput,
    private readonly overrides: ReadonlyMap<string, ShiftTimes> = new Map()
  ) {
    this.holidaySet = new Set(input.holidays);
    this.scheduleByDate = new Map(input.schedules.map(s => [s.date, s]));
    this.active = input.activeRequests.filter(isActive);
  }

  isHoliday(date: string): boolean {
    return this.holidaySet.has(date);
  }

  isWorkingDay(date: string): boolean {
    return this.workingDaysBetween(date, date).length === 1;
  }

  workingDaysBetween(from: string, to: string): string[] {
    return workingDays(from, to, this.input.regularDows, this.holidaySet);
  }

  /** Ca của ngày D theo §5.2; `startDate` luôn là D. */
  shiftOf(date: string): ShiftSpan | null {
    if (this.isHoliday(date)) return null;

    const working = this.isWorkingDay(date);
    if (working) {
      const override = this.overrides.get(date);
      if (override) return { startDate: date, ...override };
      const change = this.active.find(r => r.type === 'SHIFT_CHANGE' && covers(r.changeStartDate, r.changeEndDate, date));
      if (change && change.newStartTime && change.newEndTime) {
        return { startDate: date, startTime: change.newStartTime, endTime: change.newEndTime };
      }
    }

    const schedule = this.scheduleByDate.get(date);
    if (schedule) {
      // Ruling của plan: ngày lịch ON_LEAVE coi như không có ca.
      return schedule.onLeave ? null : { startDate: date, startTime: schedule.startTime, endTime: schedule.endTime };
    }

    return working ? { startDate: date, ...this.input.defaultShift } : null;
  }

  /** Ca của D−1, D và D+1 (bỏ ngày không có ca): ca đêm hôm trước có thể kéo sang sáng D. */
  shiftsAround(date: string): ShiftSpan[] {
    return [addDays(date, -1), date, addDays(date, 1)]
      .map(d => this.shiftOf(d))
      .filter((s): s is ShiftSpan => s !== null);
  }

  /** Ngày đang nghỉ (§5.3): trong khoảng một đơn nghỉ/nghỉ có làm bù đang chờ hoặc đã duyệt, hoặc lịch ON_LEAVE. */
  isOnLeave(date: string): boolean {
    if (this.scheduleByDate.get(date)?.onLeave) return true;
    return this.active.some(
      r => (r.type === 'LEAVE' || r.type === 'LEAVE_WITH_MAKEUP') && covers(r.leaveStartDate, r.leaveEndDate, date)
    );
  }

  /** Khung OT và khung bù của các đơn đang chờ/đã duyệt trên ngày D, sắp theo giờ bắt đầu. */
  windowsOn(date: string): ClockWindow[] {
    const windows: ClockWindow[] = [];
    for (const r of this.active) {
      if (r.type === 'OVERTIME' && r.otDate === date) {
        const { otStartTime: start, otEndTime: end } = r;
        // Đơn OT cũ thiếu giờ hoặc giờ sai định dạng thì không có khung để so.
        if (start && end && TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && start < end) {
          windows.push({ date, startTime: start, endTime: end, kind: 'OT' });
        }
      } else if (r.type === 'LEAVE_WITH_MAKEUP') {
        for (const slot of r.makeupSlots) {
          if (slot.date === date) windows.push({ date, startTime: slot.startTime, endTime: slot.endTime, kind: 'MAKEUP' });
        }
      }
    }
    return windows.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));
  }

  /** Bản sao với ca `frame` trên các ngày `dates` (ngày làm việc), như thể đã có đơn đổi ca đó. */
  withShiftOverride(dates: readonly string[], frame: ShiftTimes): EmployeeDays {
    const overrides = new Map(this.overrides);
    for (const d of dates) overrides.set(d, { startTime: frame.startTime, endTime: frame.endTime });
    return new EmployeeDays(this.input, overrides);
  }
}
