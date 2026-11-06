import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AttendanceDayRecord } from '../../src/modules/attendance/attendance-days.repository';
import {
  EmployeePayslip,
  explanationWarning,
  makeupShortfallDays,
  type DailyAttendanceLineProps
} from '../../src/modules/payroll/domain';
import { PayrollRepository, type EmployeeMonthlyRawData } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { FakeDays, SEED_RATES, dayRow, payslipLine, punched } from './payroll-fixtures';

// Bình, nv level 1: 6,000,000 / 26 days -> 230,769 a day, 28,846.15 an hour (spec 2).
const DAY = 230_769;
const pad = (n: number) => String(n).padStart(2, '0');

describe('makeupShortfallDays (L16)', () => {
  it('counts the leave-with-makeup days still owed after the month’s makeup minutes', () => {
    assert.equal(makeupShortfallDays(1, 480), 0);
    assert.equal(makeupShortfallDays(1, 420), 1);
    assert.equal(makeupShortfallDays(2, 480), 1);
    assert.equal(makeupShortfallDays(2, 0), 2);
    assert.equal(makeupShortfallDays(0, 0), 0);
  });

  it('never counts more days than the leave-with-makeup days, nor below zero', () => {
    assert.equal(makeupShortfallDays(1, 0), 1);
    assert.equal(makeupShortfallDays(1, 600), 0);
    assert.equal(makeupShortfallDays(0, 240), 0);
  });
});

describe('explanationWarning (P9)', () => {
  it('names the day and the explanation state, with the date as the field', () => {
    assert.deepEqual(explanationWarning('EXPLANATION_PENDING', '2026-11-03'), {
      code: 'EXPLANATION_PENDING',
      message: '03/11 chờ giải trình',
      fields: ['2026-11-03']
    });
    assert.deepEqual(explanationWarning('EXPLANATION_MISSING', '2026-11-05'), {
      code: 'EXPLANATION_MISSING',
      message: '05/11 chưa giải trình',
      fields: ['2026-11-05']
    });
    assert.deepEqual(explanationWarning('EXPLANATION_REJECTED', '2026-11-06'), {
      code: 'EXPLANATION_REJECTED',
      message: '06/11 giải trình bị từ chối',
      fields: ['2026-11-06']
    });
  });
});

