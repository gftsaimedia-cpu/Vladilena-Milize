import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';
import {
  PayrollRepository,
  mapMonthRows,
  resolveKpiCap,
  type MonthRows
} from '../../src/modules/payroll/payroll.repository';

const baseStaff = {
  uuid: 'u1',
  username: 'a',
  name: 'A',
  type: 'nv',
  level: 1,
  idorm: '0',
  insured: null,
  tax_on: 1,
  dependants: '2',
  start_date: '2026-01-05',
  contract: '',
  contract_status: 'official',
  shift_allowance_pct: 60
};

const baseType = { id: '2', workdays: '26' };
const baseLevel = { name: 'Nhân viên', base_salary: '6000000', kpi_max: '6000000' };
const kpiBenefit = { benefit: 'kpi', enabled: '1' };

function rows(overrides: Partial<MonthRows> = {}): MonthRows {
  return {
    staff: baseStaff,
    type: baseType,
    level: baseLevel,
    benefits: [kpiBenefit],
    timesheets: [],
    requests: [],
    kpi: null,
    ...overrides
  };
}

describe('mapMonthRows staff flags and contract label', () => {
  it('reads dependants and resolves the contract label and the insured flag', () => {
    const { staff } = mapMonthRows('2026-10', rows());
    assert.equal(staff.contractTerm, 'long');
    assert.equal(staff.insured, true);
    assert.equal(staff.dependants, 2);
  });

  it('insures only on the insured flag for a contract under three months', () => {
    const { staff } = mapMonthRows('2026-10', rows({ staff: { ...baseStaff, contract: 'short', insured: null } }));
    assert.equal(staff.contractTerm, 'short');
    assert.equal(staff.insured, false);
    assert.equal(staff.contractStatusText, 'Dưới 3 tháng');

    const shortWith = (insured: unknown) =>
      mapMonthRows('2026-10', rows({ staff: { ...baseStaff, contract: 'short', insured } })).staff.insured;
    assert.equal(shortWith(1), true);
    assert.equal(shortWith('1'), true);
    assert.equal(shortWith(0), false);
    assert.equal(shortWith('0'), false);
  });

  it('falls back to short for a trainee without a label and honours the insured flag', () => {
    const { staff } = mapMonthRows(
      '2026-10',
      rows({ staff: { ...baseStaff, type: 'tts', contract: null, insured: 1 } })
    );
    assert.equal(staff.contractTerm, 'short');
    assert.equal(staff.insured, true);
    assert.equal(staff.contractStatusText, 'Dưới 3 tháng');
  });

  it('always insures a long contract and ignores tax_on', () => {
    const { staff } = mapMonthRows(
      '2026-10',
      rows({ staff: { ...baseStaff, contract: 'long', insured: 0, tax_on: 0 } })
    );
    assert.equal(staff.contractTerm, 'long');
    assert.equal(staff.insured, true);
    assert.equal(staff.contractStatusText, 'HĐLĐ từ 3 tháng');
  });

  it('reads a date in the contract column as no label', () => {
    const nv = mapMonthRows('2026-10', rows({ staff: { ...baseStaff, contract: '2026-12-31' } })).staff;
    assert.equal(nv.contractTerm, 'long');
    const tts = mapMonthRows('2026-10', rows({ staff: { ...baseStaff, type: 'tts', contract: '2026-12-31' } })).staff;
    assert.equal(tts.contractTerm, 'short');
  });

  it('floors dependants and never lets them go negative', () => {
    const dependants = (value: unknown) =>
      mapMonthRows('2026-10', rows({ staff: { ...baseStaff, dependants: value } })).staff.dependants;
    assert.equal(dependants(2.9), 2);
    assert.equal(dependants('3'), 3);
    assert.equal(dependants(-1), 0);
    assert.equal(dependants(null), 0);
    assert.equal(dependants('abc'), 0);
  });

  it('keeps the legacy staff fields', () => {
    const { staff } = mapMonthRows('2026-10', rows());
    assert.equal(staff.uuid, 'u1');
    assert.equal(staff.username, 'a');
    assert.equal(staff.positionLevelText, 'Nhân viên');
    assert.equal(staff.contractStatusText, 'HĐLĐ từ 3 tháng');
    assert.equal(staff.employeeType, 'nv');
    assert.equal(staff.nightAllowancePct, 60);
    assert.equal(staff.isDormResident, false);
  });

  it('reads the level number and the employment status of the staff row', () => {
    assert.equal(mapMonthRows('2026-10', rows({ staff: { ...baseStaff, level: 2 } })).staff.level, 2);
    assert.equal(mapMonthRows('2026-10', rows({ staff: { ...baseStaff, level: null } })).staff.level, 1);
    const status = (contract_status: unknown) =>
      mapMonthRows('2026-10', rows({ staff: { ...baseStaff, contract_status } })).staff.employmentStatus;
    assert.equal(status('official'), 'official');
    assert.equal(status('probation'), 'probation');
    assert.equal(status(null), null);
    assert.equal(status('tts'), null);
  });

  it('falls back to a generated level text', () => {
    const { staff } = mapMonthRows('2026-10', rows({ level: null }));
    assert.equal(staff.positionLevelText, 'NV · Bậc 1');
  });

  it('shows the resolved contract label, not the contract_status column', () => {
    const { staff } = mapMonthRows('2026-10', rows({ staff: { ...baseStaff, contract_status: 'probation' } }));
    assert.equal(staff.contractStatusText, 'HĐLĐ từ 3 tháng');
  });
});

