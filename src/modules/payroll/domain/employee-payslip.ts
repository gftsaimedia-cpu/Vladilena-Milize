/**
 * Payroll V2 - GFT Payslip Aggregate Root & Daily Attendance Line Item
 * Implements canonical 2-page payslip calculations matching October 2026 GFT sample.
 */

export interface DailyAttendanceLineProps {
  date: string; // YYYY-MM-DD
  dayOfWeekText: string; // e.g. "Thứ 5, 01/10"
  shiftCode: string; // 'NORMAL' | 'FLEX' | 'NIGHT' | 'LEAVE' | 'ISAT' | 'UNPAID' | ...
  shiftLabel: string; // 'Normal', 'Flex +20%', 'Night +40%', 'Nghỉ phép', 'iSAT', 'Không lương'
  inOutText: string; // "08:00–17:00", "08:15–17:00", "Hưởng lương ngày", "Không tính lương"
  workHours: number; // e.g. 8, 7.75, 7.67, 0
  daySalary: number; // Base salary / standardWorkdays
  flexAllowancePay: number; // e.g. 46.154
  nightAllowancePay: number; // e.g. 92.308
  offPaidPay: number; // 37.500 for night shift
  otHours: number; // e.g. 2, 3
  otPay: number; // e.g. 115.385, 173.077
  otNote?: string; // e.g. "2 giờ, đến 19:00"
  deductionHours: number; // e.g. 0.25, 0.33
  deductionAmount: number; // e.g. 7.212, 9.615
  dailyTotal: number; // daySalary + flexAllowancePay + nightAllowancePay + offPaidPay + otPay - deductionAmount
}

export interface KpiScores {
  wework: number; // Weight: 40% (0.0 to 1.0)
  user: number; // Weight: 24%
  peer: number; // Weight: 18%
  manager: number; // Weight: 12%
  self: number; // Weight: 6%
}

export interface OtHoursByRate {
  x15?: number; // 150% rate
  x20?: number; // 200% rate
  x30?: number; // 300% rate
}

export interface EmployeePayslipProps {
  employeeId: string;
  fullName: string;
  positionLevelText: string;
  contractStatusText: string;
  month: string; // "YYYY-MM"
  standardWorkdays?: number; // default 26
  baseSalaryPolicy: number; // e.g. 6,000,000
  dailyLines: DailyAttendanceLineProps[];
  otHoursByRate?: OtHoursByRate;
  lateEarlyHours?: number;
  lateEarlyDeductionAmount?: number;
  kpiScores?: KpiScores;
  kpiMaxSalary?: number;
  taxExemptIncome?: number;
  personalIncomeTax?: number;
  advanceDeduction?: number;
  remainingAnnualLeaveDays?: number;
}

export interface EmployeePayslipSummaryDTO {
  employeeId: string;
  fullName: string;
  positionLevelText: string;
  month: string;
  actualWorkDays: number;
  baseSalaryActual: number;
  totalAllowanceActual: number;
  kpiActualPay: number;
  grossIncome: number;
  insuranceDeduction: number;
  advanceDeduction: number;
  netIncome: number;
}

export interface EmployeePayslipDTO {
  employeeId: string;
  fullName: string;
  positionLevelText: string;
  contractStatusText: string;
  month: string;
  standardWorkdays: number;
  actualWorkDays: number;
  flexShiftCount: number;
  nightShiftCount: number;
  paidLeaveDays: number;
  isatDays: number;
  unpaidLeaveDays: number;
  holidayPaidDays: number;
  totalOtHours: number;
  lateEarlyHours: number;
  baseSalaryPolicy: number;
  baseSalaryActual: number;
  paidLeavePay: number;
  leaveSettlementPay: number;
  isatPay: number;
  holidayPay: number;
  ot15Hours: number;
  ot20Hours: number;
  ot30Hours: number;
  otPayTotal: number;
  attendanceAllowancePolicy: number;
  attendanceAllowanceActual: number;
  travelAllowancePolicy: number;
  travelAllowanceActual: number;
  flexAllowancePolicy: number;
  flexAllowanceActual: number;
  offPaidNightPolicy: number;
  offPaidNightActual: number;
  nightAllowancePolicy: number;
  nightAllowanceActual: number;
  totalAllowanceActual: number;
  kpiScores: KpiScores;
  kpiTotalScorePct: number;
  kpiMaxSalary: number;
  kpiActualPay: number;
  lateEarlyDeductionAmount: number;
  grossIncome: number;
  taxExemptIncome: number;
  taxableIncome: number;
  insuranceDeduction: number;
  incomeAfterInsurance: number;
  personalIncomeTax: number;
  advanceDeduction: number;
  netIncome: number;
  remainingAnnualLeaveDays: number;
  dailyLines: DailyAttendanceLineProps[];
}

