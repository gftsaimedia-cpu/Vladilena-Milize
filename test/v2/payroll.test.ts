import assert from 'node:assert/strict';
import { test, describe, it } from 'node:test';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { PayrollRepository, EmployeeMonthlyRawData } from '../../src/modules/payroll/payroll.repository';
import { DEFAULT_INSURANCE_RATES, EmployeePayslip } from '../../src/modules/payroll/domain';
import type { Kysely } from 'kysely';
import { nvMonthData } from './payroll-fixtures';

// Staff fields the V2 rules added; the older fixtures below do not depend on them.
const rulesStaff = {
  insured: true,
  dependants: 0,
  hasTax: true,
  contractStart: '2025-01-05',
  contractEnd: null,
  kpiCap: { applicable: false, kpiMax: null }
};

class FakePayrollRepository extends PayrollRepository {
  data: Map<string, EmployeeMonthlyRawData> = new Map();
  runs: any[] = [];
  slips: any[] = [];

  constructor() {
    super({} as any);
  }

  override async listEligibleEmployees(): Promise<Array<{ uuid: string; username: string; name: string }>> {
    return Array.from(this.data.values()).map(d => ({
      uuid: d.staff.uuid,
      username: d.staff.username,
      name: d.staff.name
    }));
  }

  override async getMonthlyData(employeeId: string, month: string): Promise<EmployeeMonthlyRawData | null> {
    return this.data.get(`${employeeId}:${month}`) || null;
  }

