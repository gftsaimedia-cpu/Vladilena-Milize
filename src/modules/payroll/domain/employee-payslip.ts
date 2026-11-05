import { PayrollAllowancePolicy, type AllowanceRates } from './allowance-rates';
import { calculateInsurance, InsuranceDeduction } from './insurance';
import { calculateKpiPay, KpiComponent, KpiPay } from './kpi-pay';
import { OT_MULTIPLIERS, type OtRates } from './overtime-pay';
import { calculatePersonalIncomeTax, TaxMethod, type TaxRules } from './personal-income-tax';
import { PayrollWarning } from './payroll-warning';

/**
 * Payroll V2 - GFT Payslip Aggregate Root & Daily Attendance Line Item
 * Implements canonical 2-page payslip calculations matching October 2026 GFT sample.
 */

export interface DailyAttendanceLineProps {
  date: string; // YYYY-MM-DD
  dayOfWeekText: string; // weekday of `date`: 'Thứ 2' ... 'Thứ 7', 'Chủ nhật'
  shiftCode: string; // 'NORMAL' | 'FLEX' | 'NIGHT' | 'LEAVE' | 'ISAT' | 'UNPAID' | ...
  shiftLabel: string; // 'Normal', 'Flex +20%', 'Night +40%', 'Nghỉ phép', 'iSAT', 'Không lương'
  inOutText: string; // real times "08:12–17:05", "08:12–—" when a side is missing, "Hưởng lương ngày", "Không tính lương"
  checkIn?: string | null; // 'HH:MM' Vietnam time, null on LEAVE/ISAT/UNPAID lines
  checkOut?: string | null;
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

// Points 0-100 per component (weighted by the month's KPI weights); null = not entered.
export type KpiScores = Record<KpiComponent, number | null>;

/** OT hours by kind of day; the keys are named after the default rates x1.5 / x2 / x3. */
export interface OtHoursByRate {
  x15?: number; // weekday
  x20?: number; // Saturday or Sunday
  x30?: number; // company holiday
}

/** OT money by kind of day, summed from the day lines (each line rounds each kind once). */
export interface OtPayByRate {
  x15?: number;
  x20?: number;
  x30?: number;
}

/**
 * A HOLIDAY line is paid only when its date falls on one of the person's working weekdays (numbered as in the settings
 * store and getUTCDay: 1 = Monday … 6 = Saturday; Sunday, 0, is never in a week). Without a week every holiday line is
 * paid.
 */
export function paysHoliday(date: string, workWeekdays?: readonly number[]): boolean {
  return !workWeekdays || workWeekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
}

export interface EmployeePayslipProps {
  employeeId: string;
  username?: string; // staff.username; default = employeeId
  fullName: string;
  positionLevelText: string;
  contractStatusText: string;
  month: string; // "YYYY-MM"
  standardWorkdays?: number; // default 26
  baseSalaryPolicy: number; // e.g. 6,000,000
  employeeType?: string;
  level?: number; // staff.level; default 1
  employmentStatus?: 'probation' | 'official' | null; // default null
  nightAllowancePct?: number;
  isDormResident?: boolean;
  allowanceRates?: AllowanceRates | null; // the position version in force; missing = none, no allowance
  makeupWorkDates?: string[];
  dailyLines: DailyAttendanceLineProps[];
  workWeekdays?: readonly number[]; // the person's working weekdays (1 = Mon … 6 = Sat); default: every holiday line is paid
  otHoursByRate?: OtHoursByRate;
  otPayByRate?: OtPayByRate;
  otRates?: OtRates; // the rates the OT was paid at; default OT_MULTIPLIERS
  lateEarlyHours?: number;
  lateEarlyDeductionAmount?: number;
  diligenceLostFromDays?: number; // the attendance allowance is lost from this many absence days; default 5
  kpi?: KpiPay; // default: no KPI pay
  insurance?: InsuranceDeduction; // default: nothing deducted
  taxMethod?: TaxMethod; // default 'none'
  taxRules?: TaxRules; // default DEFAULT_TAX_RULES
  dependants?: number; // default 0
  warnings?: PayrollWarning[];
  advanceDeduction?: number;
  remainingAnnualLeaveDays?: number | null; // null = no leave account; default null
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
  username: string;
  fullName: string;
  positionLevelText: string;
  contractStatusText: string;
  employeeType: string | null;
  level: number;
  employmentStatus: 'probation' | 'official' | null;
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
  ot15Pay: number;
  ot20Pay: number;
  ot30Pay: number;
  otPayTotal: number;
  dayRate: number;
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
  kpiApplicable: boolean;
  kpiScores: KpiScores;
  kpiTotalScorePct: number;
  kpiProposedAmount: number | null;
  kpiAppliedAmount: number;
  kpiMaxSalary: number;
  kpiActualPay: number;
  lateEarlyDeductionAmount: number;
  grossIncome: number;
  taxExemptIncome: number;
  taxableIncome: number;
  insuranceDeduction: number;
  insuranceBreakdown: { bhxh: number; bhyt: number; bhtn: number };
  incomeAfterInsurance: number;
  taxMethod: TaxMethod;
  dependants: number;
  taxAssessableIncome: number;
  personalIncomeTax: number;
  advanceDeduction: number;
  netIncome: number;
  warnings: PayrollWarning[];
  remainingAnnualLeaveDays: number | null;
  dailyLines: DailyAttendanceLineProps[];
}

export class EmployeePayslip {
  // Identity & Terms
  readonly employeeId: string;
  readonly username: string;
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
  readonly employeeType: string | undefined;
  readonly level: number;
  readonly employmentStatus: 'probation' | 'official' | null;
  readonly nightAllowancePct: number;
  readonly isDormResident: boolean;
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
  readonly ot15Pay: number;
  readonly ot20Pay: number;
  readonly ot30Pay: number;
  readonly otPayTotal: number;
  readonly dayRate: number;

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
  readonly kpiApplicable: boolean;
  readonly kpiScores: KpiScores;
  readonly kpiTotalScorePct: number;
  readonly kpiProposedAmount: number | null;
  readonly kpiAppliedAmount: number;
  readonly kpiMaxSalary: number;
  readonly kpiActualPay: number;

