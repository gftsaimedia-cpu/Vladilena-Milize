// Tuần làm việc: thứ trong tuần là số 0..6 (0 = Chủ nhật), tuần làm chỉ gồm 1..6.
import { SettingsInputError } from '../settings.errors';

/** Ngày công chuẩn của tháng theo số ngày làm mỗi tuần: n × 52 ÷ 12, làm tròn. */
export function standardWorkdaysForWeek(n: number): number {
  return Math.round((n * 52) / 12);
}

/** Danh sách thứ làm việc: số nguyên 1..6, không trùng, ít nhất một phần tử; trả mảng tăng dần. */
export function validateWeekdays(v: unknown): number[] {
  const fail = (): never => {
    throw new SettingsInputError('Ngày làm trong tuần phải là danh sách thứ từ 1 (Thứ Hai) đến 6 (Thứ Bảy), không trùng', 'weekdays');
  };
  if (!Array.isArray(v) || v.length < 1) return fail();
  for (const d of v) if (!Number.isInteger(d) || d < 1 || d > 6) return fail();
  if (new Set(v).size !== v.length) return fail();
  return [...(v as number[])].sort((a, b) => a - b);
}

/** Ngày 'YYYY-MM-DD' có phải ngày làm theo tuần này không (thứ tính theo lịch, UTC; 0 = Chủ nhật). */
export function isWorkday(weekdays: readonly number[], date: string): boolean {
  return weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
}
