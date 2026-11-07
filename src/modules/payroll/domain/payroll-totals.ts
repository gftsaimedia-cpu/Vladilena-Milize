/**
 * Dòng tổng của bảng lương một kỳ: cộng các phiếu của lần chạy hiện tại, theo từng cột của bảng.
 * FE chỉ hiện các số này (không tự cộng). Phiếu lưu trước khi có một trường chi tiết thì trường đó tính 0.
 */

/** Phần của một phiếu đã lưu mà dòng tổng đọc (khớp PayslipRecord). */
export interface TotalsSlip {
  /** Trạng thái phiếu: 'draft', 'approved' / 'final' (đã duyệt), 'rejected'. */
  status?: string;
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

/** Số phiếu theo trạng thái cho các thẻ lọc của bảng lương (phiếu đã duyệt gồm cả 'final'). */
export interface SlipStatusCounts {
  all: number;
  draft: number;
  approved: number;
  rejected: number;
}

export interface PayrollTotals {
  count: number;
  statusCounts: SlipStatusCounts;
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
  const statusCount = (...names: string[]) => slips.filter(s => names.includes(String(s.status))).length;
  return {
    count: slips.length,
    // Nháp là mọi phiếu chưa được duyệt hay từ chối (kể cả trạng thái lạ), nên bốn số cộng lại bằng `all`.
    statusCounts: {
      all: slips.length,
      draft: slips.length - statusCount('approved', 'final') - statusCount('rejected'),
      approved: statusCount('approved', 'final'),
      rejected: statusCount('rejected')
    },
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
