const pad2 = (n: number) => String(n).padStart(2, '0');

const DATE_TEXT = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Chuỗi 'YYYY-MM-DD' của một ngày có thật trong lịch ('2026-02-30' không hợp lệ). */
export function isValidDateText(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_TEXT.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Đưa giá trị cột DATE về 'YYYY-MM-DD'. pg trả DATE thành Date lúc 0h theo giờ máy, nên phải đọc bằng getter
 * local: getter UTC ở UTC+7 lùi về hôm trước. Chuỗi giữ nguyên, chỉ cắt phần giờ nếu có.
 */
export function toDateText(value: Date | string): string {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  const text = String(value);
  return text.length > 10 ? text.slice(0, 10) : text;
}
