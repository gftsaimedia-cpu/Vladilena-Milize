import assert from 'node:assert/strict';
import { test, describe, it } from 'node:test';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import {
  PayrollRepository,
  EmployeeMonthlyRawData,
  mapMonthRows
} from '../../src/modules/payroll/payroll.repository';
import { EmployeePayslip } from '../../src/modules/payroll/domain';
import type { Kysely } from 'kysely';
import type { AttendanceDayRecord } from '../../src/modules/attendance/attendance-days.repository';
import type { ShiftFacts } from '../../src/modules/attendance/domain/attendance-day';
import {
  FakeDays,
  type MonthFixture,
  SEED_RATES,
  dayRow,
  nvMonthData,
  payslipLine,
  punched,
  seedRatesFor
} from './payroll-fixtures';
import type { AllowanceRates } from '../../src/modules/payroll/domain/allowance-rates';

// Staff fields the V2 rules added; the older fixtures below do not depend on them.
const rulesStaff = {
  insured: true,
  dependants: 0,
  contractTerm: 'long' as const,
  kpiCap: { applicable: false, kpiMax: null }
};

class FakePayrollRepository extends PayrollRepository {
  data: Map<string, any> = new Map();
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

/** The service on a fake repository; the day rows of a person are the `days` of the fixture with that uuid and month. */
const serviceOf = (repo: FakePayrollRepository) =>
  new PayrollService(
    repo,
    undefined,
    new FakeDays(
      (uuid, month) =>
        [...repo.data.entries()].find(([key, fixture]) => key.endsWith(`:${month}`) && fixture.staff.uuid === uuid)?.[1]
          .days
    )
  );

/** A PRESENT row on a shift of that type, punched over its hours. */
const shiftRow = (
  date: string,
  type: ShiftFacts['type'],
  [start, end]: [string, string],
  over: Partial<AttendanceDayRecord> = {}
): AttendanceDayRecord =>
  dayRow('PRESENT', date, {
    shift: { type, start, end, allowancePct: 0 },
    ...punched(date, start, end),
    ...over
  });

describe('Payroll V2 - Tính lương & Xuất phiếu lương chu kỳ', () => {
  const repo = new FakePayrollRepository();
  const service = serviceOf(repo);

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
    days: [
      dayRow('PRESENT', '2026-10-01'),
      shiftRow('2026-10-02', 'FLEX', ['09:00', '18:00'], { shift: { type: 'FLEX', start: '09:00', end: '18:00', allowancePct: 20 } }),
      dayRow('LEAVE_PAID', '2026-10-03')
    ].map(row => ({ ...row, employeeId: empId })),
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
      allowanceRates: seedRatesFor(overrides.employeeType),
      ...overrides
    });

  const worked = (n: number) => Array.from({ length: n }, () => payslipLine('PRESENT'));
  const staffOf = (uuid: string, employeeType: string | undefined, nightAllowancePct: number, allowanceRates: AllowanceRates | null) => ({
    uuid,
    username: uuid,
    name: uuid,
    positionLevelText: 'L1',
    contractStatusText: 'Active',
    baseSalary: 6_000_000,
    standardWorkdays: 26,
    employeeType,
    nightAllowancePct,
    isDormResident: false,
    allowanceRates,
    ...rulesStaff
  });

