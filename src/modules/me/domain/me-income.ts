import type { EmployeePayslipDTO } from '../../payroll/domain';

// Thu nhập tạm tính của nhân viên (luật chốt 05/11/2026): chỉ cộng tiền những ngày đã qua, không trừ bảo hiểm và thuế
// TNCN — hai khoản này chỉ tính khi chốt kỳ. Tạm ứng đã duyệt vẫn trừ vì là tiền đã nhận. Phiếu chính thức và bảng lương
// của Admin không qua hàm này.
export function estimateIncomeOf(slip: EmployeePayslipDTO): EmployeePayslipDTO {
  const advance = slip.advanceDeduction || 0;
  return {
    ...slip,
    insuranceDeduction: 0,
    insuranceBreakdown: { bhxh: 0, bhyt: 0, bhtn: 0 },
    incomeAfterInsurance: slip.grossIncome,
    personalIncomeTax: 0,
    deductionTotal: advance,
    netIncome: slip.grossIncome - advance
  };
}

/** Năm phần điểm KPI theo thứ tự hiển thị (khoá trong `kpiScores` của phiếu và nhãn trên màn nhân viên). */
export const KPI_PARTS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'wework', label: 'Wework' },
  { key: 'user', label: 'Người dùng' },
  { key: 'peer', label: 'Đồng nghiệp' },
  { key: 'manager', label: 'Quản lý' },
  { key: 'self', label: 'Tự đánh giá' }
];

type LeaveFields = Partial<Pick<EmployeePayslipDTO, 'paidLeavePay' | 'leaveSettlementPay' | 'isatPay' | 'holidayPay'>>;

/** Tiền nghỉ phép + quyết toán phép + iSAT + lương lễ: dòng "Nghỉ phép, iSAT" của màn Thu nhập, BE cộng sẵn để FE chỉ hiện. */
export function leaveIncomePayOf(slip: LeaveFields | null | undefined): number {
  if (!slip) return 0;
  return (slip.paidLeavePay || 0) + (slip.leaveSettlementPay || 0) + (slip.isatPay || 0) + (slip.holidayPay || 0);
}
