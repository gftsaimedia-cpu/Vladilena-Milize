import { DEFAULT_INSURANCE_RATES, type KpiInput } from '../../src/modules/payroll/domain';
import type { EmployeeMonthlyRawData } from '../../src/modules/payroll/payroll.repository';

type Timesheet = EmployeeMonthlyRawData['timesheets'][number];

const SUNDAYS = ['2026-10-04', '2026-10-11', '2026-10-18'];

const timesheet = (workDate: string, shiftType: string): Timesheet => ({
  workDate,
  shiftType,
  shiftStartTime: '08:00',
  shiftEndTime: '17:00',
  shiftAllowancePct: 0,
  workHours: shiftType === 'LEAVE' ? 0 : 8,
  otHours: 0,
  lateMinutes: 0,
  earlyMinutes: 0,
  status: shiftType === 'LEAVE' ? 'ON_LEAVE' : 'PRESENT',
  dayStatus: 'VALID',
  scheduleType: 'REGULAR'
});

// One NV level-1 employee in 2026-10: 20 NORMAL days (1-23 Oct without the Sundays 4, 11, 18) and one LEAVE day
// (24 Oct), an approved 2h OT request and a 1,000,000 advance. KPI is entered with a 5,000,000 proposal.
export function nvMonthData(
  overrides: { staff?: Partial<EmployeeMonthlyRawData['staff']>; kpi?: KpiInput | null } = {}
): EmployeeMonthlyRawData {
  const normalDays = Array.from({ length: 23 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`).filter(
    date => !SUNDAYS.includes(date)
  );
  const defaultKpi: KpiInput = {
    scores: { wework: 9000, user: 8000, peer: 7000, manager: 8500, self: 10000 },
    proposedAmount: 5_000_000
  };

  return {
    staff: {
      uuid: 'u1',
      username: 'a',
      name: 'Nhân viên A',
      positionLevelText: 'Nhân viên · Bậc 1',
      contractStatusText: 'HĐLĐ từ 3 tháng',
      baseSalary: 6_000_000,
      standardWorkdays: 26,
      employeeType: 'nv',
      nightAllowancePct: 40,
      isDormResident: false,
      remainingAnnualLeaveDays: 12,
      insured: true,
      dependants: 1,
      contractTerm: 'long',
      kpiCap: { applicable: true, kpiMax: 6_000_000 },
      ...overrides.staff
    },
    timesheets: [...normalDays.map(date => timesheet(date, 'NORMAL')), timesheet('2026-10-24', 'LEAVE')],
    requests: [
      { id: 'req_ot_1', type: 'OVERTIME', status: 'APPROVED', otHours: 2 },
      { id: 'req_adv_1', type: 'ADVANCE', status: 'APPROVED', advanceAmount: 1_000_000 }
    ],
    kpi: overrides.kpi === undefined ? defaultKpi : overrides.kpi,
    insuranceRates: DEFAULT_INSURANCE_RATES
  };
}
