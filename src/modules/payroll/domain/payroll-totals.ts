/**
 * Dòng tổng của bảng lương một kỳ: cộng các phiếu của lần chạy hiện tại, theo từng cột của bảng.
 * FE chỉ hiện các số này (không tự cộng). Phiếu lưu trước khi có một trường chi tiết thì trường đó tính 0.
 */

/** Phần của một phiếu đã lưu mà dòng tổng đọc (khớp PayslipRecord). */
export interface TotalsSlip {
  gross: number;
  insurance: number;
  tax: number;
  advance: number;
  net: number;
  details?: {
    baseSalaryActual?: number;
    kpiActualPay?: number;
    totalAllowanceActual?: number;
    otPayTotal?: number;
    lateEarlyDeductionAmount?: number;
  } | null;
}

export interface PayrollTotals {
  count: number;
  baseSalaryActual: number; // cột "Tiền ngày công"
  kpiActualPay: number; // cột "Lương KPI"
  allowance: number; // cột "Phụ cấp"
  otPay: number; // cột "Làm thêm"
  lateDeduction: number; // cột "Trừ giờ", số dương (mỗi phiếu lưu số âm)
  gross: number;
  insurance: number;
  tax: number;
  advance: number;
  deductions: number; // bảo hiểm + thuế + tạm ứng
  net: number;
  netShare: number; // % thực nhận trên tổng thu nhập, làm tròn số nguyên; 0 khi tổng thu nhập 0
}

export function payrollTotalsOf(slips: ReadonlyArray<TotalsSlip>): PayrollTotals {
  const sum = (pick: (s: TotalsSlip) => number | undefined) => slips.reduce((a, s) => a + (Number(pick(s)) || 0), 0);
  const gross = sum(s => s.gross);
  const insurance = sum(s => s.insurance);
  const tax = sum(s => s.tax);
  const advance = sum(s => s.advance);
  const net = sum(s => s.net);
  return {
    count: slips.length,
    baseSalaryActual: sum(s => s.details?.baseSalaryActual),
    kpiActualPay: sum(s => s.details?.kpiActualPay),
    allowance: sum(s => s.details?.totalAllowanceActual),
    otPay: sum(s => s.details?.otPayTotal),
    lateDeduction: sum(s => Math.abs(Number(s.details?.lateEarlyDeductionAmount) || 0)),
    gross,
    insurance,
    tax,
    advance,
    deductions: insurance + tax + advance,
    net,
    netShare: gross ? Math.round((net / gross) * 100) : 0
  };
}
