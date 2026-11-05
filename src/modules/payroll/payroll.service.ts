import { Injectable, Optional, Inject } from '@nestjs/common';
import { TransactionCoordinator } from '../../database';
import { PayrollRepository, EmployeeMonthlyRawData, KpiScorePatch, PayslipRecord } from './payroll.repository';
import { KpiValidationError } from './payroll.errors';
import {
  EmployeePayslip,
  DailyAttendanceLineProps,
  EmployeePayslipSummaryDTO,
  EmployeePayslipDTO,
  PayrollWarning,
  calculateInsurance,
  calculateKpiPay,
  resolveTaxMethod
} from './domain';
import { PayrollAllowancePolicy } from './domain/allowance-rates';

// Scores are points 0-100; userScore / selfScore are other names for user / self.
export interface KpiScoreBody {
  wework?: number | null;
  user?: number | null;
  userScore?: number | null;
  peer?: number | null;
  manager?: number | null;
  self?: number | null;
  selfScore?: number | null;
  proposedAmount?: number | null;
}

type KpiScoreColumn = 'wework' | 'user_score' | 'peer' | 'manager' | 'self_score';

const KPI_SCORE_FIELDS: Array<{ column: KpiScoreColumn; name: keyof KpiScoreBody; alias?: keyof KpiScoreBody }> = [
  { column: 'wework', name: 'wework' },
  { column: 'user_score', name: 'user', alias: 'userScore' },
  { column: 'peer', name: 'peer' },
  { column: 'manager', name: 'manager' },
  { column: 'self_score', name: 'self', alias: 'selfScore' }
];

@Injectable()
export class PayrollService {
  constructor(
    @Inject(PayrollRepository) private readonly repo: PayrollRepository,
    @Optional() @Inject(TransactionCoordinator) private readonly txCoordinator?: TransactionCoordinator
  ) {}

  async calculatePeriodPayslips(
    month: string,
    employeeIds?: string[],
    actor = 'system'
  ): Promise<{
    runId: number | null;
    items: EmployeePayslipSummaryDTO[];
    errors: Array<{ employeeId: string; message: string }>;
  }> {
    // A list of employees is a partial run: the other employees keep their payslips. runId is null when no payslip
    // was computed, in which case nothing is stored.
    const isPartial = employeeIds !== undefined && employeeIds.length > 0;
    const doCalc = async () => {
      let targets = employeeIds;
      if (!targets || targets.length === 0) {
        const staffList = await this.repo.listEligibleEmployees();
        targets = staffList.map(s => s.uuid);
      }

      const payslips: EmployeePayslip[] = [];
      const summaries: EmployeePayslipSummaryDTO[] = [];
      const errors: Array<{ employeeId: string; message: string }> = [];
      const seenUsernames = new Set<string>();

      for (const empId of targets) {
        try {
          const payslip = await this.generateMonthlyPayslip(empId, month);
          // The same person can be listed by uuid and by username; keep one payslip per username.
          if (seenUsernames.has(payslip.username)) continue;
          seenUsernames.add(payslip.username);
          payslips.push(payslip);
          summaries.push(payslip.toSummary());
        } catch (err) {
          errors.push({ employeeId: empId, message: err instanceof Error ? err.message : String(err) });
        }
      }

      const carryForward = isPartial
        ? { exceptUsernames: payslips.map(p => p.username), exceptEmployeeIds: targets }
        : undefined;
      const runId = await this.repo.savePayrollRunAndSlips(month, actor, payslips, errors.length, carryForward);
      return { runId, items: summaries, errors };
    };

    if (this.txCoordinator) {
      return await this.txCoordinator.withLock(`payroll_${month}`, doCalc);
    }
    return await doCalc();
  }

  async listPayslips(month: string): Promise<PayslipRecord[]> {
    return await this.repo.listPayslips(month);
  }

  async decidePayslip(
    month: string,
    username: string,
    status: 'approved' | 'rejected',
    actor: string,
    note?: string
  ): Promise<PayslipRecord | null> {
    return await this.repo.decidePayslip(month, username, status, actor, note);
  }

  async getPayslip(month: string, employeeId: string): Promise<PayslipRecord | null> {
    return await this.repo.getPayslip(month, employeeId);
  }

