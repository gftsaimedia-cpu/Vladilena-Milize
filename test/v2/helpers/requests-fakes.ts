import { randomUUID } from 'node:crypto';
import { RequestsService } from '../../../src/modules/requests/requests.service';
import { ExplanationsService } from '../../../src/modules/requests/explanations.service';
import {
  ExplanationRemindersRepository,
  type ReminderRow
} from '../../../src/modules/requests/explanation-reminders.repository';
import {
  RequestsRepository,
  type IsatProfile,
  type RequestListFilter,
  type ScheduleDay,
  type StaffContext
} from '../../../src/modules/requests/requests.repository';
import { AttendanceRepository, type TimesheetFilter } from '../../../src/modules/attendance/attendance.repository';
import { HolidaysRepository, type Holiday } from '../../../src/modules/holidays/holidays.repository';
import { DayStatusRepository } from '../../../src/modules/requests/day-status.repository';
import { DailyTimesheet, WorkSchedule } from '../../../src/modules/attendance/domain';
import type { TransactionCoordinator } from '../../../src/database';
import type { AdvanceQuote } from '../../../src/modules/payroll/domain';
import {
  SystemRequest,
  eachDate,
  weekday,
  workMinutes,
  type ClaimStatus,
  type DayClaim,
  type DayStatusRow,
  type ExplanationCase,
  type RequestStatus,
  type SystemRequestProps
} from '../../../src/modules/requests/domain';

/** Nhân viên `nv01` (T2–T7) và thực tập sinh `tts01` (T2–T6) của các test đơn từ. */
export const NV_UUID = '0a7c4e2e-1111-4a6b-9c1d-000000000001';
export const TTS_UUID = '0a7c4e2e-2222-4a6b-9c1d-000000000002';
/** Người duyệt `admin` của các test: uuid khác tên đăng nhập như trên DB thật. */
export const ADMIN_UUID = '0a7c4e2e-3333-4a6b-9c1d-000000000003';

/**
 * Hồ sơ nộp đơn: mặc định nv, ca 08:00–17:00, 12 ngày phép, mọi cờ bật, không ghi ngày vào làm. `employeeType: 'tts'`
 * đổi sang mặc định tts.
 */
export function staffContext(overrides: Partial<StaffContext> = {}): StaffContext {
  const tts = overrides.employeeType === 'tts';
  return {
    employeeId: tts ? TTS_UUID : NV_UUID,
    employeeType: tts ? 'tts' : 'nv',
    defaultShift: { startTime: '08:00', endTime: '17:00' },
    leaveBalance: 12,
    leaveBalanceOn: null,
    startDate: null,
    benefits: tts ? { ot: false, makeup: true, leaveAccount: false } : { ot: true, makeup: true, leaveAccount: true },
    regularDows: tts ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6],
    ...overrides
  };
}

const ACTIVE: ReadonlyArray<RequestStatus> = ['PENDING', 'APPROVED'];

/** Giao dịch giả mà RecordingLock đưa vào khoá: các fake ghi lại mỗi lệnh chạy trên giao dịch nào. */
export const LOCK_TRX = { name: 'giao dịch của khoá' };

/** Bản fake gắn với `trx`: dùng chung dữ liệu với bản gốc, chỉ khác giao dịch ghi vào `calls`. */
function boundTo<T extends object>(repo: T, trx: unknown): T {
  const view = Object.create(repo);
  view.trx = trx;
  return view;
}

/** Đơn trong bộ nhớ; hồ sơ tra theo cả uuid lẫn username; `schedules` là lịch của mọi nhân sự. */
export class FakeRequestsRepository extends RequestsRepository {
  /** Giao dịch mà bản này chạy trên (undefined = pool) và nhật ký [phương thức, giao dịch] theo thứ tự gọi. */
  trx: unknown = undefined;
  calls: Array<[string, unknown]> = [];

  override withTransaction(trx: any): this {
    return boundTo(this, trx);
  }

