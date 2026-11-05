import { Injectable, Optional, Inject } from '@nestjs/common';
import { TransactionCoordinator } from '../../database';
import { SettingsReader, type SettingsSnapshot } from '../settings';
import { PayrollRepository, KpiScorePatch, PayslipRecord, type RunSettings } from './payroll.repository';
import { KpiValidationError } from './payroll.errors';
import {
  EmployeePayslip,
  DailyAttendanceLineProps,
  inOutText as presenceText,
  presenceOf,
  type Presence,
  measureOvertime,
  OT_BUCKET_OF,
  OT_MULTIPLIERS,
  otLinePayByRate,
  type OtRates,
  type OtShare,
  type OtWindow,
  type PresenceSpan,
  weekdayTextOf,
  EmployeePayslipSummaryDTO,
  PayrollWarning,
  calculateInsurance,
  calculateKpiPay,
  resolveTaxMethod,
  paysHoliday,
  DEFAULT_INSURANCE_RATES,
  DEFAULT_TAX_RULES,
  KPI_WEIGHTS,
  type InsuranceRates,
  type KpiComponent,
  type TaxRules
} from './domain';
import { PayrollAllowancePolicy } from './domain/allowance-rates';

/** The numbers a payslip is computed with. */
interface PayRules {
  kpiWeights: Record<KpiComponent, number>;
  insuranceRates: InsuranceRates;
  taxRules: TaxRules;
  otRates: OtRates;
  diligenceLostFromDays?: number; // undefined = the domain default (lost from 5 absence days)
}

/** Without a settings reader (a service built by hand in a test): the domain defaults, the rules before the store. */
const DEFAULT_PAY_RULES: PayRules = {
  kpiWeights: KPI_WEIGHTS,
  insuranceRates: DEFAULT_INSURANCE_RATES,
  taxRules: DEFAULT_TAX_RULES,
  otRates: OT_MULTIPLIERS
};

/** The payslip numbers of a month's settings; insurance % (8 means 8%) become rates (0.08). */
function payRulesOf(s: SettingsSnapshot): PayRules {
  return {
    kpiWeights: s.kpiWeights,
    insuranceRates: { bhxh: s.insurance.bhxhPct / 100, bhyt: s.insurance.bhytPct / 100, bhtn: s.insurance.bhtnPct / 100 },
    taxRules: s.tax,
    otRates: { weekday: s.overtime.weekdayRate, weekend: s.overtime.weekendRate, holiday: s.overtime.holidayRate },
    diligenceLostFromDays: s.attendance.diligenceLostFromDays
  };
}

type PayrollSettings = Pick<SettingsReader, 'settingsFor' | 'workWeekOf' | 'maxChangeId'>;

// Scores are points 0-100; userScore / selfScore are other names for user / self.
export interface KpiScoreBody {
  wework?: number | null;
  user?: number | null;
  userScore?: number | null;
  peer?: number | null;
  manager?: number | null;
  self?: number | null;
  selfScore?: number | null;
  proposedAmount?: number | null;
}

type KpiScoreColumn = 'wework' | 'user_score' | 'peer' | 'manager' | 'self_score';

const KPI_SCORE_FIELDS: Array<{ column: KpiScoreColumn; name: keyof KpiScoreBody; alias?: keyof KpiScoreBody }> = [
  { column: 'wework', name: 'wework' },
  { column: 'user_score', name: 'user', alias: 'userScore' },
  { column: 'peer', name: 'peer' },
  { column: 'manager', name: 'manager' },
  { column: 'self_score', name: 'self', alias: 'selfScore' }
];

/** Tỉ lệ 0.125 → "12,5": đúng số % đã đặt (tối đa 2 chữ số lẻ, dấu phẩy), không làm tròn về số nguyên. */
const pctText = (rate: number): string => String(Math.round(rate * 10000) / 100).replace('.', ',');

@Injectable()
export class PayrollService {
  constructor(
    @Inject(PayrollRepository) private readonly repo: PayrollRepository,
    // Nest always injects the reader (PayrollModule imports SettingsModule; no @Optional, so a missing import fails at
    // boot). A service built by hand without it computes with DEFAULT_PAY_RULES and the position type's workdays.
    @Inject(SettingsReader) private readonly settings?: PayrollSettings,
    @Optional() @Inject(TransactionCoordinator) private readonly txCoordinator?: TransactionCoordinator
  ) {}