  // Block 6: Deductions
  readonly lateEarlyDeductionAmount: number;

  // Block 7: Gross to Net Deductions
  readonly grossIncome: number;
  readonly taxExemptIncome: number;
  readonly taxableIncome: number;
  readonly insuranceDeduction: number;
  readonly insuranceBreakdown: { bhxh: number; bhyt: number; bhtn: number };
  readonly incomeAfterInsurance: number;
  readonly taxMethod: TaxMethod;
  readonly dependants: number;
  readonly taxAssessableIncome: number;
  readonly personalIncomeTax: number;
  readonly advanceDeduction: number;
  readonly netIncome: number;

  // Block 8: Balance
  readonly remainingAnnualLeaveDays: number | null;

  // Data-quality flags raised while the payslip was computed
  readonly warnings: PayrollWarning[];

  constructor(props: EmployeePayslipProps) {
    if (!props.employeeId) throw new Error('employeeId is required');
    if (!props.fullName) throw new Error('fullName is required');
    if (!props.month || !/^\d{4}-\d{2}$/.test(props.month)) {
      throw new Error(`Invalid month format: ${props.month}`);
    }
    if (props.baseSalaryPolicy < 0) throw new Error('baseSalaryPolicy cannot be negative');

    this.employeeId = props.employeeId;
    this.username = props.username ?? props.employeeId;
    this.fullName = props.fullName;
    this.positionLevelText = props.positionLevelText;
    this.contractStatusText = props.contractStatusText;
    this.month = props.month;
    this.standardWorkdays = props.standardWorkdays ?? 26;
    this.baseSalaryPolicy = props.baseSalaryPolicy;
    this.employeeType = props.employeeType;
    this.level = props.level ?? 1;
    this.employmentStatus = props.employmentStatus ?? null;
    this.nightAllowancePct = props.nightAllowancePct ?? (props.employeeType === 'nv' ? 40 : 30);
    this.isDormResident = props.isDormResident ?? false;
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
      } else if (code === 'HOLIDAY' && paysHoliday(line.date, props.workWeekdays)) {
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

    // The pay is measured per day (see overtime-pay.ts); the total is the sum of the day lines.
    this.otPayTotal = this.dailyLines.reduce((sum, line) => sum + line.otPay, 0);
    this.ot15Pay = props.otPayByRate?.x15 ?? 0;
    this.ot20Pay = props.otPayByRate?.x20 ?? 0;
    this.ot30Pay = props.otPayByRate?.x30 ?? 0;
    this.dayRate = Math.round(dayRate);

    // Block 4: Allowances
    // Policy values
    const rates = new PayrollAllowancePolicy(this.employeeType, this.nightAllowancePct, props.allowanceRates);
    this.attendanceAllowancePolicy = Math.round(this.baseSalaryPolicy * rates.attendanceRate);
    this.travelAllowancePolicy = Math.round(this.baseSalaryPolicy * rates.travelRate);
    this.flexAllowancePolicy = Math.round(this.baseSalaryPolicy * rates.flexRate);
    this.offPaidNightPolicy = rates.isKnownType
      ? Math.round(this.standardWorkdays * hourRate * (1 + rates.nightRate))
      : 0;
    this.nightAllowancePolicy = Math.round(this.baseSalaryPolicy * rates.nightRate);

    // Actual values
    const makeupDates = new Set(props.makeupWorkDates ?? []);
    const allowanceWorkDays = Math.max(0, this.actualWorkDays - makeupDates.size);
    const allowanceRatio = allowanceWorkDays / this.standardWorkdays;
    const makeupDays = makeupDates.size;
    const absenceDays = Math.max(0, this.paidLeaveDays + this.unpaidLeaveDays - makeupDays);
    const keepsDiligence = absenceDays < (props.diligenceLostFromDays ?? 5);
    this.attendanceAllowanceActual =
      rates.attendanceRate > 0 && keepsDiligence ? Math.round(allowanceRatio * this.attendanceAllowancePolicy) : 0;
    this.travelAllowanceActual = !this.isDormResident ? Math.round(allowanceRatio * this.travelAllowancePolicy) : 0;
    this.flexAllowanceActual = rates.isKnownType
      ? this.dailyLines.reduce((sum, line) => sum + line.flexAllowancePay, 0)
      : 0;
    this.offPaidNightActual = rates.isKnownType ? this.dailyLines.reduce((sum, line) => sum + line.offPaidPay, 0) : 0;
    this.nightAllowanceActual = rates.isKnownType
      ? this.dailyLines.reduce((sum, line) => sum + line.nightAllowancePay, 0)
      : 0;
    this.totalAllowanceActual =
      this.attendanceAllowanceActual +
      this.travelAllowanceActual +
      this.flexAllowanceActual +
      this.offPaidNightActual +
      this.nightAllowanceActual;

    // Block 5: KPI Pay, computed by calculateKpiPay with the month's weights (default Wework 40%, User 24%, Peer 18%,
    // Manager 12%, Self 6%)
    const kpi = props.kpi ?? calculateKpiPay(null, { applicable: false, kpiMax: null });
    this.kpiApplicable = kpi.applicable;
    this.kpiScores = kpi.scores;
    this.kpiTotalScorePct = kpi.weightedPct;
    this.kpiProposedAmount = kpi.proposedAmount;
    this.kpiAppliedAmount = kpi.appliedAmount;
    this.kpiMaxSalary = kpi.appliedAmount;
    this.kpiActualPay = kpi.amount;

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

    // Tax-exempt part of the pay: the OT premium over the normal hourly rate (rate - 1 of each kind of day: by default
    // 150% -> 50%, 200% -> 100%, 300% -> 200%) plus, for each night line, the lower of 30% of the hourly pay for the
    // hours worked and the night allowance paid that day (a night day without allowance, e.g. a makeup day, exempts
    // nothing).
    const otRates = props.otRates ?? OT_MULTIPLIERS;
    const otExempt = Math.round(
      this.ot15Hours * hourRate * (otRates.weekday - 1) +
        this.ot20Hours * hourRate * (otRates.weekend - 1) +
        this.ot30Hours * hourRate * (otRates.holiday - 1)
    );
    const nightExempt = Math.round(
      this.dailyLines
        .filter(line => line.shiftCode.toUpperCase() === 'NIGHT')
        .reduce((sum, line) => sum + Math.min(line.workHours * hourRate * 0.3, line.nightAllowancePay), 0)
    );
    this.taxExemptIncome = otExempt + nightExempt;

    const insurance = props.insurance ?? calculateInsurance(0, false);
    this.insuranceDeduction = insurance.total;
    this.insuranceBreakdown = { bhxh: insurance.bhxh, bhyt: insurance.bhyt, bhtn: insurance.bhtn };
    this.incomeAfterInsurance = this.grossIncome - this.insuranceDeduction;

    this.taxMethod = props.taxMethod ?? 'none';
    this.dependants = props.dependants ?? 0;
    const tax = calculatePersonalIncomeTax(
      {
        method: this.taxMethod,
        grossIncome: this.grossIncome,
        exemptIncome: this.taxExemptIncome,
        insurance: this.insuranceDeduction,
        dependants: this.dependants
      },
      props.taxRules
    );
    this.taxableIncome = tax.taxableIncome;
    this.taxAssessableIncome = tax.assessableIncome;
    this.personalIncomeTax = tax.tax;
    this.advanceDeduction = props.advanceDeduction ?? 0;

    this.netIncome = this.grossIncome - this.insuranceDeduction - this.personalIncomeTax - this.advanceDeduction;

    // Block 8: Balance
    this.remainingAnnualLeaveDays = props.remainingAnnualLeaveDays ?? null;

    this.warnings = [...(props.warnings ?? [])];
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
      username: this.username,
      fullName: this.fullName,
      positionLevelText: this.positionLevelText,
      contractStatusText: this.contractStatusText,
      employeeType: this.employeeType ?? null,
      level: this.level,
      employmentStatus: this.employmentStatus,
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
      ot15Pay: this.ot15Pay,
      ot20Pay: this.ot20Pay,
      ot30Pay: this.ot30Pay,
      otPayTotal: this.otPayTotal,
      dayRate: this.dayRate,
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
      kpiApplicable: this.kpiApplicable,
      kpiScores: this.kpiScores,
      kpiTotalScorePct: this.kpiTotalScorePct,
      kpiProposedAmount: this.kpiProposedAmount,
      kpiAppliedAmount: this.kpiAppliedAmount,
      kpiMaxSalary: this.kpiMaxSalary,
      kpiActualPay: this.kpiActualPay,
      lateEarlyDeductionAmount: this.lateEarlyDeductionAmount,
      grossIncome: this.grossIncome,
      taxExemptIncome: this.taxExemptIncome,
      taxableIncome: this.taxableIncome,
      insuranceDeduction: this.insuranceDeduction,
      insuranceBreakdown: this.insuranceBreakdown,
      incomeAfterInsurance: this.incomeAfterInsurance,
      taxMethod: this.taxMethod,
      dependants: this.dependants,
      taxAssessableIncome: this.taxAssessableIncome,
      personalIncomeTax: this.personalIncomeTax,
      advanceDeduction: this.advanceDeduction,
      netIncome: this.netIncome,
      warnings: this.warnings,
      remainingAnnualLeaveDays: this.remainingAnnualLeaveDays,
      dailyLines: this.dailyLines
    };
  }
}
