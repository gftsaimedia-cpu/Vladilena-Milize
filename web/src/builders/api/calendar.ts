// Màn Lịch (Cài đặt) từ GET /api/v2/holidays?year=: ngày liền nhau cùng tên gộp thành một khoảng.
// BE chưa có tham số ngày trả lương nên payDay là null.
export type HolidayDTO = { date: string; name: string };
export type HolidayRange = { id: string; from: string; to: string; name: string };

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const spanDays = (h: HolidayRange) => Math.round((Date.parse(h.to) - Date.parse(h.from)) / 86400000) + 1;

export function holidayRangesOf(items: HolidayDTO[]): HolidayRange[] {
  const out: HolidayRange[] = [];
  for (const { date, name } of [...items].sort((a, b) => a.date.localeCompare(b.date))) {
    const last = out[out.length - 1];
    if (last && addDays(last.to, 1) === date && last.name === name) last.to = date;
    else out.push({ id: date, from: date, to: date, name });
  }
  return out;
}

export function calendarFromHolidays(items: HolidayDTO[], year: number) {
  const holidays = holidayRangesOf(items).filter(h => h.from.startsWith(String(year)));
  return { year, startDay: 1, payDay: null, holidays, holidayDays: holidays.reduce((n, h) => n + spanDays(h), 0) };
}

/** Các ngày của một khoảng (from..to), để thêm hoặc xoá từng ngày qua API. */
export function datesOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= (to || from); d = addDays(d, 1)) out.push(d);
  return out;
}