  async calculatePeriodPayslips(
    month: string,
    employeeIds?: string[],
    actor = 'system'
  ): Promise<{
    runId: number | null;
    items: EmployeePayslipSummaryDTO[];
    errors: Array<{ employeeId: string; message: string }>;
  }> {
    // A list of employees is a partial run: the other employees keep their payslips. runId is null when no payslip
    // was computed, in which case nothing is stored.
    const isPartial = employeeIds !== undefined && employeeIds.length > 0;
    const doCalc = async () => {
      // One read of the month's settings for the whole run; the run stores what its payslips were computed with.
      const settings = await this.runSettings(month);
      let targets = employeeIds;
      if (!targets || targets.length === 0) {
        const staffList = await this.repo.listEligibleEmployees();
        targets = staffList.map(s => s.uuid);
      }

      const payslips: EmployeePayslip[] = [];
      const summaries: EmployeePayslipSummaryDTO[] = [];
      const errors: Array<{ employeeId: string; message: string }> = [];
      const seenUsernames = new Set<string>();

      for (const empId of targets) {
        try {
          const payslip = await this.payslipOf(empId, month, settings?.snapshot ?? null);
          // The same person can be listed by uuid and by username; keep one payslip per username.
          if (seenUsernames.has(payslip.username)) continue;
          seenUsernames.add(payslip.username);
          payslips.push(payslip);
          summaries.push(payslip.toSummary());
        } catch (err) {
          errors.push({ employeeId: empId, message: err instanceof Error ? err.message : String(err) });
        }
      }

      const carryForward = isPartial
        ? { exceptUsernames: payslips.map(p => p.username), exceptEmployeeIds: targets }
        : undefined;
      const runId = await this.repo.savePayrollRunAndSlips(month, actor, payslips, errors.length, carryForward, settings);
      return { runId, items: summaries, errors };
    };

    if (this.txCoordinator) {
      return await this.txCoordinator.withLock(`payroll_${month}`, doCalc);
    }
    return await doCalc();
  }

  // The month's settings for a run; null without a reader. The change id is read before the snapshot: a change saved
  // in between then leaves the stored rev older than the snapshot (the run looks stale), never newer.
  private async runSettings(month: string): Promise<RunSettings | null> {
    if (!this.settings) return null;
    const rev = await this.settings.maxChangeId();
    const snapshot = await this.settings.settingsFor(month);
    return { snapshot, rev };
  }

  async listPayslips(month: string): Promise<PayslipRecord[]> {
    return await this.repo.listPayslips(month);
  }

  async decidePayslip(
    month: string,
    username: string,
    status: 'approved' | 'rejected',
    actor: string,
    note?: string
  ): Promise<PayslipRecord | null> {
    // A blank note is stored as null, so a reader never has to tell "" from "no reason".
    return await this.repo.decidePayslip(month, username, status, actor, typeof note === 'string' ? note.trim() || null : null);
  }

  async getPayslip(month: string, employeeId: string): Promise<PayslipRecord | null> {
    return await this.repo.getPayslip(month, employeeId);
  }