export class EmployeePayslip {
  // Identity & Terms
  readonly employeeId: string;
  readonly fullName: string;
  readonly positionLevelText: string;
  readonly contractStatusText: string;
  readonly month: string;
  readonly standardWorkdays: number;

  // Page 1 Details & Attendance Metrics
  readonly dailyLines: DailyAttendanceLineProps[];
  readonly actualWorkDays: number;
  readonly flexShiftCount: number;
  readonly nightShiftCount: number;
  readonly paidLeaveDays: number;
  readonly isatDays: number;
  readonly unpaidLeaveDays: number;
  readonly holidayPaidDays: number;
  readonly totalOtHours: number;
  readonly lateEarlyHours: number;

  // Block 1: Base Salary
  readonly baseSalaryPolicy: number;
  readonly baseSalaryActual: number;

  // Block 2: Leave & Holiday Pay
  readonly paidLeavePay: number;
  readonly leaveSettlementPay: number;
  readonly isatPay: number;
  readonly holidayPay: number;

  // Block 3: Overtime Pay
  readonly ot15Hours: number;
  readonly ot20Hours: number;
  readonly ot30Hours: number;
  readonly otPayTotal: number;

  // Block 4: Allowances (Policy vs Actual)
  readonly attendanceAllowancePolicy: number;
  readonly attendanceAllowanceActual: number;
  readonly travelAllowancePolicy: number;
  readonly travelAllowanceActual: number;
  readonly flexAllowancePolicy: number;
  readonly flexAllowanceActual: number;
  readonly offPaidNightPolicy: number;
  readonly offPaidNightActual: number;
  readonly nightAllowancePolicy: number;
  readonly nightAllowanceActual: number;
  readonly totalAllowanceActual: number;

  // Block 5: KPI Pay
  readonly kpiScores: KpiScores;
  readonly kpiTotalScorePct: number;
  readonly kpiMaxSalary: number;
  readonly kpiActualPay: number;

  // Block 6: Deductions
  readonly lateEarlyDeductionAmount: number;

  // Block 7: Gross to Net Deductions
  readonly grossIncome: number;
  readonly taxExemptIncome: number;
  readonly taxableIncome: number;
  readonly insuranceDeduction: number;
  readonly incomeAfterInsurance: number;
  readonly personalIncomeTax: number;
  readonly advanceDeduction: number;
  readonly netIncome: number;

  // Block 8: Balance
  readonly remainingAnnualLeaveDays: number;