  requests = new Map<string, SystemRequest>();
  /**
   * Trạng thái của mỗi đơn như lần `save` gần nhất, tức như hàng `system_requests` trên DB. Đơn đã đổi trạng thái trong bộ
   * nhớ (duyệt, từ chối, huỷ) mà chưa lưu vẫn giữ trạng thái cũ ở đây; JOIN của fake `day_status` đọc từ đây.
   */
  storedStatus = new Map<string, RequestStatus>();
  profiles = new Map<string, StaffContext>();
  schedules: ScheduleDay[] = [];
  /** Tháng truyền vào findStaffContext, theo thứ tự gọi. */
  staffMonths: string[] = [];
  /** Khoảng [from, to] truyền vào listScheduleDays, theo thứ tự gọi. */
  scheduleRanges: Array<[string, string]> = [];

  constructor() {
    super({} as any);
    this.putStaff('nv01', staffContext());
    this.putStaff('tts01', staffContext({ employeeType: 'tts' }));
    this.putStaff('admin', staffContext({ employeeId: ADMIN_UUID }));
  }

  /** Đặt hồ sơ cho cả uuid lẫn username. */
  putStaff(username: string, context: StaffContext): void {
    this.profiles.set(username, context);
    this.profiles.set(context.employeeId, context);
  }

  override async save(request: SystemRequest): Promise<void> {
    this.calls.push(['save', this.trx]);
    this.requests.set(request.id, request);
    this.storedStatus.set(request.id, request.status);
  }

  override async findById(id: string): Promise<SystemRequest | null> {
    this.calls.push(['findById', this.trx]);
    return this.requests.get(id) ?? null;
  }

  override async listActive(employeeId: string): Promise<SystemRequest[]> {
    this.calls.push(['listActive', this.trx]);
    return [...this.requests.values()].filter(r => r.employeeId === employeeId && ACTIVE.includes(r.status));
  }

  override async list(filter: RequestListFilter = {}): Promise<SystemRequest[]> {
    this.calls.push(['list', this.trx]);
    let result = [...this.requests.values()];
    if (filter.employeeIds?.length) result = result.filter(r => filter.employeeIds!.includes(r.employeeId));
    else if (filter.employeeId) result = result.filter(r => r.employeeId === filter.employeeId);
    if (filter.type) result = result.filter(r => r.type === filter.type);
    if (filter.status) result = result.filter(r => r.status === filter.status);
    return result;
  }

  override async count(filter: Omit<RequestListFilter, 'limit' | 'offset'> = {}): Promise<number> {
    return (await this.list(filter)).length;
  }

  override async resolveStaffUuid(employeeIdOrUsername: string): Promise<string | null> {
    this.calls.push(['resolveStaffUuid', this.trx]);
    return this.profiles.get(employeeIdOrUsername)?.employeeId ?? null;
  }

  override async findStaffContext(employeeIdOrUsername: string, month: string): Promise<StaffContext | null> {
    this.calls.push(['findStaffContext', this.trx]);
    this.staffMonths.push(month);
    return this.profiles.get(employeeIdOrUsername) ?? null;
  }

  override async listScheduleDays(_employeeId: string, from: string, to: string): Promise<ScheduleDay[]> {
    this.calls.push(['listScheduleDays', this.trx]);
    this.scheduleRanges.push([from, to]);
    return this.schedules.filter(s => s.date >= from && s.date <= to);
  }

  override async findIsatProfile(employeeIdOrUsername: string, _month: string): Promise<IsatProfile | null> {
    const staff = this.profiles.get(employeeIdOrUsername);
    if (!staff) return null;
    return {
      employeeId: staff.employeeId,
      isatEnabled: staff.employeeType === 'nv',
      snapshot: {
        fullName: staff.employeeType === 'nv' ? 'Nhân viên' : 'Thực tập sinh',
        positionType: staff.employeeType,
        positionLevel: 1,
        levelName: null,
        shiftType: 'NORMAL',
        shiftStartTime: staff.defaultShift.startTime,
        shiftEndTime: staff.defaultShift.endTime
      }
    };
  }
}

/** Lịch làm việc trong bộ nhớ, khoá `${employeeId}:${workDate}`. */
export class FakeAttendanceRepository extends AttendanceRepository {
  /** Giao dịch mà bản này chạy trên (undefined = pool) và nhật ký [phương thức, giao dịch] theo thứ tự gọi. */
  trx: unknown = undefined;
  calls: Array<[string, unknown]> = [];

  override withTransaction(trx: any): this {
    return boundTo(this, trx);
  }

  schedules = new Map<string, WorkSchedule>();
  dayStatuses = new Map<string, string>();
  /** Bảng công các ngày (giờ vào/ra thật); dựng bằng `timesheet(...)`. */
  timesheets: DailyTimesheet[] = [];

