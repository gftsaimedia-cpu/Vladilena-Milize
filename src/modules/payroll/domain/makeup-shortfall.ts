/** Phút của một ngày nghỉ có làm bù phải bù lại (8 giờ). */
const MINUTES_PER_DAY = 480;

/**
 * Số ngày nghỉ có làm bù vẫn tính là ngày nghỉ cho chuyên cần (L16): mỗi ngày nghỉ nợ 480 phút, trừ số phút đã bù trong
 * tháng; phần còn thiếu làm tròn lên theo ngày 8 giờ, không quá số ngày nghỉ có bù.
 */
export function makeupShortfallDays(lwmDays: number, makeupMinutes: number): number {
  const missing = Math.max(0, MINUTES_PER_DAY * lwmDays - makeupMinutes);
  return Math.min(lwmDays, Math.ceil(missing / MINUTES_PER_DAY));
}
