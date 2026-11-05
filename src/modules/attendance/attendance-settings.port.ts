import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';

/** Số phút ân hạn đi muộn / về sớm khi chưa có module cài đặt. Đặt duy nhất ở đây (spec 9.1). */
export const DEFAULT_LATE_GRACE_MINUTES = 15;

/** Cổng cài đặt mà chấm công cần. Khi module `settings` vào `main`, chỉ cần viết lại bản cài đặt của cổng này. */
export abstract class AttendanceSettingsPort {
  /** Số phút ân hạn của tháng `month` ('YYYY-MM'). */
  abstract graceMinutes(month: string, trx?: Kysely<DB>): Promise<number>;
  /** Các thứ đi làm của nhân sự trong tháng: số nguyên 1..6 (thứ Hai … thứ Bảy), tăng dần, không trùng. */
  abstract workWeek(employeeUuid: string, month: string, trx?: Kysely<DB>): Promise<number[]>;
}

/** `regular_dows` lưu dạng chuỗi JSON; chỉ giữ số nguyên 1..6 (0 = Chủ nhật bị bỏ), bỏ trùng, tăng dần. Sai dạng thì rỗng. */
export function parseWorkWeek(text: string | null | undefined): number[] {
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    const days = parsed.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 6);
    return [...new Set(days)].sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/** Bản tạm (spec 9.1): tuần làm việc theo phiên bản `position_types` đang hiệu lực, ân hạn là hằng số. */
@Injectable()
export class PositionTypeAttendanceSettings extends AttendanceSettingsPort {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {
    super();
  }

  async graceMinutes(_month: string, _trx?: Kysely<DB>): Promise<number> {
    return DEFAULT_LATE_GRACE_MINUTES;
  }

  async workWeek(employeeUuid: string, month: string, trx?: Kysely<DB>): Promise<number[]> {
    const db = trx ?? this.qb;
    const staff = await db.selectFrom('staff').select('type').where('uuid', '=', employeeUuid).executeTakeFirst();
    if (!staff) return [];
    // Phiên bản mới nhất có effective_month <= month (như findStaffContext).
    const version = await db
      .selectFrom('position_types')
      .select('regular_dows')
      .where('code', '=', staff.type)
      .where('effective_month', '<=', month)
      .orderBy('effective_month', 'desc')
      .limit(1)
      .executeTakeFirst();
    return version ? parseWorkWeek(version.regular_dows) : [];
  }
}