  constructor() {
    super({} as any);
  }

  override async listTimesheets(filter: TimesheetFilter = {}): Promise<DailyTimesheet[]> {
    this.calls.push(['listTimesheets', this.trx]);
    return this.timesheets
      .filter(
        t =>
          (!filter.employeeId || t.employeeId === filter.employeeId) &&
          (!filter.startDate || t.workDate >= filter.startDate) &&
          (!filter.endDate || t.workDate <= filter.endDate) &&
          (!filter.status || t.status === filter.status)
      )
      .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.employeeId.localeCompare(b.employeeId));
  }

  override async ensureDefaultSchedule(employeeId: string, workDate: string): Promise<WorkSchedule> {
    this.calls.push(['ensureDefaultSchedule', this.trx]);
    const key = `${employeeId}:${workDate}`;
    const existing = this.schedules.get(key);
    if (existing) return existing;
    const def = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType: 'NORMAL',
      plannedStartTime: '08:00',
      plannedEndTime: '17:00'
    });
    this.schedules.set(key, def);
    return def;
  }

  override async saveSchedule(schedule: WorkSchedule): Promise<void> {
    this.calls.push(['saveSchedule', this.trx]);
    this.schedules.set(`${schedule.employeeId}:${schedule.workDate}`, schedule);
  }

  override async updateDayStatus(employeeId: string, workDate: string, status: string): Promise<void> {
    this.calls.push(['updateDayStatus', this.trx]);
    this.dayStatuses.set(`${employeeId}:${workDate}`, status);
  }
}

/**
 * Bảng công ca 08–17 của ngày `date`; `inTime`/`outTime` là giờ Việt Nam 'HH:MM' cùng ngày, null = không chấm. Giờ ra
 * sáng hôm sau (ca đêm) thì dựng DailyTimesheet trực tiếp.
 */
export function timesheet(date: string, inTime: string | null, outTime: string | null, employeeId: string = NV_UUID): DailyTimesheet {
  const at = (time: string | null) => (time ? new Date(`${date}T${time}:00+07:00`) : null);
  return DailyTimesheet.create({
    employeeId,
    workDate: date,
    shiftType: 'NORMAL',
    shiftStartTime: '08:00',
    shiftEndTime: '17:00',
    actualCheckIn: at(inTime),
    actualCheckOut: at(outTime)
  });
}

/** Lời nhắc giải trình trong bộ nhớ, khoá `${employeeId}:${date}`; `remindedAt` lưu dạng ISO như bản đọc từ DB. */
export class FakeRemindersRepository extends ExplanationRemindersRepository {
  trx: unknown = undefined;
  calls: Array<[string, unknown]> = [];
  rows = new Map<string, ReminderRow>();

  constructor() {
    super({} as any);
  }

  override withTransaction(trx: any): this {
    return boundTo(this, trx);
  }

  override async upsert(row: { employeeId: string; date: string; remindedBy: string; remindedAt: Date }): Promise<void> {
    this.calls.push(['upsert', this.trx]);
    this.rows.set(`${row.employeeId}:${row.date}`, {
      employeeId: row.employeeId,
      date: row.date,
      remindedBy: row.remindedBy,
      remindedAt: row.remindedAt.toISOString()
    });
  }

  override async listBetween(from: string, to: string, employeeId?: string): Promise<ReminderRow[]> {
    this.calls.push(['listBetween', this.trx]);
    return [...this.rows.values()]
      .filter(r => r.date >= from && r.date <= to && (employeeId === undefined || r.employeeId === employeeId))
      .sort((a, b) => b.date.localeCompare(a.date) || a.employeeId.localeCompare(b.employeeId));
  }
}

/** Lịch lễ trong bộ nhớ; `ranges` ghi các khoảng đã đọc. */
export class FakeHolidaysRepository extends HolidaysRepository {
  /** Giao dịch mà bản này chạy trên (undefined = pool) và nhật ký [phương thức, giao dịch] theo thứ tự gọi. */
  trx: unknown = undefined;
  calls: Array<[string, unknown]> = [];

  override withTransaction(trx: any): this {
    return boundTo(this, trx);
  }

  dates: Holiday[] = [];
  ranges: Array<[string, string]> = [];

