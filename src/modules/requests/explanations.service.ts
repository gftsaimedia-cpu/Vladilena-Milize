import { Injectable, Optional, Inject } from '@nestjs/common';
import {
  addDays,
  eachDate,
  explanationCasesOf,
  formatDayMonth,
  isClosedPeriod,
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
import { RequestsRepository, type StaffContext } from './requests.repository';
import { DayStatusRepository } from './day-status.repository';
import { ExplanationRemindersRepository } from './explanation-reminders.repository';
import { loadEmployeeDays } from './load-days';
import { AttendanceRepository } from '../attendance/attendance.repository';
import type { DailyTimesheet } from '../attendance/domain';
import { HolidaysRepository } from '../holidays/holidays.repository';
import { SystemService } from '../system/system.service';
import { SettingsReader } from '../settings';
import { withPersonWeek } from './staff-week';

/** Một ngày cần giải trình (spec 3.1): trường hợp máy tìm ra, giờ nhân viên phải nhập và lần nhắc gần nhất (ISO) nếu có. */
export interface DueDay {
  date: string;
  cases: ExplanationCase[];
  needs: ExplanationNeeds;
  remindedAt: string | null;
}

/** Một ngày cần giải trình của một nhân sự, cho chuông của Admin (spec 3.4). */
export interface DueItem extends DueDay {
  employeeId: string;
  name: string;
}

/** Kết quả xét một ngày: cần giải trình thì kèm trường hợp và giờ phải nhập, không thì câu báo vì sao (R-P4). */
export type DueCheck =
  | { ok: true; cases: ExplanationCase[]; needs: ExplanationNeeds }
  | { ok: false; message: string };

/** Như `DueCheck`; ngày cần giải trình kèm ca của ngày ('HH:MM') để người nộp xét giờ ra sau giờ vào (R-P5). */
export type StaffDayCheck =
  | { ok: true; cases: ExplanationCase[]; needs: ExplanationNeeds; shift: { startTime: string; endTime: string } }
  | { ok: false; message: string };

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

const refuse = (message: string): { ok: false; message: string } => ({ ok: false, message });

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
 * giải trình đã có và kỳ lương đã chốt. Chỉ đọc; không phụ thuộc `RequestsService` (chiều ngược lại thì có).
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
    @Optional() @Inject(SystemService) private readonly periods?: Pick<SystemService, 'getPeriod'>,
    @Inject(SettingsReader) private readonly settings?: Pick<SettingsReader, 'workWeekOf'>
  ) {}

  /**
   * Các ngày cần giải trình, mới nhất trước: từ ngày 01 tháng trước (hoặc ngày vào làm, nếu muộn hơn) tới hôm nay (R1),
   * bỏ tháng đã chốt công, ngày không phải ngày làm và ngày đã có đơn; giữ ngày máy tìm ra ít nhất một trường hợp.
   */
  async dueDays(employeeIdOrUsername: string): Promise<DueDay[]> {
    const today = vietnamToday(this.now());
    const staff = await this.resolveStaff(employeeIdOrUsername, monthOf(today));
    const lastMonthStart = firstOfLastMonth(today);
    const from = staff.startDate !== null && staff.startDate > lastMonthStart ? staff.startDate : lastMonthStart;
    if (from > today) return [];

    const facts = await this.loadFacts(staff, from, today, today);
    const [closed, reminders] = await Promise.all([
      this.closedMonths(from, today),
      this.remindersOf(staff.employeeId, from, today)
    ]);
    const due: DueDay[] = [];
    for (const date of eachDate(from, today).reverse()) {
      if (closed.has(monthOf(date))) continue;
      const check = this.judge(facts, date);
      if (check.ok) {
        due.push({ date, cases: check.cases, needs: check.needs, remindedAt: reminders.get(date) ?? null });
      }
    }
    return due;
  }

  /**
   * Ngày cần giải trình của mọi nhân sự đang nộp đơn, ngày mới trước rồi theo tên. Hồ sơ không đọc được (thiếu cấu hình
   * loại nhân sự, dòng Admin không có loại...) bị bỏ qua để một hồ sơ hỏng không làm hỏng chuông của Admin.
   */
  async listDue(): Promise<DueItem[]> {
    const people = await this.requests.listFilingStaff();
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
   * nhắc. `reminded_by` là uuid của Admin, tra như lúc duyệt đơn.
   */
  async remind(employeeIdOrUsername: string, date: string, adminIdOrUsername: string): Promise<{ remindedAt: string }> {
    const check = await this.checkDay(employeeIdOrUsername, date);
    if (!check.ok) {
      throw new Error(check.message);
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
   * tương lai → tháng đã chốt → không phải ngày làm (gồm trước ngày vào làm) → đã có đơn → không có trường hợp. Hai bước
   * đầu không cần đọc lịch, nên loại nhân sự chưa cấu hình chỉ báo lỗi cấu hình từ bước ba.
   */
  async checkStaffDay(staff: StaffContext, date: string): Promise<StaffDayCheck> {
    const today = vietnamToday(this.now());
    if (date > today) {
      return refuse('Không giải trình cho ngày trong tương lai');
    }
    const month = monthOf(date);
    if (await this.isClosedMonth(month)) {
      return refuse(`Tháng ${Number(month.slice(5, 7))} đã chốt công`);
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

    let due: { cases: ExplanationCase[]; needs: ExplanationNeeds; remindedAt: string | null } | null = null;
    if (check.ok) {
      const reminders = await this.remindersOf(staff.employeeId, date, date);
      due = { cases: check.cases, needs: check.needs, remindedAt: reminders.get(date) ?? null };
    }
    return { explanation: latest ? viewOf(latest) : null, due };
  }

  /**
   * Ngày `date` (đã qua bước tương lai và tháng chốt) theo dữ liệu đã đọc: ngày làm, chưa có đơn, có trường hợp. Ca lấy
   * từ `shiftOf`, giờ vào/ra từ bảng công, `hasOt` tính cả OT chờ duyệt lẫn đã duyệt (R-P2).
   */
  private judge(facts: RangeFacts, date: string): StaffDayCheck {
    const { staff, days } = facts;
    const day = formatDayMonth(date);
    const shift = days.shiftOf(date);
    if (
      shift === null ||
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
    const startTime = hhmm(shift.startTime);
    const endTime = hhmm(shift.endTime);
    const { cases, needs } = explanationCasesOf({
      date,
      today: facts.today,
      shiftStart: startTime,
      shiftEnd: endTime,
      checkIn: sheet?.actualCheckIn ?? null,
      checkOut: sheet?.actualCheckOut ?? null,
      hasOt: days.windowsOn(date).some(w => w.kind === 'OT')
    });
    if (cases.length === 0) {
      return refuse(`Ngày ${day} không có gì cần giải trình`);
    }
    return { ok: true, cases, needs, shift: { startTime, endTime } };
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
      days,
      sheets: new Map(sheets.map(sheet => [sheet.workDate, sheet])),
      explained: new Set(
        filed.filter(r => r.explanationDate !== null && EXPLAINED.has(r.status)).map(r => r.explanationDate as string)
      )
    };
  }

  /** Tháng đã chốt công trong các tháng mà [from, to] chạm tới. */
  private async closedMonths(from: string, to: string): Promise<Set<string>> {
    const months = monthsBetween(from, to);
    const closed = await Promise.all(months.map(month => this.isClosedMonth(month)));
    return new Set(months.filter((_, i) => closed[i]));
  }

  /** Kỳ lương đã có dòng và không còn 'open'; không có `periods` thì chưa chốt. */
  private async isClosedMonth(month: string): Promise<boolean> {
    if (!this.periods) return false;
    return isClosedPeriod(await this.periods.getPeriod(month));
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