describe('EmployeePayslip counts the day lines by their row fields', () => {
  // Bình with the seeded nv rates (attendance 25%, travel 15%) and the settings threshold: diligence lost from 3 days.
  const slipOf = (dailyLines: DailyAttendanceLineProps[], diligenceLostFromDays = 3) =>
    new EmployeePayslip({
      employeeId: 'u-binh',
      fullName: 'Bình',
      positionLevelText: 'Nhân viên',
      contractStatusText: 'HĐLĐ từ 3 tháng',
      month: '2026-11',
      standardWorkdays: 26,
      baseSalaryPolicy: 6_000_000,
      employeeType: 'nv',
      allowanceRates: SEED_RATES.nv,
      diligenceLostFromDays,
      dailyLines
    });
  const worked = (n: number) =>
    Array.from({ length: n }, (_, i) => payslipLine('PRESENT', { date: `2026-11-${pad(i + 2)}` }));
  // 20 worked days of 26: attendance 25% x 6,000,000 x 20/26, travel 15% x 6,000,000 x 20/26.
  const ATTENDANCE_20 = 1_153_846;

  it('takes the work days from countsAsWorkday, not from the shift code', () => {
    const slip = slipOf([
      ...worked(20),
      // A PRESENT day paid 0 (late, not explained) keeps its NORMAL shift code but is not a work day.
      payslipLine('PRESENT', { date: '2026-11-23', payUnits: 0, countsAsWorkday: false })
    ]);
    assert.equal(slip.actualWorkDays, 20);
    assert.equal(slip.baseSalaryActual, 4_615_385);
  });

  it('pays LEAVE_PAID, ISAT and HOLIDAY lines with payUnits 1 at the day rate (BUG-2)', () => {
    const slip = slipOf([
      ...worked(20),
      payslipLine('LEAVE_PAID', { date: '2026-11-18' }),
      payslipLine('HOLIDAY', { date: '2026-11-19', payUnits: 1 }),
      payslipLine('HOLIDAY', { date: '2026-11-20', payUnits: 0 }),
      payslipLine('ISAT', { date: '2026-11-21', payUnits: 1 }),
      payslipLine('ISAT', { date: '2026-11-28', payUnits: 0 }),
      payslipLine('LEAVE_UNPAID', { date: '2026-11-24' })
    ]);
    assert.equal(slip.paidLeaveDays, 1);
    assert.equal(slip.paidLeavePay, DAY);
    assert.equal(slip.holidayPaidDays, 1);
    assert.equal(slip.holidayPay, DAY);
    assert.equal(slip.isatDays, 1);
    assert.equal(slip.isatPay, DAY);
    assert.equal(slip.unpaidLeaveDays, 1);
    assert.equal(slip.actualWorkDays, 20);
  });

  it('a PRESENT day paid 0 is neither a work day nor a day off (L17)', () => {
    const unexplained = [3, 4, 5].map(d =>
      payslipLine('PRESENT', { date: `2026-11-${pad(d)}`, payUnits: 0, countsAsWorkday: false })
    );
    const slip = slipOf([...worked(20), ...unexplained]);
    assert.equal(slip.actualWorkDays, 20);
    assert.equal(slip.attendanceAllowanceActual, ATTENDANCE_20);
  });

  it('keeps diligence with 2 days off and loses it with 3 at the settings threshold (BUG-5)', () => {
    const two = [payslipLine('ABSENT', { date: '2026-11-05' }), payslipLine('LEAVE_PAID', { date: '2026-11-18' })];
    assert.equal(slipOf([...worked(20), ...two]).attendanceAllowanceActual, ATTENDANCE_20);

    const three = [...two, payslipLine('LEAVE_UNPAID', { date: '2026-11-24' })];
    assert.equal(slipOf([...worked(20), ...three]).attendanceAllowanceActual, 0);
  });

  it('counts a leave with makeup as a day off only while the month’s makeup is short (L16)', () => {
    const twoOff = [payslipLine('ABSENT', { date: '2026-11-05' }), payslipLine('LEAVE_PAID', { date: '2026-11-18' })];
    const leave = payslipLine('LEAVE_MAKEUP', { date: '2026-11-10' });
    const madeUp = (minutes: number) => payslipLine('PRESENT', { date: '2026-11-12', makeupMinutes: minutes });

    // 240 of 480 minutes made up: one day still owed, so 3 days off.
    assert.equal(slipOf([...worked(19), madeUp(240), leave, ...twoOff]).attendanceAllowanceActual, 0);
    // Fully made up: the leave does not count, 2 days off.
    assert.equal(slipOf([...worked(19), madeUp(480), leave, ...twoOff]).attendanceAllowanceActual, ATTENDANCE_20);
  });

  // D1: the makeup minutes of the month at the hourly rate, rounded once: 6.000.000 x (480 / 60) / 208 = 230.769,23. The
  // lines show 115.385 each, which summed gave 230.770 before.
  it('adds the makeup pay of the month to the gross income (P8, D1)', () => {
    const plain = slipOf(worked(20));
    const withMakeup = slipOf([
      ...worked(18),
      payslipLine('PRESENT', { date: '2026-11-12', makeupMinutes: 240, makeupPay: 115_385 }),
      payslipLine('PRESENT', { date: '2026-11-16', makeupMinutes: 240, makeupPay: 115_385 })
    ]);
    assert.equal(withMakeup.makeupPay, 230_769);
    assert.equal(withMakeup.toJSON().makeupPay, 230_769);
    assert.equal(withMakeup.actualWorkDays, plain.actualWorkDays);
    assert.equal(withMakeup.grossIncome, plain.grossIncome + 230_769);
  });
});