  // One PRESENT row of that shift type on 01/10; `row` changes the row (e.g. a day that does not count as a work day).
  const calculateLine = async (
    employeeType: string | undefined,
    shiftType: ShiftFacts['type'],
    workHours: number,
    nightAllowancePct = 40,
    allowanceRates: AllowanceRates | null = seedRatesFor(employeeType),
    row: Partial<AttendanceDayRecord> = {}
  ) => {
    const repo = new FakePayrollRepository();
    repo.data.set('allowance:2026-10', {
      staff: staffOf('allowance', employeeType, nightAllowancePct, allowanceRates),
      days: [
        dayRow('PRESENT', '2026-10-01', {
          employeeId: 'allowance',
          shift: { type: shiftType, start: '08:00', end: '17:00', allowancePct: nightAllowancePct },
          workHours,
          ...row
        })
      ],
      requests: [],
      kpi: null
    });
    return serviceOf(repo).generateMonthlyPayslip('allowance', '2026-10');
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
    const eligible = makePayslip({ employeeType: 'nv', dailyLines: worked(20) });
    const idorm = makePayslip({ employeeType: 'nv', isDormResident: true, dailyLines: worked(20) });
    const ineligible = makePayslip({
      employeeType: 'nv',
      dailyLines: [...worked(20), ...Array.from({ length: 5 }, () => payslipLine('LEAVE_PAID'))]
    });
    const tts = makePayslip({ employeeType: 'tts', dailyLines: worked(20) });

    assert.equal(eligible.travelAllowanceActual, 692_308);
    assert.equal(eligible.attendanceAllowanceActual, 1_153_846);
    assert.equal(idorm.travelAllowanceActual, 0);
    assert.equal(idorm.attendanceAllowanceActual, 1_153_846);
    assert.equal(ineligible.attendanceAllowanceActual, 0);
    assert.equal(tts.travelAllowanceActual, 0);
    assert.equal(tts.attendanceAllowanceActual, 0);

    // A leave with makeup that was fully made up is not an absence (L16): 4 day-off rows keep the allowance at the
    // default threshold of 5. The made-up day is a day whose work is makeup, an EXTRA row (rest day, not a work day):
    // it is paid makeup x1 only and counts no allowance day (D13, which overrides R10). So the ratio stays 19 / 26:
    // attendance 0.25 x 6.000.000 x 19 / 26 = 1.096.153,85 and travel 0.15 x 6.000.000 x 19 / 26 = 657.692,31.
    const leaves = Array.from({ length: 4 }, () => payslipLine('LEAVE_PAID'));
    const makeupOffsetsAbsence = makePayslip({
      employeeType: 'nv',
      dailyLines: [
        ...worked(19),
        payslipLine('EXTRA', { makeupMinutes: 480 }),
        ...leaves,
        payslipLine('LEAVE_MAKEUP')
      ]
    });
    assert.equal(makeupOffsetsAbsence.attendanceAllowanceActual, 1_096_154);
    assert.equal(makeupOffsetsAbsence.travelAllowanceActual, 657_692);
    const notMadeUp = makePayslip({
      employeeType: 'nv',
      dailyLines: [...worked(20), ...leaves, payslipLine('LEAVE_MAKEUP')]
    });
    assert.equal(notMadeUp.attendanceAllowanceActual, 0);
  });

  it('does not grant NV-only allowances when employee type is missing or unknown', async () => {
    const unknown = makePayslip({ dailyLines: worked(20) });
    assert.equal(unknown.travelAllowanceActual, 0);
    assert.equal(unknown.attendanceAllowanceActual, 0);
    assert.equal(unknown.flexAllowanceActual, 0);
    assert.equal(unknown.nightAllowanceActual, 0);
    const unknownNight = await calculateLine(undefined, 'NIGHT', 8);
    assert.equal(unknownNight.dailyLines[0].nightAllowancePay, 0);
    assert.equal(unknownNight.dailyLines[0].offPaidPay, 0);
  });

  it('reads Flex from the position version', async () => {
    const slip = await calculateLine('nv', 'FLEX', 8, 40, { ...SEED_RATES.nv, flexPct: 25 });
    assert.equal(slip.dailyLines[0].flexAllowancePay, 57_692);
    assert.equal(slip.dailyLines[0].shiftLabel, 'Flex +25%');
  });

  it('TTS night uses the level rate when it is set', async () => {
    const level = await calculateLine('tts', 'NIGHT', 8, 40, { ...SEED_RATES.tts, levelNightPct: 50 });
    const type = await calculateLine('tts', 'NIGHT', 8, 40, { ...SEED_RATES.tts, levelNightPct: null });
    assert.equal(level.dailyLines[0].nightAllowancePay, 115_385);
    assert.equal(level.dailyLines[0].shiftLabel, 'Night +50%');
    assert.equal(type.dailyLines[0].nightAllowancePay, 69_231);
  });

  it('a decimal % shows on the shift label as set, not rounded', async () => {
    const flex = await calculateLine('nv', 'FLEX', 8, 40, { ...SEED_RATES.nv, flexPct: 12.5 });
    assert.equal(flex.dailyLines[0].shiftLabel, 'Flex +12,5%');
    // 0.145 * 100 = 14.499999… trong số thực: làm tròn kiểu cũ ra 14.
    const night = await calculateLine('tts', 'NIGHT', 8, 40, { ...SEED_RATES.tts, levelNightPct: 14.5 });
    assert.equal(night.dailyLines[0].shiftLabel, 'Night +14,5%');
  });

  it('travel applies to any type with a rate and never to a dorm resident', () => {
    const dailyLines = worked(20);
    const allowanceRates = { ...SEED_RATES.tts, travelPct: 15 };
    const tts = makePayslip({ employeeType: 'tts', allowanceRates, dailyLines });
    const dorm = makePayslip({ employeeType: 'tts', allowanceRates, isDormResident: true, dailyLines });
    assert.equal(tts.travelAllowanceActual, 692_308);
    assert.equal(dorm.travelAllowanceActual, 0);
  });

  it('attendance applies to any type with a rate', () => {
    const ctv = makePayslip({
      employeeType: 'ctv',
      allowanceRates: { ...SEED_RATES.ctv, attendancePct: 25 },
      dailyLines: worked(20)
    });
    assert.equal(ctv.attendanceAllowanceActual, 1_153_846);
  });

  it('no position version pays no allowance', () => {
    const slip = makePayslip({ employeeType: 'nv', allowanceRates: null, dailyLines: worked(20) });
    assert.equal(slip.flexAllowancePolicy, 0);
    assert.equal(slip.nightAllowancePolicy, 0);
    assert.equal(slip.travelAllowancePolicy, 0);
    assert.equal(slip.attendanceAllowancePolicy, 0);
    assert.equal(slip.offPaidNightPolicy, 0);
  });

  it('applies the selected night rate and fills at most one short hour without a second credit', async () => {
    const repo = new FakePayrollRepository();
    const night = (date: string, over: Partial<AttendanceDayRecord>) =>
      dayRow('PRESENT', date, {
        employeeId: 'night',
        shift: { type: 'NIGHT', start: '22:00', end: '06:00', allowancePct: 60 },
        ...over
      });
    repo.data.set('night:2026-10', {
      staff: { ...staffOf('night', 'nv', 60, SEED_RATES.nv), positionLevelText: 'NV L1' },
      days: [
        night('2026-10-01', { workHours: 8 }),
        // Left 60 minutes early with an approved explanation: paid, 60 minutes deducted (one hour, 28,846).
        night('2026-10-02', {
          workHours: 7,
          earlyMinutes: 60,
          cases: [{ code: 'EARLY_CHECK_OUT', minutes: 60, affectsPay: true }],
          explanationStatus: 'APPROVED',
          deductionMinutes: 60
        })
      ],
      requests: [],
      kpi: null
    });
    const slip = await serviceOf(repo).generateMonthlyPayslip('night', '2026-10');
    assert.equal(slip.dailyLines[0].nightAllowancePay, 138_462);
    assert.equal(slip.dailyLines[0].offPaidPay, 46_154);
    assert.equal(slip.dailyLines[1].offPaidPay, 28_846);
    assert.equal(slip.offPaidNightActual, 75_000);

    // A night day that does not count as a work day (late without an explanation: 0 pay units) pays no premium.
    const unpaidNight = await calculateLine('nv', 'NIGHT', 8, 60, SEED_RATES.nv, {
      payUnits: 0,
      countsAsWorkday: false
    });
    assert.equal(unpaidNight.dailyLines[0].nightAllowancePay, 0);
    assert.equal(unpaidNight.dailyLines[0].offPaidPay, 0);
  });

  it('reads neither the old timesheet rows nor the iSAT registrations for the month data', async () => {
    const tables: string[] = [];
    let table = '';
    const qb = {
      selectFrom(nextTable: string) {
        table = nextTable;
        tables.push(nextTable.split(' ')[0]);
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
      leftJoin() {
        return this;
      },
      innerJoin() {
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
        return [];
      }
    };
    const repo = new PayrollRepository(qb as unknown as Kysely<any>);
    const data = await repo.getMonthlyData('repo-emp', '2026-10');

    assert.ok(data);
    assert.equal(tables.includes('timesheet_entries'), false);
    assert.equal(tables.includes('isat_registrations'), false);
    assert.equal('timesheets' in data, false);
    assert.equal('isatDates' in data, false);
  });

  it('pays a day of made-up hours makeup x1 only: not a work day, no premium (D13, was R10)', async () => {
    const repo = new FakePayrollRepository();
    const workdays = [1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22].map(
      day => `2026-10-${String(day).padStart(2, '0')}`
    );
    repo.data.set('makeup:2026-10', {
      staff: { ...staffOf('makeup', 'nv', 40, SEED_RATES.nv), positionLevelText: 'NV L1' },
      days: [
        ...workdays.map(date => dayRow('PRESENT', date)),
        // Sundays 04/10 and 11/10: the 18:00-22:00 makeup window worked on a rest day, 240 minutes x1 each, so the
        // leave with makeup of 28/10 is fully made up. A day whose work is makeup is an EXTRA row.
        dayRow('EXTRA', '2026-10-04', { ...punched('2026-10-04', '18:00', '22:00'), workHours: 4, makeupMinutes: 240 }),
        dayRow('EXTRA', '2026-10-11', { ...punched('2026-10-11', '18:00', '22:00'), workHours: 4, makeupMinutes: 240 }),
        ...[23, 24, 26, 27].map(day => dayRow('LEAVE_PAID', `2026-10-${day}`)),
        dayRow('LEAVE_MAKEUP', '2026-10-28')
      ].map(row => ({ ...row, employeeId: 'makeup' })),
      requests: [],
      kpi: null
    });

    const slip = await serviceOf(repo).generateMonthlyPayslip('makeup', '2026-10');

    // 19 work days: 6.000.000 x 19 / 26 = 4.384.615,38
    assert.equal(slip.actualWorkDays, 19);
    assert.equal(slip.baseSalaryActual, 4_384_615);
    // 19 / 26 of the 15% travel and 25% attendance: the made-up days count no day, and 4 days off stay below 5.
    assert.equal(slip.travelAllowanceActual, 657_692);
    assert.equal(slip.attendanceAllowanceActual, 1_096_154);
    // makeup x1: 6.000.000 x (480 / 60) / 208 = 230.769,23; each day shows 6.000.000 x 4 / 208 = 115.384,62
    assert.equal(slip.makeupPay, 230_769);
    const makeupDay = slip.dailyLines.find(row => row.date === '2026-10-11');
    assert.deepEqual(
      [makeupDay?.daySalary, makeupDay?.flexAllowancePay, makeupDay?.nightAllowancePay, makeupDay?.makeupPay],
      [0, 0, 0, 115_385]
    );
    assert.equal(slip.flexAllowanceActual, 0);
  });

  it('counts a leave with makeup that was not made up as an absence', async () => {
    const repo = new FakePayrollRepository();
    repo.data.set('planned-makeup:2026-10', {
      staff: { ...staffOf('planned-makeup', 'nv', 40, SEED_RATES.nv), positionLevelText: 'NV L1' },
      days: [
        ...Array.from({ length: 20 }, (_, i) => dayRow('PRESENT', `2026-10-${String(i + 1).padStart(2, '0')}`)),
        dayRow('LEAVE_MAKEUP', '2026-10-21'),
        ...Array.from({ length: 4 }, (_, i) => dayRow('LEAVE_PAID', `2026-10-${22 + i}`))
      ].map(row => ({ ...row, employeeId: 'planned-makeup' })),
      requests: [],
      kpi: null
    });
    const slip = await serviceOf(repo).generateMonthlyPayslip('planned-makeup', '2026-10');

    assert.equal(slip.attendanceAllowanceActual, 0);
    assert.equal(slip.travelAllowanceActual, 692_308);
  });
});

