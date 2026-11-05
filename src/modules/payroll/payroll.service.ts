import { randomUUID } from 'node:crypto';
import { Injectable, Optional, Inject } from '@nestjs/common';
import { TransactionCoordinator, type DatabaseTransaction } from '../../database';
import type { AttendanceDayRecord } from '../attendance/attendance-days.repository';
import { AttendanceDaysService } from '../attendance/attendance-days.service';
import type { AttendanceDayStatus } from '../attendance/domain/attendance-day';
import { AuditLog } from '../audit/audit-log';
import { PeriodsService, PayslipNotDecidableError } from '../periods';
import { SettingsReader, type SettingsSnapshot } from '../settings';
import {
  PayrollRepository,
  KpiScorePatch,
  PayslipRecord,
  type KpiScoreRow,
  type RunSettings,
  type SavedRun
} from './payroll.repository';
import { KpiValidationError, PayrollFinalizedError } from './payroll.errors';
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
  explanationWarning,
  type ExplanationWarningCode,
  calculateInsurance,
  calculateKpiPay,
  resolveTaxMethod,
  DEFAULT_INSURANCE_RATES,
  DEFAULT_TAX_RULES,
  KPI_WEIGHTS,
  type InsuranceRates,
  type KpiComponent,
  type TaxRules,
  advanceQuoteOf,
  type AdvanceQuote
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
type PayrollDays = Pick<AttendanceDaysService, 'refreshMonth'>;

/** Day rows without a payslip line: outside the employment, a rest day of the week, a day not evaluated yet (8.1). */
const HIDDEN_KINDS: ReadonlySet<AttendanceDayStatus> = new Set(['OUTSIDE', 'REST', 'PENDING']);
/** Rows whose real presence is measured for OT (8.1); ABSENT has no punch, its line only shows dashes. */
const MEASURED_KINDS: ReadonlySet<AttendanceDayStatus> = new Set(['PRESENT', 'EXTRA', 'HOLIDAY']);

/** Shift code of a line: the shift type on a shift day, else a code for the kind of day. */
const KIND_CODE: Partial<Record<AttendanceDayStatus, string>> = {
  LEAVE_PAID: 'LEAVE',
  LEAVE_UNPAID: 'UNPAID',
  LEAVE_MAKEUP: 'MAKEUP_LEAVE',
  ISAT: 'ISAT',
  HOLIDAY: 'HOLIDAY',
  EXTRA: 'EXTRA'
};
const KIND_LABEL: Partial<Record<AttendanceDayStatus, string>> = {
  LEAVE_PAID: 'Nghỉ phép',
  LEAVE_UNPAID: 'Không lương',
  LEAVE_MAKEUP: 'Nghỉ có làm bù',
  ISAT: 'iSAT',
  HOLIDAY: 'Lễ',
  EXTRA: 'Ngoài lịch'
};

/** Warning of a PRESENT or ABSENT day with a pay-affecting case that is not approved; null when it needs none. */
function explanationWarningCodeOf(row: AttendanceDayRecord): ExplanationWarningCode | null {
  if (row.status !== 'PRESENT' && row.status !== 'ABSENT') return null;
  if (!row.cases.some(c => c.affectsPay)) return null;
  if (row.explanationStatus === 'PENDING') return 'EXPLANATION_PENDING';
  if (row.explanationStatus === 'REJECTED') return 'EXPLANATION_REJECTED';
  if (row.explanationStatus === 'NONE') return 'EXPLANATION_MISSING';
  return null;
}

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

const NO_KPI: KpiScoreRow = { wework: null, user_score: null, peer: null, manager: null, self_score: null, kpi_proposed: null };

/**
 * Phần KPI đổi của một lần lưu, theo tên ở API (điểm, không nhân 100; lương đề xuất bằng đồng). Cột không gửi hoặc
 * gửi đúng giá trị cũ thì không có mặt; không đổi gì thì cả hai rỗng.
 */
function kpiChanges(was: KpiScoreRow, patch: KpiScorePatch) {
  const before: Record<string, number | null> = {};
  const after: Record<string, number | null> = {};
  const points = (v: number | null) => (v === null ? null : v / 100);
  for (const { column, name } of KPI_SCORE_FIELDS) {
    const next = patch[column];
    if (next === undefined || next === was[column]) continue;
    before[name] = points(was[column]);
    after[name] = points(next);
  }
  if (patch.kpi_proposed !== undefined && patch.kpi_proposed !== was.kpi_proposed) {
    before.proposedAmount = was.kpi_proposed;
    after.proposedAmount = patch.kpi_proposed;
  }
  return { before, after, changed: Object.keys(after).length > 0 };
}

