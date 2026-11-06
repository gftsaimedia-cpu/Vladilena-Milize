import { vnInstant } from './presence';

/** Phút của một ngày nghỉ có làm bù phải bù lại (8 giờ). */
const MINUTES_PER_DAY = 480;

/**
 * Số ngày nghỉ có làm bù vẫn tính là ngày nghỉ cho chuyên cần (L16): mỗi ngày nghỉ nợ 480 phút, trừ số phút đã được ghi nhận bù
 * trong tháng (phút có mặt, hoặc cả khung nếu vào trễ ở khung đã được giải trình duyệt); phần còn thiếu làm tròn lên
 * theo ngày 8 giờ, không quá số ngày nghỉ có bù.
 */
export function makeupShortfallDays(lwmDays: number, creditedMinutes: number): number {
  const missing = Math.max(0, MINUTES_PER_DAY * lwmDays - creditedMinutes);
  return Math.min(lwmDays, Math.ceil(missing / MINUTES_PER_DAY));
}

/** Khung làm bù đã duyệt của một đơn nghỉ có làm bù: ngày, giờ kết thúc 'HH:mm' (giờ Việt Nam) và số phút làm thực của khung. */
export type MakeupWindow = { date: string; end: string; workMinutes: number };

/**
 * Phút làm bù đã xếp mà chưa tới (D10, 06/11): tổng phút làm thực của các khung kết thúc SAU `now`. Chỉ dùng để xét
 * chuyên cần ở thu nhập tạm tính giữa tháng, không bao giờ để trả tiền. Khung đã kết thúc không còn ở đây vì số phút
 * thật đã nằm trên dòng ngày (`makeup_credit_minutes`, phút ghi nhận bù); sang tháng sau thì mọi khung của tháng đã
 * kết thúc nên còn 0.
 * Khung đang diễn ra (bắt đầu trước `now`, kết thúc sau `now`) được tính đủ `workMinutes`, dù dòng ngày có thể đã giữ
 * một phần số phút đó: ước lượng giữa tháng chấp nhận lệch tạm thời, hết khung thì số phút thật thay thế.
 */
export function plannedMakeupMinutes(windows: readonly MakeupWindow[] | undefined, now: Date): number {
  let minutes = 0;
  for (const w of windows ?? []) {
    if (vnInstant(w.date, w.end.slice(0, 5)).getTime() > now.getTime()) minutes += w.workMinutes;
  }
  return minutes;
}
