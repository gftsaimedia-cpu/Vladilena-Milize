import type { AdvanceQuote } from '../../payroll/domain';
import type { DueDay } from '../explanations.service';
import type { FilingKind } from '../requests.service';
import type { ClaimStatus } from './day-status';
import type { HourOption } from './filing-rules';
import type { LeaveType } from './leave-types';
import type { FrameShiftType } from './shift-frames';

/** Một loại đơn trên form: khoá thì `reason` là câu cho nhân viên. */
export interface FilingKindState {
  kind: FilingKind;
  enabled: boolean;
  reason?: string;
}

/** Một tháng trong khoảng nộp đơn (tháng này và tháng sau). */
export interface FilingMonthState {
  month: string;
  closed: boolean;
  /** Tổng phút OT của đơn đang chờ và đã duyệt trong tháng. */
  otMinutes: number;
  otCapMinutes: 2400;
  hasOvertime: boolean;
  hasMakeupLeave: boolean;
}

/** Một ngày trong khoảng nộp đơn. `hours` rỗng khi ngày đang nghỉ. */
export interface FilingDayState {
  date: string;
  workday: boolean;
  shift: { start: string; end: string } | null;
  holiday: string | null;
  claim: { status: ClaimStatus; pending: boolean } | null;
  hours: HourOption[];
}

/** Mọi thứ các form đơn của nhân viên cần trong một lần gọi (spec 2.1). */
export interface RequestContextDTO {
  today: string;
  window: { from: string; to: string };
  kinds: FilingKindState[];
  months: FilingMonthState[];
  leaveTypes: Array<{ code: LeaveType; label: string }>;
  annualLeaveLeft: number | null;
  shiftFrames: Array<{ shiftType: FrameShiftType; start: string; end: string }>;
  days: FilingDayState[];
  explanationDays: DueDay[];
  /** `windowEnd`: ngày cuối nộp tạm ứng của tháng (17); `ordersThisMonth`: số đơn tạm ứng của tháng sau khi nộp (mỗi tháng một đơn). */
  advance: (AdvanceQuote & { month: string; windowEnd: string; ordersThisMonth: number }) | null;
}
