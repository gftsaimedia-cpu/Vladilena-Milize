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

export class PayslipNotDecidableError extends ConflictError {
  constructor(month: string, status: PeriodStatus) {
    super('Chỉ duyệt phiếu khi kỳ lương đã tính sau chốt công', { code: 'PAYSLIP_NOT_DECIDABLE', status });
  }
}
