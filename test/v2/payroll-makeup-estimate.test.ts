import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AttendanceDayRecord } from '../../src/modules/attendance/attendance-days.repository';
import { EmployeePayslip, makeupShortfallDays, plannedMakeupMinutes } from '../../src/modules/payroll/domain';
import { PayrollRepository, type EmployeeMonthlyRawData } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { FakeDays, SEED_RATES, dayRow, payslipLine } from './payroll-fixtures';

// D10 (06/11): the mid-month income estimate counts as worked every approved makeup window that has not ended yet, for the
// chuyên cần shortfall ONLY (never for pay). A window that has ended counts by the minutes really worked (the row's
// makeupMinutes). Once the month is over nothing planned is left to count.
//
// Bình, nv level 1, 6,000,000 / 26. Diligence (25% of 6,000,000 x work days / 26) is lost from 5 absence days (the
// domain default). Month 2026-11: 5 work days 02-06, one leave with makeup 10/11, four unpaid leave days 11-14 (a day off each).
//   absence days = 4 day-off rows + makeupShortfallDays(1 LWM day, worked + planned minutes)
//   owed 480 minutes: nothing made up -> shortfall ceil(480/480) = 1 -> 4 + 1 = 5 >= 5 -> diligence LOST
//                     480 planned     -> shortfall ceil(0/480)   = 0 -> 4 + 0 = 4 <  5 -> diligence KEPT
const BINH = 'u-binh';
const win = (date: string, start: string, end: string, workMinutes: number) => ({ date, start, end, workMinutes });
// Two evening windows of 4 h: 18:00-22:00 -> 240 work minutes each = the 480 owed by the one leave with makeup.
const TWO_EVENINGS = [win('2026-11-14', '18:00', '22:00', 240), win('2026-11-16', '18:00', '22:00', 240)];

const binhData = (makeupWindows: EmployeeMonthlyRawData['makeupWindows']): EmployeeMonthlyRawData => ({
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
  requests: [],
  makeupWindows,
  kpi: null
});

class BinhRepository extends PayrollRepository {
  constructor(private readonly data: EmployeeMonthlyRawData) {
    super({} as any);
  }
  override async getMonthlyData() {
    return this.data;
  }
}

const november = (): AttendanceDayRecord[] =>
  [
    ...['02', '03', '04', '05', '06'].map(d => dayRow('PRESENT', `2026-11-${d}`)),
    dayRow('LEAVE_MAKEUP', '2026-11-10'),
    ...['11', '12', '13', '14'].map(d => dayRow('LEAVE_UNPAID', `2026-11-${d}`))
  ].map(row => ({ ...row, employeeId: BINH }));

const slipAt = (now: Date, windows: EmployeeMonthlyRawData['makeupWindows'], rows = november()) => {
  const service = new PayrollService(new BinhRepository(binhData(windows)), undefined, new FakeDays(() => rows));
  service.now = () => now;
  return service.generateMonthlyPayslip(BINH, '2026-11');
};
// 25% x 6,000,000 x 5 work days / 26 = 288,461.54
const KEPT = 288_462;

describe('plannedMakeupMinutes (D10)', () => {
  const noon = new Date('2026-11-12T05:00:00Z'); // 12:00 on 12/11, Vietnam time

  it('adds the work minutes of the windows that end after now', () => {
    assert.equal(plannedMakeupMinutes(TWO_EVENINGS, noon), 480);
  });

  it('ignores a window that has ended, and one that ends exactly now', () => {
    const w = win('2026-11-12', '08:00', '12:00', 240);
    assert.equal(plannedMakeupMinutes([w], noon), 0); // ended 12:00 = now: end is not after now
    assert.equal(plannedMakeupMinutes([w], new Date('2026-11-12T04:59:00Z')), 240); // 11:59, still running
    assert.equal(plannedMakeupMinutes([win('2026-11-11', '18:00', '22:00', 240)], noon), 0);
  });

  it('reads the window on the Vietnam clock, not UTC', () => {
    // 18:00-22:00 on 12/11 in Vietnam ends at 15:00Z: at 14:59Z it still counts, at 15:00Z it does not.
    const w = win('2026-11-12', '18:00', '22:00', 240);
    assert.equal(plannedMakeupMinutes([w], new Date('2026-11-12T14:59:00Z')), 240);
    assert.equal(plannedMakeupMinutes([w], new Date('2026-11-12T15:00:00Z')), 0);
  });

  it('is 0 with no windows', () => {
    assert.equal(plannedMakeupMinutes([], noon), 0);
    assert.equal(plannedMakeupMinutes(undefined, noon), 0);
  });
});