describe('mapMonthRows annual leave left', () => {
  const leaveStaff = { ...baseStaff, leave_balance: 12 };
  const account = { benefit: 'leaveAccount', enabled: '1' };
  const left = (staff: object, benefits: unknown[], annualLeaveUsed?: number | string) =>
    mapMonthRows('2026-10', rows({ staff, benefits, annualLeaveUsed })).staff.remainingAnnualLeaveDays;

  it('is the balance minus the approved annual leave days used when the type keeps a leave account', () => {
    assert.equal(left(leaveStaff, [kpiBenefit, account], '2'), 10);
    assert.equal(left({ ...leaveStaff, leave_balance: null }, [account], 0), 0);
    assert.equal(left(leaveStaff, [account]), 12);
  });

  it('is null without a leave account or when the benefit is off', () => {
    assert.equal(left(leaveStaff, [kpiBenefit], 2), null);
    assert.equal(left(leaveStaff, [{ benefit: 'leaveAccount', enabled: 0 }], 2), null);
  });
});

describe('mapMonthRows allowance rates', () => {
  it('passes the rates of the version in force', () => {
    const { staff } = mapMonthRows(
      '2026-10',
      rows({
        type: { ...baseType, flex_pct: 25, night_pct: 30, travel_pct: 0, attendance_pct: 0 },
        level: { ...baseLevel, night_pct: 50 }
      })
    );
    assert.deepEqual(staff.allowanceRates, {
      flexPct: 25,
      typeNightPct: 30,
      levelNightPct: 50,
      travelPct: 0,
      attendancePct: 0
    });
    assert.equal(mapMonthRows('2026-10', rows({ type: null })).staff.allowanceRates, null);
  });

  it('a staff row without a type gets no allowance rates even though the NV version is read for workdays', () => {
    const typeRow = { ...baseType, flex_pct: 20, night_pct: 40, travel_pct: 15, attendance_pct: 25 };
    const { staff } = mapMonthRows('2026-10', rows({ staff: { ...baseStaff, type: '' }, type: typeRow }));
    assert.equal(staff.allowanceRates, null);
    assert.equal(staff.standardWorkdays, 26);
  });
});

describe('mapMonthRows base pay and workdays', () => {
  it('takes base salary and standard workdays from the level and the type', () => {
    const { staff } = mapMonthRows('2026-10', rows());
    assert.equal(staff.baseSalary, 6_000_000);
    assert.equal(staff.standardWorkdays, 26);
  });

  it('reports a missing type or level as null instead of a default', () => {
    assert.equal(mapMonthRows('2026-10', rows({ type: null })).staff.standardWorkdays, null);
    assert.equal(mapMonthRows('2026-10', rows({ level: null })).staff.baseSalary, null);
  });
});

