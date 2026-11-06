import type { AttendanceDayStatus } from '../../attendance/domain/attendance-day';
import { PayrollAllowancePolicy, shiftHoursOf, type AllowanceRates } from './allowance-rates';
import { calculateInsurance, DEFAULT_INSURANCE_RATES, insurancePctOf, InsuranceDeduction, type InsurancePct } from './insurance';
import { calculateKpiPay, KPI_WEIGHTS, KpiComponent, KpiPay } from './kpi-pay';
import { makeupShortfallDays } from './makeup-shortfall';
import { moneyOf, type MoneyOptions } from './money';
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
  // PRESENT/ABSENT: the shift type 'NORMAL' | 'FLEX' | 'NIGHT'; else 'LEAVE' | 'UNPAID' | 'MAKEUP_LEAVE' | 'ISAT' |
  // 'HOLIDAY' | 'EXTRA'
  shiftCode: string;
  shiftLabel: string; // 'Normal', 'Flex +20%', 'Night +40%', 'Nghỉ phép', 'iSAT', 'Không lương', 'Lễ', ...
  inOutText: string; // real times "08:12–17:05", "08:12–—" when a side is missing, "Hưởng lương ngày", "Không tính lương"
  checkIn?: string | null; // 'HH:MM' Vietnam time, null on LEAVE/ISAT/UNPAID lines
  checkOut?: string | null;
  workHours: number; // e.g. 8, 7.75, 7.67, 0
  // The money of the day below (daySalary ... dailyTotal, makeupPay) is DISPLAY ONLY, each rounded on its own line. The
  // payslip items and the advance never read it: they are one formula on the quantities (payUnits, workHours, the
  // minutes, the OT hours), rounded once (D1, D2; see money.ts).
  daySalary: number; // payUnits x base salary / standardWorkdays
  flexAllowancePay: number; // e.g. 46.154
  nightAllowancePay: number; // e.g. 92.308
  offPaidPay: number; // 37.500 for night shift
  otHours: number; // e.g. 2, 3
  otPay: number; // e.g. 115.385, 173.077
  otNote?: string; // e.g. "2 giờ, đến 19:00"
  deductionHours: number; // the row's deduction minutes / 60 rounded to 2 decimals, display only, e.g. 0.5
  deductionMinutes: number; // the row's deduction minutes, exact, e.g. 30
  deductionAmount: number; // e.g. 14.423
  // daySalary + flexAllowancePay + nightAllowancePay + offPaidPay + otPay + makeupPay - deductionAmount
  dailyTotal: number;
  // The day row the line was read from (spec 8.1); the payslip counts by these, never by shiftCode.
  kind: AttendanceDayStatus;
  payUnits: number; // 0 or 1 day of pay
  countsAsWorkday: boolean;
  countsAsDayOff: boolean; // a day off for the attendance allowance
  makeupMinutes: number; // minutes worked inside the approved makeup windows of the day (L14)
  makeupPay: number; // makeupMinutes / 60 x hourly rate, display only
}

/** The rates a payslip was computed with (the month's settings), so a reader prints them instead of hard-coding. */
export interface PayslipRates {
  kpiWeights: Record<KpiComponent, number>; // % of the KPI pay per component, sum 100
  insurancePct: InsurancePct; // bhxh 8, bhyt 1.5, bhtn 1, total 10.5
  otMultipliers: OtRates; // weekday 1.5, weekend 2, holiday 3
  lateGraceMinutes: number; // a late check-in within this many minutes is not deducted
}

/** What a calendar day of the month shows on the payslip strip. */
export type PayslipDayKind = 'work' | 'leave' | 'isat' | 'unpaid' | 'rest' | 'future';
export interface PayslipDay {
  date: string; // YYYY-MM-DD
  kind: PayslipDayKind;
}

/** The default rates, for a payslip built without the month's settings. */
export const DEFAULT_LATE_GRACE_MINUTES = 15;

