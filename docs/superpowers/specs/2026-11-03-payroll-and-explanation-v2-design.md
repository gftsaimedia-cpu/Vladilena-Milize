# Payroll V2 (GFT Payslip) & Attendance Explanation V2 Design

**Date:** 2026-11-03  
**Status:** Approved by User  
**Scope:** Parallel implementation of Task 1 (Payroll V2 with GFT Payslip Aggregate) and Task 2 (Attendance Explanation Request & Approval). Sanctions/punitive penalties are postponed.

---

## 1. Context & Business Goal

The user provided the official 2-page canonical payslip from GFT (*Phiếu lương tháng 10/2026*):
- **Page 1:** Daily Attendance Breakdown (*Chấm công tháng 10/2026*): Daily line items showing shift, in/out time, work hours, day pay, allowances (flex/night/off-paid), OT pay, deductions for late/early, daily total, and a summary bar.
- **Page 2:** Monthly Payroll Summary (*Tổng hợp lương*):
  - Block 1: Work days & Base salary (Policy vs Actual).
  - Block 2: Leave & Holiday pay (Paid leave, Leave settlement, Saturday iSAT, Holiday).
  - Block 3: Overtime (OT x1.5, x2, x3 hours & total pay).
  - Block 4: Allowances (Policy vs Actual: Attendance 25%, Travel 15%, Flex 20%, Night bonus 40%/60%, Night Off Paid 37.500 VND/night).
  - Block 5: KPI Pay (5 weighted components: Base Wework 40%, User 24%, Peer 18%, Manager 12%, Self 6%; total score % & actual KPI pay).
  - Block 6: Late / Early deductions (hours and amount).
  - Block 7: Gross to Net deductions (Gross income, Tax-exempt income, Taxable income, Mandatory insurances 10.5%, Income after insurance, PIT, Advance deduction, Net income).
  - Block 8: Remaining annual leave days.

In parallel, **Task 2 (Giải trình chấm công / Attendance Explanation)** enables an employee whose attendance incurs `day_status = 'NEEDS_EXPLANATION'` to submit an explanation request. When approved by admin, `day_status` transitions to `'VALID'`, qualifying the day as a standard work day on the payslip. Sanctions remain deferred.

---

## 2. Core Domain Models

### 2.1 `DailyAttendanceLine`
Represents one line item in the Page 1 attendance table:
```typescript
export interface DailyAttendanceLineProps {
  date: string;                  // YYYY-MM-DD
  dayOfWeekText: string;         // e.g. "Thứ 5, 01/10"
  shiftCode: string;             // 'NORMAL' | 'FLEX' | 'NIGHT' | 'LEAVE' | 'ISAT' | 'UNPAID' | ...
  shiftLabel: string;            // 'Normal', 'Flex +20%', 'Night +40%', 'Nghỉ phép', 'iSAT', 'Không lương'
  inOutText: string;             // "08:00–17:00", "08:15–17:00", "Hưởng lương ngày", "Không tính lương"
  workHours: number;             // e.g. 8, 7.75, 7.67, 0
  daySalary: number;             // Base salary / standardWorkdays
  flexAllowancePay: number;      // e.g. 46.154
  nightAllowancePay: number;     // e.g. 92.308
  offPaidPay: number;            // 37.500 for night shift
  otHours: number;               // e.g. 2, 3
  otPay: number;                 // e.g. 115.385, 173.077
  otNote?: string;               // e.g. "2 giờ, đến 19:00"
  deductionHours: number;        // e.g. 0.25, 0.33
  deductionAmount: number;       // e.g. 7.212, 9.615
  dailyTotal: number;            // daySalary + flexAllowancePay + nightAllowancePay + offPaidPay + otPay - deductionAmount
}
```