  // Checks the KPI body against the employee's KPI cap and saves it: undefined keeps the stored value, null clears it.
  async setKpiScore(username: string, month: string, body: KpiScoreBody, actor: string): Promise<void> {
    const cap = await this.repo.getKpiCap(username, month);
    if (!cap) throw new KpiValidationError('EMPLOYEE_NOT_FOUND', `Không tìm thấy nhân sự ${username}`);

    const input = body ?? {};
    const patch: KpiScorePatch = {};
    for (const { column, name, alias } of KPI_SCORE_FIELDS) {
      // The short name wins when both names are sent.
      const value = input[input[name] === undefined && alias ? alias : name];
      if (value === undefined) continue;
      if (value === null) {
        patch[column] = null;
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
        throw new KpiValidationError('INVALID_KPI_SCORE', 'Điểm KPI phải từ 0 đến 100');
      }
      patch[column] = Math.round(value * 100);
    }

    const proposed = input.proposedAmount;
    if (proposed !== undefined) {
      if (proposed !== null) {
        if (!Number.isSafeInteger(proposed) || proposed < 0) {
          throw new KpiValidationError('INVALID_KPI_SCORE', 'Lương KPI đề xuất phải là số nguyên từ 0 trở lên');
        }
        if (proposed > 0 && !cap.applicable) {
          throw new KpiValidationError('KPI_NOT_APPLICABLE', 'Chức vụ hoặc bậc của nhân sự không áp dụng lương KPI');
        }
        if (cap.kpiMax !== null && proposed > cap.kpiMax) {
          throw new KpiValidationError(
            'KPI_PROPOSAL_EXCEEDS_MAX',
            `Lương KPI đề xuất phải nhỏ hơn hoặc bằng ${cap.kpiMax} đồng`
          );
        }
      }
      patch.kpi_proposed = proposed;
    }

    await this.repo.saveKpiScore(username, month, patch, actor);
  }

