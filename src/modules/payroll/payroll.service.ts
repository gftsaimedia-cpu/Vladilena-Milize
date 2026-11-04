import { Injectable, Optional } from '@nestjs/common';
import { TransactionCoordinator } from '../../database';
import { PayrollRepository, EmployeeMonthlyRawData } from './payroll.repository';
import {
  EmployeePayslip,
  DailyAttendanceLineProps,
  KpiScores,
  EmployeePayslipSummaryDTO,
  EmployeePayslipDTO,
} from './domain';

@Injectable()
export class PayrollService {
  constructor(
    private readonly repo: PayrollRepository,
    @Optional() private readonly txCoordinator?: TransactionCoordinator
  ) {}

  async calculatePeriodPayslips(
    month: string,
    employeeIds?: string[],
    actor = 'system'
  ): Promise<{ runId: number; items: EmployeePayslipSummaryDTO[] }> {
    const doCalc = async () => {
      let targets = employeeIds;
      if (!targets || targets.length === 0) {
        const staffList = await this.repo.listEligibleEmployees();
        targets = staffList.map((s) => s.uuid);
      }

      const payslips: EmployeePayslip[] = [];
      const summaries: EmployeePayslipSummaryDTO[] = [];

      for (const empId of targets) {
        try {
          const payslip = await this.generateMonthlyPayslip(empId, month);
          payslips.push(payslip);
          summaries.push(payslip.toSummary());
        } catch (err) {
          // Skip if missing data
        }
      }

      const runId = await this.repo.savePayrollRunAndSlips(month, actor, payslips);
      return { runId, items: summaries };
    };

    if (this.txCoordinator) {
      return await this.txCoordinator.withLock(`payroll_${month}`, doCalc);
    }
    return await doCalc();
  }

  async listPayslips(month: string): Promise<any[]> {
    return await this.repo.listPayslips(month);
  }

  async getPayslip(month: string, employeeId: string): Promise<any | null> {
    return await this.repo.getPayslip(month, employeeId);
  }

  async setKpiScore(username: string, month: string, scores: any, actor: string): Promise<void> {
    await this.repo.saveKpiScore(username, month, scores, actor);
  }

  async generateMonthlyPayslip(employeeId: string, month: string): Promise<EmployeePayslip> {
    const data = await this.repo.getMonthlyData(employeeId, month);
    if (!data) {
      throw new Error(`Data not found for employee ${employeeId} in month ${month}`);
    }

    const { staff, timesheets, requests, kpiScore } = data;
    const standardWorkdays = staff.standardWorkdays || 26;
    const baseSalaryPolicy = staff.baseSalary;
    const dayRate = baseSalaryPolicy / standardWorkdays;
    const hourRate = dayRate / 8;

    const dailyLines: DailyAttendanceLineProps[] = [];
    let totalDeductionHours = 0;

    for (const ts of timesheets) {
      const shiftCode = ts.shiftType.toUpperCase();
      let shiftLabel = 'Normal';
      let inOutText = '08:00–17:00';
      let flexAllowancePay = 0;
      let nightAllowancePay = 0;
      let offPaidPay = 0;
      let daySalary = 0;

      if (shiftCode === 'FLEX') {
        shiftLabel = 'Flex +20%';
        flexAllowancePay = Math.round(0.2 * dayRate);
        daySalary = Math.round(dayRate);
      } else if (shiftCode === 'NIGHT') {
        shiftLabel = 'Night +40%';
        nightAllowancePay = Math.round(0.4 * dayRate);
        offPaidPay = 37500;
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
        dailyTotal,
      });
    }

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

    let kpiScoresProps: KpiScores | undefined = undefined;
    if (kpiScore) {
      kpiScoresProps = {
        wework: kpiScore.wework > 1 ? kpiScore.wework / 100 : kpiScore.wework,
        user: kpiScore.user > 1 ? kpiScore.user / 100 : kpiScore.user,
        peer: kpiScore.peer > 1 ? kpiScore.peer / 100 : kpiScore.peer,
        manager: kpiScore.manager > 1 ? kpiScore.manager / 100 : kpiScore.manager,
        self: kpiScore.self > 1 ? kpiScore.self / 100 : kpiScore.self,
      };
    }

    const roundedLateEarlyHours = Math.round(totalDeductionHours * 100) / 100;

    return new EmployeePayslip({
      employeeId: staff.uuid,
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
        x30: 0,
      },
      lateEarlyHours: roundedLateEarlyHours,
      kpiScores: kpiScoresProps,
      kpiMaxSalary: staff.kpiMaxSalary || baseSalaryPolicy,
      advanceDeduction,
      remainingAnnualLeaveDays: staff.remainingAnnualLeaveDays || 22,
    });
  }
}
