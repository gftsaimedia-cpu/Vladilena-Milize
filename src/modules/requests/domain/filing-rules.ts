import { LEAVE_TYPES, type LeaveType } from './leave-types';
import type { ShiftFrame, FrameShiftType } from './shift-frames';
import type { SystemRequest } from './system-request';
import { dayCapError, windowError, workMinutes, type ClockWindow, type ShiftSpan } from './time-window';
import { formatDayMonth, lastDayOfMonth } from './working-days';

export type FiledBy = 'self' | 'admin';

/** Nhân viên tự nộp đơn cho các ngày từ hôm nay đến hết tháng sau. */
export function filingWindow(today: string): { from: string; to: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return { from: today, to: lastDayOfMonth(`${nextYear}-${String(nextMonth).padStart(2, '0')}`) };
}

/** Đúng dạng 'HH:00'. */
export function isWholeHour(time: string): boolean {
  return /^([01]\d|2[0-3]):00$/.test(time);
}

/** Đơn tạm ứng chỉ mở ngày 16 và 17 hằng tháng. */
export function advanceDayOpen(today: string): boolean {
  const day = today.slice(8, 10);
  return day === '16' || day === '17';
}

/** Kỳ đã có dòng và không còn 'open' thì đã đóng. */
export function isClosedPeriod(row: { status: string } | null): boolean {
  return row !== null && row.status !== 'open';
}

export interface HourOption {
  start: number;
  ends: Array<{ end: number; minutes: number }>;
}

const FIRST_HOUR = 6;
const LAST_HOUR = 22;

const hourText = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

/** Mọi cặp giờ tròn trong 06–22 mà một khung OT/làm bù mới còn đặt được trong ngày `date`. */
export function dayHourOptions(input: {
  date: string;
  shifts: readonly ShiftSpan[];
  hasShift: boolean;
  windows: readonly ClockWindow[];
}): HourOption[] {
  const { date, shifts, hasShift, windows } = input;
  const options: HourOption[] = [];
  for (let start = FIRST_HOUR; start < LAST_HOUR; start++) {
    const ends: HourOption['ends'] = [];
    for (let end = start + 1; end <= LAST_HOUR; end++) {
      const window: ClockWindow = { date, startTime: hourText(start), endTime: hourText(end), kind: 'OT' };
      if (windowError(window, shifts, windows) !== null) continue;
      if (dayCapError(date, hasShift, [...windows, window]) !== null) continue;
      ends.push({ end, minutes: workMinutes(window.startTime, window.endTime) });
    }
    if (ends.length > 0) options.push({ start, ends });
  }
  return options;
}

export type TitleInput =
  | { kind: 'leave'; leaveType: LeaveType; startDate: string; endDate: string }
  | { kind: 'leave-with-makeup'; startDate: string; endDate: string }
  | { kind: 'overtime'; date: string; startTime: string; endTime: string }
  | { kind: 'shift-change'; frame: ShiftFrame; startDate: string; endDate: string }
  | { kind: 'explanation'; date: string }
  | { kind: 'advance'; month: string };

const FRAME_LABELS: Record<FrameShiftType, string> = { NORMAL: 'Normal', FLEX: 'Flex', NIGHT: 'Night' };

/** 13–16/11, 13/11, 30/11–02/12. */
function dateRangeText(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatDayMonth(startDate);
  if (startDate.slice(0, 7) === endDate.slice(0, 7)) return `${startDate.slice(8, 10)}–${formatDayMonth(endDate)}`;
  return `${formatDayMonth(startDate)}–${formatDayMonth(endDate)}`;
}

/** '18:00' → '18', '18:30' → '18:30'. */
function clockText(time: string): string {
  return time.endsWith(':00') ? time.slice(0, 2) : time;
}

/** Tiêu đề đơn do server đặt, không nhận từ client. */
export function requestTitle(input: TitleInput): string {
  switch (input.kind) {
    case 'leave': {
      const label = LEAVE_TYPES.find(t => t.code === input.leaveType)?.label ?? input.leaveType;
      return `${label} ${dateRangeText(input.startDate, input.endDate)}`;
    }
    case 'leave-with-makeup':
      return `Nghỉ có làm bù ${dateRangeText(input.startDate, input.endDate)}`;
    case 'overtime':
      return `Làm thêm ${formatDayMonth(input.date)} ${clockText(input.startTime)}–${clockText(input.endTime)}h`;
    case 'shift-change': {
      const { shiftType, startTime, endTime } = input.frame;
      return `Đổi ca ${FRAME_LABELS[shiftType]} ${startTime.slice(0, 2)}–${endTime.slice(0, 2)}, ${dateRangeText(input.startDate, input.endDate)}`;
    }
    case 'explanation':
      return `Giải trình ${formatDayMonth(input.date)}`;
    case 'advance':
      return `Tạm ứng lương tháng ${Number(input.month.slice(5, 7))}`;
  }
}

/**
 * Số ngày phép năm còn lại: số dư trừ các đơn phép năm đang chờ hoặc đã duyệt có ngày bắt đầu
 * từ mốc `leaveBalanceOn` trở đi (đơn trước mốc đã nằm trong số dư). Chưa có tài khoản phép → null.
 */
export function annualLeaveLeftOf(
  balance: { leaveBalance: number; leaveBalanceOn: string | null; leaveAccount: boolean },
  active: readonly SystemRequest[]
): number | null {
  if (!balance.leaveAccount) return null;
  const used = active
    .filter(
      r =>
        r.type === 'LEAVE' &&
        r.leaveType === 'ANNUAL' &&
        (r.status === 'PENDING' || r.status === 'APPROVED') &&
        (balance.leaveBalanceOn === null || (r.leaveStartDate ?? '') >= balance.leaveBalanceOn)
    )
    .reduce((sum, r) => sum + (r.leaveDaysCount ?? 0), 0);
  return balance.leaveBalance - used;
}