describe('KPI cap', () => {
  it('is applicable when the kpi benefit is on and the level has a kpi_max', () => {
    const { staff } = mapMonthRows('2026-10', rows());
    assert.deepEqual(staff.kpiCap, { applicable: true, kpiMax: 6_000_000 });
  });

  it('is not applicable when the level has no kpi_max', () => {
    const { staff } = mapMonthRows('2026-10', rows({ level: { ...baseLevel, kpi_max: null } }));
    assert.deepEqual(staff.kpiCap, { applicable: false, kpiMax: null });
  });

  it('is not applicable without an enabled kpi benefit', () => {
    assert.equal(mapMonthRows('2026-10', rows({ benefits: [] })).staff.kpiCap.applicable, false);
    const off = [{ benefit: 'kpi', enabled: '0' }];
    assert.equal(mapMonthRows('2026-10', rows({ benefits: off })).staff.kpiCap.applicable, false);
    const other = [{ benefit: 'travel', enabled: 1 }];
    assert.equal(mapMonthRows('2026-10', rows({ benefits: other })).staff.kpiCap.applicable, false);
  });

  it('is not applicable without a level', () => {
    assert.deepEqual(mapMonthRows('2026-10', rows({ level: null })).staff.kpiCap, {
      applicable: false,
      kpiMax: null
    });
  });

  it('resolveKpiCap never returns applicable with a null kpiMax', () => {
    for (const level of [null, { kpi_max: null }, { kpi_max: undefined }, { kpi_max: '0' }, { kpi_max: 4_000_000 }]) {
      for (const benefits of [[], [{ benefit: 'kpi', enabled: 0 }], [{ benefit: 'kpi', enabled: 1 }]]) {
        const cap = resolveKpiCap(level, benefits);
        assert.equal(cap.applicable && cap.kpiMax === null, false);
      }
    }
    assert.deepEqual(resolveKpiCap({ kpi_max: '0' }, [{ benefit: 'kpi', enabled: 1 }]), {
      applicable: true,
      kpiMax: 0
    });
    assert.deepEqual(resolveKpiCap({ kpi_max: 4_000_000 }, [{ benefit: 'kpi', enabled: '1' }]), {
      applicable: true,
      kpiMax: 4_000_000
    });
  });
});

describe('mapMonthRows KPI scores', () => {
  const kpiRow = {
    wework: '9000',
    user_score: null,
    peer: 7000,
    manager: 8500,
    self_score: 10000,
    kpi_proposed: '5000000'
  };

  it('maps the five scores and the proposal, keeping null as null', () => {
    const { kpi } = mapMonthRows('2026-10', rows({ kpi: kpiRow }));
    assert.deepEqual(kpi, {
      scores: { wework: 9000, user: null, peer: 7000, manager: 8500, self: 10000 },
      proposedAmount: 5_000_000
    });
  });

  it('keeps a missing proposal as null', () => {
    const { kpi } = mapMonthRows('2026-10', rows({ kpi: { ...kpiRow, kpi_proposed: null } }));
    assert.equal(kpi?.proposedAmount, null);
  });

  it('returns null when the employee has no kpi row', () => {
    assert.equal(mapMonthRows('2026-10', rows()).kpi, null);
  });
});