// Points 0-100 per component (weighted by the month's KPI weights); null = not entered.
export type KpiScores = Record<KpiComponent, number | null>;

/** OT hours by kind of day; the keys are named after the default rates x1.5 / x2 / x3. */
export interface OtHoursByRate {
  x15?: number; // weekday
  x20?: number; // Saturday or Sunday
  x30?: number; // company holiday
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
  dailyLines: DailyAttendanceLineProps[];
  otHoursByRate?: OtHoursByRate; // exact hours by kind of day; the OT pay of each kind is one formula on them
  otRates?: OtRates; // the rates the OT was paid at; default OT_MULTIPLIERS
  rates?: Omit<PayslipRates, 'otMultipliers'>; // default: the domain defaults; otMultipliers always follow otRates
  calendar?: PayslipDay[]; // one entry per day of the month for the strip; default none
  lateMinutes?: number; // minutes of late check-in beyond the grace, summed over the lines; default 0
  lateEarlyHours?: number; // display only (2 decimals); default the lines' deduction minutes / 60
  diligenceLostFromDays?: number; // the attendance allowance is lost from this many absence days; default 5
  /** Work minutes of the approved makeup windows that have not ended yet (D10): they count as made up for the diligence
   * shortfall only, never for pay. Default 0 (a month that is over has none). */
  plannedMakeupMinutes?: number;
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
  makeupPay: number;
  workPay: number;
  lateMinutes: number;
  rates: PayslipRates;
  calendar: PayslipDay[];
  deductionTotal: number;
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
  readonly makeupPay: number; // base x (the month's makeup minutes / 60) / (std x 8), rounded once (L14, D1)
  // Pay for the days worked and the paid days off: base + paid leave + settlement + iSAT + holiday (no makeup, OT, allowances).
  readonly workPay: number;

  // The month's rates and the late minutes beyond the grace, for the printed labels and notes.
  readonly rates: PayslipRates;
  readonly lateMinutes: number;
  readonly calendar: PayslipDay[];

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
  readonly deductionTotal: number; // insurance + income tax + advance
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

    // Compute day and hour rates (exact; only the tax exemption and the policy figures use them directly)
    const dayRate = this.baseSalaryPolicy / this.standardWorkdays;
    const hourRate = dayRate / 8;
    const rates = new PayrollAllowancePolicy(this.employeeType, this.nightAllowancePct, props.allowanceRates);
    const otRates = props.otRates ?? OT_MULTIPLIERS;
    // D1: every money item below is one formula on the base salary and an unrounded quantity, rounded once (money.ts).
    const pay = (quantity: number, opts?: MoneyOptions) =>
      moneyOf(this.baseSalaryPolicy, this.standardWorkdays, quantity, opts);

    // Attendance counts from the day-row fields of the lines (spec 8.1), never from the shift code. The quantities are
    // read from the lines; their money (daySalary, flexAllowancePay, ...) is display only and never summed.
    let workDaysCount = 0;
    let flexCount = 0;
    let nightCount = 0;
    let paidLeaveCount = 0;
    let isatCount = 0;
    let unpaidLeaveCount = 0;
    let holidayCount = 0;
    let dayOffCount = 0;
    let makeupLeaveCount = 0;
    let makeupMinutes = 0;
    let deductionMinutes = 0;
    let flexHours = 0; // Σ min(8, shift hours) of the flex work days (shift hours = workHours - makeup, D13)
    let nightBreakHours = 0; // Σ the exact night break pay of the night work days, in hours of pay
    let nightExemptHours = 0; // Σ min(30% of the hours worked, the night allowance in hours) of the night work days