  constructor() {
    super({} as any);
  }

  override async listBetween(from: string, to: string): Promise<Holiday[]> {
    this.calls.push(['listBetween', this.trx]);
    this.ranges.push([from, to]);
    return this.dates.filter(h => h.date >= from && h.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  }
}

/**
 * `day_status` trong bộ nhớ, khoá `${employeeId}:${date}`. Đọc trả `DayClaim` với trạng thái đơn lấy từ `source`, và
 * chỉ trả dòng có đơn đang chờ hoặc đã duyệt, như JOIN thật. `source` là `{ requests }` của fake đơn (chung hay riêng).
 * Khi `source` có `storedStatus` thì trạng thái đọc từ đó (như đã lưu): giữa lúc đơn đổi trạng thái trong bộ nhớ và lúc
 * lưu, JOIN thật vẫn thấy trạng thái cũ trên DB.
 */
export class FakeDayStatusRepository extends DayStatusRepository {
  /** Giao dịch mà bản này chạy trên (undefined = pool) và nhật ký [phương thức, giao dịch] theo thứ tự gọi. */
  trx: unknown = undefined;
  calls: Array<[string, unknown]> = [];
  /** Khoảng [from, to] truyền vào listBetween, theo thứ tự gọi. */
  ranges: Array<[string, string]> = [];

  override withTransaction(trx: any): this {
    return boundTo(this, trx);
  }

  rows = new Map<string, DayStatusRow>();

  constructor(
    private readonly source: { requests: Map<string, SystemRequest>; storedStatus?: Map<string, RequestStatus> }
  ) {
    super({} as any);
  }

  /** Đặt dòng thẳng vào bảng, không ghi vào `calls` (dùng để gieo dữ liệu). */
  put(row: DayStatusRow): void {
    this.rows.set(`${row.employeeId}:${row.date}`, row);
  }

  /** Trạng thái đơn như JOIN thấy: như đã lưu nếu biết, không thì trạng thái trong bộ nhớ; không có đơn thì undefined. */
  private statusOf(requestId: string): RequestStatus | undefined {
    const req = this.source.requests.get(requestId);
    if (!req) return undefined;
    return this.source.storedStatus?.get(requestId) ?? req.status;
  }

  private claims(filter: (row: DayStatusRow) => boolean): DayClaim[] {
    const claims: DayClaim[] = [];
    for (const row of this.rows.values()) {
      if (!filter(row)) continue;
      const ownerStatus = this.statusOf(row.requestId);
      if (!ownerStatus || !ACTIVE.includes(ownerStatus)) continue;
      const baseStatus = row.baseRequestId ? this.statusOf(row.baseRequestId) : undefined;
      claims.push({
        ...row,
        requestStatus: ownerStatus as DayClaim['requestStatus'],
        baseRequestStatus: baseStatus ?? null
      });
    }
    return claims.sort((a, b) => a.employeeId.localeCompare(b.employeeId) || a.date.localeCompare(b.date));
  }

  override async listBetween(employeeId: string, from: string, to: string): Promise<DayClaim[]> {
    this.calls.push(['listBetween', this.trx]);
    this.ranges.push([from, to]);
    return this.claims(r => r.employeeId === employeeId && r.date >= from && r.date <= to);
  }

  override async listByRequest(requestId: string): Promise<DayClaim[]> {
    this.calls.push(['listByRequest', this.trx]);
    return this.claims(r => r.requestId === requestId);
  }

  override async listByBase(requestId: string): Promise<DayClaim[]> {
    this.calls.push(['listByBase', this.trx]);
    return this.claims(r => r.baseRequestId === requestId);
  }

  override async upsert(rows: readonly DayStatusRow[]): Promise<void> {
    this.calls.push(['upsert', this.trx]);
    if (rows.length === 0) return;
    const keys = rows.map(r => `${r.employeeId}:${r.date}`);
    if (new Set(keys).size !== keys.length) {
      throw new Error('ON CONFLICT DO UPDATE command cannot affect row a second time');
    }
    for (const row of rows) this.put({ ...row });
  }