/** Tỉ lệ 0.125 → "12,5": đúng số % đã đặt (tối đa 2 chữ số lẻ, dấu phẩy), không làm tròn về số nguyên. */
const pctText = (rate: number): string => String(Math.round(rate * 10000) / 100).replace('.', ',');

@Injectable()
export class PayrollService {
  /** Thời điểm hiện tại, dùng khi ghi lại dòng ngày của tháng; test đặt lại để cố định "hôm nay" (như RequestsService). */
  now: () => Date = () => new Date();

  constructor(
    @Inject(PayrollRepository) private readonly repo: PayrollRepository,
    // Nest always injects the reader (PayrollModule imports SettingsModule; no @Optional, so a missing import fails at
    // boot). A service built by hand without it computes with DEFAULT_PAY_RULES and the position type's workdays.
    @Inject(SettingsReader) private readonly settings?: PayrollSettings,
    // Nest always injects it too (PayrollModule imports AttendanceModule; no @Optional). A service built by hand
    // without it can list, decide and score payslips but not compute one.
    @Inject(AttendanceDaysService) private readonly days?: PayrollDays,
    @Optional() @Inject(TransactionCoordinator) private readonly txCoordinator?: TransactionCoordinator,
    // The period lifecycle (PayrollModule imports PeriodsModule): a full run after Chốt công marks the period calculated,
    // approved/paid refuse a run or a KPI change, and payslips are decided only while calculated. Without it (hand-built
    // in tests) none of those checks run.
    @Optional() @Inject(PeriodsService) private readonly periods?: PeriodsService,
    // Nest luôn tiêm (AuditModule toàn cục). Service dựng tay trong test không có thì không ghi nhật ký.
    @Optional() @Inject(AuditLog) private readonly audit?: Pick<AuditLog, 'append'>
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
    const doCalc = async (trx?: DatabaseTransaction) => {
      // Kỳ đã phê duyệt hoặc đã trả thì không tính lại; rev đọc ở đây là rev mà markCalculated sẽ đối chiếu (R4).
      const snapshot = this.periods ? await this.periods.snapshot(month) : null;
      if (snapshot && (snapshot.status === 'approved' || snapshot.status === 'paid')) {
        throw new PayrollFinalizedError(`Kỳ lương ${month} đã phê duyệt, không thể tính lại`);
      }
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
      // Nhật ký payroll.calculate là câu ghi cuối trong giao dịch lưu lần chạy: ghi lỗi thì lần chạy không được lưu.
      const audit = this.audit;
      const logRun = audit
        ? async (t: DatabaseTransaction, run: SavedRun) => {
            await audit.append(t, {
              actor,
              action: 'payroll.calculate',
              entityKind: 'period',
              entityId: month,
              month,
              before: run.previousRunNo === null ? null : { run: run.previousRunNo },
              after: {
                run: run.runNo,
                slips: run.slips,
                errors: errors.length,
                ...(isPartial ? { people: payslips.map(p => p.username) } : {})
              },
              sensitivity: 'normal',
              requestId: randomUUID()
            });
          }
        : undefined;
      const runId = await this.repo.savePayrollRunAndSlips(
        month,
        actor,
        payslips,
        errors.length,
        carryForward,
        settings,
        logRun
      );
      if (this.periods && snapshot && runId !== null) {
        await this.periods.markCalculated(trx, month, { runId, actor, full: !isPartial, expectedRev: snapshot.rev });
      }
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
    const cleanNote = typeof note === 'string' ? note.trim() || null : null;
    const decide = async (trx?: DatabaseTransaction): Promise<PayslipRecord | null> => {
      if (this.periods) {
        const { status: periodStatus } = await this.periods.snapshot(month);
        if (periodStatus !== 'calculated') throw new PayslipNotDecidableError(month, periodStatus);
      }
      // Có giao dịch và nhật ký: đọc quyết định cũ (khoá dòng phiếu), ghi quyết định mới, rồi ghi nhật ký cuối cùng.
      const was = trx && this.audit ? await this.repo.decisionOf(trx, month, username) : null;
      const slip = await this.repo.decidePayslip(month, username, status, actor, cleanNote, trx);
      if (trx && this.audit && was && slip && (was.status !== slip.status || was.note !== slip.note)) {
        await this.audit.append(trx, {
          actor,
          action: 'payroll.decide',
          entityKind: 'payslip',
          entityId: username,
          subject: username,
          month,
          before: { status: was.status },
          after: { status: slip.status },
          reason: cleanNote,
          sensitivity: 'normal',
          requestId: randomUUID()
        });
      }
      return slip;
    };
    return this.txCoordinator ? await this.txCoordinator.withLock(`payroll_${month}`, decide) : await decide();
  }

  // Đưa phiếu về nháp (xoá quyết định); dùng khi kỳ lương cần duyệt lại phiếu. Có `trx` thì chạy trên giao dịch đó
  // (giao dịch duyệt đơn) và giữ lần chạy nháp tới hết giao dịch (xem PayrollRepository.resetDecision).
  async resetDecision(month: string, employeeId: string, trx?: DatabaseTransaction): Promise<boolean> {
    return await this.repo.resetDecision(month, employeeId, trx);
  }

  async getPayslip(month: string, employeeId: string): Promise<PayslipRecord | null> {
    return await this.repo.getPayslip(month, employeeId);
  }

  // Checks the KPI body against the employee's KPI cap and saves it: undefined keeps the stored value, null clears it.
  async setKpiScore(username: string, month: string, body: KpiScoreBody, actor: string): Promise<void> {
    if (this.periods) {
      const { status } = await this.periods.snapshot(month);
      if (status === 'approved' || status === 'paid') {
        throw new PayrollFinalizedError('Kỳ lương đã phê duyệt, không sửa KPI được');
      }
    }
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

    const { audit, txCoordinator } = this;
    if (!audit || !txCoordinator) {
      await this.repo.saveKpiScore(username, month, patch, actor);
      return;
    }
    // Khoá theo người và tháng để `before` đúng cả khi hai lần lưu đầu tiên chạy cùng lúc; nhật ký là câu ghi cuối.
    await txCoordinator.withLock(`kpi_${month}_${username}`, async trx => {
      const was = (await this.repo.kpiScoreOf(trx, username, month)) ?? NO_KPI;
      await this.repo.saveKpiScore(username, month, patch, actor, trx);
      const { before, after, changed } = kpiChanges(was, patch);
      if (!changed) return;
      await audit.append(trx, {
        actor,
        action: 'kpi.score',
        entityKind: 'kpi',
        entityId: username,
        subject: username,
        month,
        before,
        after,
        sensitivity: 'pay',
        requestId: randomUUID()
      });
    });
  }

  /** Số tiền tạm ứng của tháng `month`: 80% lương các ngày công 01–15 theo bảng lương tính ngay lúc này. */
  async advanceQuote(employeeId: string, month: string): Promise<AdvanceQuote> {
    const payslip = await this.generateMonthlyPayslip(employeeId, month);
    return advanceQuoteOf(payslip.dailyLines, month);
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

    const { staff, requests } = data;
    if (staff.baseSalary === null || staff.standardWorkdays === null) {
      const position = `${staff.employeeType ?? 'không rõ loại'} (${staff.positionLevelText})`;
      throw new Error(`Thiếu cấu hình chức vụ hoặc bậc lương cho ${position}`);
    }
    if (!this.days) throw new Error('Bảng lương chưa nối dòng ngày công (AttendanceDaysService)');

    // T6 (spec 7.2): write the whole month's day rows again, then read them. refreshMonth opens its own transaction on
    // another pool connection and takes the person's lock `requests_<uuid>`. So payslipOf must never run while the
    // caller holds that lock on another connection: it would wait for itself forever. No caller does today: Requests
    // computes the advance quote before it takes the lock (requests.service planAdvance), the period run holds only
    // `payroll_<month>`, and /me reads without a lock.
    const rows = await this.days.refreshMonth(staff.uuid, month, { now: this.now() });

    const rules = snapshot ? payRulesOf(snapshot) : DEFAULT_PAY_RULES;
    // The standard days follow the person's own week when there is one (D3/D5), else the position type's workdays.
    const week = this.settings ? await this.settings.workWeekOf(staff.uuid, month) : null;
    const employeeType = staff.employeeType;
    const nightAllowancePct = staff.nightAllowancePct === 60 ? 60 : 40;
    const allowancePolicy = new PayrollAllowancePolicy(employeeType, nightAllowancePct, staff.allowanceRates);
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

    // The payslip shows every day row but those outside the employment, the rest days and the days not evaluated yet.
    const shownRows = rows
      .filter(row => !HIDDEN_KINDS.has(row.status))
      .sort((a, b) => a.workDate.localeCompare(b.workDate));

    // Real presence (the punches, a missing side taken from the approved explanation) of the rows that have one,
    // computed once for the day lines and the OT measure.
    const presenceByDate = new Map<string, Presence>();
    for (const row of shownRows) {
      if (!MEASURED_KINDS.has(row.status) && row.status !== 'ABSENT') continue;
      presenceByDate.set(
        row.workDate,
        presenceOf(row.workDate, row.checkIn, row.checkOut, explainedByDate.get(row.workDate))
      );
    }

    // OT is the presence inside the approved window x hourly rate x multiplier, measured on PRESENT, EXTRA and HOLIDAY
    // rows. A row only counts when both its check-in and check-out are real instants; one without them (or with a
    // malformed explained time) has no OT.
    const validInstant = (at: Date | null): at is Date => at !== null && !Number.isNaN(at.getTime());
    const spans: PresenceSpan[] = [];
    for (const row of shownRows) {
      const presence = presenceByDate.get(row.workDate);
      if (!MEASURED_KINDS.has(row.status) || !presence) continue;
      if (validInstant(presence.start) && validInstant(presence.end)) {
        spans.push({ workDate: row.workDate, start: presence.start, end: presence.end });
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
    const dayWarnings: PayrollWarning[] = [];

    for (const row of shownRows) {
      const kind = row.status;
      const onShift = kind === 'PRESENT' || kind === 'ABSENT';
      // A row with no shift (null outside PRESENT/ABSENT/PENDING) reads as NORMAL; never read a field of it.
      const shiftType = row.shift?.type ?? 'NORMAL';
      const shiftCode = onShift ? shiftType : (KIND_CODE[kind] ?? kind);
      const paysDay = row.payUnits === 1;
      const daySalary = Math.round(row.payUnits * dayRate);
      // The deduction is the row's: after the grace, in 30-minute blocks, and only on an approved explanation (L4).
      const deductionHours = row.deductionMinutes / 60;
      totalDeductionHours += deductionHours;
      const deductionAmount = Math.round(deductionHours * hourRate);
      const makeupPay = Math.round((row.makeupMinutes / 60) * hourRate);

      let shiftLabel = onShift ? 'Normal' : (KIND_LABEL[kind] ?? kind);
      let flexAllowancePay = 0;
      let nightAllowancePay = 0;
      let offPaidPay = 0;
      // The flex and night premiums are paid only on a day that counts as a work day (8.1, R10).
      if (onShift && shiftType === 'FLEX') {
        shiftLabel = `Flex +${pctText(allowancePolicy.flexRate)}%`;
        if (row.countsAsWorkday) flexAllowancePay = allowancePolicy.flexPremium(hourRate, row.workHours);
      } else if (onShift && shiftType === 'NIGHT') {
        shiftLabel = `Night +${pctText(allowancePolicy.nightRate)}%`;
        if (row.countsAsWorkday) {
          nightAllowancePay = allowancePolicy.nightPremium(dayRate);
          offPaidPay = allowancePolicy.nightBreakPay(hourRate, row.workHours, deductionAmount);
        }
      }

      // Shift days, extra days and a holiday with a punch show the real times; the other days show what they pay.
      const presence = presenceByDate.get(row.workDate);
      const showsTimes =
        presence !== undefined && (kind !== 'HOLIDAY' || presence.checkIn !== null || presence.checkOut !== null);
      const checkIn = showsTimes ? presence.checkIn : null;
      const checkOut = showsTimes ? presence.checkOut : null;
      const inOutText = showsTimes ? presenceText(presence) : paysDay ? 'Hưởng lương ngày' : 'Không tính lương';

      const lineShares = otSharesByLine.get(row.workDate) ?? [];
      const otHours = lineShares.reduce((sum, share) => sum + share.hours, 0);
      const linePayByRate = otLinePayByRate(lineShares, hourRate);
      otPayByRate.x15 += linePayByRate.x15;
      otPayByRate.x20 += linePayByRate.x20;
      otPayByRate.x30 += linePayByRate.x30;
      const otPay = linePayByRate.x15 + linePayByRate.x20 + linePayByRate.x30;

      const dailyTotal =
        daySalary + flexAllowancePay + nightAllowancePay + offPaidPay + otPay + makeupPay - deductionAmount;

      dailyLines.push({
        date: row.workDate,
        dayOfWeekText: weekdayTextOf(row.workDate),
        shiftCode,
        shiftLabel,
        inOutText,
        checkIn,
        checkOut,
        workHours: row.workHours,
        daySalary,
        flexAllowancePay,
        nightAllowancePay,
        offPaidPay,
        otHours,
        otPay,
        deductionHours: Math.round(deductionHours * 100) / 100,
        deductionAmount,
        dailyTotal,
        kind,
        payUnits: row.payUnits,
        countsAsWorkday: row.countsAsWorkday,
        countsAsDayOff: row.countsAsDayOff,
        makeupMinutes: row.makeupMinutes,
        makeupPay
      });

      const warningCode = explanationWarningCodeOf(row);
      if (warningCode) dayWarnings.push(explanationWarning(warningCode, row.workDate));
    }

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
    // The KPI warnings, then one per day whose pay-affecting case is not approved yet (in date order).
    const warnings: PayrollWarning[] = [...kpi.warnings, ...dayWarnings];

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