    for (const line of this.dailyLines) {
      if (line.countsAsWorkday) {
        workDaysCount++;
        // D13: the makeup minutes of the line are paid x1 on their own; the premiums read the shift hours only.
        const shiftHours = shiftHoursOf(line.workHours, line.makeupMinutes);
        if (line.shiftCode === 'FLEX') {
          flexCount++;
          flexHours += rates.flexHours(shiftHours);
        }
        if (line.shiftCode === 'NIGHT') {
          nightCount++;
          nightBreakHours += rates.nightBreakHours(shiftHours, line.deductionMinutes / 60);
          nightExemptHours += Math.min(shiftHours * 0.3, 8 * rates.nightRate);
        }
      }
      if (line.countsAsDayOff) dayOffCount++;
      const paid = line.payUnits === 1;
      if (line.kind === 'LEAVE_PAID' && paid) paidLeaveCount++;
      else if (line.kind === 'ISAT' && paid) isatCount++;
      else if (line.kind === 'HOLIDAY' && paid) holidayCount++;
      else if (line.kind === 'LEAVE_UNPAID') unpaidLeaveCount++;
      else if (line.kind === 'LEAVE_MAKEUP') makeupLeaveCount++;
      makeupMinutes += line.makeupMinutes;
      deductionMinutes += line.deductionMinutes;
    }

    this.actualWorkDays = workDaysCount;
    this.flexShiftCount = flexCount;
    this.nightShiftCount = nightCount;
    this.paidLeaveDays = paidLeaveCount;
    this.isatDays = isatCount;
    this.unpaidLeaveDays = unpaidLeaveCount;
    this.holidayPaidDays = holidayCount;

    // Block 1: Base Salary Actual = base x days / std
    this.baseSalaryActual = pay(this.actualWorkDays);

    // Block 2: Leave & Holiday Pay = base x days / std; makeup = base x (the month's makeup minutes / 60) / (std x 8)
    this.paidLeavePay = pay(this.paidLeaveDays);
    this.leaveSettlementPay = 0;
    this.isatPay = pay(this.isatDays);
    this.holidayPay = pay(this.holidayPaidDays);
    this.makeupPay = pay(makeupMinutes / 60, { perHour: true });
    this.workPay = this.baseSalaryActual + this.paidLeavePay + this.leaveSettlementPay + this.isatPay + this.holidayPay;
    this.lateMinutes = props.lateMinutes ?? 0;
    this.calendar = [...(props.calendar ?? [])];

    // Block 3: Overtime Pay. One item per kind of day: base x hours x rate / (std x 8), from the exact hours of that kind
    // (the lines round their own OT for display only); the total is the sum of the three items.
    this.ot15Hours = props.otHoursByRate?.x15 ?? 0;
    this.ot20Hours = props.otHoursByRate?.x20 ?? 0;
    this.ot30Hours = props.otHoursByRate?.x30 ?? 0;
    this.totalOtHours = this.ot15Hours + this.ot20Hours + this.ot30Hours;
    this.ot15Pay = pay(this.ot15Hours, { perHour: true, rate: otRates.weekday });
    this.ot20Pay = pay(this.ot20Hours, { perHour: true, rate: otRates.weekend });
    this.ot30Pay = pay(this.ot30Hours, { perHour: true, rate: otRates.holiday });
    this.otPayTotal = this.ot15Pay + this.ot20Pay + this.ot30Pay;
    this.dayRate = Math.round(dayRate);

    // Block 4: Allowances
    // Policy values: rounded on their own, shown on their own; the actual values never read them.
    this.attendanceAllowancePolicy = Math.round(this.baseSalaryPolicy * rates.attendanceRate);
    this.travelAllowancePolicy = Math.round(this.baseSalaryPolicy * rates.travelRate);
    this.flexAllowancePolicy = Math.round(this.baseSalaryPolicy * rates.flexRate);
    this.offPaidNightPolicy = rates.isKnownType
      ? Math.round(this.standardWorkdays * hourRate * (1 + rates.nightRate))
      : 0;
    this.nightAllowancePolicy = Math.round(this.baseSalaryPolicy * rates.nightRate);