  // Checks the KPI body against the employee's KPI cap and saves it: undefined keeps the stored value, null clears it.
  async setKpiScore(username: string, month: string, body: KpiScoreBody, actor: string): Promise<void> {
    const cap = await this.repo.getKpiCap(username, month);
    if (!cap) throw new KpiValidationError('EMPLOYEE_NOT_FOUND', `Không tìm thấy nhân sự ${username}`);

    const input = body ?? {};
    const patch: KpiScorePatch = {};
    for (const { column, name, alias } of KPI_SCORE_FIELDS) {
      // The short name wins when both names are sent.
      const value = input[input[name] === undefined && alias ? alias : name];
      if (value === undefined) continue;
      if (value === null) {
        patch[column] = null;
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
        throw new KpiValidationError('INVALID_KPI_SCORE', 'Điểm KPI phải từ 0 đến 100');
      }
      patch[column] = Math.round(value * 100);
    }

    const proposed = input.proposedAmount;
    if (proposed !== undefined) {
      if (proposed !== null) {
        if (!Number.isSafeInteger(proposed) || proposed < 0) {
          throw new KpiValidationError('INVALID_KPI_SCORE', 'Lương KPI đề xuất phải là số nguyên từ 0 trở lên');
        }
        if (proposed > 0 && !cap.applicable) {
          throw new KpiValidationError('KPI_NOT_APPLICABLE', 'Chức vụ hoặc bậc của nhân sự không áp dụng lương KPI');
        }
        if (cap.kpiMax !== null && proposed > cap.kpiMax) {
          throw new KpiValidationError(
            'KPI_PROPOSAL_EXCEEDS_MAX',
            `Lương KPI đề xuất phải nhỏ hơn hoặc bằng ${cap.kpiMax} đồng`
          );
        }
      }
      patch.kpi_proposed = proposed;
    }

    await this.repo.saveKpiScore(username, month, patch, actor);
  }

  async generateMonthlyPayslip(employeeId: string, month: string): Promise<EmployeePayslip> {
    return await this.payslipOf(employeeId, month, this.settings ? await this.settings.settingsFor(month) : null);
  }

