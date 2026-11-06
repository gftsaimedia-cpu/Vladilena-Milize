import type { DailyAttendanceLineProps } from './employee-payslip';
import { moneyOf } from './money';

/** Tạm ứng bằng 80% lương các ngày công 01–15 của tháng. */
export const ADVANCE_RATE_PCT = 80;
const ADVANCE_RATE = ADVANCE_RATE_PCT / 100;
const MINUTES_PER_DAY = 8 * 60;

const PAID_SHIFTS: ReadonlySet<string> = new Set(['NORMAL', 'FLEX', 'NIGHT']);

export interface AdvanceQuote {
  amount: number;
  workDays: number;
  from: string;
  to: string;
}

/**
 * Số tiền được ứng của tháng `month` (YYYY-MM): các dòng ngày 01–15 thuộc ca NORMAL, FLEX hoặc NIGHT có lương ngày, trừ
 * phút trễ/sớm của chính các dòng đó. Dòng nghỉ, iSAT hoặc không có lương ngày không tính.
 *
 * Một công thức, làm tròn một lần (D2, giống D1): 80% × (lương cơ bản × Σ payUnits ÷ công chuẩn − lương cơ bản ×
 * (Σ phút trừ ÷ 60) ÷ (công chuẩn × 8)). Không đọc tiền từng ngày đã làm tròn của dòng (`daySalary`, `deductionAmount`).
 * Ví dụ Bình 6.000.000 / 26, 10 ngày công: 0,8 × 6.000.000 × 10 ÷ 26 = 1.846.153,85 → 1.846.154.
 */
export function advanceQuoteOf(
  lines: readonly DailyAttendanceLineProps[],
  month: string,
  baseSalary: number,
  standardWorkdays: number
): AdvanceQuote {
  const from = `${month}-01`;
  const to = `${month}-15`;
  const counted = lines.filter(
    line => line.date >= from && line.date <= to && PAID_SHIFTS.has(line.shiftCode) && line.payUnits > 0
  );
  const payUnits = counted.reduce((sum, line) => sum + line.payUnits, 0);
  const deductionMinutes = counted.reduce((sum, line) => sum + line.deductionMinutes, 0);
  // Days of pay less the deducted minutes as days (480 minutes = one day), in one formula.
  const days = payUnits - deductionMinutes / MINUTES_PER_DAY;
  return { amount: moneyOf(baseSalary, standardWorkdays, days, { rate: ADVANCE_RATE }), workDays: counted.length, from, to };
}