  override async remove(employeeId: string, dates: readonly string[], requestId: string): Promise<void> {
    this.calls.push(['remove', this.trx]);
    for (const date of dates) {
      const key = `${employeeId}:${date}`;
      if (this.rows.get(key)?.requestId === requestId) this.rows.delete(key);
    }
  }
}

/** Thay TransactionCoordinator: ghi khoá rồi chạy thẳng, đưa LOCK_TRX làm giao dịch của khoá. */
export class RecordingLock {
  keys: string[] = [];

  async withLock<T>(key: string, fn: (trx: any) => Promise<T>): Promise<T> {
    this.keys.push(key);
    return fn(LOCK_TRX);
  }

  /** Khoá thêm trên giao dịch đang mở (khoá nhân viên lúc duyệt, từ chối, huỷ): chỉ ghi lại khoá. */
  async acquireAdvisoryLock(_trx: unknown, key: string): Promise<void> {
    this.keys.push(key);
  }
}

/** Kỳ lương trong bộ nhớ: `statuses` map tháng (YYYY-MM) → trạng thái; tháng không có trong map là chưa có dòng kỳ. */
export class FakePeriods {
  statuses = new Map<string, string>();

  async getPeriod(month: string): Promise<{ month: string; status: string } | null> {
    const status = this.statuses.get(month);
    return status === undefined ? null : { month, status };
  }
}

/** Số tiền tạm ứng giả: `quote` trả về, hoặc ném `failWith`; `calls` ghi [uuid, tháng]. */
export class FakePayroll {
  quote: AdvanceQuote = { amount: 2_215_385, workDays: 12, from: '2026-11-01', to: '2026-11-15' };
  failWith: Error | null = null;
  calls: Array<[string, string]> = [];