  async generateMonthlyPayslip(employeeId: string, month: string): Promise<EmployeePayslip> {
    const data = await this.repo.getMonthlyData(employeeId, month);
    if (!data) {
      throw new Error(`Data not found for employee ${employeeId} in month ${month}`);
    }

    const { staff, timesheets, requests } = data;
    if (staff.baseSalary === null || staff.standardWorkdays === null) {
      const position = `${staff.employeeType ?? 'không rõ loại'} (${staff.positionLevelText})`;
      throw new Error(`Thiếu cấu hình chức vụ hoặc bậc lương cho ${position}`);
    }
    const employeeType = staff.employeeType;
    const nightAllowancePct = staff.nightAllowancePct === 60 ? 60 : 40;
    const allowancePolicy = new PayrollAllowancePolicy(employeeType, nightAllowancePct);
    // An approved iSAT Saturday is paid as one base day; the set also drops a date listed twice.
    const isatDates = new Set(data.isatDates ?? []);
    // An iSAT Saturday has no attendance line, so a makeup approved on it later must not count as a makeup day.
    const makeupWorkDates = new Set(
      timesheets
        .filter(
          ts =>
            ts.scheduleType === 'MAKE_UP' && ts.status === 'PRESENT' && ts.workHours > 0 && !isatDates.has(ts.workDate)
        )
        .map(ts => ts.workDate)
    );
    const standardWorkdays = staff.standardWorkdays;
    const baseSalaryPolicy = staff.baseSalary;
    const dayRate = baseSalaryPolicy / standardWorkdays;
    const hourRate = dayRate / 8;

    const dailyLines: DailyAttendanceLineProps[] = [];
    let totalDeductionHours = 0;

    for (const ts of timesheets) {
      if (isatDates.has(ts.workDate)) continue;

      const shiftCode = ts.shiftType.toUpperCase();
      let shiftLabel = 'Normal';
      let inOutText = '08:00–17:00';
      let flexAllowancePay = 0;
      let nightAllowancePay = 0;
      let offPaidPay = 0;
      let daySalary = 0;

      if (shiftCode === 'FLEX') {
        shiftLabel = `Flex +${Math.round(allowancePolicy.flexRate * 100)}%`;
        flexAllowancePay = makeupWorkDates.has(ts.workDate) ? 0 : allowancePolicy.flexPremium(hourRate, ts.workHours);
        daySalary = Math.round(dayRate);
      } else if (shiftCode === 'NIGHT') {
        const nightPct = allowancePolicy.nightRate;
        shiftLabel = `Night +${Math.round(nightPct * 100)}%`;
        nightAllowancePay = makeupWorkDates.has(ts.workDate) ? 0 : allowancePolicy.nightPremium(dayRate);
        const timeDeduction = Math.round((((ts.lateMinutes || 0) + (ts.earlyMinutes || 0)) * hourRate) / 60);
        offPaidPay = makeupWorkDates.has(ts.workDate)
          ? 0
          : allowancePolicy.nightBreakPay(hourRate, ts.workHours, timeDeduction);
        inOutText = '22:00–06:00';
        daySalary = Math.round(dayRate);
      } else if (shiftCode === 'LEAVE') {
        shiftLabel = 'Nghỉ phép';
        inOutText = 'Hưởng lương ngày';
        daySalary = Math.round(dayRate);
      } else if (shiftCode === 'ISAT') {
        shiftLabel = 'iSAT';
        inOutText = 'Hưởng lương ngày';
        daySalary = Math.round(dayRate);
      } else if (shiftCode === 'UNPAID') {
        shiftLabel = 'Không lương';
        inOutText = 'Không tính lương';
        daySalary = 0;
      } else {
        shiftLabel = 'Normal';
        daySalary = Math.round(dayRate);
      }

      const lateMins = ts.lateMinutes || 0;
      const earlyMins = ts.earlyMinutes || 0;
      const deductionHours = (lateMins + earlyMins) / 60;
      totalDeductionHours += deductionHours;
      const deductionAmount = Math.round(deductionHours * hourRate);

      const dailyTotal = daySalary + flexAllowancePay + nightAllowancePay + offPaidPay - deductionAmount;

      dailyLines.push({
        date: ts.workDate,
        dayOfWeekText: 'Thứ 2 - Thứ 6',
        shiftCode,
        shiftLabel,
        inOutText,
        workHours: ts.workHours,
        daySalary,
        flexAllowancePay,
        nightAllowancePay,
        offPaidPay,
        otHours: ts.otHours,
        otPay: 0,
        deductionHours: Math.round(deductionHours * 100) / 100,
        deductionAmount,
        dailyTotal
      });
    }

    for (const date of isatDates) {
      dailyLines.push({
        date,
        dayOfWeekText: 'Thứ 7',
        shiftCode: 'ISAT',
        shiftLabel: 'iSAT',
        inOutText: 'Hưởng lương ngày',
        workHours: 0,
        daySalary: Math.round(dayRate),
        flexAllowancePay: 0,
        nightAllowancePay: 0,
        offPaidPay: 0,
        otHours: 0,
        otPay: 0,
        deductionHours: 0,
        deductionAmount: 0,
        dailyTotal: Math.round(dayRate)
      });
    }
    dailyLines.sort((a, b) => a.date.localeCompare(b.date));

    let totalOtHours = 0;
    for (const req of requests) {
      if (req.type === 'OVERTIME' && req.status === 'APPROVED') {
        totalOtHours += req.otHours || 0;
      }
    }

    let advanceDeduction = 0;
    for (const req of requests) {
      if (req.type === 'ADVANCE' && req.status === 'APPROVED') {
        advanceDeduction += Number(req.advanceAmount || 0);
      }
    }

    const kpi = calculateKpiPay(data.kpi, staff.kpiCap);
    const insurance = calculateInsurance(baseSalaryPolicy, staff.insured, data.insuranceRates);
    const taxMethod = resolveTaxMethod(staff.contractTerm);
    const warnings: PayrollWarning[] = [...kpi.warnings];

    const roundedLateEarlyHours = Math.round(totalDeductionHours * 100) / 100;

    return new EmployeePayslip({
      employeeId: staff.uuid,
      username: staff.username,
      fullName: staff.name,
      positionLevelText: staff.positionLevelText,
      contractStatusText: staff.contractStatusText,
      month,
      standardWorkdays,
      baseSalaryPolicy,
      dailyLines,
      otHoursByRate: {
        x15: 0,
        x20: totalOtHours,
        x30: 0
      },
      lateEarlyHours: roundedLateEarlyHours,
      employeeType,
      nightAllowancePct,
      isDormResident: staff.isDormResident,
      makeupWorkDates: Array.from(makeupWorkDates),
      kpi,
      insurance,
      taxMethod,
      dependants: staff.dependants,
      warnings,
      advanceDeduction,
      remainingAnnualLeaveDays: staff.remainingAnnualLeaveDays || 22
    });
  }
}
