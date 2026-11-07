import { Injectable, Optional, Inject } from '@nestjs/common';
import {
  addDays,
  eachDate,
  explanationCasesOf,
  formatDayMonth,
  lastDayOfMonth,
  monthOf,
  requireDateText,
  vietnamToday,
  type EmployeeDays,
  type ExplanationCase,
  type ExplanationNeeds,
  type RequestStatus,
  type SystemRequest
} from './domain';
import { bulkFailureOf, runBulk, type BulkFailure } from '../../common';
import { AuditEntryError } from '../audit/domain/audit-entry';
import { RequestsRepository, type StaffContext } from './requests.repository';
import { DayStatusRepository } from './day-status.repository';
import { ExplanationRemindersRepository } from './explanation-reminders.repository';
import { loadEmployeeDays } from './load-days';
import { AttendanceRepository } from '../attendance/attendance.repository';
import {
  detectCases,
  EVALUATE_AFTER_MS,
  expectedBounds,
  type DailyTimesheet,
  type TimeWindow
} from '../attendance/domain';
import { HolidaysRepository } from '../holidays/holidays.repository';
import { gateAllows, type PeriodStatus } from '../periods/domain';
import { PeriodGate } from '../periods/period-gate';
import { PeriodLockedError } from '../periods/periods.errors';
import { SettingsReader } from '../settings';
import { withPersonWeek } from './staff-week';

/** Một ngày cần giải trình (spec 3.1): trường hợp máy tìm ra, giờ nhân viên phải nhập và lần nhắc gần nhất (ISO) nếu có. */
export interface DueDay {
  date: string;
  cases: ExplanationCase[];
  needs: ExplanationNeeds;
  remindedAt: string | null;
  /** Giờ vào/ra thực của ngày ('HH:mm' giờ Việt Nam) theo bảng công; null khi ngày chưa có lần chấm đó. */
  checkIn: string | null;
  checkOut: string | null;
}

/** Một ngày cần giải trình của một nhân sự, cho chuông của Admin (spec 3.4). */
export interface DueItem extends DueDay {
  employeeId: string;
  name: string;
}

/**
 * Ngày bị từ chối: câu báo vì sao (R-P4). Từ chối vì kỳ lương của tháng đã khoá giải trình (đã phê duyệt hoặc đã trả)
 * thì kèm `locked` (tháng và trạng thái kỳ), để nơi gọi ném đúng lỗi 409 `PERIOD_LOCKED`.
 */
export type DayRefusal = { ok: false; message: string; locked?: { month: string; status: PeriodStatus } };

/** Kết quả xét một ngày: cần giải trình thì kèm trường hợp và giờ phải nhập, không thì câu báo vì sao (R-P4). */
export type DueCheck = { ok: true; cases: ExplanationCase[]; needs: ExplanationNeeds } | DayRefusal;

/** Giờ của một lần chấm theo giờ Việt Nam ('HH:mm'); không có thì null. */
function vnTime(at: Date | string | null | undefined): string | null {
  if (!at) return null;
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getTime() + 7 * 3600000).toISOString().slice(11, 16);
}

/**
 * Như `DueCheck`; ngày cần giải trình kèm ca của ngày ('HH:MM') để người nộp xét giờ ra không trước giờ vào (R-P5). Ngày
 * không ca có khung OT/bù đã duyệt thì `shift` null.
 */
export type StaffDayCheck =
  | {
      ok: true;
      cases: ExplanationCase[];
      needs: ExplanationNeeds;
      shift: { startTime: string; endTime: string } | null;
      checkIn: string | null;
      checkOut: string | null;
    }
  | DayRefusal;

/** Lỗi 409 `PERIOD_LOCKED` của một lần từ chối vì kỳ lương; lần từ chối khác thành lỗi nghiệp vụ thường. */
export function refusalError(refusal: DayRefusal): Error {
  return refusal.locked ? new PeriodLockedError(refusal.locked.month, refusal.locked.status) : new Error(refusal.message);
}

