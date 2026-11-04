import { businessDateText } from '../../../common/business-date';

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMs(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Mọi ngày từ `from` đến `to`, gồm cả hai đầu. Rỗng nếu `from` sau `to`. */
export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** Thứ trong tuần theo UTC: 0 = CN … 6 = T7. */
export function weekday(date: string): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

/** '2026-11-30' → '2026-11' */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** '2026-11' → '2026-11-30' */
export function lastDayOfMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return fromUtcMs(Date.UTC(year, m, 0));
}

/** '2026-11-12' → '12/11' */
export function formatDayMonth(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Các ngày làm việc trong [from, to]: thứ nằm trong `regularDows` và không phải ngày lễ. */
export function workingDays(
  from: string,
  to: string,
  regularDows: readonly number[],
  holidays: ReadonlySet<string>
): string[] {
  return eachDate(from, to).filter(d => regularDows.includes(weekday(d)) && !holidays.has(d));
}

/** Ngày hiện tại theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function vietnamToday(now: Date): string {
  return businessDateText(now);
}