describe('the mid-month estimate counts planned makeup for the diligence shortfall (D10)', () => {
  it('1 leave-with-makeup day, 480 minutes of windows all in the future -> diligence kept', async () => {
    // 12/11 12:00: both windows (14/11, 16/11) are ahead. Shortfall = ceil(max(0, 480 - (0 worked + 480 planned)) / 480) = 0.
    const slip = await slipAt(new Date('2026-11-12T05:00:00Z'), TWO_EVENINGS);
    assert.equal(makeupShortfallDays(1, 0 + 480), 0);
    assert.equal(slip.attendanceAllowanceActual, KEPT);
  });

  it('the same windows in the past with 0 minutes worked -> diligence lost', async () => {
    // 20/11: both windows ended and no one made them up (the rows carry makeupMinutes 0): shortfall = ceil(480 / 480) = 1,
    // absence days = 4 + 1 = 5 >= 5.
    const slip = await slipAt(new Date('2026-11-20T05:00:00Z'), TWO_EVENINGS);
    assert.equal(slip.attendanceAllowanceActual, 0);
  });

  it('month-end payslip (now after the month): the planned windows no longer count', async () => {
    // 01/12: same windows, nothing made up. Nothing is planned any more, so the result is the real one: lost.
    const slip = await slipAt(new Date('2026-12-01T03:00:00Z'), TWO_EVENINGS);
    assert.equal(slip.attendanceAllowanceActual, 0);
  });

  it('one window passed and made up, one still ahead -> 240 real + 240 planned = 480, kept', async () => {
    const rows = november();
    rows.push({ ...dayRow('EXTRA', '2026-11-14', { makeupMinutes: 240, workHours: 4 }), employeeId: BINH });
    // 15/11: the 14/11 window is past (240 worked on the row), the 16/11 window is ahead (240 planned).
    const slip = await slipAt(new Date('2026-11-15T05:00:00Z'), TWO_EVENINGS, rows);
    assert.equal(slip.attendanceAllowanceActual, KEPT);
  });

  it('one window passed and made up, the other passed without work -> 240 real, shortfall ceil(240/480) = 1, lost', async () => {
    const rows = november();
    rows.push({ ...dayRow('EXTRA', '2026-11-14', { makeupMinutes: 240, workHours: 4 }), employeeId: BINH });
    const slip = await slipAt(new Date('2026-11-17T05:00:00Z'), TWO_EVENINGS, rows);
    assert.equal(slip.attendanceAllowanceActual, 0);
  });

  it('the planned minutes never pay: makeupPay follows the real minutes only', async () => {
    const future = await slipAt(new Date('2026-11-12T05:00:00Z'), TWO_EVENINGS);
    const none = await slipAt(new Date('2026-11-12T05:00:00Z'), []);
    assert.equal(future.makeupPay, 0);
    assert.equal(future.grossIncome - none.grossIncome, KEPT); // only the kept diligence differs, no makeup money
    assert.equal(none.attendanceAllowanceActual, 0); // without any planned window the shortfall stands: lost
  });

  it('the payslip prop plannedMakeupMinutes moves the diligence and nothing else', () => {
    const lines = [
      ...Array.from({ length: 5 }, (_, i) => payslipLine('PRESENT', { date: `2026-11-0${i + 2}` })),
      payslipLine('LEAVE_MAKEUP', { date: '2026-11-10' }),
      ...Array.from({ length: 4 }, (_, i) => payslipLine('LEAVE_UNPAID', { date: `2026-11-${11 + i}` }))
    ];
    const make = (planned?: number) =>
      new EmployeePayslip({
        employeeId: BINH,
        fullName: 'Bình',
        positionLevelText: 'Nhân viên',
        contractStatusText: 'HĐLĐ',
        month: '2026-11',
        standardWorkdays: 26,
        baseSalaryPolicy: 6_000_000,
        employeeType: 'nv',
        allowanceRates: SEED_RATES.nv,
        dailyLines: lines,
        plannedMakeupMinutes: planned
      });
    assert.equal(make().attendanceAllowanceActual, 0);
    assert.equal(make(0).attendanceAllowanceActual, 0);
    assert.equal(make(240).attendanceAllowanceActual, 0); // 240 of 480 still owed: shortfall 1
    assert.equal(make(480).attendanceAllowanceActual, KEPT);
    assert.equal(make(480).makeupPay, 0);
    assert.equal(make(480).grossIncome - make().grossIncome, KEPT);
  });
});
