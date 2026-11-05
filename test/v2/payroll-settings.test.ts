import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/database';
import { EmployeePayslip, measureOvertime, otLinePayByRate, vnInstant } from '../../src/modules/payroll/domain';
import { PayrollRepository, type EmployeeMonthlyRawData } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import type { SettingsSnapshot, WorkWeek } from '../../src/modules/settings';
import { createScriptedKysely } from './helpers/scripted-kysely';
import { SEED_RATES, nvMonthData } from './payroll-fixtures';

// The settings as seeded in migrations/postgres/schema.sql (the confirmed rules, diligence lost from 3 absence days).
const SEED: SettingsSnapshot = {
  overtime: { weekdayRate: 1.5, weekendRate: 2, holidayRate: 3 },
  attendance: { lateGraceMinutes: 15, diligenceLostFromDays: 3 },
  kpiWeights: { wework: 40, user: 24, peer: 18, manager: 12, self: 6 },
  insurance: { bhxhPct: 8, bhytPct: 1.5, bhtnPct: 1 },
  tax: {
    personalDeduction: 15_500_000,
    dependantDeduction: 6_200_000,
    shortContractPct: 10,
    shortContractThreshold: 5_000_000,
    brackets: [
      { upTo: 10_000_000, ratePct: 5 },
      { upTo: 30_000_000, ratePct: 10 },
      { upTo: 60_000_000, ratePct: 20 },
      { upTo: 100_000_000, ratePct: 30 },
      { upTo: null, ratePct: 35 }
    ]
  },
  payCalendar: { payDay: 10 }
};

type Week = Pick<WorkWeek, 'weekdays' | 'standardWorkdays'>;
const TYPE_WEEK: Week = { weekdays: [1, 2, 3, 4, 5, 6], standardWorkdays: 26 };
const MON_FRI: Week = { weekdays: [1, 2, 3, 4, 5], standardWorkdays: 22 };

// A settings reader that answers with one snapshot and a week per person (the type week when none is given), and
// records each call in order.
class FakeReader {
  readonly calls: string[] = [];

  constructor(
    private readonly snapshot: SettingsSnapshot = SEED,
    private readonly weeks: Record<string, Week> = {},
    private readonly rev = 0
  ) {}

  async settingsFor(month: string): Promise<SettingsSnapshot> {
    this.calls.push(`settingsFor ${month}`);
    return this.snapshot;
  }

  async workWeekOf(uuid: string, month: string): Promise<WorkWeek> {
    this.calls.push(`workWeekOf ${uuid} ${month}`);
    const own = this.weeks[uuid];
    return {
      ...(own ?? TYPE_WEEK),
      source: own ? 'own' : 'type',
      from: own ? month : null,
      typeWeekdays: TYPE_WEEK.weekdays,
      typeStandardWorkdays: TYPE_WEEK.standardWorkdays
    };
  }

  async maxChangeId(): Promise<number> {
    this.calls.push('maxChangeId');
    return this.rev;
  }
}

class MonthRepository extends PayrollRepository {
  constructor(
    private readonly months: Record<string, EmployeeMonthlyRawData>,
    db: Kysely<DB> = {} as Kysely<DB>
  ) {
    super(db);
  }

  override async getMonthlyData(employeeId: string): Promise<EmployeeMonthlyRawData | null> {
    return this.months[employeeId] ?? null;
  }

  override async listEligibleEmployees() {
    return Object.values(this.months).map(({ staff }) => ({ uuid: staff.uuid, username: staff.username, name: staff.name }));
  }
}

const payslipOf = (data: EmployeeMonthlyRawData, month: string, reader: FakeReader) =>
  new PayrollService(new MonthRepository({ [data.staff.uuid]: data }), reader).generateMonthlyPayslip(data.staff.uuid, month);

type Timesheet = EmployeeMonthlyRawData['timesheets'][number];

