import assert from 'node:assert/strict';
import { test, describe, it } from 'node:test';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { PayrollRepository, EmployeeMonthlyRawData } from '../../src/modules/payroll/payroll.repository';
import { EmployeePayslip } from '../../src/modules/payroll/domain';
import type { Kysely } from 'kysely';

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
      kpiMaxSalary: 15600000,
      remainingAnnualLeaveDays: 12
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
    kpiScore: {
      wework: 100,
      user: 95,
      peer: 90,
      manager: 95,
      self: 95
    }
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
        isDormResident: false
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
      kpiScore: null
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
        isDormResident: false
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
      kpiScore: null
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
        isDormResident: false
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
      kpiScore: null
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
        isDormResident: false
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
      kpiScore: null
    });
    const slip = await payroll.generateMonthlyPayslip('planned-makeup', '2026-10');

    assert.equal(slip.attendanceAllowanceActual, 0);
    assert.equal(slip.travelAllowanceActual, 692_308);
  });
});