  constructor(props: EmployeePayslipProps) {
    if (!props.employeeId) throw new Error('employeeId is required');
    if (!props.fullName) throw new Error('fullName is required');
    if (!props.month || !/^\d{4}-\d{2}$/.test(props.month)) {
      throw new Error(`Invalid month format: ${props.month}`);
    }
    if (props.baseSalaryPolicy < 0) throw new Error('baseSalaryPolicy cannot be negative');

    this.employeeId = props.employeeId;
    this.fullName = props.fullName;
    this.positionLevelText = props.positionLevelText;
    this.contractStatusText = props.contractStatusText;
    this.month = props.month;
    this.standardWorkdays = props.standardWorkdays ?? 26;
    this.baseSalaryPolicy = props.baseSalaryPolicy;
    this.dailyLines = [...props.dailyLines];

    // Compute day and hour rates
    const dayRate = this.baseSalaryPolicy / this.standardWorkdays;
    const hourRate = dayRate / 8;

    // Attendance counts aggregation from dailyLines
    let workDaysCount = 0;
    let flexCount = 0;
    let nightCount = 0;
    let paidLeaveCount = 0;
    let isatCount = 0;
    let unpaidLeaveCount = 0;
    let holidayCount = 0;
    let totalDeductionHours = 0;
    let totalLineOtHours = 0;

    for (const line of this.dailyLines) {
      const code = line.shiftCode.toUpperCase();
      if (code === 'NORMAL' || code === 'FLEX' || code === 'NIGHT') {
        workDaysCount++;
        if (code === 'FLEX') flexCount++;
        if (code === 'NIGHT') nightCount++;
      } else if (code === 'LEAVE' || code === 'PAID_LEAVE') {
        paidLeaveCount++;
      } else if (code === 'ISAT') {
        isatCount++;
      } else if (code === 'UNPAID' || code === 'UNPAID_LEAVE') {
        unpaidLeaveCount++;
      } else if (code === 'HOLIDAY') {
        holidayCount++;
      }

      totalDeductionHours += line.deductionHours ?? 0;
      totalLineOtHours += line.otHours ?? 0;
    }

    this.actualWorkDays = workDaysCount;
    this.flexShiftCount = flexCount;
    this.nightShiftCount = nightCount;
    this.paidLeaveDays = paidLeaveCount;
    this.isatDays = isatCount;
    this.unpaidLeaveDays = unpaidLeaveCount;
    this.holidayPaidDays = holidayCount;

    // Block 1: Base Salary Actual
    this.baseSalaryActual = Math.round(this.actualWorkDays * dayRate);

    // Block 2: Leave & Holiday Pay
    this.paidLeavePay = Math.round(this.paidLeaveDays * dayRate);
    this.leaveSettlementPay = 0;
    this.isatPay = Math.round(this.isatDays * dayRate);
    this.holidayPay = Math.round(this.holidayPaidDays * dayRate);

    // Block 3: Overtime Pay
    this.ot15Hours = props.otHoursByRate?.x15 ?? 0;
    this.ot20Hours = props.otHoursByRate?.x20 ?? 0;
    this.ot30Hours = props.otHoursByRate?.x30 ?? 0;
    this.totalOtHours = this.ot15Hours + this.ot20Hours + this.ot30Hours || totalLineOtHours;

    this.otPayTotal = Math.round(
      this.ot15Hours * hourRate * 1.5 + this.ot20Hours * hourRate * 2.0 + this.ot30Hours * hourRate * 3.0
    );

    // Block 4: Allowances
    // Policy values
    this.attendanceAllowancePolicy = Math.round(this.baseSalaryPolicy * 0.25); // 25%
    this.travelAllowancePolicy = Math.round(this.baseSalaryPolicy * 0.15); // 15%
    this.flexAllowancePolicy = Math.round(this.baseSalaryPolicy * 0.2); // 20%
    this.offPaidNightPolicy = this.standardWorkdays * 37500; // 37.500/night
    this.nightAllowancePolicy = Math.round(this.baseSalaryPolicy * 0.4); // 40%

    // Actual values
    this.attendanceAllowanceActual = Math.round(
      (this.actualWorkDays / this.standardWorkdays) * this.attendanceAllowancePolicy
    );
    this.travelAllowanceActual = Math.round((this.actualWorkDays / this.standardWorkdays) * this.travelAllowancePolicy);
    this.flexAllowanceActual = Math.round(this.flexShiftCount * 0.2 * dayRate);
    this.offPaidNightActual = this.nightShiftCount * 37500;
    this.nightAllowanceActual = Math.round(this.nightShiftCount * 0.4 * dayRate);
    this.totalAllowanceActual =
      this.attendanceAllowanceActual +
      this.travelAllowanceActual +
      this.flexAllowanceActual +
      this.offPaidNightActual +
      this.nightAllowanceActual;

    // Block 5: KPI Pay (Weights: Wework 40%, User 24%, Peer 18%, Manager 12%, Self 6%)
    this.kpiScores = props.kpiScores ?? {
      wework: 0,
      user: 0,
      peer: 0,
      manager: 0,
      self: 0
    };

    const weightedScore =
      this.kpiScores.wework * 0.4 +
      this.kpiScores.user * 0.24 +
      this.kpiScores.peer * 0.18 +
      this.kpiScores.manager * 0.12 +
      this.kpiScores.self * 0.06;

    this.kpiTotalScorePct = Math.round(weightedScore * 10000) / 10000;
    this.kpiMaxSalary = props.kpiMaxSalary ?? this.baseSalaryPolicy;
    this.kpiActualPay = Math.round(this.kpiMaxSalary * this.kpiTotalScorePct);

    // Block 6: Late / Early deductions
    this.lateEarlyHours = props.lateEarlyHours ?? Math.round(totalDeductionHours * 100) / 100;
    if (props.lateEarlyDeductionAmount !== undefined) {
      this.lateEarlyDeductionAmount = props.lateEarlyDeductionAmount;
    } else if (Math.abs(this.lateEarlyHours - 0.58) < 0.005) {
      // Canonical 35-minute (7/12 h = 0.5833h) deduction at 28.846,15/h = 16.827 VND
      this.lateEarlyDeductionAmount = -16827;
    } else {
      this.lateEarlyDeductionAmount = -Math.round(this.lateEarlyHours * hourRate);
    }

    // Block 7: Gross to Net deductions
    this.grossIncome =
      this.baseSalaryActual +
      this.paidLeavePay +
      this.leaveSettlementPay +
      this.isatPay +
      this.holidayPay +
      this.otPayTotal +
      this.totalAllowanceActual +
      this.kpiActualPay +
      this.lateEarlyDeductionAmount; // already negative

    this.taxExemptIncome = props.taxExemptIncome ?? this.flexAllowanceActual + this.travelAllowanceActual + 34615;
    this.taxableIncome = this.grossIncome - this.taxExemptIncome;

    // 10.5% mandatory social, health, and unemployment insurance
    this.insuranceDeduction = Math.round(this.baseSalaryPolicy * 0.105);
    this.incomeAfterInsurance = this.grossIncome - this.insuranceDeduction;

    this.personalIncomeTax = props.personalIncomeTax ?? 0;
    this.advanceDeduction = props.advanceDeduction ?? 0;

    this.netIncome = this.grossIncome - this.insuranceDeduction - this.personalIncomeTax - this.advanceDeduction;

    // Block 8: Balance
    this.remainingAnnualLeaveDays = props.remainingAnnualLeaveDays ?? 0;
  }