### 2.2 `EmployeePayslip` (Aggregate Root)
Encapsulates all calculations matching the GFT Payslip:
```typescript
export class EmployeePayslip {
  // Identity & Terms
  readonly employeeId: string;
  readonly fullName: string;
  readonly positionLevelText: string;     // "NV · Bậc 1"
  readonly contractStatusText: string;    // "HĐLĐ từ 3 tháng"
  readonly month: string;                 // "2026-10"
  readonly standardWorkdays: number;      // 26

  // Page 1 details & summary
  readonly dailyLines: DailyAttendanceLineProps[];
  readonly actualWorkDays: number;        // e.g. 24
  readonly flexShiftCount: number;        // e.g. 3
  readonly nightShiftCount: number;       // e.g. 3
  readonly paidLeaveDays: number;         // e.g. 1
  readonly isatDays: number;              // e.g. 1
  readonly unpaidLeaveDays: number;       // e.g. 1
  readonly holidayPaidDays: number;       // e.g. 0
  readonly totalOtHours: number;          // e.g. 5
  readonly lateEarlyHours: number;        // e.g. 0.58

  // Block 1: Base Salary
  readonly baseSalaryPolicy: number;      // 6.000.000
  readonly baseSalaryActual: number;      // 5.538.462

  // Block 2: Leave & Holiday
  readonly paidLeavePay: number;          // 230.769
  readonly leaveSettlementPay: number;    // 0
  readonly isatPay: number;               // 230.769
  readonly holidayPay: number;            // 0

  // Block 3: Overtime
  readonly ot15Hours: number;             // 0
  readonly ot20Hours: number;             // 5
  readonly ot30Hours: number;             // 0
  readonly otPayTotal: number;            // 288.462

  // Block 4: Allowances (Policy vs Actual)
  readonly attendanceAllowancePolicy: number; // 1.500.000 (25%)
  readonly attendanceAllowanceActual: number; // 1.384.615 (actualWorkDays / standardWorkdays * policy)
  readonly travelAllowancePolicy: number;     // 900.000 (15%)
  readonly travelAllowanceActual: number;     // 830.769 (actualWorkDays / standardWorkdays * policy)
  readonly flexAllowancePolicy: number;       // 1.200.000 (20%)
  readonly flexAllowanceActual: number;       // 138.462 (count * 20% daySalary)
  readonly offPaidNightPolicy: number;        // 975.000
  readonly offPaidNightActual: number;        // 112.500 (count * 37.500)
  readonly nightAllowancePolicy: number;      // 2.400.000 (40%)
  readonly nightAllowanceActual: number;      // 276.923 (count * 40% daySalary)
  readonly totalAllowanceActual: number;      // 2.743.269

  // Block 5: KPI Pay
  readonly kpiScores: {
    wework: number;    // 85%
    user: number;      // 90%
    peer: number;      // 80%
    manager: number;   // 85%
    self: number;      // 90%
  };
  readonly kpiTotalScorePct: number;          // 85.6%
  readonly kpiMaxSalary: number;              // 6.000.000
  readonly kpiActualPay: number;              // 5.136.000

  // Block 6: Late / Early deductions
  readonly lateEarlyDeductionAmount: number;  // -16.827

  // Block 7: Gross to Net
  readonly grossIncome: number;               // 14.150.904
  readonly taxExemptIncome: number;           // 1.003.846
  readonly taxableIncome: number;             // 13.147.058
  readonly insuranceDeduction: number;        // 630.000 (10.5%)
  readonly incomeAfterInsurance: number;      // 13.520.904
  readonly personalIncomeTax: number;         // 0
  readonly advanceDeduction: number;          // 2.025.000
  readonly netIncome: number;                 // 11.495.904

  // Block 8: Balance
  readonly remainingAnnualLeaveDays: number;  // 22
}
```

---

## 3. Explanation Request Workflow (Task 2)

1. **Submission:**
   - When an employee has an attendance record with `day_status = 'NEEDS_EXPLANATION'`, they submit a request of type `'EXPLANATION'` with `work_date`, `reason`, and requested in/out timestamps.
2. **Review:**
   - Admin reviews request via `RequestV2Service.reviewRequest(requestId, 'APPROVE' | 'REJECT', reviewerId, note)`.
   - On **APPROVE**:
     - `system_requests.status` is set to `'APPROVED'`.
     - `timesheet_entries.day_status` for `(employee_id, work_date)` is updated to `'VALID'`.
     - The day becomes a fully valid work day for monthly payroll calculation.
   - On **REJECT**:
     - `system_requests.status` is set to `'REJECTED'`.
     - `timesheet_entries.day_status` remains `'NEEDS_EXPLANATION'` (no punitive monetary fine is charged; sanctions deferred).

---

## 4. Verification & Precision Standard

Calculations must match the sample payslip to within 1 VND across all composite equations:
$$\text{Day Rate} = \frac{\text{Base Salary}}{\text{Standard Workdays}}$$
$$\text{Hour Rate} = \frac{\text{Day Rate}}{8}$$
$$\text{Gross} = \text{BaseActual} + \text{LeavePay} + \text{IsatPay} + \text{OTPay} + \text{TotalAllowances} + \text{KpiPay} - \text{DeductionAmount}$$
$$\text{Net} = \text{Gross} - \text{Insurance} - \text{PIT} - \text{Advance}$$
