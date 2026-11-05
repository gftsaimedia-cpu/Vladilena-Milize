// Ngày theo giờ Việt Nam (UTC+7) lúc chạy seed hay test. Không viết cứng ngày, để DB demo luôn khớp với hôm nay.
// Module thuần (không đọc file, không dùng __dirname): test Playwright trong web/ cũng import được.

const VN_OFFSET_MS = 7 * 3600_000;

/** Hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export const todayVN = (now: Date = new Date()): string => new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

export const monthOf = (date: string): string => date.slice(0, 7);

export const addMonths = (ym: string, n: number): string =>
  new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

export const daysInMonth = (ym: string): number => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

export const dateIn = (ym: string, day: number): string => `${ym}-${String(day).padStart(2, '0')}`;

/** 0 = Chủ nhật, 1 = thứ Hai … 6 = thứ Bảy. */
export const weekday = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Mọi ngày của tháng `ym`; có `until` thì dừng ở ngày đó (gồm cả ngày đó). */
export function datesOf(ym: string, until?: string): string[] {
  const out: string[] = [];
  for (let day = 1; day <= daysInMonth(ym); day++) {
    const date = dateIn(ym, day);
    if (until && date > until) break;
    out.push(date);
  }
  return out;
}

export interface DemoMonths {
  /** Hôm nay theo giờ Việt Nam. */
  today: string;
  /** Tháng này (dữ liệu tới hôm nay). */
  m0: string;
  /** Tháng trước. */
  m1: string;
  /** Tháng trước nữa. */
  m2: string;
}

/** Ba tháng của DB demo. */
export function demoMonths(today: string = todayVN()): DemoMonths {
  const m0 = monthOf(today);
  return { today, m0, m1: addMonths(m0, -1), m2: addMonths(m0, -2) };
}
