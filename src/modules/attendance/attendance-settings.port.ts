import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { DB } from '../../database';
import { SettingsReader, TypeWeekMissingError } from '../settings';

/** Cổng cài đặt mà chấm công cần (spec 9.1). Bản chạy thật là `SettingsAttendanceSettings`. */
export abstract class AttendanceSettingsPort {
  /** Số phút ân hạn của tháng `month` ('YYYY-MM'). */
  abstract graceMinutes(month: string, trx?: Kysely<DB>): Promise<number>;
  /** Các thứ đi làm của nhân sự trong tháng: số nguyên 1..6 (thứ Hai … thứ Bảy), tăng dần, không trùng. */
  abstract workWeek(employeeUuid: string, month: string, trx?: Kysely<DB>): Promise<number[]>;
}

/** Tuần mặc định khi loại nhân sự chưa có tuần làm (cùng ruling F2 của AttendanceService): thứ Hai đến thứ Bảy. */
const DEFAULT_WORK_WEEK: readonly number[] = [1, 2, 3, 4, 5, 6];

/** Chỉ giữ số nguyên 1..6 (0 = Chủ nhật bị bỏ), bỏ trùng, tăng dần. */
function normalizeWeek(days: readonly number[]): number[] {
  return [...new Set(days.filter(d => Number.isInteger(d) && d >= 1 && d <= 6))].sort((a, b) => a - b);
}

/** Cổng đọc kho cài đặt: ân hạn và tuần làm việc theo phiên bản đang hiệu lực của tháng. */
@Injectable()
export class SettingsAttendanceSettings extends AttendanceSettingsPort {
  // `@Inject` rõ ràng: tsx không phát metadata kiểu tham số, nên Nest không tự suy ra được.
  constructor(@Inject(SettingsReader) private readonly reader: SettingsReader) {
    super();
  }

  async graceMinutes(month: string, trx?: Kysely<DB>): Promise<number> {
    return (await this.reader.settingsFor(month, trx)).attendance.lateGraceMinutes;
  }

  async workWeek(employeeUuid: string, month: string, trx?: Kysely<DB>): Promise<number[]> {
    try {
      return normalizeWeek((await this.reader.workWeekOf(employeeUuid, month, trx)).weekdays);
    } catch (err) {
      // Loại chưa có tuần làm (vd. tài khoản quản trị đầu tiên) thì coi như T2–T7, như app nhân viên.
      if (err instanceof TypeWeekMissingError) return [...DEFAULT_WORK_WEEK];
      throw err;
    }
  }
}
