const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' + 'HH:mm' hiểu theo giờ Việt Nam (UTC+7). */
export function vnInstant(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+07:00`);
}

/** Cộng (hoặc trừ) n ngày vào ngày dạng 'YYYY-MM-DD'. */
export function addDaysText(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Thứ trong tuần: 0 = Chủ nhật … 6 = Thứ bảy. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Mọi ngày của tháng 'YYYY-MM'. */
export function datesOfMonth(month: string): string[] {
  const [year, mon] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export function monthOfDate(date: string): string {
  return date.slice(0, 7);
}

/** Từ tháng 'YYYY-MM' tới tháng 'YYYY-MM', gồm hai đầu. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [year, mon] = from.split('-').map(Number);
  const [toYear, toMon] = to.split('-').map(Number);
  while (year < toYear || (year === toYear && mon <= toMon)) {
    out.push(`${year}-${String(mon).padStart(2, '0')}`);
    mon += 1;
    if (mon > 12) {
      mon = 1;
      year += 1;
    }
  }
  return out;
}