  // `snapshot` is the month's settings (null without a reader); the person's week comes from the reader too.
  private async payslipOf(employeeId: string, month: string, snapshot: SettingsSnapshot | null): Promise<EmployeePayslip> {
    const data = await this.repo.getMonthlyData(employeeId, month);
    if (!data) {
      throw new Error(`Data not found for employee ${employeeId} in month ${month}`);
    }

    const { staff, timesheets, requests } = data;
    if (staff.baseSalary === null || staff.standardWorkdays === null) {
      const position = `${staff.employeeType ?? 'không rõ loại'} (${staff.positionLevelText})`;
      throw new Error(`Thiếu cấu hình chức vụ hoặc bậc lương cho ${position}`);
    }
    const rules = snapshot ? payRulesOf(snapshot) : DEFAULT_PAY_RULES;
    // The standard days follow the person's own week when there is one (D3/D5), else the position type's workdays.
    const week = this.settings ? await this.settings.workWeekOf(staff.uuid, month) : null;
    const employeeType = staff.employeeType;
    const nightAllowancePct = staff.nightAllowancePct === 60 ? 60 : 40;
    const allowancePolicy = new PayrollAllowancePolicy(employeeType, nightAllowancePct, staff.allowanceRates);
    // An approved iSAT Saturday is paid as one base day; the set also drops a date listed twice.
    const isatDates = new Set(data.isatDates ?? []);
    // An iSAT Saturday has no attendance line, so a makeup approved on it later must not count as a makeup day.
    const makeupWorkDates = new Set(
      timesheets
        .filter(
          ts =>
            ts.scheduleType === 'MAKE_UP' && ts.status === 'PRESENT' && ts.workHours > 0 && !isatDates.has(ts.workDate)
        )
        .map(ts => ts.workDate)
    );
    const standardWorkdays = week ? week.standardWorkdays : staff.standardWorkdays;
    const baseSalaryPolicy = staff.baseSalary;
    const dayRate = baseSalaryPolicy / standardWorkdays;
    const hourRate = dayRate / 8;

    // Times of the approved explanations, by the day they explain; they fill the punch a day is missing.
    const explainedByDate = new Map<string, { checkIn: string | null; checkOut: string | null }>();
    for (const req of requests) {
      if (req.type === 'EXPLANATION' && req.status === 'APPROVED' && req.explanationDate) {
        explainedByDate.set(req.explanationDate, {
          checkIn: req.actualCheckIn ?? null,
          checkOut: req.actualCheckOut ?? null
        });
      }
    }

    // Real presence of every NORMAL, FLEX and NIGHT line, computed once for the day lines and the OT measure.
    const presenceOfLine = new Map<(typeof timesheets)[number], Presence>();
    for (const ts of timesheets) {
      if (isatDates.has(ts.workDate)) continue;
      const code = ts.shiftType.toUpperCase();
      if (code === 'LEAVE' || code === 'ISAT' || code === 'UNPAID') continue;
      const explained = explainedByDate.get(ts.workDate);
      presenceOfLine.set(ts, presenceOf(ts.workDate, ts.actualCheckIn, ts.actualCheckOut, explained));
    }

    // OT is the presence inside the approved window x hourly rate x multiplier. A line only counts when both its
    // check-in and check-out are real instants; one without them (or with a malformed explained time) has no OT.
    const validInstant = (at: Date | null): at is Date => at !== null && !Number.isNaN(at.getTime());
    const spans: PresenceSpan[] = [];
    for (const [ts, presence] of presenceOfLine) {
      if (validInstant(presence.start) && validInstant(presence.end)) {
        spans.push({ workDate: ts.workDate, start: presence.start, end: presence.end });
      }
    }
    const otWindows: OtWindow[] = [];
    for (const req of requests) {
      if (req.type === 'OVERTIME' && req.status === 'APPROVED' && req.otDate && req.otStartTime && req.otEndTime) {
        otWindows.push({ date: req.otDate, start: req.otStartTime, end: req.otEndTime });
      }
    }
    const otShares = measureOvertime(otWindows, spans, new Set(data.holidayDates ?? []), rules.otRates);
    const otSharesByLine = new Map<string, OtShare[]>();
    for (const share of otShares) {
      otSharesByLine.set(share.lineDate, [...(otSharesByLine.get(share.lineDate) ?? []), share]);
    }

    const dailyLines: DailyAttendanceLineProps[] = [];
    let totalDeductionHours = 0;
    const otPayByRate = { x15: 0, x20: 0, x30: 0 };

    for (const ts of timesheets) {
      if (isatDates.has(ts.workDate)) continue;

      const shiftCode = ts.shiftType.toUpperCase();
      let shiftLabel = 'Normal';
      let inOutText = '';
      let checkIn: string | null = null;
      let checkOut: string | null = null;
      let flexAllowancePay = 0;
      let nightAllowancePay = 0;
      let offPaidPay = 0;
      let daySalary = 0;

      if (shiftCode === 'FLEX') {
        shiftLabel = `Flex +${pctText(allowancePolicy.flexRate)}%`;
        flexAllowancePay = makeupWorkDates.has(ts.workDate) ? 0 : allowancePolicy.flexPremium(hourRate, ts.workHours);
        daySalary = Math.round(dayRate);
      } else if (shiftCode === 'NIGHT') {
        const nightPct = allowancePolicy.nightRate;
        shiftLabel = `Night +${pctText(nightPct)}%`;
        nightAllowancePay = makeupWorkDates.has(ts.workDate) ? 0 : allowancePolicy.nightPremium(dayRate);
        const timeDeduction = Math.round((((ts.lateMinutes || 0) + (ts.earlyMinutes || 0)) * hourRate) / 60);
        offPaidPay = makeupWorkDates.has(ts.workDate)
          ? 0
          : allowancePolicy.nightBreakPay(hourRate, ts.workHours, timeDeduction);
        daySalary = Math.round(dayRate);
      } else if (shiftCode === 'LEAVE') {
        shiftLabel = 'Nghỉ phép';
        inOutText = 'Hưởng lương ngày';
        daySalary = Math.round(dayRate);
      } else if (shiftCode === 'ISAT') {
        shiftLabel = 'iSAT';
        inOutText = 'Hưởng lương ngày';
        daySalary = Math.round(dayRate);
      } else if (shiftCode === 'UNPAID') {
        shiftLabel = 'Không lương';
        inOutText = 'Không tính lương';
        daySalary = 0;
      } else {
        shiftLabel = 'Normal';
        // A holiday off the person's week is not paid (paysHoliday; the payslip does not count it either).
        daySalary = shiftCode === 'HOLIDAY' && !paysHoliday(ts.workDate, week?.weekdays) ? 0 : Math.round(dayRate);
      }

      const presence = presenceOfLine.get(ts);
      if (presence) {
        checkIn = presence.checkIn;
        checkOut = presence.checkOut;
        inOutText = presenceText(presence);
      }

      const lateMins = ts.lateMinutes || 0;
      const earlyMins = ts.earlyMinutes || 0;
      const deductionHours = (lateMins + earlyMins) / 60;
      totalDeductionHours += deductionHours;
      const deductionAmount = Math.round(deductionHours * hourRate);

      const lineShares = otSharesByLine.get(ts.workDate) ?? [];
      const otHours = lineShares.reduce((sum, share) => sum + share.hours, 0);
      const linePayByRate = otLinePayByRate(lineShares, hourRate);
      otPayByRate.x15 += linePayByRate.x15;
      otPayByRate.x20 += linePayByRate.x20;
      otPayByRate.x30 += linePayByRate.x30;
      const otPay = linePayByRate.x15 + linePayByRate.x20 + linePayByRate.x30;

      const dailyTotal = daySalary + flexAllowancePay + nightAllowancePay + offPaidPay + otPay - deductionAmount;

      dailyLines.push({
        date: ts.workDate,
        dayOfWeekText: weekdayTextOf(ts.workDate),
        shiftCode,
        shiftLabel,
        inOutText,
        checkIn,
        checkOut,
        workHours: ts.workHours,
        daySalary,
        flexAllowancePay,
        nightAllowancePay,
        offPaidPay,
        otHours,
        otPay,
        deductionHours: Math.round(deductionHours * 100) / 100,
        deductionAmount,
        dailyTotal
      });
    }

    for (const date of isatDates) {
      dailyLines.push({
        date,
        dayOfWeekText: weekdayTextOf(date),
        shiftCode: 'ISAT',
        shiftLabel: 'iSAT',
        inOutText: 'Hưởng lương ngày',
        checkIn: null,
        checkOut: null,
        workHours: 0,
        daySalary: Math.round(dayRate),
        flexAllowancePay: 0,
        nightAllowancePay: 0,
        offPaidPay: 0,
        otHours: 0,
        otPay: 0,
        deductionHours: 0,
        deductionAmount: 0,
        dailyTotal: Math.round(dayRate)
      });
    }
    dailyLines.sort((a, b) => a.date.localeCompare(b.date));

    // OT hours by kind of day, from the same shares as the day lines.
    const otHoursByRate = { x15: 0, x20: 0, x30: 0 };
    for (const share of otShares) otHoursByRate[OT_BUCKET_OF[share.kind]] += share.hours;

    let advanceDeduction = 0;
    for (const req of requests) {
      if (req.type === 'ADVANCE' && req.status === 'APPROVED') {
        advanceDeduction += Number(req.advanceAmount || 0);
      }
    }

    const kpi = calculateKpiPay(data.kpi, staff.kpiCap, rules.kpiWeights);
    const insurance = calculateInsurance(baseSalaryPolicy, staff.insured, rules.insuranceRates);
    const taxMethod = resolveTaxMethod(staff.contractTerm);
    const warnings: PayrollWarning[] = [...kpi.warnings];

    const roundedLateEarlyHours = Math.round(totalDeductionHours * 100) / 100;

    return new EmployeePayslip({
      employeeId: staff.uuid,
      username: staff.username,
      fullName: staff.name,
      positionLevelText: staff.positionLevelText,
      contractStatusText: staff.contractStatusText,
      month,
      standardWorkdays,
      baseSalaryPolicy,
      dailyLines,
      workWeekdays: week?.weekdays,
      otHoursByRate,
      otPayByRate,
      otRates: rules.otRates,
      lateEarlyHours: roundedLateEarlyHours,
      diligenceLostFromDays: rules.diligenceLostFromDays,
      employeeType,
      level: staff.level,
      employmentStatus: staff.employmentStatus,
      nightAllowancePct,
      isDormResident: staff.isDormResident,
      allowanceRates: staff.allowanceRates,
      makeupWorkDates: Array.from(makeupWorkDates),
      kpi,
      insurance,
      taxMethod,
      taxRules: rules.taxRules,
      dependants: staff.dependants,
      warnings,
      advanceDeduction,
      remainingAnnualLeaveDays: staff.remainingAnnualLeaveDays
    });
  }
}