describe('mapMonthRows timesheets and requests', () => {
  it('converts advance amounts and numeric columns to numbers', () => {
    const { requests } = mapMonthRows(
      '2026-10',
      rows({
        requests: [
          { type: 'ADVANCE', status: 'APPROVED', advance_amount: '1000000' },
          { type: 'OVERTIME', status: 'APPROVED', ot_hours: '2.5', advance_amount: null }
        ]
      })
    );
    assert.equal(requests[0].advanceAmount, 1_000_000);
    assert.equal(typeof requests[0].advanceAmount, 'number');
    assert.equal(requests[1].otHours, 2.5);
    assert.equal(requests[1].advanceAmount, null);
  });

  it('turns DATE values given as Date objects into local YYYY-MM-DD strings', () => {
    const data = mapMonthRows(
      '2026-10',
      rows({
        timesheets: [{ work_date: new Date(2026, 9, 5), shift_allowance_pct: '20', work_hours: '8' }],
        requests: [
          {
            ot_date: new Date(2026, 9, 7),
            leave_start_date: new Date(2026, 9, 12),
            leave_end_date: new Date(2026, 9, 13),
            explanation_date: new Date(2026, 0, 1)
          }
        ]
      })
    );
    assert.equal(data.timesheets[0].workDate, '2026-10-05');
    assert.equal(data.timesheets[0].shiftAllowancePct, 20);
    assert.equal(data.timesheets[0].workHours, 8);
    assert.equal(data.requests[0].otDate, '2026-10-07');
    assert.equal(data.requests[0].leaveStartDate, '2026-10-12');
    assert.equal(data.requests[0].leaveEndDate, '2026-10-13');
    assert.equal(data.requests[0].explanationDate, '2026-01-01');
  });

  it('passes date strings through and keeps null dates', () => {
    const { timesheets, requests } = mapMonthRows(
      '2026-10',
      rows({
        timesheets: [{ work_date: '2026-10-05' }],
        requests: [{ ot_date: '2026-10-07', leave_start_date: null, leave_end_date: null, explanation_date: null }]
      })
    );
    assert.equal(timesheets[0].workDate, '2026-10-05');
    assert.equal(requests[0].otDate, '2026-10-07');
    assert.equal(requests[0].leaveStartDate, null);
    assert.equal(requests[0].leaveEndDate, null);
    assert.equal(requests[0].explanationDate, null);
  });

  it('turns punch timestamps into ISO strings and keeps null punches', () => {
    const { timesheets } = mapMonthRows(
      '2026-10',
      rows({
        timesheets: [
          {
            work_date: '2026-10-05',
            actual_check_in: new Date('2026-10-05T01:00:00.000Z'),
            actual_check_out: null,
            schedule_type: null
          }
        ]
      })
    );
    assert.equal(timesheets[0].actualCheckIn, '2026-10-05T01:00:00.000Z');
    assert.equal(timesheets[0].actualCheckOut, null);
    assert.equal(timesheets[0].scheduleType, undefined);
  });

  it('cuts the explained times of a request to HH:MM and keeps empty ones as null', () => {
    const { requests } = mapMonthRows(
      '2026-10',
      rows({
        requests: [
          { type: 'EXPLANATION', actual_check_in: '08:00:00', actual_check_out: '19:20' },
          { type: 'EXPLANATION', actual_check_in: '', actual_check_out: null },
          { type: 'OVERTIME' }
        ]
      })
    );
    assert.deepEqual([requests[0].actualCheckIn, requests[0].actualCheckOut], ['08:00', '19:20']);
    assert.deepEqual([requests[1].actualCheckIn, requests[1].actualCheckOut], [null, null]);
    assert.deepEqual([requests[2].actualCheckIn, requests[2].actualCheckOut], [null, null]);
  });

  it('cuts the OT window times to HH:MM and keeps missing ones as null', () => {
    const { requests } = mapMonthRows(
      '2026-10',
      rows({
        requests: [
          { type: 'OVERTIME', ot_start_time: '18:00:00', ot_end_time: '20:00' },
          { type: 'OVERTIME', ot_start_time: null, ot_end_time: '' },
          { type: 'ADVANCE' }
        ]
      })
    );
    assert.deepEqual([requests[0].otStartTime, requests[0].otEndTime], ['18:00', '20:00']);
    assert.deepEqual([requests[1].otStartTime, requests[1].otEndTime], [null, null]);
    assert.deepEqual([requests[2].otStartTime, requests[2].otEndTime], [null, null]);
  });

  it('maps the company holidays of the month to YYYY-MM-DD text', () => {
    assert.deepEqual(
      mapMonthRows('2026-09', rows({ holidays: [new Date(2026, 8, 2), '2026-09-01'] })).holidayDates,
      ['2026-09-02', '2026-09-01']
    );
    assert.deepEqual(mapMonthRows('2026-09', rows()).holidayDates, []);
  });

  it('maps approved iSAT Saturdays to YYYY-MM-DD text', () => {
    assert.deepEqual(
      mapMonthRows('2026-11', rows({ isatDates: [new Date(2026, 10, 7), '2026-11-14'] })).isatDates,
      ['2026-11-07', '2026-11-14']
    );
    assert.deepEqual(mapMonthRows('2026-11', rows()).isatDates, []);
  });
});

type Call = {
  table: string;
  where: Array<[unknown, unknown, unknown]>;
  order: unknown[];
  innerJoins: Array<[unknown, unknown, unknown]>;
  limit?: number;
};

