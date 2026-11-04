const pad2 = (n: number) => String(n).padStart(2, '0');

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
