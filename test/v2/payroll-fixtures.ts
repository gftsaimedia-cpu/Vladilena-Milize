import type { AttendanceDayRecord } from '../../src/modules/attendance/attendance-days.repository';
import type { AttendanceDayStatus } from '../../src/modules/attendance/domain/attendance-day';
import { vnInstant } from '../../src/modules/attendance/domain/calendar';
import type { DailyAttendanceLineProps, KpiInput } from '../../src/modules/payroll/domain';
import type { AllowanceRates } from '../../src/modules/payroll/domain/allowance-rates';
import type { EmployeeMonthlyRawData } from '../../src/modules/payroll/payroll.repository';

/** Kinds of day row that pay one day (when the type has the benefit). */
const PAID_KINDS: ReadonlySet<AttendanceDayStatus> = new Set(['PRESENT', 'LEAVE_PAID', 'ISAT', 'HOLIDAY']);
const DAY_OFF_KINDS: ReadonlySet<AttendanceDayStatus> = new Set(['ABSENT', 'LEAVE_PAID', 'LEAVE_UNPAID']);
const SHIFT_KINDS: ReadonlySet<AttendanceDayStatus> = new Set(['PRESENT', 'ABSENT', 'PENDING']);

/**
 * One day row as `AttendanceDaysService.refreshMonth` returns it, with the defaults `buildDay` gives that kind: a
 * PRESENT day is the 08:00–17:00 shift punched on time (8 paid hours), an ABSENT day has the two missing cases, a leave,
 * iSAT or holiday day has no shift. `countsAsWorkday` follows `payUnits` on a PRESENT day unless given.
 */
export function dayRow(
  status: AttendanceDayStatus,
  date: string,
  over: Partial<AttendanceDayRecord> = {}
): AttendanceDayRecord {
  const payUnits = over.payUnits ?? (PAID_KINDS.has(status) ? 1 : 0);
  const present = status === 'PRESENT';
  return {
    employeeId: 'u1',
    workDate: date,
    status,
    shift: SHIFT_KINDS.has(status) ? { type: 'NORMAL', start: '08:00', end: '17:00', allowancePct: 0 } : null,
    checkIn: present ? vnInstant(date, '08:00') : null,
    checkOut: present ? vnInstant(date, '17:00') : null,
    workHours: present ? 8 : 0,
    lateMinutes: 0,
    earlyMinutes: 0,
    leaveType: status === 'LEAVE_PAID' ? 'ANNUAL' : status === 'LEAVE_UNPAID' ? 'UNPAID' : null,
    sourceRequestId: null,
    cases:
      status === 'ABSENT'
        ? [
            { code: 'MISSING_CHECK_IN', minutes: 0, affectsPay: true },
            { code: 'MISSING_CHECK_OUT', minutes: 0, affectsPay: true }
          ]
        : [],
    explanationStatus: 'NONE',
    explanationRequestId: null,
    payUnits,
    deductionMinutes: 0,
    countsAsWorkday: present && payUnits === 1,
    countsAsDayOff: DAY_OFF_KINDS.has(status),
    makeupMinutes: 0,
    dayStatus: present ? 'VALID' : 'PLANNED',
    checkInStatus: present ? 'VALID' : 'PENDING',
    checkOutStatus: present ? 'VALID' : 'PENDING',
    isLocked: false,
    ...over
  };
}

/** The punched in/out of a day row on the Vietnam clock; null leaves that side without a punch. */
export const punched = (date: string, inHhmm: string | null, outHhmm: string | null) => ({
  checkIn: inHhmm ? vnInstant(date, inHhmm) : null,
  checkOut: outHhmm ? vnInstant(date, outHhmm) : null
});

/** `AttendanceDaysService` stand-in: records each `refreshMonth` and answers with the rows of that person and month. */
export class FakeDays {
  readonly calls: Array<{ employeeId: string; month: string; now: Date | undefined }> = [];

  constructor(private readonly rowsOf: (employeeId: string, month: string) => AttendanceDayRecord[] | undefined) {}

  async refreshMonth(employeeId: string, month: string, opts: { now?: Date } = {}): Promise<AttendanceDayRecord[]> {
    this.calls.push({ employeeId, month, now: opts.now });
    return this.rowsOf(employeeId, month) ?? [];
  }
}

const SHIFT_CODE_OF: Partial<Record<AttendanceDayStatus, string>> = {
  PRESENT: 'NORMAL',
  ABSENT: 'NORMAL',
  LEAVE_PAID: 'LEAVE',
  LEAVE_UNPAID: 'UNPAID',
  LEAVE_MAKEUP: 'MAKEUP_LEAVE',
  ISAT: 'ISAT',
  HOLIDAY: 'HOLIDAY',
  EXTRA: 'EXTRA'
};

