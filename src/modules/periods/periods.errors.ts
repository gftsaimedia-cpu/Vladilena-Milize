import { BadRequestError, ConflictError } from '../../common';
import { approveReason, monthLabel, STATUS_LABEL } from './domain';
import type { ApproveBlockers, PeriodStatus } from './domain';

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

export class PeriodLockedError extends ConflictError {
  constructor(month: string, status: PeriodStatus) {
    const label = monthLabel(month);
    const message =
      status === 'approved'
        ? `Kỳ lương tháng ${label} đã phê duyệt`
        : status === 'paid'
          ? `Kỳ lương tháng ${label} đã trả lương`
          : `Tháng ${label} đã chốt công`;
    super(message, { code: 'PERIOD_LOCKED', month, status });
  }
}

/** Tháng trước phiên bản cài đặt đầu tiên: không có ngày trả lương, nên không có kỳ lương (400 thay vì 500). */
export class NoSettingsError extends BadRequestError {
  constructor(month: string) {
    super(`Tháng ${monthLabel(month)} chưa có cài đặt lương`, { code: 'NO_SETTINGS', month });
  }
}

export class PeriodStateError extends ConflictError {
  constructor(month: string, status: PeriodStatus) {
    super(`Kỳ lương tháng ${monthLabel(month)} đang ở bước "${STATUS_LABEL[status]}", không làm được thao tác này`, {
      code: 'PERIOD_STATE',
      month,
      status,
    });
  }
}

export class MonthNotEndedError extends ConflictError {
  constructor(month: string) {
    super(`Tháng ${monthLabel(month)} chưa kết thúc, chưa chốt công được`, { code: 'MONTH_NOT_ENDED' });
  }
}

export class BeforePaydayError extends ConflictError {
  constructor(month: string, payday: string) {
    super(`Chưa tới ngày trả lương ${dayLabel(payday)}`, { code: 'BEFORE_PAYDAY', payday });
  }
}

export class PeriodBlockedError extends ConflictError {
  constructor(month: string, blockers: ApproveBlockers) {
    super(approveReason(blockers) ?? 'Kỳ lương còn vướng', { code: 'PERIOD_BLOCKED', blockers });
  }
}

export class ReasonRequiredError extends BadRequestError {
  constructor() {
    super('Cần ghi lý do', { code: 'REASON_REQUIRED' });
  }
}

/** Lý do dài hơn `max` ký tự (sau khi cắt khoảng trắng hai đầu); nhật ký không nhận lý do dài hơn 1000 ký tự. */
export class ReasonTooLongError extends BadRequestError {
  constructor(max: number) {
    super(`Lý do tối đa ${max} ký tự`, { code: 'REASON_TOO_LONG' });
  }
}

/** Lý do có ký tự nhật ký không lưu được (NUL). */
export class ReasonInvalidError extends BadRequestError {
  constructor() {
    super('Lý do chứa ký tự không hợp lệ', { code: 'REASON_INVALID' });
  }
}

export class PayslipNotDecidableError extends ConflictError {
  constructor(month: string, status: PeriodStatus) {
    super('Chỉ duyệt phiếu khi kỳ lương đã tính sau chốt công', { code: 'PAYSLIP_NOT_DECIDABLE', status });
  }
}