    // Actual values. The allowances follow the work days. The days off for the attendance allowance are the lines that
    // count as one (leave, absence) plus the leave-with-makeup days the month's makeup minutes leave short (L15, L16).
    // D10: the windows still ahead count as worked here, and only here (makeupPay above reads the real minutes).
    const absenceDays =
      dayOffCount + makeupShortfallDays(makeupLeaveCount, makeupMinutes + (props.plannedMakeupMinutes ?? 0));
    const keepsDiligence = absenceDays < (props.diligenceLostFromDays ?? 5);
    // rate x base x work days / std
    this.attendanceAllowanceActual =
      rates.attendanceRate > 0 && keepsDiligence ? pay(this.actualWorkDays, { rate: rates.attendanceRate }) : 0;
    this.travelAllowanceActual = !this.isDormResident ? pay(this.actualWorkDays, { rate: rates.travelRate }) : 0;
    // flexRate x base x Σ min(8, hours) / (std x 8); nightRate x base x night days / std; the night break pay summed
    // exact over the night days (capped by each day's exact deduction), then rounded once
    this.flexAllowanceActual = rates.isKnownType ? pay(flexHours, { perHour: true, rate: rates.flexRate }) : 0;
    this.offPaidNightActual = rates.isKnownType ? pay(nightBreakHours, { perHour: true }) : 0;
    this.nightAllowanceActual = rates.isKnownType ? pay(this.nightShiftCount, { rate: rates.nightRate }) : 0;
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

    // Block 6: Late / Early deductions: -(base x (the month's deduction minutes / 60) / (std x 8)), e.g. 35 minutes on
    // 6.000.000 / 26 = -16.827. The hours are shown with 2 decimals only; the money never reads them.
    this.lateEarlyHours = props.lateEarlyHours ?? Math.round((deductionMinutes / 60) * 100) / 100;
    this.lateEarlyDeductionAmount = -pay(deductionMinutes / 60, { perHour: true });

    // Block 7: Gross to Net deductions
    this.grossIncome =
      this.baseSalaryActual +
      this.paidLeavePay +
      this.leaveSettlementPay +
      this.isatPay +
      this.holidayPay +
      this.makeupPay +
      this.otPayTotal +
      this.totalAllowanceActual +
      this.kpiActualPay +
      this.lateEarlyDeductionAmount; // already negative

    // Tax-exempt part of the pay: the OT premium over the normal hourly rate (rate - 1 of each kind of day: by default
    // 150% -> 50%, 200% -> 100%, 300% -> 200%) plus, for each night line, the lower of 30% of the hourly pay for the
    // shift hours (D13) and the night allowance of that day (a night day without allowance, e.g. one that is not a work
    // day, exempts nothing). Each part is summed exact and rounded once; the night part never reads the rounded
    // allowance of the line (D1).
    this.rates = {
      kpiWeights: props.rates?.kpiWeights ?? KPI_WEIGHTS,
      insurancePct: props.rates?.insurancePct ?? insurancePctOf(DEFAULT_INSURANCE_RATES),
      otMultipliers: { ...otRates },
      lateGraceMinutes: props.rates?.lateGraceMinutes ?? DEFAULT_LATE_GRACE_MINUTES
    };
    const otExempt = Math.round(
      this.ot15Hours * hourRate * (otRates.weekday - 1) +
        this.ot20Hours * hourRate * (otRates.weekend - 1) +
        this.ot30Hours * hourRate * (otRates.holiday - 1)
    );
    const nightExempt = pay(nightExemptHours, { perHour: true });
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

    this.deductionTotal = this.insuranceDeduction + this.personalIncomeTax + this.advanceDeduction;
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
      makeupPay: this.makeupPay,
      workPay: this.workPay,
      lateMinutes: this.lateMinutes,
      rates: this.rates,
      calendar: this.calendar,
      deductionTotal: this.deductionTotal,
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