// Records every query the repository builds so the filters can be asserted without a database.
function recordingQb(tables: Record<string, { first?: any; all?: any[] }>) {
  const calls: Call[] = [];
  let current: Call;
  const eb: any = (col: unknown, op: unknown, value: unknown) => [col, op, value];
  eb.or = (list: unknown[]) => ({ or: list });
  eb.and = (list: unknown[]) => ({ and: list });
  const qb: any = {
    selectFrom(table: string) {
      current = { table, where: [], order: [], innerJoins: [] };
      calls.push(current);
      return qb;
    },
    leftJoin() {
      return qb;
    },
    innerJoin(table: unknown, lhs: unknown, rhs: unknown) {
      current.innerJoins.push([table, lhs, rhs]);
      return qb;
    },
    selectAll() {
      return qb;
    },
    select() {
      return qb;
    },
    where(...args: any[]) {
      current.where.push(typeof args[0] === 'function' ? args[0](eb) : (args as [unknown, unknown, unknown]));
      return qb;
    },
    orderBy(...args: unknown[]) {
      current.order.push(args);
      return qb;
    },
    limit(n: number) {
      current.limit = n;
      return qb;
    },
    async executeTakeFirst() {
      return tables[current.table]?.first;
    },
    async execute() {
      return tables[current.table]?.all ?? [];
    }
  };
  return { qb: qb as Kysely<any>, calls };
}