// The payslip service on hand-made day rows: Bình, nv level 1 (6,000,000 / 26 days), no KPI, November 2026.
const BINH = 'u-binh';
const binhData = (requests: EmployeeMonthlyRawData['requests'] = [], holidayDates: string[] = []) =>
  ({
    staff: {
      uuid: BINH,
      username: 'nv-binh',
      name: 'Bình',
      positionLevelText: 'Nhân viên',
      contractStatusText: 'HĐLĐ từ 3 tháng',
      baseSalary: 6_000_000,
      standardWorkdays: 26,
      employeeType: 'nv',
      level: 1,
      employmentStatus: 'official',
      nightAllowancePct: 40,
      isDormResident: false,
      allowanceRates: SEED_RATES.nv,
      remainingAnnualLeaveDays: null,
      contractTerm: 'long',
      insured: true,
      dependants: 0,
      kpiCap: { applicable: false, kpiMax: null }
    },
    requests,
    holidayDates,
    kpi: null
  }) as EmployeeMonthlyRawData;

class BinhRepository extends PayrollRepository {
  constructor(private readonly data: EmployeeMonthlyRawData) {
    super({} as any);
  }
  override async getMonthlyData(employeeId: string) {
    return employeeId === this.data.staff.uuid || employeeId === this.data.staff.username ? this.data : null;
  }
  override async listEligibleEmployees() {
    return [{ uuid: this.data.staff.uuid, username: this.data.staff.username, name: this.data.staff.name }];
  }
  override async savePayrollRunAndSlips(): Promise<number> {
    return 1;
  }
}

const NOW = new Date('2026-12-01T03:00:00.000Z');
const build = (rows: AttendanceDayRecord[], data = binhData()) => {
  const days = new FakeDays(() => rows.map(row => ({ ...row, employeeId: BINH })));
  const service = new PayrollService(new BinhRepository(data), undefined, days);
  service.now = () => NOW;
  return { days, service };
};
const slipOf = (rows: AttendanceDayRecord[], data = binhData()) =>
  build(rows, data).service.generateMonthlyPayslip(BINH, '2026-11');
const lineOf = (slip: EmployeePayslip, date: string) => slip.dailyLines.find(line => line.date === date)!;