/** Mã và câu lỗi của một phần tử nhắc: lỗi lập trình (nhật ký) ném lại, còn lại như `bulkFailureOf`. */
function explanationFailureOf(err: unknown): { code: string; message: string } {
  if (err instanceof AuditEntryError) throw err;
  return bulkFailureOf(err);
}

/** Đơn giải trình của một ngày, như màn nhân viên hiện (spec 3.6). `sentAt` là lúc nộp (ISO). */
export interface ExplanationView {
  id: string;
  status: RequestStatus;
  sentAt: string;
  cases: ExplanationCase[];
  actualCheckIn: string | null;
  actualCheckOut: string | null;
}

/** Dữ liệu đã đọc cho một khoảng ngày của một nhân sự. */
interface RangeFacts {
  staff: StaffContext;
  today: string;
  /** Thời điểm đọc, để biết ngày đã tới mốc xét chưa (spec 4.3). */
  now: Date;
  days: EmployeeDays;
  /** Bảng công theo ngày công. */
  sheets: Map<string, DailyTimesheet>;
  /** Ngày đã có đơn giải trình chờ duyệt, đã duyệt hoặc đã bị từ chối (đơn đã huỷ không tính). */
  explained: Set<string>;
}

const EXPLAINED: ReadonlySet<RequestStatus> = new Set<RequestStatus>(['PENDING', 'APPROVED', 'REJECTED']);

/** 'HH:MM:SS' → 'HH:MM': `explanationCasesOf` chỉ đọc được 'HH:MM' (giờ sai dạng thì lặng lẽ không ra trường hợp nào). */
const hhmm = (time: string): string => time.slice(0, 5);

/** Ngày 01 của tháng trước tháng của `date`: '2026-11-04' → '2026-10-01'. */
const firstOfLastMonth = (date: string): string => `${monthOf(addDays(`${monthOf(date)}-01`, -1))}-01`;

/** Các tháng (YYYY-MM) mà [from, to] chạm tới, theo thứ tự. */
function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = monthOf(from); month <= monthOf(to); month = monthOf(addDays(lastDayOfMonth(month), 1))) {
    months.push(month);
  }
  return months;
}

const refuse = (message: string): DayRefusal => ({ ok: false, message });

/** Khung OT và khung bù của đơn đã duyệt trên ngày `date`: đúng tập khung dòng ngày của chấm công dùng. */
function approvedWindowsOn(days: EmployeeDays, date: string): TimeWindow[] {
  const sources = days.windowSourcesOn(date);
  return days
    .windowsOn(date)
    .filter((_, i) => sources[i].requestStatus === 'APPROVED')
    .map(w => ({ kind: w.kind, start: w.startTime, end: w.endTime }));
}

/**
 * Trường hợp của ngày không ca có khung đã duyệt, bằng bộ dò duy nhất của chấm công (spec 4) như dòng ngày EXTRA: đo so
 * với mốc đầu và mốc cuối của các khung (mọi trường hợp chỉ để biết, không ảnh hưởng tiền ngày).
 */
function windowDayCases(
  date: string,
  windows: readonly TimeWindow[],
  checkIn: Date | null,
  checkOut: Date | null,
  now: Date
): { cases: ExplanationCase[]; needs: ExplanationNeeds } {
  const bounds = expectedBounds(date, null, windows);
  const evaluated =
    (checkIn !== null && checkOut !== null) || (bounds !== null && now.getTime() >= bounds.end.getTime() + EVALUATE_AFTER_MS);
  // Không có ca thì bộ dò không dùng ân hạn vào trễ (đo theo ngưỡng 15 phút so với mốc đầu).
  const { cases } = detectCases({ date, shift: null, windows, checkIn, checkOut, firstOutInShift: null, graceMinutes: 0, evaluated });
  const codes = cases.map(c => c.code);
  return { cases: codes, needs: { checkIn: codes.includes('MISSING_CHECK_IN'), checkOut: codes.includes('MISSING_CHECK_OUT') } };
}