/** A hand-built payslip day line of one kind, with that kind's counting fields (amounts 0 unless given). */
export function payslipLine(
  kind: AttendanceDayStatus,
  over: Partial<DailyAttendanceLineProps> = {}
): DailyAttendanceLineProps {
  const payUnits = over.payUnits ?? (PAID_KINDS.has(kind) ? 1 : 0);
  return {
    date: '2026-10-01',
    dayOfWeekText: '',
    shiftCode: SHIFT_CODE_OF[kind] ?? kind,
    shiftLabel: '',
    inOutText: '',
    workHours: kind === 'PRESENT' ? 8 : 0,
    daySalary: 0,
    flexAllowancePay: 0,
    nightAllowancePay: 0,
    offPaidPay: 0,
    otHours: 0,
    otPay: 0,
    deductionHours: 0,
    deductionMinutes: 0,
    deductionAmount: 0,
    dailyTotal: 0,
    kind,
    payUnits,
    countsAsWorkday: kind === 'PRESENT' && payUnits === 1,
    countsAsDayOff: DAY_OFF_KINDS.has(kind),
    makeupMinutes: 0,
    makeupPay: 0,
    ...over
  };
}

// The % of each staff type as seeded in migrations/postgres/schema.sql (no level overrides the night rate).
export const SEED_RATES: Record<'nv' | 'tts' | 'ctv', AllowanceRates> = {
  nv: { flexPct: 20, typeNightPct: 40, levelNightPct: null, travelPct: 15, attendancePct: 25 },
  tts: { flexPct: 10, typeNightPct: 30, levelNightPct: null, travelPct: 0, attendancePct: 0 },
  ctv: { flexPct: 10, typeNightPct: 30, levelNightPct: null, travelPct: 0, attendancePct: 0 }
};

// The seeded rates of a known staff type; an unknown or missing type has no position version.
export const seedRatesFor = (employeeType: string | undefined): AllowanceRates | null =>
  employeeType === 'nv' || employeeType === 'tts' || employeeType === 'ctv' ? SEED_RATES[employeeType] : null;

/** A month of one employee as a test feeds it: what `getMonthlyData` returns plus the day rows of that month. */
export type MonthFixture = EmployeeMonthlyRawData & { days: AttendanceDayRecord[] };

const SUNDAYS = ['2026-10-04', '2026-10-11', '2026-10-18'];

// One NV level-1 employee in 2026-10: 20 PRESENT days (1-23 Oct without the Sundays 4, 11, 18, punched 08:00-17:00)
// and one LEAVE_PAID day (24 Oct), an approved OT request on Saturday 03/10 (18:00-20:00, fully worked) and a
// 1,000,000 advance. KPI is entered with a 5,000,000 proposal.
export function nvMonthData(
  overrides: { staff?: Partial<EmployeeMonthlyRawData['staff']>; kpi?: KpiInput | null } = {}
): MonthFixture {
  const workedDays = Array.from({ length: 23 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`).filter(
    date => !SUNDAYS.includes(date)
  );
  const defaultKpi: KpiInput = {
    scores: { wework: 9000, user: 8000, peer: 7000, manager: 8500, self: 10000 },
    proposedAmount: 5_000_000
  };
  const staff: EmployeeMonthlyRawData['staff'] = {
    uuid: 'u1',
    username: 'a',
    name: 'Nhân viên A',
    positionLevelText: 'Nhân viên · Bậc 1',
    contractStatusText: 'HĐLĐ từ 3 tháng',
    baseSalary: 6_000_000,
    standardWorkdays: 26,
    employeeType: 'nv',
    level: 1,
    employmentStatus: 'official',
    nightAllowancePct: 40,
    isDormResident: false,
    remainingAnnualLeaveDays: 12,
    insured: true,
    dependants: 1,
    contractTerm: 'long',
    kpiCap: { applicable: true, kpiMax: 6_000_000 },
    allowanceRates: seedRatesFor(overrides.staff?.employeeType ?? 'nv'),
    ...overrides.staff
  };

  return {
    staff,
    days: [
      ...workedDays.map(date =>
        // Saturday 03/10: present 08:00-20:00 on the Vietnam clock, so the 18:00-20:00 OT window is fully worked.
        dayRow('PRESENT', date, date === '2026-10-03' ? punched(date, '08:00', '20:00') : {})
      ),
      dayRow('LEAVE_PAID', '2026-10-24')
    ].map(row => ({ ...row, employeeId: staff.uuid })),
    requests: [
      {
        id: 'req_ot_1',
        type: 'OVERTIME',
        status: 'APPROVED',
        otDate: '2026-10-03',
        otStartTime: '18:00',
        otEndTime: '20:00',
        otHours: 2
      },
      { id: 'req_adv_1', type: 'ADVANCE', status: 'APPROVED', advanceAmount: 1_000_000 }
    ],
    kpi: overrides.kpi === undefined ? defaultKpi : overrides.kpi
  };
}

/** A FakeDays answering with the `days` of the fixture whose staff has that uuid (none: no rows). */
export const fixtureDays = (fixtures: () => Iterable<MonthFixture>): FakeDays =>
  new FakeDays(uuid => [...fixtures()].find(fixture => fixture.staff.uuid === uuid)?.days);