// One attendance line; `presence` is the real check-in and check-out on the Vietnam clock.
const timesheet = (workDate: string, shiftType = 'NORMAL', presence?: [string, string]): Timesheet => ({
  workDate,
  shiftType,
  shiftStartTime: '08:00',
  shiftEndTime: '17:00',
  shiftAllowancePct: 0,
  actualCheckIn: presence ? vnInstant(workDate, presence[0]).toISOString() : null,
  actualCheckOut: presence ? vnInstant(workDate, presence[1]).toISOString() : null,
  workHours: shiftType === 'NORMAL' ? 8 : 0,
  otHours: 0,
  lateMinutes: 0,
  earlyMinutes: 0,
  status: shiftType === 'LEAVE' ? 'ON_LEAVE' : 'PRESENT',
  dayStatus: 'VALID',
  scheduleType: 'REGULAR'
});

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const DECEMBER = Array.from({ length: 31 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`);
const DECEMBER_MON_FRI = DECEMBER.filter(date => weekdayOf(date) >= 1 && weekdayOf(date) <= 5);

// Bình: nv level 2 (6,500,000) on a long contract, no KPI; `standardWorkdays` is the type's 26.
const binh = (timesheets: Timesheet[]): EmployeeMonthlyRawData => ({
  staff: {
    uuid: 'u-binh',
    username: 'nv-binh',
    name: 'Bình',
    positionLevelText: 'Chuyên viên',
    contractStatusText: 'HĐLĐ từ 3 tháng',
    baseSalary: 6_500_000,
    standardWorkdays: 26,
    employeeType: 'nv',
    level: 2,
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
  timesheets,
  requests: [],
  kpi: null
});

// nvMonthData of 2026-10 with its 20 NORMAL days and `leaveDays` LEAVE days (24, 26, 27 Oct...; 25 is a Sunday).
const nvWithLeave = (leaveDays: number): EmployeeMonthlyRawData => {
  const data = nvMonthData();
  const normal = data.timesheets.filter(ts => ts.shiftType === 'NORMAL');
  const leave = ['2026-10-24', '2026-10-26', '2026-10-27', '2026-10-28'].slice(0, leaveDays);
  return { ...data, timesheets: [...normal, ...leave.map(date => timesheet(date, 'LEAVE'))] };
};

const withSettings = (patch: Partial<SettingsSnapshot>): SettingsSnapshot => ({ ...SEED, ...patch });

// Shift 08:00-17:00 of an nv level 1 (6,000,000 / 26 days / 8 hours).
const HOUR_RATE = 6_000_000 / 26 / 8;
const NO_HOLIDAYS: ReadonlySet<string> = new Set();

describe('Payroll reads the settings of the month', () => {
  it('pays the seeded settings exactly like the old constants', async () => {
    const slip = await payslipOf(nvMonthData(), '2026-10', new FakeReader());

    assert.equal(slip.standardWorkdays, 26);
    assert.equal(slip.kpiTotalScorePct, 84);
    assert.equal(slip.grossIncome, 11_007_693);
    assert.equal(slip.insuranceDeduction, 630_000);
    assert.equal(slip.netIncome, 9_377_693);
  });

  it('D3: an own Mon–Fri week makes the standard days 22 (Bình, December 2026, all 23 days worked)', async () => {
    assert.equal(DECEMBER_MON_FRI.length, 23);
    const reader = new FakeReader(SEED, { 'u-binh': MON_FRI });

    const slip = await payslipOf(binh(DECEMBER_MON_FRI.map(date => timesheet(date))), '2026-12', reader);

    assert.ok(reader.calls.includes('workWeekOf u-binh 2026-12'));
    assert.equal(slip.standardWorkdays, 22);
    assert.equal(slip.actualWorkDays, 23);
    assert.equal(slip.dayRate, 295_455);
    assert.equal(slip.baseSalaryActual, 6_795_455);
  });

  it('D15: diligence is lost from the number of absence days in the settings, 3 by default', async () => {
    const reader = new FakeReader();
    assert.equal((await payslipOf(nvWithLeave(2), '2026-10', reader)).attendanceAllowanceActual, 1_153_846);
    assert.equal((await payslipOf(nvWithLeave(3), '2026-10', reader)).attendanceAllowanceActual, 0);

    const fromFour = new FakeReader(withSettings({ attendance: { lateGraceMinutes: 15, diligenceLostFromDays: 4 } }));
    assert.equal((await payslipOf(nvWithLeave(3), '2026-10', fromFour)).attendanceAllowanceActual, 1_153_846);
    assert.equal((await payslipOf(nvWithLeave(4), '2026-10', fromFour)).attendanceAllowanceActual, 0);
  });

  it('keeps diligence below 5 absence days when no threshold is given (the old pure rule)', () => {
    const line = (date: string, shiftCode: string) => ({
      date,
      dayOfWeekText: '',
      shiftCode,
      shiftLabel: shiftCode,
      inOutText: '',
      workHours: 8,
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
    const slip = (leaveDays: number, diligenceLostFromDays?: number) =>
      new EmployeePayslip({
        employeeId: 'p',
        fullName: 'P',
        positionLevelText: 'NV',
        contractStatusText: '',
        month: '2026-10',
        baseSalaryPolicy: 6_000_000,
        employeeType: 'nv',
        allowanceRates: SEED_RATES.nv,
        diligenceLostFromDays,
        dailyLines: [
          ...Array.from({ length: 20 }, () => line('2026-10-01', 'NORMAL')),
          ...Array.from({ length: leaveDays }, () => line('2026-10-24', 'LEAVE'))
        ]
      });
    assert.equal(slip(4).attendanceAllowanceActual, 1_153_846);
    assert.equal(slip(5).attendanceAllowanceActual, 0);
    assert.equal(slip(2, 3).attendanceAllowanceActual, 1_153_846);
    assert.equal(slip(3, 3).attendanceAllowanceActual, 0);
  });

  it('weighs the KPI scores with the weights in the settings', async () => {
    const seeded = await payslipOf(nvMonthData(), '2026-10', new FakeReader());
    assert.equal(seeded.kpiTotalScorePct, 84);
    assert.equal(seeded.kpiActualPay, 4_200_000);

    const weights = { wework: 50, user: 14, peer: 18, manager: 12, self: 6 };
    const changed = await payslipOf(nvMonthData(), '2026-10', new FakeReader(withSettings({ kpiWeights: weights })));
    assert.equal(changed.kpiTotalScorePct, 85);
    assert.equal(changed.kpiActualPay, 4_250_000);
  });

  it('deducts insurance at the % in the settings', async () => {
    const seeded = await payslipOf(nvMonthData(), '2026-10', new FakeReader());
    assert.deepEqual(seeded.insuranceBreakdown, { bhxh: 480_000, bhyt: 90_000, bhtn: 60_000 });

    const insurance = { bhxhPct: 10, bhytPct: 1.5, bhtnPct: 1 };
    const changed = await payslipOf(nvMonthData(), '2026-10', new FakeReader(withSettings({ insurance })));
    assert.deepEqual(changed.insuranceBreakdown, { bhxh: 600_000, bhyt: 90_000, bhtn: 60_000 });
    assert.equal(changed.insuranceDeduction, 750_000);
  });

  it('takes the tax deductions, brackets and short-contract rate from the settings', async () => {
    // Taxable 10,950,001, insurance 630,000, one dependant.
    const tax = (patch: Partial<SettingsSnapshot['tax']>, data = nvMonthData()) =>
      payslipOf(data, '2026-10', new FakeReader(withSettings({ tax: { ...SEED.tax, ...patch } }))).then(
        slip => slip.personalIncomeTax
      );
    const lowDeductions = { personalDeduction: 2_000_000, dependantDeduction: 1_000_000 };

    assert.equal(await tax({}), 0);
    // Assessable 10,950,001 - 630,000 - 2,000,000 - 1,000,000 = 7,320,001 at 5%.
    assert.equal(await tax(lowDeductions), 366_000);
    // 5,000,000 at 10% + 2,320,001 at 20%.
    const brackets = [
      { upTo: 5_000_000, ratePct: 10 },
      { upTo: null, ratePct: 20 }
    ];
    assert.equal(await tax({ ...lowDeductions, brackets }), 964_000);

    // A contract under three months: the short-contract % of the gross 11,007,693 once the gross reaches the threshold.
    const short = () => nvMonthData({ staff: { contractTerm: 'short' } });
    assert.equal(await tax({ shortContractPct: 20 }, short()), 2_201_539);
    assert.equal(await tax({ shortContractPct: 20, shortContractThreshold: 12_000_000 }, short()), 0);
  });

  it('pays a holiday only when it falls on a day of the person’s week', async () => {
    // Friday 25/12 and Saturday 12/12 are holiday lines; the other 22 weekdays are worked.
    const lines = [
      ...DECEMBER_MON_FRI.filter(date => date !== '2026-12-25').map(date => timesheet(date)),
      timesheet('2026-12-25', 'HOLIDAY'),
      timesheet('2026-12-12', 'HOLIDAY')
    ];

    const monFri = await payslipOf(binh(lines), '2026-12', new FakeReader(SEED, { 'u-binh': MON_FRI }));
    assert.equal(monFri.holidayPaidDays, 1);
    assert.equal(monFri.holidayPay, 295_455);
    assert.equal(monFri.dailyLines.find(line => line.date === '2026-12-12')?.daySalary, 0);
    assert.equal(monFri.dailyLines.find(line => line.date === '2026-12-25')?.daySalary, 295_455);

    const monSat = await payslipOf(binh(lines), '2026-12', new FakeReader());
    assert.equal(monSat.holidayPaidDays, 2);
    assert.equal(monSat.holidayPay, 500_000);
    assert.equal(monSat.dailyLines.find(line => line.date === '2026-12-12')?.daySalary, 250_000);
  });
});

describe('OT rates from the settings', () => {
  const window = (date: string, start = '18:00', end = '20:00') => ({ date, start, end });
  const span = (workDate: string, from = '08:00', to = '20:30') => ({
    workDate,
    start: vnInstant(workDate, from),
    end: vnInstant(workDate, to)
  });

  it('pays a weekday OT share at the weekday rate given', () => {
    const shares = measureOvertime([window('2026-10-07')], [span('2026-10-07')], NO_HOLIDAYS, {
      weekday: 1.6,
      weekend: 2,
      holiday: 3
    });
    assert.deepEqual(shares, [{ lineDate: '2026-10-07', otDate: '2026-10-07', hours: 2, kind: 'weekday', multiplier: 1.6 }]);
    // 2 hours x 28,846.15 x 1.6
    assert.deepEqual(otLinePayByRate(shares, HOUR_RATE), { x15: 92_308, x20: 0, x30: 0 });
  });

  it('keeps weekday and weekend OT apart when both rates are equal', () => {
    // Wednesday 07/10 and Saturday 10/10, one hour each, both at x2.
    const shares = measureOvertime(
      [window('2026-10-07', '18:00', '19:00'), window('2026-10-10', '18:00', '19:00')],
      [span('2026-10-07'), span('2026-10-10')],
      NO_HOLIDAYS,
      { weekday: 2, weekend: 2, holiday: 3 }
    );
    assert.deepEqual(
      shares.map(share => [share.kind, share.multiplier]),
      [
        ['weekday', 2],
        ['weekend', 2]
      ]
    );
    assert.deepEqual(otLinePayByRate(shares, HOUR_RATE), { x15: 57_692, x20: 57_692, x30: 0 });
  });

  // nvMonthData with real presence 08:00-20:30 on Wednesday 07/10 and Saturday 03/10 and the given OT windows.
  const nvWithOt = (windows: Array<ReturnType<typeof window>>): EmployeeMonthlyRawData => {
    const data = nvMonthData();
    const present = new Set(['2026-10-03', '2026-10-07']);
    return {
      ...data,
      timesheets: data.timesheets.map(ts =>
        present.has(ts.workDate) ? timesheet(ts.workDate, 'NORMAL', ['08:00', '20:30']) : ts
      ),
      requests: [
        ...windows.map((w, i) => ({
          id: `ot-${i}`,
          type: 'OVERTIME',
          status: 'APPROVED',
          otDate: w.date,
          otStartTime: w.start,
          otEndTime: w.end
        })),
        { id: 'adv', type: 'ADVANCE', status: 'APPROVED', advanceAmount: 1_000_000 }
      ]
    };
  };
  const overtime = (weekdayRate: number, weekendRate: number) =>
    withSettings({ overtime: { weekdayRate, weekendRate, holidayRate: 3 } });

  it('pays the payslip OT at the weekday rate of the settings and exempts the premium over the normal rate', async () => {
    const data = nvWithOt([window('2026-10-07')]);

    const seeded = await payslipOf(data, '2026-10', new FakeReader());
    assert.equal(seeded.ot15Hours, 2);
    assert.equal(seeded.ot15Pay, 86_538);
    assert.equal(seeded.taxExemptIncome, 28_846);

    const changed = await payslipOf(data, '2026-10', new FakeReader(overtime(1.6, 2)));
    assert.equal(changed.ot15Hours, 2);
    assert.equal(changed.ot15Pay, 92_308);
    assert.equal(changed.otPayTotal, 92_308);
    // The 60% premium of 2 hours is tax-exempt.
    assert.equal(changed.taxExemptIncome, 34_615);
  });

  it('keeps the payslip OT buckets by kind when two rates are equal', async () => {
    const data = nvWithOt([window('2026-10-07', '18:00', '19:00'), window('2026-10-03', '18:00', '19:00')]);

    const slip = await payslipOf(data, '2026-10', new FakeReader(overtime(2, 2)));

    assert.deepEqual([slip.ot15Hours, slip.ot20Hours, slip.ot30Hours], [1, 1, 0]);
    assert.deepEqual([slip.ot15Pay, slip.ot20Pay, slip.ot30Pay], [57_692, 57_692, 0]);
  });
});

describe('Payroll run stores the settings it used', () => {
  const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

  // The column -> value map of the "insert into payroll_runs" statement.
  const runInsert = (log: ReturnType<typeof createScriptedKysely>['log']) => {
    const entry = log.find(e => typeof e !== 'string' && e.sql.startsWith('insert into "payroll_runs"'));
    assert.ok(entry && typeof entry !== 'string');
    const columns = /^insert into "payroll_runs" \(([^)]*)\)/.exec(entry.sql)![1].split(', ');
    return Object.fromEntries(columns.map((column, i) => [column.replace(/"/g, ''), entry.parameters[i]]));
  };

  const run = async (reader?: FakeReader) => {
    const { db, log } = createScriptedKysely(({ sql }) => {
      if (sql.startsWith('select max(')) return [{ max_run_no: null }];
      if (sql.startsWith('insert into "payroll_runs"')) return [{ id: 42 }];
      return [];
    });
    const months = {
      ua: nvMonthData({ staff: { uuid: 'ua', username: 'alice' } }),
      ub: nvMonthData({ staff: { uuid: 'ub', username: 'bob' } })
    };
    const result = await new PayrollService(new MonthRepository(months, db), reader).calculatePeriodPayslips(
      '2026-10',
      undefined,
      'admin'
    );
    assert.equal(result.runId, 42);
    assert.deepEqual(result.errors, []);
    return runInsert(log);
  };

  it('stores the month snapshot as params_json, its sha256 as params_hash and the last change id as params_rev', async () => {
    const snapshot = withSettings({ overtime: { weekdayRate: 1.6, weekendRate: 2, holidayRate: 3 } });
    const reader = new FakeReader(snapshot, {}, 17);

    const row = await run(reader);

    assert.equal(row.params_json, JSON.stringify(snapshot));
    assert.deepEqual(JSON.parse(row.params_json as string), snapshot);
    assert.equal(row.params_hash, sha256(row.params_json as string));
    assert.equal(row.params_rev, 17);
  });

  it('reads the settings once for the whole run, the change id first', async () => {
    const reader = new FakeReader(SEED, {}, 5);

    await run(reader);

    assert.deepEqual(reader.calls, ['maxChangeId', 'settingsFor 2026-10', 'workWeekOf ua 2026-10', 'workWeekOf ub 2026-10']);
  });

  it('stores an empty snapshot when the service has no settings reader', async () => {
    const row = await run();

    assert.equal(row.params_json, '{}');
    assert.equal(row.params_hash, sha256('{}'));
    assert.equal(row.params_rev, 0);
  });
});