describe('PayrollRepository.getMonthlyData queries', () => {
  const tables = {
    staff: { first: { ...baseStaff, level: 2 } },
    position_types: { first: baseType },
    position_levels: { first: baseLevel },
    position_type_benefits: { all: [kpiBenefit] },
    kpi_scores: { first: { username: 'a', wework: '9000', kpi_proposed: '4000000' } }
  };

  it('reads the position type and level effective for the month, newest first', async () => {
    const { qb, calls } = recordingQb(tables);
    const data = await new PayrollRepository(qb).getMonthlyData('u1', '2026-10');
    const type = calls.find(c => c.table === 'position_types');
    const level = calls.find(c => c.table === 'position_levels');
    assert.deepEqual(type?.where, [
      ['code', '=', 'nv'],
      ['effective_month', '<=', '2026-10']
    ]);
    assert.deepEqual(level?.where, [
      ['type_code', '=', 'nv'],
      ['level_no', '=', 2],
      ['effective_month', '<=', '2026-10']
    ]);
    for (const call of [type, level]) {
      assert.deepEqual(call?.order, [['effective_month', 'desc']]);
      assert.equal(call?.limit, 1);
    }
    assert.deepEqual(calls.find(c => c.table === 'position_type_benefits')?.where, [['type_id', '=', '2']]);
    assert.equal(data?.staff.baseSalary, 6_000_000);
    assert.equal(data?.staff.standardWorkdays, 26);
    assert.deepEqual(data?.staff.kpiCap, { applicable: true, kpiMax: 6_000_000 });
    assert.equal(data?.kpi?.proposedAmount, 4_000_000);
  });

  it('no longer reads the insurance rates from the settings table (they come from the settings store)', async () => {
    const { qb, calls } = recordingQb(tables);
    await new PayrollRepository(qb).getMonthlyData('u1', '2026-10');
    assert.equal(
      calls.some(c => c.table === 'settings'),
      false
    );
  });

  it('skips the benefits query and reports null workdays when no position type exists', async () => {
    const { qb, calls } = recordingQb({ ...tables, position_types: {} });
    const data = await new PayrollRepository(qb).getMonthlyData('u1', '2026-10');
    assert.equal(
      calls.some(c => c.table === 'position_type_benefits'),
      false
    );
    assert.equal(data?.staff.standardWorkdays, null);
    assert.equal(data?.staff.kpiCap.applicable, false);
  });

  it('filters requests by date ranges instead of LIKE', async () => {
    const { qb, calls } = recordingQb(tables);
    await new PayrollRepository(qb).getMonthlyData('u1', '2026-02');
    const where = calls.find(c => c.table === 'system_requests')?.where;
    const range = (col: string) => ({
      and: [
        [col, '>=', '2026-02-01'],
        [col, '<=', '2026-02-28']
      ]
    });
    const monthMatch = [
      range('ot_date'),
      range('leave_start_date'),
      ['advance_period', '=', '2026-02'],
      range('explanation_date')
    ];
    assert.deepEqual(where, [['employee_id', '=', 'u1'], ['status', '=', 'APPROVED'], { or: monthMatch }]);
    assert.equal(JSON.stringify(where).includes('like'), false);
  });

  it('reads approved iSAT Saturdays of the month for the employee uuid', async () => {
    const { qb, calls } = recordingQb({
      ...tables,
      isat_registrations: { all: [{ saturday: new Date(2026, 9, 10) }] }
    });
    const data = await new PayrollRepository(qb).getMonthlyData('u1', '2026-10');
    const isat = calls.find(c => c.table === 'isat_registrations');
    assert.deepEqual(isat?.innerJoins, [['system_requests', 'system_requests.id', 'isat_registrations.request_id']]);
    assert.deepEqual(isat?.where, [
      ['system_requests.employee_id', '=', 'u1'],
      ['system_requests.type', '=', 'ISAT'],
      ['system_requests.status', '=', 'APPROVED'],
      ['isat_registrations.saturday', '>=', '2026-10-01'],
      ['isat_registrations.saturday', '<=', '2026-10-31']
    ]);
    assert.deepEqual(isat?.order, [['isat_registrations.saturday', 'asc']]);
    assert.deepEqual(data?.isatDates, ['2026-10-10']);
  });

  it('reads the company holidays between the first and the last day of the month', async () => {
    const { qb, calls } = recordingQb({ ...tables, company_holidays: { all: [{ holiday_date: new Date(2026, 8, 2) }] } });
    const data = await new PayrollRepository(qb).getMonthlyData('u1', '2026-10');
    assert.deepEqual(calls.find(c => c.table === 'company_holidays')?.where, [
      ['holiday_date', '>=', '2026-10-01'],
      ['holiday_date', '<=', '2026-10-31']
    ]);
    assert.deepEqual(data?.holidayDates, ['2026-09-02']);
  });

  it('counts approved annual leave days up to the month end and from the balance date', async () => {
    const withBalanceOn = (leave_balance_on: string | null) =>
      recordingQb({
        ...tables,
        staff: { first: { ...baseStaff, level: 2, leave_balance: 12, leave_balance_on } },
        position_type_benefits: { all: [{ benefit: 'leaveAccount', enabled: 1 }] },
        day_status: { first: { n: '2' } }
      });

    const dated = withBalanceOn('2026-10-01');
    const data = await new PayrollRepository(dated.qb).getMonthlyData('u1', '2026-10');
    const used = dated.calls.find(c => c.table === 'day_status');
    assert.deepEqual(used?.innerJoins, [['system_requests', 'system_requests.id', 'day_status.request_id']]);
    assert.deepEqual(used?.where, [
      ['day_status.employee_id', '=', 'u1'],
      ['day_status.status', '=', 'LEAVE'],
      ['system_requests.type', '=', 'LEAVE'],
      ['system_requests.leave_type', '=', 'ANNUAL'],
      ['system_requests.status', '=', 'APPROVED'],
      ['day_status.work_date', '<=', '2026-10-31'],
      ['day_status.work_date', '>=', '2026-10-01']
    ]);
    assert.equal(data?.staff.remainingAnnualLeaveDays, 10);

    const undated = withBalanceOn(null);
    await new PayrollRepository(undated.qb).getMonthlyData('u1', '2026-10');
    assert.deepEqual(undated.calls.find(c => c.table === 'day_status')?.where, [
      ['day_status.employee_id', '=', 'u1'],
      ['day_status.status', '=', 'LEAVE'],
      ['system_requests.type', '=', 'LEAVE'],
      ['system_requests.leave_type', '=', 'ANNUAL'],
      ['system_requests.status', '=', 'APPROVED'],
      ['day_status.work_date', '<=', '2026-10-31']
    ]);
  });

  it('returns null when the employee does not exist', async () => {
    const { qb } = recordingQb({});
    assert.equal(await new PayrollRepository(qb).getMonthlyData('nobody', '2026-10'), null);
  });
});
