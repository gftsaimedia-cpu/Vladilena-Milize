// Đọc và kiểm các mảnh số dùng chung của API cài đặt. Sai thì ném SettingsInputError kèm tên ô sai.
import { SettingsInputError } from '../settings.errors';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const REASON_MAX = 300;

function fail(field: string, message: string): never {
  throw new SettingsInputError(message, field);
}

/** Tháng 'YYYY-MM'; field là tên ô để báo lỗi. */
export function parseMonth(v: unknown, field: string): string {
  if (typeof v !== 'string' || !MONTH.test(v)) fail(field, 'Tháng phải có dạng YYYY-MM');
  return v;
}

/** Tháng áp dụng: đúng dạng và không sớm hơn minMonth. */
export function parseEffectiveMonth(v: unknown, minMonth: string): string {
  if (typeof v !== 'string' || !MONTH.test(v)) fail('effectiveMonth', 'Tháng áp dụng phải có dạng YYYY-MM');
  if (v < minMonth) {
    fail('effectiveMonth', `Tháng áp dụng phải từ ${minMonth.slice(5)}/${minMonth.slice(0, 4)} trở đi`);
  }
  return v;
}

/** Lý do: chữ tuỳ chọn, cắt khoảng trắng hai đầu, rỗng thành null, tối đa 300 ký tự. */
export function parseReason(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') fail('reason', 'Lý do phải là chữ');
  const text = v.trim();
  if (text.length > REASON_MAX) fail('reason', `Lý do tối đa ${REASON_MAX} ký tự`);
  return text || null;
}

/** Số phiên bản của nhóm (stamp): số nguyên không âm. */
export function parseStamp(v: unknown): number {
  if (!Number.isInteger(v) || (v as number) < 0) fail('stamp', 'Số phiên bản không hợp lệ');
  return v as number;
}
