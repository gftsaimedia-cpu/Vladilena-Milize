import assert from 'node:assert/strict';
import { test, describe, it } from 'node:test';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { PayrollRepository, EmployeeMonthlyRawData } from '../../src/modules/payroll/payroll.repository';
import { EmployeePayslip } from '../../src/modules/payroll/domain';

class FakePayrollRepository extends PayrollRepository {
  data: Map<string, EmployeeMonthlyRawData> = new Map();
  runs: any[] = [];
  slips: any[] = [];

  constructor() {
    super({} as any);
  }

  override async listEligibleEmployees(): Promise<Array<{ uuid: string; username: string; name: string }>> {
    return Array.from(this.data.values()).map((d) => ({
      uuid: d.staff.uuid,
      username: d.staff.username,
      name: d.staff.name,
    }));
  }

  override async getMonthlyData(employeeId: string, month: string): Promise<EmployeeMonthlyRawData | null> {
    return this.data.get(`${employeeId}:${month}`) || null;
  }

  override async savePayrollRunAndSlips(month: string, actor: string, payslips: EmployeePayslip[]): Promise<number> {
    const runId = this.runs.length + 1;
    this.runs.push({ id: runId, month, actor, slipsTotal: payslips.length });
    for (const p of payslips) {
      const summary = p.toSummary();
      this.slips.push({
        runId,
        username: summary.employeeId,
        gross: summary.grossIncome,
        net: summary.netIncome,
        advance: summary.advanceDeduction,
      });
    }
    return runId;
  }

  override async listPayslips(month: string): Promise<any[]> {
    return this.slips;
  }
}

describe('Payroll V2 - Tính lương & Xuất phiếu lương chu kỳ', () => {
  const repo = new FakePayrollRepository();
  const service = new PayrollService(repo);

  const empId = 'uuid_user_payroll_1';
  const month = '2026-10';

  repo.data.set(`${empId}:${month}`, {
    staff: {
      uuid: empId,
      username: 'tran-minh-ngoc',
      name: 'Trần Minh Ngọc',
      positionLevelText: 'Quản lý · Bậc 3',
      contractStatusText: 'HĐLĐ từ 3 tháng',
      baseSalary: 15600000,
      standardWorkdays: 26,
      kpiMaxSalary: 15600000,
      remainingAnnualLeaveDays: 12,
    },
    timesheets: [
      {
        workDate: '2026-10-01',
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00',
        shiftAllowancePct: 0,
        workHours: 8,
        otHours: 0,
        lateMinutes: 0,
        earlyMinutes: 0,
        status: 'PRESENT',
        dayStatus: 'VALID',
      },
      {
        workDate: '2026-10-02',
        shiftType: 'FLEX',
        shiftStartTime: '09:00',
        shiftEndTime: '18:00',
        shiftAllowancePct: 20,
        workHours: 8,
        otHours: 0,
        lateMinutes: 0,
        earlyMinutes: 0,
        status: 'PRESENT',
        dayStatus: 'VALID',
      },
      {
        workDate: '2026-10-03',
        shiftType: 'LEAVE',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00',
        shiftAllowancePct: 0,
        workHours: 8,
        otHours: 0,
        lateMinutes: 0,
        earlyMinutes: 0,
        status: 'LEAVE',
        dayStatus: 'VALID',
      },
    ],
    requests: [
      {
        id: 'req_ot_1',
        type: 'OVERTIME',
        status: 'APPROVED',
        otHours: 4,
      },
      {
        id: 'req_adv_1',
        type: 'ADVANCE',
        status: 'APPROVED',
        advanceAmount: 1000000,
      },
    ],
    kpiScore: {
      wework: 100,
      user: 95,
      peer: 90,
      manager: 95,
      self: 95,
    },
  });

  it('1. Tính lương tháng cho nhân viên từ ngày công, OT, tạm ứng và KPI', async () => {
    const payslip = await service.generateMonthlyPayslip(empId, month);
    assert.ok(payslip);

    assert.equal(payslip.employeeId, empId);
    assert.equal(payslip.month, month);
    assert.equal(payslip.baseSalaryPolicy, 15600000);
    assert.equal(payslip.advanceDeduction, 1000000);

    const summary = payslip.toSummary();
    assert.equal(summary.employeeId, empId);
    assert.equal(summary.month, month);
    assert.equal(summary.advanceDeduction, 1000000);
    assert.ok(summary.grossIncome > 0, 'Lương gộp phải lớn hơn 0');
    assert.ok(summary.netIncome > 0, 'Lương thực nhận phải lớn hơn 0');
  });

  it('2. Chạy tính lương toàn bộ chu kỳ (calculatePeriodPayslips) tạo payroll_run', async () => {
    const result = await service.calculatePeriodPayslips(month, [empId], 'admin');
    assert.equal(result.runId, 1);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].employeeId, empId);

    const slips = await service.listPayslips(month);
    assert.equal(slips.length, 1);
    assert.equal(slips[0].advance, 1000000);
  });
});
