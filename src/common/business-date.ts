/** Công ty chạy theo giờ Việt Nam: "hôm nay" và "tháng này" không đổi theo TZ của máy chủ (Docker chạy UTC). */
export const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const calendarFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** Ngày 'YYYY-MM-DD' theo giờ Việt Nam của một thời điểm. toISOString() cho ngày UTC, lùi một ngày từ 0h đến 7h. */
export function businessDateText(at: Date = new Date()): string {
  const parts: Record<string, string> = {};
  for (const { type, value } of calendarFormat.formatToParts(at)) parts[type] = value;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Tháng 'YYYY-MM' theo giờ Việt Nam của một thời điểm. */
export function businessMonthText(at: Date = new Date()): string {
  return businessDateText(at).slice(0, 7);
}
