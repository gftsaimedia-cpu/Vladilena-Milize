/**
 * Ngày trả lương mặc định: ngày 10 của tháng sau, dạng YYYY-MM-DD. Chạy thật thì `PeriodsService.paydayFor` đọc ngày từ
 * kho cài đặt (`payDateOf` với `payCalendar.payDay`); hàm này chỉ dùng khi không có kho cài đặt.
 */
export function paydayOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-10`;
}
