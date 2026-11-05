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
    netIncome: slip.grossIncome - advance
  };
}