  async advanceQuote(employeeId: string, month: string): Promise<AdvanceQuote> {
    this.calls.push([employeeId, month]);
    if (this.failWith) throw this.failWith;
    return this.quote;
  }
}

/**
 * Service đủ phụ thuộc; "hôm nay" cố định 2026-11-04 (17:00 giờ Việt Nam). `explanations` dùng chung các fake và đồng hồ
 * của `service`: đặt lại `service.now` thì đổi cả hai.
 */
export function makeService() {
  const repo = new FakeRequestsRepository();
  const att = new FakeAttendanceRepository();
  const holidays = new FakeHolidaysRepository();
  const days = new FakeDayStatusRepository(repo);
  const lock = new RecordingLock();
  const periods = new FakePeriods();
  const payroll = new FakePayroll();
  const reminders = new FakeRemindersRepository();
  const explanations = new ExplanationsService(repo, att, holidays, days, reminders, periods);
  const service = new RequestsService(
    repo,
    att,
    lock as unknown as TransactionCoordinator,
    holidays,
    days,
    periods,
    payroll,
    explanations
  );
  service.now = () => new Date('2026-11-04T10:00:00Z');
  explanations.now = () => service.now();
  return { service, repo, att, holidays, days, lock, periods, payroll, explanations, reminders };
}

// ---- Đơn dựng sẵn cho test (mặc định của nv01, đang chờ) ----

type Extra = Partial<SystemRequestProps>;

function request(type: SystemRequestProps['type'], status: RequestStatus, fields: Extra): SystemRequest {
  return new SystemRequest({
    id: randomUUID(),
    employeeId: NV_UUID,
    title: 't',
    reason: 'r',
    type,
    status,
    ...fields
  });
}

/** Đơn nghỉ `ANNUAL`; `leaveDaysCount` mặc định là số ngày lịch của khoảng. */
export function leaveRequest(start: string, end: string, status: RequestStatus = 'PENDING', extra: Extra = {}): SystemRequest {
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  return request('LEAVE', status, {
    leaveType: 'ANNUAL',
    leaveStartDate: start,
    leaveEndDate: end,
    leaveDaysCount: days,
    ...extra
  });
}

/** Đơn nghỉ có làm bù, mỗi khung tính `workMinutes` theo §5.4. */
export function lwmRequest(
  start: string,
  end: string,
  slots: ReadonlyArray<{ date: string; startTime: string; endTime: string }>,
  status: RequestStatus = 'PENDING',
  extra: Extra = {}
): SystemRequest {
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  return request('LEAVE_WITH_MAKEUP', status, {
    leaveType: null,
    leaveStartDate: start,
    leaveEndDate: end,
    leaveDaysCount: days,
    makeupSlots: slots.map(s => ({ ...s, workMinutes: workMinutes(s.startTime, s.endTime) })),
    ...extra
  });
}

/** Đơn OT một khung; `otHours` = giờ thực làm. */
export function otRequest(date: string, startTime: string, endTime: string, status: RequestStatus = 'PENDING', extra: Extra = {}): SystemRequest {
  return request('OVERTIME', status, {
    otDate: date,
    otStartTime: startTime,
    otEndTime: endTime,
    otHours: workMinutes(startTime, endTime) / 60,
    ...extra
  });
}

/** Đơn đổi ca cho khoảng [start, end]. */
export function shiftChange(
  start: string,
  end: string,
  shiftType: string,
  startTime: string,
  endTime: string,
  status: RequestStatus = 'PENDING',
  extra: Extra = {}
): SystemRequest {
  return request('SHIFT_CHANGE', status, {
    changeStartDate: start,
    changeEndDate: end,
    newShiftType: shiftType,
    newStartTime: startTime,
    newEndTime: endTime,
    ...extra
  });
}

/** Đơn giải trình cho một ngày. */
export function explanationRequest(
  date: string,
  cases: ExplanationCase[] = ['LATE_CHECK_IN'],
  status: RequestStatus = 'PENDING',
  extra: Extra = {}
): SystemRequest {
  return request('EXPLANATION', status, { explanationDate: date, explanationCases: cases, ...extra });
}

const NV_ISAT_PROFILE = {
  fullName: 'Nhân viên',
  positionType: 'nv',
  positionLevel: 1,
  levelName: null,
  shiftType: 'NORMAL',
  shiftStartTime: '08:00',
  shiftEndTime: '17:00'
};

/** Đơn iSAT đủ 4 điều kiện cho `saturday`; đã duyệt thì `approve(ADMIN_UUID)`. */
export function isatRequest(
  saturday: string,
  status: 'PENDING' | 'APPROVED' = 'PENDING',
  extra: { employeeId?: string } = {}
): SystemRequest {
  const req = SystemRequest.createIsatRequest({
    employeeId: extra.employeeId ?? NV_UUID,
    saturday,
    team: 'Nhóm thử',
    conditions: { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true },
    profile: NV_ISAT_PROFILE
  });
  if (status === 'APPROVED') req.approve(ADMIN_UUID);
  return req;
}

const CLAIM_OF: Partial<Record<SystemRequestProps['type'], ClaimStatus>> = {
  LEAVE: 'LEAVE',
  LEAVE_WITH_MAKEUP: 'LEAVE_WITH_MAKEUP',
  SHIFT_CHANGE: 'SHIFT_CHANGE',
  ISAT: 'ISAT'
};

/**
 * Lưu đơn, và nếu là nghỉ, nghỉ có làm bù, đổi ca hoặc iSAT đang chờ hoặc đã duyệt thì ghi luôn các dòng `day_status`
 * như lúc nộp: `dates` nếu có; không thì các ngày trong khoảng thuộc `regularDows` của người đó và không là ngày lễ
 * của `ctx.holidays`; iSAT thì đúng Thứ Bảy.
 */
export async function seed(
  ctx: { repo: FakeRequestsRepository; days: FakeDayStatusRepository; holidays: FakeHolidaysRepository },
  req: SystemRequest,
  dates?: string[]
): Promise<SystemRequest> {
  await ctx.repo.save(req);
  const status = CLAIM_OF[req.type];
  if (!status || !ACTIVE.includes(req.status)) return req;

  let days = dates;
  if (!days) {
    if (req.type === 'ISAT') {
      days = req.isat ? [req.isat.saturday] : [];
    } else {
      const start = req.type === 'SHIFT_CHANGE' ? req.changeStartDate : req.leaveStartDate;
      const end = req.type === 'SHIFT_CHANGE' ? req.changeEndDate : req.leaveEndDate;
      const regularDows = ctx.repo.profiles.get(req.employeeId)?.regularDows ?? [1, 2, 3, 4, 5, 6];
      const holidays = new Set(ctx.holidays.dates.map(h => h.date));
      days = start ? eachDate(start, end ?? start).filter(d => regularDows.includes(weekday(d)) && !holidays.has(d)) : [];
    }
  }
  for (const date of days) {
    ctx.days.put({ employeeId: req.employeeId, date, status, requestId: req.id, baseRequestId: null });
  }
  return req;
}
