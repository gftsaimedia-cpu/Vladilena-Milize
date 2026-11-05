import type { ActiveStatus, DayClaim, DayView, WindowSource } from './day-status';
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
  /** Các dòng `day_status` của nhân sự quanh khoảng ngày của đơn. */
  claims: readonly DayClaim[];
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
export class EmployeeDays implements DayView {
  private readonly holidaySet: ReadonlySet<string>;
  private readonly scheduleByDate: ReadonlyMap<string, ScheduleDay>;
  private readonly claimByDate: ReadonlyMap<string, DayClaim>;
  private readonly active: readonly SystemRequest[];

  constructor(
    private readonly input: EmployeeDaysInput,
    private readonly overrides: ReadonlyMap<string, ShiftTimes> = new Map()
  ) {
    this.holidaySet = new Set(input.holidays);
    this.scheduleByDate = new Map(input.schedules.map(s => [s.date, s]));
    this.claimByDate = new Map(input.claims.map(c => [c.date, c]));
    this.active = input.activeRequests.filter(isActive);
  }

  /** Dòng `day_status` đang giữ ngày D, hoặc null. */
  claimOn(date: string): DayClaim | null {
    return this.claimByDate.get(date) ?? null;
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

  /** Ngày đang nghỉ (§5.3): `day_status` của ngày là nghỉ hoặc nghỉ có làm bù. Không đọc lịch ON_LEAVE hay danh sách đơn. */
  isOnLeave(date: string): boolean {
    const status = this.claimByDate.get(date)?.status;
    return status === 'LEAVE' || status === 'LEAVE_WITH_MAKEUP';
  }

  /** Khung OT và khung bù của các đơn đang chờ/đã duyệt trên ngày D, sắp theo giờ bắt đầu. */
  windowsOn(date: string): ClockWindow[] {
    return this.windowEntries(date).map(e => e.window);
  }

  /** Cùng các khung với `windowsOn`, theo cùng thứ tự, kèm đơn sinh ra khung và trạng thái của đơn. */
  windowSourcesOn(date: string): WindowSource[] {
    return this.windowEntries(date).map(e => e.source);
  }

  private windowEntries(date: string): Array<{ window: ClockWindow; source: WindowSource }> {
    const entries: Array<{ window: ClockWindow; source: WindowSource }> = [];
    for (const r of this.active) {
      const requestStatus = r.status as ActiveStatus; // `active` chỉ giữ đơn chờ hoặc đã duyệt
      if (r.type === 'OVERTIME' && r.otDate === date) {
        const { otStartTime: start, otEndTime: end } = r;
        // Đơn OT cũ thiếu giờ hoặc giờ sai định dạng thì không có khung để so.
        if (start && end && TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && start < end) {
          entries.push({
            window: { date, startTime: start, endTime: end, kind: 'OT' },
            source: { kind: 'OT', requestId: r.id, requestStatus }
          });
        }
      } else if (r.type === 'LEAVE_WITH_MAKEUP') {
        for (const slot of r.makeupSlots) {
          if (slot.date === date) {
            entries.push({
              window: { date, startTime: slot.startTime, endTime: slot.endTime, kind: 'MAKEUP' },
              source: { kind: 'MAKEUP', requestId: r.id, requestStatus }
            });
          }
        }
      }
    }
    return entries.sort(
      (a, b) => a.window.startTime.localeCompare(b.window.startTime) || a.window.endTime.localeCompare(b.window.endTime)
    );
  }

  /** Bản sao với ca `frame` trên các ngày `dates` (ngày làm việc), như thể đã có đơn đổi ca đó. */
  withShiftOverride(dates: readonly string[], frame: ShiftTimes): EmployeeDays {
    const overrides = new Map(this.overrides);
    for (const d of dates) overrides.set(d, { startTime: frame.startTime, endTime: frame.endTime });
    return new EmployeeDays(this.input, overrides);
  }
}