  override async savePayrollRunAndSlips(
    month: string,
    actor: string,
    payslips: EmployeePayslip[],
    errorCount = 0
  ): Promise<number> {
    const runId = this.runs.length + 1;
    this.runs.push({ id: runId, month, actor, slipsTotal: payslips.length, slipsError: errorCount });
    for (const p of payslips) {
      const summary = p.toSummary();
      this.slips.push({
        runId,
        username: summary.employeeId,
        gross: summary.grossIncome,
        net: summary.netIncome,
        advance: summary.advanceDeduction
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
      remainingAnnualLeaveDays: 12,
      ...rulesStaff,
      kpiCap: { applicable: true, kpiMax: 15_600_000 }
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
        dayStatus: 'VALID'
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
        dayStatus: 'VALID'
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
        dayStatus: 'VALID'
      }
    ],
    requests: [
      {
        id: 'req_ot_1',
        type: 'OVERTIME',
        status: 'APPROVED',
        otHours: 4
      },
      {
        id: 'req_adv_1',
        type: 'ADVANCE',
        status: 'APPROVED',
        advanceAmount: 1000000
      }
    ],
    kpi: {
      scores: { wework: 10000, user: 9500, peer: 9000, manager: 9500, self: 9500 },
      proposedAmount: 15_600_000
    },
    insuranceRates: DEFAULT_INSURANCE_RATES
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

describe('Payroll allowance behavior from the reference app', () => {
  const makePayslip = (overrides: Partial<ConstructorParameters<typeof EmployeePayslip>[0]> = {}) =>
    new EmployeePayslip({
      employeeId: 'allowance-test',
      fullName: 'Allowance Test',
      positionLevelText: 'L1',
      contractStatusText: 'Active',
      month: '2026-10',
      standardWorkdays: 26,
      baseSalaryPolicy: 6_000_000,
      dailyLines: [],
      ...overrides
    });

  const line = (shiftCode: string, workHours = 8) => ({
    date: '2026-10-01',
    dayOfWeekText: 'Thứ 2',
    shiftCode,
    shiftLabel: shiftCode,
    inOutText: '',
    workHours,
    daySalary: 0,
    flexAllowancePay: 0,
    nightAllowancePay: 0,
    offPaidPay: 0,
    otHours: 0,
    otPay: 0,
    deductionHours: 0,
    deductionAmount: 0,
    dailyTotal: 0
  });

  const calculateLine = async (
    employeeType: string | undefined,
    shiftType: string,
    workHours: number,
    nightAllowancePct = 40,
    scheduleType = 'REGULAR'
  ) => {
    const repo = new FakePayrollRepository();
    const payroll = new PayrollService(repo);
    repo.data.set('allowance:2026-10', {
      staff: {
        uuid: 'allowance',
        username: 'allowance',
        name: 'Allowance',
        positionLevelText: 'L1',
        contractStatusText: 'Active',
        baseSalary: 6_000_000,
        standardWorkdays: 26,
        employeeType,
        nightAllowancePct,
        isDormResident: false,
        ...rulesStaff
      },
      timesheets: [
        {
          workDate: '2026-10-01',
          shiftType,
          shiftStartTime: '08:00',
          shiftEndTime: '17:00',
          shiftAllowancePct: nightAllowancePct,
          workHours,
          otHours: 0,
          lateMinutes: 0,
          earlyMinutes: 0,
          status: 'PRESENT',
          dayStatus: 'VALID',
          scheduleType
        }
      ],
      requests: [],
      kpi: null,
      insuranceRates: DEFAULT_INSURANCE_RATES
    });
    return payroll.generateMonthlyPayslip('allowance', '2026-10');
  };

  it('uses 10% Flex for TTS/CTV and 20% for NV on paid hours, capped at eight', async () => {
    const tts = await calculateLine('tts', 'FLEX', 4);
    const ctv = await calculateLine('ctv', 'FLEX', 4);
    const nv = await calculateLine('nv', 'FLEX', 4);
    const capped = await calculateLine('nv', 'FLEX', 10);

    assert.equal(tts.flexAllowanceActual, 11_538);
    assert.equal(ctv.flexAllowanceActual, 11_538);
    assert.equal(nv.flexAllowanceActual, 23_077);
    assert.equal(capped.flexAllowanceActual, 46_154);
  });

  it('uses persisted NV Night percent while TTS and CTV stay at thirty percent', async () => {
    const tts = await calculateLine('tts', 'NIGHT', 8, 60);
    const ctv = await calculateLine('ctv', 'NIGHT', 8, 60);
    const nv40 = await calculateLine('nv', 'NIGHT', 8, 40);
    const nv60 = await calculateLine('nv', 'NIGHT', 8, 60);

    assert.equal(tts.nightAllowanceActual, 69_231);
    assert.equal(ctv.nightAllowanceActual, 69_231);
    assert.equal(nv40.nightAllowanceActual, 92_308);
    assert.equal(nv60.nightAllowanceActual, 138_462);
  });

  it('calculates NV travel and attendance by actual workdays, excluding iDorm and excess absences', () => {
    const eligible = makePayslip({ employeeType: 'nv', dailyLines: Array.from({ length: 20 }, () => line('NORMAL')) });
    const idorm = makePayslip({
      employeeType: 'nv',
      isDormResident: true,
      dailyLines: Array.from({ length: 20 }, () => line('NORMAL'))
    });
    const ineligible = makePayslip({
      employeeType: 'nv',
      dailyLines: [
        ...Array.from({ length: 20 }, () => line('NORMAL')),
        ...Array.from({ length: 5 }, () => line('LEAVE'))
      ]
    });
    const tts = makePayslip({ employeeType: 'tts', dailyLines: Array.from({ length: 20 }, () => line('NORMAL')) });

    assert.equal(eligible.travelAllowanceActual, 692_308);
    assert.equal(eligible.attendanceAllowanceActual, 1_153_846);
    assert.equal(idorm.travelAllowanceActual, 0);
    assert.equal(idorm.attendanceAllowanceActual, 1_153_846);
    assert.equal(ineligible.attendanceAllowanceActual, 0);
    assert.equal(tts.travelAllowanceActual, 0);
    assert.equal(tts.attendanceAllowanceActual, 0);

    const makeupOffsetsAbsence = makePayslip({
      employeeType: 'nv',
      makeupWorkDates: ['2026-10-20'],
      dailyLines: [
        ...Array.from({ length: 20 }, () => line('NORMAL')),
        ...Array.from({ length: 5 }, () => line('LEAVE'))
      ]
    });
    assert.equal(makeupOffsetsAbsence.attendanceAllowanceActual, 1_096_154);
  });

  it('does not grant NV-only allowances when employee type is missing or unknown', async () => {
    const unknown = makePayslip({ dailyLines: Array.from({ length: 20 }, () => line('NORMAL')) });
    assert.equal(unknown.travelAllowanceActual, 0);
    assert.equal(unknown.attendanceAllowanceActual, 0);
    assert.equal(unknown.flexAllowanceActual, 0);
    assert.equal(unknown.nightAllowanceActual, 0);
    const unknownNight = await calculateLine(undefined, 'NIGHT', 8);
    assert.equal(unknownNight.dailyLines[0].nightAllowancePay, 0);
    assert.equal(unknownNight.dailyLines[0].offPaidPay, 0);
  });

  it('applies the selected night rate and fills at most one short hour without a second credit', async () => {
    const repo = new FakePayrollRepository();
    const payroll = new PayrollService(repo);
    repo.data.set('night:2026-10', {
      staff: {
        uuid: 'night',
        username: 'night',
        name: 'Night',
        positionLevelText: 'NV L1',
        contractStatusText: 'Active',
        baseSalary: 6_000_000,
        standardWorkdays: 26,
        employeeType: 'nv',
        nightAllowancePct: 60,
        isDormResident: false,
        ...rulesStaff
      },
      timesheets: [
        {
          workDate: '2026-10-01',
          shiftType: 'NIGHT',
          shiftStartTime: '22:00',
          shiftEndTime: '06:00',
          shiftAllowancePct: 60,
          workHours: 8,
          otHours: 0,
          lateMinutes: 0,
          earlyMinutes: 0,
          status: 'PRESENT',
          dayStatus: 'VALID'
        },
        {
          workDate: '2026-10-02',
          shiftType: 'NIGHT',
          shiftStartTime: '22:00',
          shiftEndTime: '06:00',
          shiftAllowancePct: 60,
          workHours: 7,
          otHours: 0,
          lateMinutes: 0,
          earlyMinutes: 60,
          status: 'PRESENT',
          dayStatus: 'NEEDS_EXPLANATION'
        }
      ],
      requests: [],
      kpi: null,
      insuranceRates: DEFAULT_INSURANCE_RATES
    });
    const slip = await payroll.generateMonthlyPayslip('night', '2026-10');
    assert.equal(slip.dailyLines[0].nightAllowancePay, 138_462);
    assert.equal(slip.dailyLines[0].offPaidPay, 46_154);
    assert.equal(slip.dailyLines[1].offPaidPay, 28_846);
    assert.equal(slip.offPaidNightActual, 75_000);

    const makeupNight = await calculateLine('nv', 'NIGHT', 8, 60, 'MAKE_UP');
    assert.equal(makeupNight.dailyLines[0].nightAllowancePay, 0);
    assert.equal(makeupNight.dailyLines[0].offPaidPay, 0);
  });

  it('loads persisted schedule type by employee and work date for makeup detection', async () => {
    const joins: string[] = [];
    let table = '';
    const qb = {
      selectFrom(nextTable: string) {
        table = nextTable;
        return this;
      },
      selectAll() {
        return this;
      },
      select() {
        return this;
      },
      where() {
        return this;
      },
      orderBy() {
        return this;
      },
      limit() {
        return this;
      },
      leftJoin(_table: string, callback: (join: { onRef: (...args: string[]) => any }) => void) {
        const join = {
          onRef: (...args: string[]) => {
            joins.push(args.join('='));
            return join;
          }
        };
        callback(join);
        return this;
      },
      async executeTakeFirst() {
        if (table === 'staff')
          return { uuid: 'repo-emp', username: 'repo-emp', name: 'Employee', type: 'nv', level: 1 };
        if (table === 'position_types') return { id: 2, workdays: 26 };
        if (table === 'position_levels') return { base_salary: 6_000_000, kpi_max: 6_000_000, name: 'NV L1' };
        return undefined;
      },
      async execute() {
        if (table === 'timesheet_entries') {
          return [
            {
              work_date: '2026-10-10',
              shift_type: 'FLEX',
              shift_start_time: '09:00',
              shift_end_time: '18:00',
              shift_allowance_pct: 20,
              work_hours: 8,
              ot_hours: 0,
              late_minutes: 0,
              early_minutes: 0,
              status: 'PRESENT',
              day_status: 'VALID',
              schedule_type: 'MAKE_UP'
            }
          ];
        }
        return [];
      }
    };
    const repo = new PayrollRepository(qb as unknown as Kysely<any>);
    const data = await repo.getMonthlyData('repo-emp', '2026-10');

    assert.deepEqual(joins, [
      'work_schedules.employee_id===timesheet_entries.employee_id',
      'work_schedules.work_date===timesheet_entries.work_date'
    ]);
    assert.equal(data?.timesheets[0].scheduleType, 'MAKE_UP');
  });

  it('excludes distinct completed makeup dates from NV allowance ratio and daily premiums, but not base days', async () => {
    const repo = new FakePayrollRepository();
    const payroll = new PayrollService(repo);
    const ordinaryDays = Array.from({ length: 19 }, (_, i) => ({
      ...line('NORMAL'),
      date: `2026-10-${String(i + 1).padStart(2, '0')}`
    }));
    const makeupFlex = { ...line('FLEX'), date: '2026-10-20' };
    const leaves = Array.from({ length: 5 }, (_, i) => ({ ...line('LEAVE'), date: `2026-10-${21 + i}` }));
    repo.data.set('makeup:2026-10', {
      staff: {
        uuid: 'makeup',
        username: 'makeup',
        name: 'Makeup',
        positionLevelText: 'NV L1',
        contractStatusText: 'Active',
        baseSalary: 6_000_000,
        standardWorkdays: 26,
        employeeType: 'nv',
        nightAllowancePct: 40,
        isDormResident: false,
        ...rulesStaff
      },
      timesheets: [
        ...ordinaryDays.map(row => ({
          workDate: row.date,
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
          scheduleType: 'REGULAR'
        })),
        {
          workDate: makeupFlex.date,
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
          scheduleType: 'MAKE_UP'
        },
        ...leaves.map((row, i) => ({
          workDate: row.date,
          shiftType: 'LEAVE',
          shiftStartTime: '08:00',
          shiftEndTime: '17:00',
          shiftAllowancePct: 0,
          workHours: 0,
          otHours: 0,
          lateMinutes: 0,
          earlyMinutes: 0,
          status: 'ON_LEAVE',
          dayStatus: 'VALID',
          scheduleType: 'REGULAR'
        }))
      ],
      requests: [
        { id: 'request-1', type: 'LEAVE_WITH_MAKEUP', status: 'APPROVED', leaveEndDate: '2026-10-20' },
        { id: 'request-duplicate', type: 'LEAVE_WITH_MAKEUP', status: 'APPROVED', leaveEndDate: '2026-10-20' }
      ],
      kpi: null,
      insuranceRates: DEFAULT_INSURANCE_RATES
    });

    const slip = await payroll.generateMonthlyPayslip('makeup', '2026-10');

    assert.equal(slip.actualWorkDays, 20);
    assert.equal(slip.baseSalaryActual, 4_615_385);
    assert.equal(slip.travelAllowanceActual, 657_692);
    assert.equal(slip.attendanceAllowanceActual, 1_096_154);
    assert.equal(slip.dailyLines.find(row => row.date === '2026-10-20')?.flexAllowancePay, 0);
  });

  it('does not count a planned makeup schedule without a completed attendance row', async () => {
    const repo = new FakePayrollRepository();
    const payroll = new PayrollService(repo);
    repo.data.set('planned-makeup:2026-10', {
      staff: {
        uuid: 'planned-makeup',
        username: 'planned-makeup',
        name: 'Planned',
        positionLevelText: 'NV L1',
        contractStatusText: 'Active',
        baseSalary: 6_000_000,
        standardWorkdays: 26,
        employeeType: 'nv',
        nightAllowancePct: 40,
        isDormResident: false,
        ...rulesStaff
      },
      timesheets: [
        ...Array.from({ length: 20 }, (_, i) => ({
          workDate: `2026-10-${String(i + 1).padStart(2, '0')}`,
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
          scheduleType: 'REGULAR'
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          workDate: `2026-10-${21 + i}`,
          shiftType: 'LEAVE',
          shiftStartTime: '08:00',
          shiftEndTime: '17:00',
          shiftAllowancePct: 0,
          workHours: 0,
          otHours: 0,
          lateMinutes: 0,
          earlyMinutes: 0,
          status: 'ON_LEAVE',
          dayStatus: 'VALID',
          scheduleType: i === 0 ? 'MAKE_UP' : 'REGULAR'
        }))
      ],
      requests: [],
      kpi: null,
      insuranceRates: DEFAULT_INSURANCE_RATES
    });
    const slip = await payroll.generateMonthlyPayslip('planned-makeup', '2026-10');

    assert.equal(slip.attendanceAllowanceActual, 0);
    assert.equal(slip.travelAllowanceActual, 692_308);
  });
});

describe('Payroll V2 - KPI, insurance and income tax on the payslip', () => {
  type Overrides = Parameters<typeof nvMonthData>[0];

  const setup = (overrides?: Overrides) => {
    const repo = new FakePayrollRepository();
    repo.data.set('u1:2026-10', nvMonthData(overrides));
    return { repo, service: new PayrollService(repo) };
  };
  const generate = (overrides?: Overrides) => setup(overrides).service.generateMonthlyPayslip('u1', '2026-10');
  const codes = (slip: EmployeePayslip) => slip.warnings.map(w => w.code);

  it('pays KPI from the monthly proposal, deducts insurance and finds no tax below the allowances', async () => {
    const slip = await generate();

    assert.equal(slip.baseSalaryActual, 4_615_385);
    assert.equal(slip.paidLeavePay, 230_769);
    assert.equal(slip.otPayTotal, 115_385);
    assert.equal(slip.attendanceAllowanceActual, 1_153_846);
    assert.equal(slip.travelAllowanceActual, 692_308);
    assert.equal(slip.kpiActualPay, 4_200_000);
    assert.equal(slip.kpiTotalScorePct, 84);
    assert.equal(slip.grossIncome, 11_007_693);
    assert.equal(slip.taxExemptIncome, 57_692);
    assert.equal(slip.taxableIncome, 10_950_001);
    assert.equal(slip.insuranceDeduction, 630_000);
    assert.equal(slip.personalIncomeTax, 0);
    assert.equal(slip.advanceDeduction, 1_000_000);
    assert.equal(slip.netIncome, 9_377_693);
    assert.equal(slip.taxMethod, 'progressive');
    assert.deepEqual(slip.warnings, []);
  });

  it('exposes the KPI, insurance and tax details on the DTO', async () => {
    const dto = (await generate()).toJSON();

    assert.equal(dto.username, 'a');
    assert.deepEqual(dto.kpiScores, { wework: 90, user: 80, peer: 70, manager: 85, self: 100 });
    assert.equal(dto.kpiApplicable, true);
    assert.equal(dto.kpiProposedAmount, 5_000_000);
    assert.equal(dto.kpiAppliedAmount, 5_000_000);
    assert.deepEqual(dto.insuranceBreakdown, { bhxh: 480_000, bhyt: 90_000, bhtn: 60_000 });
    assert.equal(dto.taxMethod, 'progressive');
    assert.equal(dto.taxAssessableIncome, 0);
    assert.equal(dto.dependants, 1);
    assert.deepEqual(dto.warnings, []);
  });

  it('feeds insurance and dependants into the progressive assessable income', async () => {
    const slip = await generate({
      staff: { baseSalary: 30_000_000, kpiCap: { applicable: true, kpiMax: 30_000_000 } },
      kpi: {
        scores: { wework: 9000, user: 8000, peer: 7000, manager: 8500, self: 10000 },
        proposedAmount: 10_000_000
      }
    });

    assert.equal(slip.grossIncome, 42_438_461);
    assert.equal(slip.taxExemptIncome, 288_462);
    assert.equal(slip.taxableIncome, 42_149_999);
    assert.equal(slip.insuranceDeduction, 3_150_000);
    // 42,149,999 - 3,150,000 - 15,500,000 - 6,200,000 x 1 dependant
    assert.equal(slip.taxAssessableIncome, 17_299_999);
    assert.equal(slip.personalIncomeTax, 1_230_000);
    assert.equal(slip.netIncome, 37_058_461);
  });

  it('taxes a contract shorter than three months at a flat 10% of the taxable income', async () => {
    const slip = await generate({ staff: { contractStart: '2026-10-01', contractEnd: '2026-12-15' } });

    assert.equal(slip.taxMethod, 'flat10');
    assert.equal(slip.personalIncomeTax, 1_095_000);
    assert.equal(slip.netIncome, 8_282_693);
  });

  it('deducts no insurance and no tax when the employee is not insured or not taxed', async () => {
    const uninsured = await generate({ staff: { insured: false } });
    assert.equal(uninsured.insuranceDeduction, 0);
    assert.deepEqual(uninsured.toJSON().insuranceBreakdown, { bhxh: 0, bhyt: 0, bhtn: 0 });
    assert.equal(uninsured.netIncome, 10_007_693);

    const untaxed = await generate({ staff: { hasTax: false, contractStart: null } });
    assert.equal(untaxed.taxMethod, 'none');
    assert.equal(untaxed.personalIncomeTax, 0);
    assert.deepEqual(untaxed.warnings, []);
  });

  it('pays no KPI and warns when the employee has no KPI row', async () => {
    const slip = await generate({ kpi: null });

    assert.equal(slip.kpiActualPay, 0);
    assert.equal(slip.grossIncome, 6_807_693);
    assert.deepEqual(codes(slip), ['KPI_PROPOSAL_MISSING', 'KPI_SCORE_MISSING']);
  });

  it('caps the proposed KPI amount at the level maximum and warns', async () => {
    const slip = await generate({ staff: { kpiCap: { applicable: true, kpiMax: 4_000_000 } } });

    assert.equal(slip.kpiActualPay, 3_360_000);
    assert.equal(slip.toJSON().kpiAppliedAmount, 4_000_000);
    assert.equal(slip.toJSON().kpiProposedAmount, 5_000_000);
    assert.deepEqual(codes(slip), ['KPI_PROPOSAL_EXCEEDS_MAX']);
  });

  it('gives no KPI and no warning to a position without KPI pay', async () => {
    const slip = await generate({
      staff: { employeeType: 'tts', kpiCap: { applicable: false, kpiMax: null } },
      kpi: null
    });

    assert.equal(slip.kpiActualPay, 0);
    assert.equal(slip.toJSON().kpiApplicable, false);
    assert.deepEqual(slip.warnings, []);
  });

  it('warns when a taxed employee has no contract start date', async () => {
    const slip = await generate({ staff: { contractStart: null } });

    assert.deepEqual(codes(slip), ['CONTRACT_START_MISSING']);
    assert.equal(slip.taxMethod, 'progressive');
  });

  it('rejects an employee whose base salary or standard workdays are not configured', async () => {
    await assert.rejects(generate({ staff: { baseSalary: null } }), /Thiếu cấu hình chức vụ hoặc bậc lương cho/);
    await assert.rejects(generate({ staff: { standardWorkdays: null } }), /Thiếu cấu hình chức vụ hoặc bậc lương cho/);
  });

  it('defaults a hand-built payslip to no KPI, no insurance and no tax', () => {
    const slip = new EmployeePayslip({
      employeeId: 'manual',
      fullName: 'Manual',
      positionLevelText: 'L1',
      contractStatusText: 'Active',
      month: '2026-10',
      baseSalaryPolicy: 6_000_000,
      dailyLines: []
    });

    assert.equal(slip.username, 'manual');
    assert.equal(slip.kpiActualPay, 0);
    assert.equal(slip.insuranceDeduction, 0);
    assert.equal(slip.taxMethod, 'none');
    assert.equal(slip.personalIncomeTax, 0);
    assert.equal(slip.dependants, 0);
    assert.deepEqual(slip.warnings, []);
  });

  it('reports each employee that fails and still saves the payslips that succeeded', async () => {
    const { repo, service } = setup();
    const result = await service.calculatePeriodPayslips('2026-10', ['u1', 'missing'], 'admin');

    assert.equal(result.items.length, 1);
    assert.deepEqual(result.errors, [
      { employeeId: 'missing', message: 'Data not found for employee missing in month 2026-10' }
    ]);
    assert.equal(repo.runs[0].slipsTotal, 1);
    assert.equal(repo.runs[0].slipsError, 1);
  });

  it('reports a missing salary configuration as an error for that employee', async () => {
    const { service } = setup({ staff: { baseSalary: null } });
    const result = await service.calculatePeriodPayslips('2026-10', ['u1']);

    assert.equal(result.items.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].employeeId, 'u1');
    assert.match(result.errors[0].message, /Thiếu cấu hình/);
  });

  it('keeps one payslip per username when an employee is listed twice', async () => {
    const { repo, service } = setup();
    repo.data.set('a:2026-10', nvMonthData());

    assert.equal((await service.calculatePeriodPayslips('2026-10', ['u1', 'u1'])).items.length, 1);
    const byUsername = await service.calculatePeriodPayslips('2026-10', ['u1', 'a']);
    assert.equal(byUsername.items.length, 1);
    assert.deepEqual(byUsername.errors, []);
  });
});
