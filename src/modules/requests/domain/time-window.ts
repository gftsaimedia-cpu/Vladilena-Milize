import { formatDayMonth } from './working-days';

export const WINDOW_EARLIEST = '06:00';
export const WINDOW_LATEST = '22:00';
export const SHIFT_GAP_MINUTES = 60;
export const SHIFT_WORK_MINUTES = 480;
export const DAY_CAP_MINUTES = 720;

/** Làm liên tục 4 giờ thì nghỉ 1 giờ (§5.4). */
const WORK_BLOCK_MINUTES = 240;
const BREAK_MINUTES = 60;

const MINUTES_PER_DAY = 1440;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type WindowKind = 'OT' | 'MAKEUP';

export interface ClockWindow {
  date: string;
  startTime: string;
  endTime: string;
  kind: WindowKind;
}

/** `endTime <= startTime` nghĩa là ca kéo sang hôm sau. */
export interface ShiftSpan {
  startDate: string;
  startTime: string;
  endTime: string;
}

/** 'HH:mm' → số phút trong ngày. */
export function toMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Số phút làm thực tế của một khung giờ: cứ 4 giờ làm thì nghỉ 1 giờ (§5.4). */
export function workMinutes(startTime: string, endTime: string): number {
  const span = toMinutes(endTime) - toMinutes(startTime);
  if (span <= 0) return 0;
  const cycle = WORK_BLOCK_MINUTES + BREAK_MINUTES;
  return Math.floor(span / cycle) * WORK_BLOCK_MINUTES + Math.min(span % cycle, WORK_BLOCK_MINUTES);
}

/** 480 → '8', 450 → '7,5'. */
export function formatHours(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100).replace('.', ',');
}

/** Số ngày từ mốc 1970-01-01 (UTC), để so ngày bằng phép trừ mà không lệch tháng. */
function dayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function absoluteMinutes(date: string, time: string): number {
  return dayNumber(date) * MINUTES_PER_DAY + toMinutes(time);
}

function shiftBounds(shift: ShiftSpan): { start: number; end: number } {
  const start = absoluteMinutes(shift.startDate, shift.startTime);
  const overnight = shift.endTime <= shift.startTime ? MINUTES_PER_DAY : 0;
  return { start, end: dayNumber(shift.startDate) * MINUTES_PER_DAY + overnight + toMinutes(shift.endTime) };
}

/**
 * Kiểm khung OT/làm bù theo thứ tự: định dạng → trong 06–22 → cách ca ≥ 60 phút → không chồng
 * khung khác cùng ngày. Trả câu lỗi đầu tiên gặp, hoặc null.
 */
export function windowError(
  window: ClockWindow,
  shifts: readonly ShiftSpan[],
  others: readonly ClockWindow[]
): string | null {
  const { date, startTime, endTime } = window;
  const range = `${startTime}–${endTime}`;
  const label = `Khung ${range} ngày ${formatDayMonth(date)}`;

  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime) || startTime >= endTime) {
    return `Giờ khung không hợp lệ: ${range}`;
  }
  if (startTime < WINDOW_EARLIEST || endTime > WINDOW_LATEST) {
    return `${label} phải nằm trong ${WINDOW_EARLIEST}–${WINDOW_LATEST}`;
  }

  const start = absoluteMinutes(date, startTime);
  const end = absoluteMinutes(date, endTime);
  for (const shift of shifts) {
    const bounds = shiftBounds(shift);
    if (start < bounds.end + SHIFT_GAP_MINUTES && bounds.start < end + SHIFT_GAP_MINUTES) {
      return `${label} phải cách ca ${shift.startTime}–${shift.endTime} ít nhất 1 giờ`;
    }
  }

  for (const other of others) {
    if (other.date === date && startTime < other.endTime && other.startTime < endTime) {
      return `${label} chồng lên khung ${other.startTime}–${other.endTime}`;
    }
  }
  return null;
}

/** Ca (nếu có, tính 8 giờ) + mọi khung OT/làm bù của ngày đó không được quá 12 giờ. */
export function dayCapError(date: string, hasShift: boolean, windows: readonly ClockWindow[]): string | null {
  const total = windows
    .filter(w => w.date === date)
    .reduce((sum, w) => sum + workMinutes(w.startTime, w.endTime), hasShift ? SHIFT_WORK_MINUTES : 0);
  if (total <= DAY_CAP_MINUTES) return null;
  return `Ngày ${formatDayMonth(date)} vượt 12 giờ (ca + OT + làm bù = ${formatHours(total)} giờ)`;
}