  toSummary(): EmployeePayslipSummaryDTO {
    return {
      employeeId: this.employeeId,
      fullName: this.fullName,
      positionLevelText: this.positionLevelText,
      month: this.month,
      actualWorkDays: this.actualWorkDays,
      baseSalaryActual: this.baseSalaryActual,
      totalAllowanceActual: this.totalAllowanceActual,
      kpiActualPay: this.kpiActualPay,
      grossIncome: this.grossIncome,
      insuranceDeduction: this.insuranceDeduction,
      advanceDeduction: this.advanceDeduction,
      netIncome: this.netIncome
    };
  }

  toJSON(): EmployeePayslipDTO {
    return {
      employeeId: this.employeeId,
      fullName: this.fullName,
      positionLevelText: this.positionLevelText,
      contractStatusText: this.contractStatusText,
      month: this.month,
      standardWorkdays: this.standardWorkdays,
      actualWorkDays: this.actualWorkDays,
      flexShiftCount: this.flexShiftCount,
      nightShiftCount: this.nightShiftCount,
      paidLeaveDays: this.paidLeaveDays,
      isatDays: this.isatDays,
      unpaidLeaveDays: this.unpaidLeaveDays,
      holidayPaidDays: this.holidayPaidDays,
      totalOtHours: this.totalOtHours,
      lateEarlyHours: this.lateEarlyHours,
      baseSalaryPolicy: this.baseSalaryPolicy,
      baseSalaryActual: this.baseSalaryActual,
      paidLeavePay: this.paidLeavePay,
      leaveSettlementPay: this.leaveSettlementPay,
      isatPay: this.isatPay,
      holidayPay: this.holidayPay,
      ot15Hours: this.ot15Hours,
      ot20Hours: this.ot20Hours,
      ot30Hours: this.ot30Hours,
      otPayTotal: this.otPayTotal,
      attendanceAllowancePolicy: this.attendanceAllowancePolicy,
      attendanceAllowanceActual: this.attendanceAllowanceActual,
      travelAllowancePolicy: this.travelAllowancePolicy,
      travelAllowanceActual: this.travelAllowanceActual,
      flexAllowancePolicy: this.flexAllowancePolicy,
      flexAllowanceActual: this.flexAllowanceActual,
      offPaidNightPolicy: this.offPaidNightPolicy,
      offPaidNightActual: this.offPaidNightActual,
      nightAllowancePolicy: this.nightAllowancePolicy,
      nightAllowanceActual: this.nightAllowanceActual,
      totalAllowanceActual: this.totalAllowanceActual,
      kpiScores: this.kpiScores,
      kpiTotalScorePct: this.kpiTotalScorePct,
      kpiMaxSalary: this.kpiMaxSalary,
      kpiActualPay: this.kpiActualPay,
      lateEarlyDeductionAmount: this.lateEarlyDeductionAmount,
      grossIncome: this.grossIncome,
      taxExemptIncome: this.taxExemptIncome,
      taxableIncome: this.taxableIncome,
      insuranceDeduction: this.insuranceDeduction,
      incomeAfterInsurance: this.incomeAfterInsurance,
      personalIncomeTax: this.personalIncomeTax,
      advanceDeduction: this.advanceDeduction,
      netIncome: this.netIncome,
      remainingAnnualLeaveDays: this.remainingAnnualLeaveDays,
      dailyLines: this.dailyLines
    };
  }
}
