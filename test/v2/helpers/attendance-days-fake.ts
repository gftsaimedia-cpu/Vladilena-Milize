import { randomUUID } from 'node:crypto';
import type { AttendanceDaysService } from '../../../src/modules/attendance/attendance-days.service';
import { DailyTimesheet } from '../../../src/modules/attendance/domain';
import { datesOfMonth } from '../../../src/modules/attendance/domain/calendar';

/** Chỗ lưu dòng ngày của repository giả: khoá `employeeId:workDate`. */
export type FakeTimesheetStore = Map<string, DailyTimesheet>;

export interface RefreshCall {
  employeeId: string;
  dates: string[];
  opts: unknown;
}

/**
 * `AttendanceDaysService` giả: ghi lại lời gọi `refreshDays`, và với mỗi ngày chưa có dòng thì thêm một dòng ca thường
 * vào `store` để người gọi đọc lại được.
 */
export class FakeAttendanceDays {
  readonly calls: RefreshCall[] = [];
  readonly monthCalls: Array<{ employeeId: string; month: string }> = [];

  constructor(private readonly store: FakeTimesheetStore) {}

  async refreshDays(employeeId: string, dates: readonly string[], opts: unknown = undefined): Promise<unknown[]> {
    this.calls.push({ employeeId, dates: [...dates], opts });
    for (const workDate of dates) {
      const key = `${employeeId}:${workDate}`;
      if (this.store.has(key)) continue;
      this.store.set(
        key,
        DailyTimesheet.create({
          id: randomUUID(),
          employeeId,
          workDate,
          shiftType: 'NORMAL',
          shiftStartTime: '08:00',
          shiftEndTime: '17:00'
        })
      );
    }
    return [];
  }

  async refreshMonth(employeeId: string, month: string, opts: unknown = undefined): Promise<unknown[]> {
    this.monthCalls.push({ employeeId, month });
    return await this.refreshDays(employeeId, datesOfMonth(month), opts);
  }

  asService(): AttendanceDaysService {
    return this as unknown as AttendanceDaysService;
  }
}