const viewOf = (r: SystemRequest): ExplanationView => ({
  id: r.id,
  status: r.status,
  sentAt: r.createdAt.toISOString(),
  cases: [...r.explanationCases],
  actualCheckIn: r.actualCheckIn,
  actualCheckOut: r.actualCheckOut
});

/**
 * Ngày cần giải trình (spec 3.1–3.2, 3.6): xét từ lịch, ngày lễ, đơn đang giữ ngày, giờ vào/ra thật của bảng công, đơn
 * giải trình đã có và kỳ lương. Giải trình nộp được tới khi kỳ được phê duyệt (người dùng chốt 05/11, spec kỳ lương
 * D2): chỉ tháng có kỳ `approved` hay `paid` bị bỏ (cổng kỳ `explain`). Chỉ đọc; không phụ thuộc `RequestsService`
 * (chiều ngược lại thì có).
 */
@Injectable()
export class ExplanationsService {
  /** Thời điểm hiện tại; test đặt lại để cố định "hôm nay". */
  now: () => Date = () => new Date();

  constructor(
    @Inject(RequestsRepository) private readonly requests: RequestsRepository,
    @Inject(AttendanceRepository) private readonly attendance: AttendanceRepository,
    @Inject(HolidaysRepository) private readonly holidays: HolidaysRepository,
    @Inject(DayStatusRepository) private readonly days: DayStatusRepository,
    @Inject(ExplanationRemindersRepository) private readonly reminderRows: ExplanationRemindersRepository,
    @Optional() @Inject(PeriodGate) private readonly periodGate?: Pick<PeriodGate, 'statusOf'>,
    @Inject(SettingsReader) private readonly settings?: Pick<SettingsReader, 'workWeekOf'>
  ) {}

  /**
   * Các ngày cần giải trình, mới nhất trước: từ ngày 01 tháng trước (hoặc ngày vào làm, nếu muộn hơn) tới hôm nay (R1),
   * bỏ tháng mà kỳ lương đã phê duyệt hoặc đã trả, ngày không phải ngày làm và ngày đã có đơn; giữ ngày máy tìm ra ít
   * nhất một trường hợp. Tháng đã chốt công hay đã tính lương vẫn còn ngày cần giải trình.
   */
  async dueDays(employeeIdOrUsername: string): Promise<DueDay[]> {
    const today = vietnamToday(this.now());
    const staff = await this.resolveStaff(employeeIdOrUsername, monthOf(today));
    const lastMonthStart = firstOfLastMonth(today);
    const from = staff.startDate !== null && staff.startDate > lastMonthStart ? staff.startDate : lastMonthStart;
    if (from > today) return [];

    const facts = await this.loadFacts(staff, from, today, today);
    const [locked, reminders] = await Promise.all([
      this.lockedMonths(from, today),
      this.remindersOf(staff.employeeId, from, today)
    ]);
    const due: DueDay[] = [];
    for (const date of eachDate(from, today).reverse()) {
      if (locked.has(monthOf(date))) continue;
      const check = this.judge(facts, date);
      if (check.ok) {
        due.push({
          date,
          cases: check.cases,
          needs: check.needs,
          remindedAt: reminders.get(date) ?? null,
          checkIn: check.checkIn,
          checkOut: check.checkOut
        });
      }
    }
    return due;
  }