describe('Payroll V2 - KPI, insurance and income tax on the payslip', () => {
  type Overrides = Parameters<typeof nvMonthData>[0];

  const setup = (overrides?: Overrides) => {
    const repo = new FakePayrollRepository();
    repo.data.set('u1:2026-10', nvMonthData(overrides));
    return { repo, service: serviceOf(repo) };
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

  it('carries the type, level, employment status and annual leave left on the DTO', async () => {
    const dto = (
      await generate({ staff: { level: 2, employmentStatus: 'probation', remainingAnnualLeaveDays: 10 } })
    ).toJSON();
    assert.equal(dto.employeeType, 'nv');
    assert.equal(dto.level, 2);
    assert.equal(dto.employmentStatus, 'probation');
    assert.equal(dto.remainingAnnualLeaveDays, 10);

    const noAccount = (await generate({ staff: { remainingAnnualLeaveDays: null } })).toJSON();
    assert.equal(noAccount.remainingAnnualLeaveDays, null);
    const spent = (await generate({ staff: { remainingAnnualLeaveDays: 0 } })).toJSON();
    assert.equal(spent.remainingAnnualLeaveDays, 0);
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

  describe('tax-exempt income', () => {
    const nightLine = payslipLine('PRESENT', {
      date: '2026-10-01',
      dayOfWeekText: 'Thứ 5',
      shiftCode: 'NIGHT',
      shiftLabel: 'Night +40%',
      inOutText: '22:00–06:00',
      workHours: 8,
      daySalary: 230_769,
      nightAllowancePay: 92_308,
      dailyTotal: 323_077
    });
    const exemptSlip = (
      dailyLines: Array<typeof nightLine>,
      otHoursByRate?: { x15?: number; x20?: number; x30?: number },
      nightAllowancePct = 40,
      over: Partial<ConstructorParameters<typeof EmployeePayslip>[0]> = {}
    ) =>
      new EmployeePayslip({
        employeeId: 'exempt',
        fullName: 'Exempt',
        positionLevelText: 'NV L1',
        contractStatusText: 'Active',
        month: '2026-10',
        standardWorkdays: 26,
        baseSalaryPolicy: 6_000_000,
        employeeType: 'nv',
        nightAllowancePct,
        allowanceRates: SEED_RATES.nv,
        dailyLines,
        otHoursByRate,
        ...over
      });

    it('exempts the OT premium of each rate and, per night line, up to 30% of the hourly pay', () => {
      const slip = exemptSlip([nightLine, { ...nightLine, date: '2026-10-02' }], { x15: 4, x20: 3, x30: 1 });

      // hourly rate = 6,000,000 / 26 / 8 = 28,846.15. Exempt OT = the premium over the normal hour:
      // 4 h at 150% x 0.5 + 3 h at 200% x 1 + 1 h at 300% x 2 = 7 hourly rates = 201,923.08 -> 201,923.
      // Night: per line min(8 h x 28,846.15 x 0.3 = 69,230.77, allowance 92,308) = 69,230.77; 2 lines = 138,461.54
      // -> 138,462. The 92,308 allowance paid per night is larger, so only the 30% part is exempt.
      // D1: the night allowance is 0.4 x 6,000,000 x 2 nights / 26 = 184,615.38 -> 184,615, rounded once (the two lines
      // show 92,308 each, which summed gave 184,616 before).
      assert.equal(slip.nightAllowanceActual, 184_615);
      assert.equal(slip.taxExemptIncome, 340_385);
    });

    it('exempts 30% of the hourly pay on each of 20 night shifts', () => {
      const lines = Array.from({ length: 20 }, (_, i) => ({
        ...nightLine,
        date: `2026-10-${String(i + 1).padStart(2, '0')}`,
        nightAllowancePay: 138_462
      }));
      const slip = exemptSlip(lines, undefined, 60);

      // Per line min(8 x 28,846.15 x 0.3 = 69,230.77, 138,462) = 69,230.77; 20 lines = 1,384,615.38 -> 1,384,615.
      // D1: the night allowance is 0.6 x 6,000,000 x 20 nights / 26 = 2,769,230.77 -> 2,769,231, rounded once (20 lines
      // of 138,462 summed gave 2,769,240 before: 20 x 0.46 of per-line rounding).
      assert.equal(slip.nightAllowanceActual, 2_769_231);
      assert.equal(slip.taxExemptIncome, 1_384_615);
    });

    it('exempts nothing for a night shift that paid no allowance', () => {
      // A night day that is not a work day pays no night allowance, so nothing is exempt. The allowance comes from the
      // row fields (D1), so the line is one that does not count as a work day.
      const slip = exemptSlip([
        { ...nightLine, payUnits: 0, countsAsWorkday: false, daySalary: 0, nightAllowancePay: 0, dailyTotal: 0 }
      ]);
      assert.equal(slip.taxExemptIncome, 0);
    });

    it('scales the exemption by the hours worked on a short night shift', () => {
      const slip = exemptSlip([{ ...nightLine, workHours: 4 }]);

      // 4 h x 28,846.15 x 0.3 = 34,615.38 -> 34,615, below the 92,308 allowance.
      assert.equal(slip.taxExemptIncome, 34_615);
    });

    it('caps the exemption at the allowance when that is lower than 30% of the hourly pay', () => {
      // A night rate of 20% (a level override): the allowance 0.2 x 230,769.23 = 46,153.85 is below 8 h x 28,846.15 x 0.3
      // = 69,230.77, so the exemption is the allowance, exact, rounded once -> 46,154. (D1: the allowance is the rate
      // of the row, no longer an amount written on the line; this test used a 50,000 line amount before.)
      const slip = exemptSlip([{ ...nightLine, nightAllowancePay: 46_154 }], undefined, 40, {
        employeeType: 'tts',
        allowanceRates: { ...SEED_RATES.tts, levelNightPct: 20 }
      });
      assert.equal(slip.nightAllowanceActual, 46_154);
      assert.equal(slip.taxExemptIncome, 46_154);
    });

    it('exempts nothing from lines of other shifts', () => {
      const flexLine = { ...nightLine, shiftCode: 'FLEX', nightAllowancePay: 0, flexAllowancePay: 46_154 };
      const normalLine = { ...nightLine, shiftCode: 'NORMAL', nightAllowancePay: 0 };
      assert.equal(exemptSlip([flexLine, normalLine]).taxExemptIncome, 0);
    });
  });

  it('taxes a contract shorter than three months at a flat 10% of gross', async () => {
    const slip = await generate({ staff: { contractTerm: 'short' } });

    assert.equal(slip.taxMethod, 'flat10');
    assert.equal(slip.grossIncome, 11_007_693);
    assert.equal(slip.taxableIncome, 10_950_001);
    assert.equal(slip.taxAssessableIncome, 11_007_693);
    // 10% of gross (11,007,693), not of gross minus the exempt part.
    assert.equal(slip.personalIncomeTax, 1_100_769);
    assert.equal(slip.netIncome, 8_276_924);
  });

  it('deducts no insurance when the employee is not insured', async () => {
    const uninsured = await generate({ staff: { insured: false } });
    assert.equal(uninsured.insuranceDeduction, 0);
    assert.deepEqual(uninsured.toJSON().insuranceBreakdown, { bhxh: 0, bhyt: 0, bhtn: 0 });
    assert.equal(uninsured.netIncome, 10_007_693);
  });

  it('takes a trainee with no contract label to flat 10% tax and no insurance', async () => {
    const repo = new FakePayrollRepository();
    const level = { name: 'Thực tập sinh · Bậc 6', base_salary: '5000000', kpi_max: null };
    repo.data.set('t1:2026-10', {
      ...mapMonthRows('2026-10', {
        staff: { uuid: 't1', username: 't', name: 'Thực tập', type: 'tts', level: 6, contract: null, insured: null },
        type: { id: '1', workdays: '22', flex_pct: 10, night_pct: 30, travel_pct: 0, attendance_pct: 0 },
        level,
        benefits: [],
        requests: [],
        kpi: null
      }),
      days: Array.from({ length: 22 }, (_, i) =>
        dayRow('PRESENT', `2026-10-${String(i + 1).padStart(2, '0')}`, { employeeId: 't1' })
      )
    });
    const slip = await serviceOf(repo).generateMonthlyPayslip('t1', '2026-10');

    assert.equal(slip.contractStatusText, 'Dưới 3 tháng');
    assert.equal(slip.grossIncome, 5_000_000);
    assert.equal(slip.insuranceDeduction, 0);
    assert.equal(slip.taxMethod, 'flat10');
    assert.equal(slip.personalIncomeTax, 500_000);
    assert.equal(slip.netIncome, 4_500_000);
    assert.deepEqual(slip.warnings, []);
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

describe('Payroll V2 - approved iSAT Saturdays', () => {
  const generate = async (days: AttendanceDayRecord[]) => {
    const repo = new FakePayrollRepository();
    repo.data.set('u1:2026-10', { ...nvMonthData(), days, requests: [] });
    return serviceOf(repo).generateMonthlyPayslip('u1', '2026-10');
  };

  it('pays an ISAT row as one base day on its own line', async () => {
    const slip = await generate([dayRow('PRESENT', '2026-10-09'), dayRow('ISAT', '2026-10-10')]);
    assert.deepEqual(
      slip.dailyLines.map(l => [l.date, l.shiftCode]),
      [
        ['2026-10-09', 'NORMAL'],
        ['2026-10-10', 'ISAT']
      ]
    );
    const line = slip.dailyLines[1];
    assert.deepEqual(
      [
        line.dayOfWeekText,
        line.shiftLabel,
        line.inOutText,
        line.workHours,
        line.daySalary,
        line.flexAllowancePay,
        line.nightAllowancePay,
        line.offPaidPay,
        line.otHours,
        line.deductionAmount,
        line.dailyTotal
      ],
      ['Thứ 7', 'iSAT', 'Hưởng lương ngày', 0, 230769, 0, 0, 0, 0, 0, 230769]
    );
    assert.equal(slip.isatDays, 1);
    assert.equal(slip.isatPay, 230769);
    assert.equal(slip.actualWorkDays, 1);
  });

  it('pays an ISAT row alone in the month', async () => {
    const slip = await generate([dayRow('ISAT', '2026-10-10')]);
    assert.deepEqual(
      slip.dailyLines.map(l => [l.date, l.shiftCode, l.dailyTotal]),
      [['2026-10-10', 'ISAT', 230769]]
    );
    assert.equal(slip.isatDays, 1);
    assert.equal(slip.isatPay, 230769);
    assert.equal(slip.actualWorkDays, 0);
  });

  // One row per person and day is the table's own rule (uq_timesheet_emp_date), so a Saturday cannot be listed twice;
  // what the payslip still decides is whether the row pays: a type without the iSAT benefit gets 0 pay units.
  it('pays an ISAT row with 0 pay units nothing', async () => {
    const slip = await generate([dayRow('ISAT', '2026-10-10', { payUnits: 0 })]);
    assert.deepEqual(
      slip.dailyLines.map(l => [l.date, l.shiftCode, l.daySalary, l.inOutText]),
      [['2026-10-10', 'ISAT', 0, 'Không tính lương']]
    );
    assert.equal(slip.isatDays, 0);
    assert.equal(slip.isatPay, 0);
  });

  it('sorts the iSAT line between the attendance lines by date', async () => {
    const slip = await generate([
      dayRow('PRESENT', '2026-10-12'),
      dayRow('ISAT', '2026-10-10'),
      dayRow('PRESENT', '2026-10-09')
    ]);
    assert.deepEqual(
      slip.dailyLines.map(l => [l.date, l.shiftCode]),
      [
        ['2026-10-09', 'NORMAL'],
        ['2026-10-10', 'ISAT'],
        ['2026-10-12', 'NORMAL']
      ]
    );
  });

  it('ignores the lateness on an ISAT row', async () => {
    const slip = await generate([dayRow('ISAT', '2026-10-10', { lateMinutes: 30 })]);
    assert.deepEqual(
      slip.dailyLines.map(l => [l.date, l.shiftCode, l.dailyTotal]),
      [['2026-10-10', 'ISAT', 230769]]
    );
    assert.equal(slip.lateEarlyHours, 0);
  });

  it('counts an iSAT Saturday neither as a work day nor as a day off for the allowances', async () => {
    const slip = await generate([dayRow('PRESENT', '2026-10-09'), dayRow('ISAT', '2026-10-10')]);
    assert.deepEqual(
      slip.dailyLines.map(l => [l.date, l.shiftCode]),
      [
        ['2026-10-09', 'NORMAL'],
        ['2026-10-10', 'ISAT']
      ]
    );
    assert.equal(slip.actualWorkDays, 1);
    // One counted work day of 26 earns its share of the 25% attendance and 15% travel allowances.
    assert.equal(slip.attendanceAllowanceActual, 57_692);
    assert.equal(slip.travelAllowanceActual, 34_615);
  });

  it('pays no iSAT when the month has no ISAT row', async () => {
    const repo = new FakePayrollRepository();
    repo.data.set('u1:2026-10', nvMonthData());
    const slip = await serviceOf(repo).generateMonthlyPayslip('u1', '2026-10');
    assert.equal(slip.isatDays, 0);
    assert.equal(slip.isatPay, 0);
    assert.equal(
      slip.dailyLines.some(l => l.shiftCode === 'ISAT'),
      false
    );
  });
});

describe('Payroll V2 - day lines show real check-in and check-out times', () => {
  const explanation = (date: string, extra: object = {}) => ({
    id: `exp-${date}`,
    type: 'EXPLANATION',
    status: 'APPROVED',
    explanationDate: date,
    ...extra
  });
  const generate = async (days: AttendanceDayRecord[], requests: EmployeeMonthlyRawData['requests'] = []) => {
    const repo = new FakePayrollRepository();
    repo.data.set('u1:2026-10', { ...nvMonthData(), days, requests });
    return serviceOf(repo).generateMonthlyPayslip('u1', '2026-10');
  };
  const lineOf = (slip: EmployeePayslip, date: string) => slip.dailyLines.find(l => l.date === date)!;

  it('prints the punched times of a PRESENT day and null times on a LEAVE_PAID day', async () => {
    const slip = await generate([
      dayRow('PRESENT', '2026-10-07', punched('2026-10-07', '08:12', '17:05')),
      dayRow('LEAVE_PAID', '2026-10-08', punched('2026-10-08', '08:00', null))
    ]);
    const normal = lineOf(slip, '2026-10-07');
    assert.deepEqual([normal.checkIn, normal.checkOut, normal.inOutText], ['08:12', '17:05', '08:12–17:05']);
    const leave = lineOf(slip, '2026-10-08');
    assert.deepEqual([leave.checkIn, leave.checkOut, leave.inOutText], [null, null, 'Hưởng lương ngày']);
  });

  it('prints the real times of a NIGHT day crossing midnight', async () => {
    const slip = await generate([
      dayRow('PRESENT', '2026-10-05', {
        shift: { type: 'NIGHT', start: '22:00', end: '06:00', allowancePct: 40 },
        checkIn: new Date('2026-10-05T15:03:00.000Z'),
        checkOut: new Date('2026-10-05T23:58:00.000Z')
      })
    ]);
    assert.equal(lineOf(slip, '2026-10-05').inOutText, '22:03–06:58');
  });

  it('fills a missing check-out from the approved explanation of that day', async () => {
    const slip = await generate(
      [shiftRow('2026-10-07', 'FLEX', ['09:00', '18:00'], punched('2026-10-07', '08:12', null))],
      [explanation('2026-10-07', { actualCheckOut: '19:20' })]
    );
    const line = lineOf(slip, '2026-10-07');
    assert.deepEqual([line.checkIn, line.checkOut, line.inOutText], ['08:12', '19:20', '08:12–19:20']);
  });

  it('ignores an explanation that is not approved', async () => {
    const slip = await generate(
      [dayRow('PRESENT', '2026-10-07', punched('2026-10-07', '08:12', null))],
      [explanation('2026-10-07', { status: 'PENDING', actualCheckOut: '19:20' })]
    );
    assert.equal(lineOf(slip, '2026-10-07').inOutText, '08:12–—');
  });

  it('prints dashes for an ABSENT day and keeps the iSAT, LEAVE and UNPAID texts', async () => {
    const slip = await generate([
      dayRow('ABSENT', '2026-10-06'),
      dayRow('LEAVE_UNPAID', '2026-10-08'),
      dayRow('LEAVE_PAID', '2026-10-09'),
      dayRow('ISAT', '2026-10-10')
    ]);
    assert.deepEqual(
      slip.dailyLines.map(l => [l.date, l.inOutText, l.checkIn ?? null, l.checkOut ?? null]),
      [
        ['2026-10-06', '—–—', null, null],
        ['2026-10-08', 'Không tính lương', null, null],
        ['2026-10-09', 'Hưởng lương ngày', null, null],
        ['2026-10-10', 'Hưởng lương ngày', null, null]
      ]
    );
  });
});

describe('Payroll V2 - overtime paid per day from the approved window and the real presence', () => {
  const punch = (workDate: string, inHhmm: string, outHhmm: string | null, shiftType: ShiftFacts['type'] = 'NORMAL') =>
    dayRow('PRESENT', workDate, {
      shift: { type: shiftType, start: '08:00', end: '17:00', allowancePct: 0 },
      ...punched(workDate, inHhmm, outHhmm)
    });
  const nightRow = (workDate: string, checkOut: string) =>
    dayRow('PRESENT', workDate, {
      shift: { type: 'NIGHT', start: '22:00', end: '06:00', allowancePct: 40 },
      ...punched(workDate, '22:00', null),
      checkOut: new Date(checkOut)
    });
  const overtime = (id: string, otDate: string | null, extra: object = {}) => ({
    id,
    type: 'OVERTIME',
    status: 'APPROVED',
    otDate,
    otStartTime: '18:00',
    otEndTime: '20:00',
    otHours: 2,
    ...extra
  });
  const explanation = (date: string, extra: object = {}) => ({
    id: `exp-${date}`,
    type: 'EXPLANATION',
    status: 'APPROVED',
    explanationDate: date,
    ...extra
  });
  const generate = async (overrides: Partial<MonthFixture>) => {
    const repo = new FakePayrollRepository();
    repo.data.set('u1:2026-10', { ...nvMonthData(), requests: [], ...overrides });
    return serviceOf(repo).generateMonthlyPayslip('u1', '2026-10');
  };
  const lineOf = (slip: EmployeePayslip, date: string) => slip.dailyLines.find(l => l.date === date)!;

  it('pays the minutes worked inside the window and puts them on the day line', async () => {
    const slip = await generate({
      days: [punch('2026-10-07', '08:12', '19:20')],
      requests: [overtime('ot-1', '2026-10-07')]
    });
    const line = lineOf(slip, '2026-10-07');
    assert.equal(line.otPay, 57_692);
    assert.ok(Math.abs(line.otHours - 4 / 3) < 1e-9);
    assert.equal(line.dailyTotal, line.daySalary + 57_692);
    assert.equal(slip.otPayTotal, 57_692);
    assert.ok(Math.abs(slip.ot15Hours - 4 / 3) < 1e-9);
    assert.equal(slip.ot20Hours, 0);
    assert.equal(slip.ot30Hours, 0);
    assert.ok(Math.abs(slip.totalOtHours - 4 / 3) < 1e-9);
  });

  it('takes the missing check-out from the approved explanation', async () => {
    const slip = await generate({
      days: [punch('2026-10-07', '08:12', null)],
      requests: [overtime('ot-1', '2026-10-07'), explanation('2026-10-07', { actualCheckOut: '19:20' })]
    });
    assert.equal(lineOf(slip, '2026-10-07').otPay, 57_692);
    assert.equal(slip.otPayTotal, 57_692);
  });

  it('pays nothing for a missing check-out without an explanation', async () => {
    const slip = await generate({
      days: [punch('2026-10-07', '08:12', null)],
      requests: [overtime('ot-1', '2026-10-07')]
    });
    assert.equal(lineOf(slip, '2026-10-07').otPay, 0);
    assert.equal(lineOf(slip, '2026-10-07').otHours, 0);
    assert.equal(slip.otPayTotal, 0);
  });

  it('pays nothing and does not throw when the request has no start time', async () => {
    const slip = await generate({
      days: [punch('2026-10-07', '08:12', '20:30')],
      requests: [overtime('ot-1', '2026-10-07', { otStartTime: undefined })]
    });
    assert.equal(lineOf(slip, '2026-10-07').otPay, 0);
    assert.equal(slip.otPayTotal, 0);
  });

  it('ignores a window whose end is not after its start', async () => {
    const slip = await generate({
      days: [punch('2026-10-07', '08:12', '21:00')],
      requests: [overtime('ot-1', '2026-10-07', { otStartTime: '20:00', otEndTime: '18:00' })]
    });
    assert.equal(slip.otPayTotal, 0);
  });

  it('ignores an OT request that is not approved', async () => {
    const slip = await generate({
      days: [punch('2026-10-07', '08:12', '20:30')],
      requests: [overtime('ot-1', '2026-10-07', { status: 'PENDING' })]
    });
    assert.equal(slip.otPayTotal, 0);
  });

  // D1: the total is the sum of the three kinds of day, each one formula on its hours. With one line per kind, as
  // here, the lines add up to the same; in general they may differ by a few dong (the line amounts are display only).
  it('adds the weekday and the Saturday OT: the total is the sum of the kinds of day', async () => {
    const slip = await generate({
      days: [punch('2026-10-07', '08:12', '19:20'), punch('2026-10-10', '08:00', '20:30')],
      requests: [overtime('ot-1', '2026-10-07'), overtime('ot-2', '2026-10-10')]
    });
    assert.equal(lineOf(slip, '2026-10-07').otPay, 57_692);
    assert.equal(lineOf(slip, '2026-10-10').otPay, 115_385);
    assert.equal(slip.otPayTotal, 173_077);
    assert.equal(slip.ot15Pay, 57_692);
    assert.equal(slip.ot20Pay, 115_385);
    assert.equal(slip.ot30Pay, 0);
    assert.equal(slip.ot15Pay + slip.ot20Pay + slip.ot30Pay, slip.otPayTotal);
    assert.equal(
      slip.otPayTotal,
      slip.dailyLines.reduce((sum, l) => sum + l.otPay, 0)
    );
    assert.ok(Math.abs(slip.ot15Hours - 4 / 3) < 1e-9);
    assert.equal(slip.ot20Hours, 2);
    assert.ok(Math.abs(slip.totalOtHours - (4 / 3 + 2)) < 1e-9);
    assert.ok(
      Math.abs(
        slip.totalOtHours - slip.dailyLines.reduce((sum, l) => sum + l.otHours, 0)
      ) < 1e-9
    );
  });

  it('pays x3 on a company holiday, which wins over Saturday', async () => {
    const slip = await generate({
      days: [dayRow('HOLIDAY', '2026-10-10', punched('2026-10-10', '08:00', '20:30'))],
      requests: [overtime('ot-1', '2026-10-10')],
      holidayDates: ['2026-10-10']
    });
    assert.equal(lineOf(slip, '2026-10-10').otPay, 173_077);
    assert.equal(slip.otPayTotal, 173_077);
    assert.equal(slip.ot30Hours, 2);
    assert.equal(slip.ot20Hours, 0);
  });

  it('keeps the day lines and pays nothing for an OT date without an attendance line', async () => {
    const slip = await generate({
      days: [punch('2026-10-07', '08:12', '20:30')],
      requests: [overtime('ot-1', '2026-10-09')]
    });
    assert.equal(slip.dailyLines.length, 1);
    assert.equal(slip.otPayTotal, 0);
  });

  it('gives a line with a malformed explained time no presence, so no OT and no NaN', async () => {
    const slip = await generate({
      days: [punch('2026-10-07', '08:12', null)],
      requests: [overtime('ot-1', '2026-10-07'), explanation('2026-10-07', { actualCheckOut: 'xx:yy' })]
    });
    assert.equal(lineOf(slip, '2026-10-07').otPay, 0);
    assert.equal(slip.otPayTotal, 0);
    assert.ok(Number.isFinite(slip.otPayTotal));
    assert.ok(Number.isFinite(slip.grossIncome));
  });

  it('takes the hours of a night shift that run into the window of the next date', async () => {
    const slip = await generate({
      days: [nightRow('2026-10-05', '2026-10-06T06:30:00+07:00')],
      requests: [overtime('ot-1', '2026-10-06', { otStartTime: '05:00', otEndTime: '07:00' })]
    });
    const line = lineOf(slip, '2026-10-05');
    assert.equal(line.otHours, 1.5);
    assert.equal(line.otPay, 64_904);
    assert.equal(slip.otPayTotal, 64_904);
  });

  it('rounds the pay of two windows on one line once: 50 + 70 minutes at x1.5 is 86,538, not 86,539', async () => {
    const slip = await generate({
      days: [punch('2026-10-07', '06:10', '19:10')],
      requests: [
        overtime('ot-1', '2026-10-07', { otStartTime: '06:00', otEndTime: '07:00' }),
        overtime('ot-2', '2026-10-07', { otStartTime: '18:00', otEndTime: '20:00' })
      ]
    });
    const line = lineOf(slip, '2026-10-07');
    assert.equal(line.otHours, 2);
    assert.equal(line.otPay, 86_538);
    assert.equal(line.dailyTotal, line.daySalary + 86_538);
    assert.equal(slip.otPayTotal, 86_538);
  });

  it('rounds each multiplier of one line separately', async () => {
    // Night shift Fri 09/10 22:00 to Sat 10/10 06:00. Two weekday windows (50 and 69 minutes, x1.5) and a Saturday
    // window (60 minutes, x2) all belong to the 09/10 line: round(119/60 h x1.5) + round(1 h x2) = 85,817 + 57,692.
    const slip = await generate({
      days: [nightRow('2026-10-09', '2026-10-10T06:00:00+07:00')],
      requests: [
        overtime('ot-1', '2026-10-09', { otStartTime: '22:00', otEndTime: '22:50' }),
        overtime('ot-2', '2026-10-09', { otStartTime: '22:50', otEndTime: '23:59' }),
        overtime('ot-3', '2026-10-10', { otStartTime: '05:00', otEndTime: '06:00' })
      ]
    });
    const line = lineOf(slip, '2026-10-09');
    assert.ok(Math.abs(line.otHours - (119 / 60 + 1)) < 1e-9);
    assert.equal(line.otPay, 85_817 + 57_692);
    assert.equal(slip.otPayTotal, 143_509);
    assert.ok(Math.abs(slip.ot15Hours - 119 / 60) < 1e-9);
    assert.equal(slip.ot20Hours, 1);
    assert.equal(slip.ot15Pay, 85_817);
    assert.equal(slip.ot20Pay, 57_692);
    assert.equal(slip.ot30Pay, 0);
    assert.equal(slip.ot15Pay + slip.ot20Pay + slip.ot30Pay, slip.otPayTotal);
  });

  it('puts a holiday OT on the x3 pay', async () => {
    const slip = await generate({
      days: [dayRow('HOLIDAY', '2026-10-10', punched('2026-10-10', '08:00', '20:30'))],
      requests: [overtime('ot-1', '2026-10-10')],
      holidayDates: ['2026-10-10']
    });
    assert.equal(slip.ot30Pay, 173_077);
    assert.equal(slip.ot15Pay, 0);
    assert.equal(slip.ot20Pay, 0);
  });
});

describe('Payroll V2 - day rate and the real weekday of every day line', () => {
  it('carries the day rate rounded from the base salary and the standard workdays', async () => {
    const repo = new FakePayrollRepository();
    repo.data.set('u1:2026-10', nvMonthData());
    const slip = await serviceOf(repo).generateMonthlyPayslip('u1', '2026-10');
    assert.equal(slip.dayRate, 230_769);
    assert.equal(slip.toJSON().dayRate, 230_769);
    assert.equal(slip.toJSON().ot15Pay, 0);
  });

  it('writes the weekday of the date on attendance, leave, extra and iSAT lines', async () => {
    const repo = new FakePayrollRepository();
    repo.data.set('u1:2026-10', {
      ...nvMonthData(),
      days: [
        dayRow('PRESENT', '2026-10-01'),
        dayRow('LEAVE_PAID', '2026-10-02'),
        dayRow('PRESENT', '2026-10-03'),
        dayRow('EXTRA', '2026-10-04', punched('2026-10-04', '08:00', '12:00')),
        dayRow('PRESENT', '2026-10-05'),
        dayRow('ISAT', '2026-10-10')
      ],
      requests: []
    });
    const slip = await serviceOf(repo).generateMonthlyPayslip('u1', '2026-10');
    assert.deepEqual(
      slip.dailyLines.map(l => [l.date, l.dayOfWeekText]),
      [
        ['2026-10-01', 'Thứ 5'],
        ['2026-10-02', 'Thứ 6'],
        ['2026-10-03', 'Thứ 7'],
        ['2026-10-04', 'Chủ nhật'],
        ['2026-10-05', 'Thứ 2'],
        ['2026-10-10', 'Thứ 7']
      ]
    );
  });
});
