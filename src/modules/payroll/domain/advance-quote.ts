import type { DailyAttendanceLineProps } from './employee-payslip';

/** Tạm ứng bằng 80% lương các ngày công 01–15 của tháng. */
export const ADVANCE_RATE_PCT = 80;
const ADVANCE_RATE = ADVANCE_RATE_PCT / 100;

const PAID_SHIFTS: ReadonlySet<string> = new Set(['NORMAL', 'FLEX', 'NIGHT']);

export interface AdvanceQuote {
  amount: number;
  workDays: number;
  from: string;
  to: string;
}

/**
 * Số tiền được ứng của tháng `month` (YYYY-MM): 80% tổng (lương ngày − trừ đi trễ/sớm) của các dòng ngày 01–15 thuộc ca
 * NORMAL, FLEX hoặc NIGHT có lương ngày. Dòng nghỉ, iSAT hoặc lương ngày 0 không tính.
 */
export function advanceQuoteOf(lines: readonly DailyAttendanceLineProps[], month: string): AdvanceQuote {
  const from = `${month}-01`;
  const to = `${month}-15`;
  const counted = lines.filter(
    line => line.date >= from && line.date <= to && PAID_SHIFTS.has(line.shiftCode) && line.daySalary > 0
  );
  const pay = counted.reduce((sum, line) => sum + (line.daySalary - line.deductionAmount), 0);
  return { amount: Math.round(ADVANCE_RATE * pay), workDays: counted.length, from, to };
}