  /**
   * Ngày cần giải trình của mọi nhân sự đang nộp đơn, ngày mới trước rồi theo tên. Hồ sơ không đọc được (thiếu cấu hình
   * loại nhân sự, dòng Admin không có loại...) bị bỏ qua để một hồ sơ hỏng không làm hỏng chuông của Admin.
   */
  async listDue(scope: { onlyIds?: readonly string[] } = {}): Promise<DueItem[]> {
    // `onlyIds` (uuid) giới hạn người xét: mảng rỗng = không ai; bỏ trống = mọi người.
    const only = scope.onlyIds ? new Set(scope.onlyIds) : null;
    const people = (await this.requests.listFilingStaff()).filter(p => !only || only.has(p.uuid));
    const items: DueItem[] = [];
    for (const person of people) {
      let due: DueDay[];
      try {
        due = await this.dueDays(person.uuid);
      } catch (err: any) {
        console.error(`listDue: bỏ qua ${person.uuid}:`, err?.message ?? err);
        continue;
      }
      for (const day of due) items.push({ ...day, employeeId: person.uuid, name: person.name });
    }
    return items.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'vi'));
  }

  /**
   * Admin nhắc nhân sự giải trình ngày `date` (spec 3.5): ngày phải còn cần giải trình; nhắc lại thì ghi đè giờ và người
   * nhắc. `reminded_by` là uuid của Admin, tra như lúc duyệt đơn. Kỳ lương của tháng đã phê duyệt hoặc đã trả thì 409
   * `PERIOD_LOCKED`; lý do khác là lỗi nghiệp vụ thường.
   */
  async remind(employeeIdOrUsername: string, date: string, adminIdOrUsername: string): Promise<{ remindedAt: string }> {
    const check = await this.checkDay(employeeIdOrUsername, date);
    if (!check.ok) {
      throw refusalError(check);
    }
    const staff = await this.resolveStaff(employeeIdOrUsername, monthOf(date));
    const adminId = await this.requests.resolveStaffUuid(adminIdOrUsername);
    if (!adminId) {
      throw new Error('Không tìm thấy tài khoản Admin');
    }
    const remindedAt = this.now();
    await this.reminderRows.upsert({ employeeId: staff.employeeId, date, remindedBy: adminId, remindedAt });
    return { remindedAt: remindedAt.toISOString() };
  }

  /**
   * Nhắc nhiều (người, ngày) một lúc, tuần tự theo thứ tự gửi lên, mỗi phần tử như `remind`: phần tử lỗi (kỳ đã khoá →
   * `PERIOD_LOCKED`, ngày đã có đơn giải trình...) vào `failed` kèm `date`, không kéo các phần tử khác. Nhắc lại người đã
   * được nhắc vẫn ghi đè lần nhắc cũ, chưa có khoảng cách tối thiểu (câu hỏi Q5 chưa chốt).
   */
  async remindMany(
    items: ReadonlyArray<{ employeeId: string; date: string }>,
    adminIdOrUsername: string
  ): Promise<{
    done: Array<{ employeeId: string; date: string; remindedAt: string }>;
    failed: Array<BulkFailure & Record<string, unknown>>;
  }> {
    return await runBulk(
      items,
      item => item.employeeId,
      async item => ({ employeeId: item.employeeId, date: item.date, ...(await this.remind(item.employeeId, item.date, adminIdOrUsername)) }),
      explanationFailureOf,
      item => ({ date: item.date })
    );
  }

  /** Lời nhắc còn hiệu lực của nhân sự, ngày mới trước: chỉ ngày còn cần giải trình (giải trình rồi thì mất, huỷ thì hiện lại). */
  async reminders(employeeIdOrUsername: string): Promise<Array<{ date: string; remindedAt: string }>> {
    const due = await this.dueDays(employeeIdOrUsername);
    return due.flatMap(d => (d.remindedAt === null ? [] : [{ date: d.date, remindedAt: d.remindedAt }]));
  }

  /** Xét ngày `date` của nhân sự theo thứ tự R-P4; nhân sự không có thì báo lỗi. */
  async checkDay(employeeIdOrUsername: string, date: string): Promise<DueCheck> {
    requireDateText(date, 'date');
    const staff = await this.resolveStaff(employeeIdOrUsername, monthOf(date));
    const check = await this.checkStaffDay(staff, date);
    return check.ok ? { ok: true, cases: check.cases, needs: check.needs } : check;
  }

  /**
   * Như `checkDay`, cho người gọi đã có hồ sơ (nộp đơn giải trình); thêm ca của ngày khi ngày cần giải trình. Thứ tự:
   * tương lai → kỳ lương đã khoá giải trình (đã phê duyệt hoặc đã trả; câu và `locked` như lỗi `PERIOD_LOCKED`) → không
   * phải ngày làm (gồm trước ngày vào làm) → đã có đơn → không có trường hợp. Hai bước đầu không cần đọc lịch, nên loại
   * nhân sự chưa cấu hình chỉ báo lỗi cấu hình từ bước ba. `period: false` bỏ bước kỳ lương: lúc nộp đơn, cổng kỳ
   * `explain` trong khoá nhân viên xét bước đó (một chỗ kiểm cho một thao tác).
   */
  async checkStaffDay(staff: StaffContext, date: string, opts: { period?: boolean } = {}): Promise<StaffDayCheck> {
    const today = vietnamToday(this.now());
    if (date > today) {
      return refuse('Không giải trình cho ngày trong tương lai');
    }
    if (opts.period !== false) {
      const month = monthOf(date);
      const status = await this.lockedStatus(month);
      if (status !== null) {
        return { ok: false, message: new PeriodLockedError(month, status).message, locked: { month, status } };
      }
    }
    return this.judge(await this.loadFacts(staff, date, date, today), date);
  }

  /**
   * Phần giải trình của màn chi tiết ngày (spec 3.6): đơn giải trình mới nhất không bị huỷ của ngày, và `due` khi ngày
   * còn cần giải trình (kèm lần nhắc), ngược lại null.
   */
  async dayView(
    employeeIdOrUsername: string,
    date: string
  ): Promise<{
    explanation: ExplanationView | null;
    due: { cases: ExplanationCase[]; needs: ExplanationNeeds; remindedAt: string | null } | null;
  }> {
    requireDateText(date, 'date');
    const staff = await this.resolveStaff(employeeIdOrUsername, monthOf(date));
    const check = await this.checkStaffDay(staff, date);
    const filed = await this.requests.list({ employeeId: staff.employeeId, type: 'EXPLANATION' });
    const latest = filed
      .filter(r => r.explanationDate === date && r.status !== 'CANCELLED')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    // Cùng cửa sổ với `dueDays` (R1): ngày trước ngày 01 của tháng trước không còn giải trình được, nên không báo "cần giải trình".
    let due: { cases: ExplanationCase[]; needs: ExplanationNeeds; remindedAt: string | null } | null = null;
    if (check.ok && date >= firstOfLastMonth(vietnamToday(this.now()))) {
      const reminders = await this.remindersOf(staff.employeeId, date, date);
      due = { cases: check.cases, needs: check.needs, remindedAt: reminders.get(date) ?? null };
    }
    return { explanation: latest ? viewOf(latest) : null, due };
  }

  /**
   * Ngày `date` (đã qua bước tương lai và bước kỳ lương) theo dữ liệu đã đọc: ngày làm (hoặc ngày không ca có khung OT/bù
   * đã duyệt), chưa có đơn, có trường hợp. Giờ vào/ra từ bảng công. Ngày có ca dò theo ca (`explanationCasesOf`, `hasOt`
   * tính cả OT chờ duyệt lẫn đã duyệt, R-P2); ngày không ca có khung dò bằng bộ dò duy nhất của chấm công, như dòng ngày
   * (người dùng chốt 06/11: vào trễ ở khung bù đã duyệt thì giải trình được).
   */
  private judge(facts: RangeFacts, date: string): StaffDayCheck {
    const { staff, days } = facts;
    const day = formatDayMonth(date);
    const shift = days.shiftOf(date);
    const windows = shift === null ? approvedWindowsOn(days, date) : [];
    if (
      (shift === null && windows.length === 0) ||
      (staff.startDate !== null && date < staff.startDate) ||
      days.isHoliday(date) ||
      days.isOnLeave(date) ||
      days.claimOn(date)?.status === 'ISAT'
    ) {
      return refuse(`Ngày ${day} không phải ngày làm`);
    }
    if (facts.explained.has(date)) {
      return refuse(`Ngày ${day} đã có đơn giải trình`);
    }

    const sheet = facts.sheets.get(date);
    const checkIn = sheet?.actualCheckIn ?? null;
    const checkOut = sheet?.actualCheckOut ?? null;
    const times = shift && { startTime: hhmm(shift.startTime), endTime: hhmm(shift.endTime) };
    const { cases, needs } = times
      ? explanationCasesOf({
          date,
          today: facts.today,
          shiftStart: times.startTime,
          shiftEnd: times.endTime,
          checkIn,
          checkOut,
          hasOt: days.windowsOn(date).some(w => w.kind === 'OT')
        })
      : windowDayCases(date, windows, checkIn, checkOut, facts.now);
    if (cases.length === 0) {
      return refuse(`Ngày ${day} không có gì cần giải trình`);
    }
    return {
      ok: true,
      cases,
      needs,
      shift: times,
      checkIn: vnTime(sheet?.actualCheckIn),
      checkOut: vnTime(sheet?.actualCheckOut)
    };
  }

  /** Lịch quanh [from, to] (cần cấu hình loại nhân sự), bảng công của khoảng và các ngày đã có đơn giải trình. */
  private async loadFacts(staff: StaffContext, from: string, to: string, today: string): Promise<RangeFacts> {
    const { days } = await loadEmployeeDays(
      { requests: this.requests, holidays: this.holidays, days: this.days },
      staff,
      from,
      to
    );
    const [sheets, filed] = await Promise.all([
      this.attendance.listTimesheets({ employeeId: staff.employeeId, startDate: from, endDate: to }),
      this.requests.list({ employeeId: staff.employeeId, type: 'EXPLANATION' })
    ]);
    return {
      staff,
      today,
      now: this.now(),
      days,
      sheets: new Map(sheets.map(sheet => [sheet.workDate, sheet])),
      explained: new Set(
        filed.filter(r => r.explanationDate !== null && EXPLAINED.has(r.status)).map(r => r.explanationDate as string)
      )
    };
  }

  /** Các tháng mà [from, to] chạm tới có kỳ lương đã khoá giải trình (đã phê duyệt hoặc đã trả). */
  private async lockedMonths(from: string, to: string): Promise<Set<string>> {
    const months = monthsBetween(from, to);
    const statuses = await Promise.all(months.map(month => this.lockedStatus(month)));
    return new Set(months.filter((_, i) => statuses[i] !== null));
  }

  /**
   * Trạng thái kỳ của tháng khi cổng kỳ không cho giải trình (`approved`, `paid`); tháng còn nhận giải trình (`open`,
   * `attendance_locked`, `calculated`) thì null. Không có cổng kỳ thì không tháng nào bị khoá.
   */
  private async lockedStatus(month: string): Promise<PeriodStatus | null> {
    if (!this.periodGate) return null;
    const status = await this.periodGate.statusOf(undefined, month);
    return gateAllows(status, 'explain') ? null : status;
  }

  /** Lần nhắc theo ngày trong [from, to] của nhân sự: ngày → `remindedAt` (ISO). */
  private async remindersOf(employeeId: string, from: string, to: string): Promise<Map<string, string>> {
    const rows = await this.reminderRows.listBetween(from, to, employeeId);
    return new Map(rows.map(r => [r.date, r.remindedAt]));
  }

  /** Hồ sơ theo uuid hoặc username, cấu hình loại nhân sự xét đến `month`. */
  private async resolveStaff(employeeIdOrUsername: string, month: string): Promise<StaffContext> {
    const staff = await this.requests.findStaffContext(employeeIdOrUsername, month);
    if (!staff) {
      throw new Error(`Không tìm thấy nhân sự: ${employeeIdOrUsername}`);
    }
    return withPersonWeek(staff, month, this.settings);
  }
}