describe('PayrollService reads the shared day rows (T6, spec 8.1)', () => {
  it('rewrites the month through AttendanceDaysService for the staff uuid with the service clock', async () => {
    const { days, service } = build([dayRow('PRESENT', '2026-11-02')]);
    await service.generateMonthlyPayslip('nv-binh', '2026-11');
    assert.deepEqual(days.calls, [{ employeeId: BINH, month: '2026-11', now: NOW }]);
  });

  it('rewrites each person’s month in the period run too', async () => {
    const { days, service } = build([dayRow('PRESENT', '2026-11-02')]);
    const result = await service.calculatePeriodPayslips('2026-11', undefined, 'admin');
    assert.deepEqual(result.errors, []);
    assert.deepEqual(days.calls, [{ employeeId: BINH, month: '2026-11', now: NOW }]);
  });

  it('shows every row except OUTSIDE, REST and PENDING, in date order', async () => {
    const slip = await slipOf([
      dayRow('PRESENT', '2026-11-03'),
      dayRow('OUTSIDE', '2026-11-01'),
      dayRow('PRESENT', '2026-11-02'),
      dayRow('REST', '2026-11-08'),
      dayRow('EXTRA', '2026-11-15', punched('2026-11-15', '08:00', '12:00')),
      dayRow('PENDING', '2026-11-30')
    ]);
    assert.deepEqual(
      slip.dailyLines.map(line => [line.date, line.kind]),
      [
        ['2026-11-02', 'PRESENT'],
        ['2026-11-03', 'PRESENT'],
        ['2026-11-15', 'EXTRA']
      ]
    );
  });

  it('maps the row kind to the shift code and never reads a missing shift', async () => {
    const flex = { type: 'FLEX' as const, start: '09:00', end: '18:00', allowancePct: 10 };
    const night = { type: 'NIGHT' as const, start: '22:00', end: '06:00', allowancePct: 30 };
    const slip = await slipOf([
      dayRow('PRESENT', '2026-11-02'),
      dayRow('PRESENT', '2026-11-03', { shift: flex }),
      dayRow('ABSENT', '2026-11-04', { shift: night }),
      dayRow('ABSENT', '2026-11-05', { shift: null }),
      dayRow('LEAVE_PAID', '2026-11-06'),
      dayRow('LEAVE_UNPAID', '2026-11-07'),
      dayRow('LEAVE_MAKEUP', '2026-11-09'),
      dayRow('ISAT', '2026-11-14'),
      dayRow('EXTRA', '2026-11-15', punched('2026-11-15', '08:00', '12:00')),
      dayRow('HOLIDAY', '2026-11-16')
    ]);
    assert.deepEqual(
      slip.dailyLines.map(line => [line.date, line.kind, line.shiftCode]),
      [
        ['2026-11-02', 'PRESENT', 'NORMAL'],
        ['2026-11-03', 'PRESENT', 'FLEX'],
        ['2026-11-04', 'ABSENT', 'NIGHT'],
        ['2026-11-05', 'ABSENT', 'NORMAL'],
        ['2026-11-06', 'LEAVE_PAID', 'LEAVE'],
        ['2026-11-07', 'LEAVE_UNPAID', 'UNPAID'],
        ['2026-11-09', 'LEAVE_MAKEUP', 'MAKEUP_LEAVE'],
        ['2026-11-14', 'ISAT', 'ISAT'],
        ['2026-11-15', 'EXTRA', 'EXTRA'],
        ['2026-11-16', 'HOLIDAY', 'HOLIDAY']
      ]
    );
  });

  it('carries the counting fields of the row on the line', async () => {
    const slip = await slipOf([
      dayRow('PRESENT', '2026-11-12', { makeupMinutes: 240 }),
      dayRow('ABSENT', '2026-11-05'),
      dayRow('LEAVE_MAKEUP', '2026-11-10')
    ]);
    assert.deepEqual(
      slip.dailyLines.map(l => [l.date, l.payUnits, l.countsAsWorkday, l.countsAsDayOff, l.makeupMinutes]),
      [
        ['2026-11-05', 0, false, true, 0],
        ['2026-11-10', 0, false, false, 0],
        ['2026-11-12', 1, true, false, 240]
      ]
    );
  });

  it('pays payUnits x day rate and deducts the row’s deductionMinutes (BUG-3, BUG-4)', async () => {
    const late = { ...punched('2026-11-03', '08:40', '17:00'), lateMinutes: 40 };
    const lateCase = [{ code: 'LATE_CHECK_IN' as const, minutes: 40, affectsPay: true }];
    const slip = await slipOf([
      dayRow('PRESENT', '2026-11-03', { ...late, cases: lateCase, explanationStatus: 'APPROVED', deductionMinutes: 30 }),
      dayRow('PRESENT', '2026-11-04', {
        ...punched('2026-11-04', '08:40', '17:00'),
        lateMinutes: 40,
        cases: lateCase,
        payUnits: 0
      })
    ]);
    const explained = lineOf(slip, '2026-11-03');
    assert.deepEqual(
      [explained.daySalary, explained.deductionHours, explained.deductionAmount, explained.dailyTotal],
      [DAY, 0.5, 14_423, 216_346]
    );
    const unexplained = lineOf(slip, '2026-11-04');
    assert.deepEqual([unexplained.daySalary, unexplained.deductionAmount, unexplained.dailyTotal], [0, 0, 0]);
    assert.equal(slip.actualWorkDays, 1);
    assert.equal(slip.lateEarlyHours, 0.5);
    assert.equal(slip.lateEarlyDeductionAmount, -14_423);
  });

  it('pays the makeup minutes at the hourly rate on the line of the makeup day (L14)', async () => {
    const slip = await slipOf([
      dayRow('LEAVE_MAKEUP', '2026-11-10'),
      dayRow('PRESENT', '2026-11-12', { ...punched('2026-11-12', '08:00', '22:00'), makeupMinutes: 240 })
    ]);
    const line = lineOf(slip, '2026-11-12');
    assert.deepEqual([line.daySalary, line.makeupPay, line.dailyTotal], [DAY, 115_385, DAY + 115_385]);
    assert.equal(lineOf(slip, '2026-11-10').daySalary, 0);
    assert.equal(slip.makeupPay, 115_385);
  });

  it('pays the flex and night premiums only on a line that counts as a work day', async () => {
    const flex = { type: 'FLEX' as const, start: '09:00', end: '18:00', allowancePct: 20 };
    const night = { type: 'NIGHT' as const, start: '22:00', end: '06:00', allowancePct: 40 };
    const unpaid = { payUnits: 0 as const, cases: [{ code: 'LATE_CHECK_IN' as const, minutes: 40, affectsPay: true }] };
    const slip = await slipOf([
      dayRow('PRESENT', '2026-11-02', { shift: flex }),
      dayRow('PRESENT', '2026-11-03', { shift: flex, ...unpaid }),
      dayRow('PRESENT', '2026-11-04', { shift: night }),
      dayRow('PRESENT', '2026-11-05', { shift: night, ...unpaid })
    ]);
    // Flex: 20% x 28,846.15 x 8 h; night: 40% x 230,769 and one paid break hour x 1.4.
    assert.equal(lineOf(slip, '2026-11-02').flexAllowancePay, 46_154);
    assert.equal(lineOf(slip, '2026-11-03').flexAllowancePay, 0);
    assert.deepEqual([lineOf(slip, '2026-11-04').nightAllowancePay, lineOf(slip, '2026-11-04').offPaidPay], [92_308, 40_385]);
    assert.deepEqual([lineOf(slip, '2026-11-05').nightAllowancePay, lineOf(slip, '2026-11-05').offPaidPay], [0, 0]);
    assert.equal(slip.flexShiftCount, 1);
    assert.equal(slip.nightShiftCount, 1);
  });

  it('fills the night break shortage up to the row’s deduction amount', async () => {
    const night = { type: 'NIGHT' as const, start: '22:00', end: '06:00', allowancePct: 40 };
    const slip = await slipOf([
      dayRow('PRESENT', '2026-11-02', {
        shift: night,
        workHours: 7,
        earlyMinutes: 60,
        cases: [{ code: 'EARLY_CHECK_OUT', minutes: 60, affectsPay: true }],
        explanationStatus: 'APPROVED',
        deductionMinutes: 60
      })
    ]);
    const line = lineOf(slip, '2026-11-02');
    assert.equal(line.deductionAmount, 28_846);
    assert.equal(line.offPaidPay, 28_846);
  });

  it('warns about each PRESENT or ABSENT day whose pay-affecting case is not approved', async () => {
    const late = [{ code: 'LATE_CHECK_IN' as const, minutes: 40, affectsPay: true }];
    const slip = await slipOf([
      dayRow('PRESENT', '2026-11-03', { cases: late, explanationStatus: 'APPROVED', deductionMinutes: 30 }),
      dayRow('PRESENT', '2026-11-04', { cases: late, payUnits: 0 }),
      dayRow('ABSENT', '2026-11-05'),
      dayRow('PRESENT', '2026-11-06', { cases: late, payUnits: 0, explanationStatus: 'REJECTED' }),
      dayRow('ABSENT', '2026-11-07', { explanationStatus: 'PENDING' }),
      // Only for information (L8): no warning.
      dayRow('PRESENT', '2026-11-09', { cases: [{ code: 'LATE_CHECK_OUT', minutes: 20, affectsPay: false }] })
    ]);
    assert.deepEqual(slip.warnings, [
      { code: 'EXPLANATION_MISSING', message: '04/11 chưa giải trình', fields: ['2026-11-04'] },
      { code: 'EXPLANATION_MISSING', message: '05/11 chưa giải trình', fields: ['2026-11-05'] },
      { code: 'EXPLANATION_REJECTED', message: '06/11 giải trình bị từ chối', fields: ['2026-11-06'] },
      { code: 'EXPLANATION_PENDING', message: '07/11 chờ giải trình', fields: ['2026-11-07'] }
    ]);
  });

  it('warns about nothing on an EXTRA or HOLIDAY row, even when it carries cases (FP5 #10)', async () => {
    const info = [{ code: 'MISSING_CHECK_OUT' as const, minutes: 0, affectsPay: false }];
    // Defensive: even a case flagged as pay-affecting never asks for an explanation outside PRESENT and ABSENT.
    const flagged = [{ code: 'EARLY_CHECK_OUT' as const, minutes: 60, affectsPay: true }];
    const slip = await slipOf([
      dayRow('EXTRA', '2026-11-08', { cases: info, explanationStatus: 'NONE' }),
      dayRow('EXTRA', '2026-11-15', { cases: flagged, explanationStatus: 'NONE' }),
      dayRow('HOLIDAY', '2026-11-09', { cases: info, explanationStatus: 'PENDING' }),
      dayRow('HOLIDAY', '2026-11-10', { cases: flagged, explanationStatus: 'REJECTED' })
    ]);
    assert.deepEqual(slip.warnings.filter(w => w.code.startsWith('EXPLANATION_')), []);
  });

  it('measures OT on PRESENT, EXTRA and HOLIDAY rows, not on a leave day with stray punches', async () => {
    const ot = (date: string, start: string, end: string) => ({
      id: `ot-${date}`,
      type: 'OVERTIME',
      status: 'APPROVED',
      otDate: date,
      otStartTime: start,
      otEndTime: end
    });
    const slip = await slipOf(
      [
        dayRow('PRESENT', '2026-11-02', punched('2026-11-02', '08:00', '19:00')),
        dayRow('EXTRA', '2026-11-15', punched('2026-11-15', '08:00', '12:00')),
        dayRow('HOLIDAY', '2026-11-20', punched('2026-11-20', '08:00', '19:00')),
        dayRow('LEAVE_PAID', '2026-11-18', punched('2026-11-18', '08:00', '19:00'))
      ],
      binhData(
        [
          ot('2026-11-02', '18:00', '19:00'),
          ot('2026-11-15', '08:00', '12:00'),
          ot('2026-11-20', '18:00', '19:00'),
          ot('2026-11-18', '18:00', '19:00')
        ],
        ['2026-11-20']
      )
    );
    // x1.5 weekday, x2 Sunday (L12: the EXTRA day pays only its OT), x3 holiday; the leave day has no presence.
    assert.equal(lineOf(slip, '2026-11-02').otPay, 43_269);
    assert.deepEqual([lineOf(slip, '2026-11-15').daySalary, lineOf(slip, '2026-11-15').otPay], [0, DAY]);
    assert.equal(lineOf(slip, '2026-11-20').otPay, 86_538);
    assert.equal(lineOf(slip, '2026-11-18').otPay, 0);
    assert.deepEqual([slip.ot15Hours, slip.ot20Hours, slip.ot30Hours], [1, 4, 1]);
  });

  it('pays a holiday line from its payUnits; a holiday on a rest day is a REST row with no line', async () => {
    const slip = await slipOf([
      dayRow('HOLIDAY', '2026-11-20', { payUnits: 1 }),
      // buildDay writes a holiday that falls outside the person's week as REST (L10).
      dayRow('REST', '2026-11-21')
    ]);
    assert.deepEqual(
      slip.dailyLines.map(l => [l.date, l.daySalary]),
      [['2026-11-20', DAY]]
    );
    assert.equal(slip.holidayPaidDays, 1);
    assert.equal(slip.holidayPay, DAY);
  });
});
