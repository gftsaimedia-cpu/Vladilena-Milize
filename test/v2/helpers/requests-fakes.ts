import { randomUUID } from 'node:crypto';
import { RequestsService } from '../../../src/modules/requests/requests.service';
import {
  RequestsRepository,
  type IsatProfile,
  type RequestListFilter,
  type ScheduleDay,
  type StaffContext
} from '../../../src/modules/requests/requests.repository';
import { AttendanceRepository } from '../../../src/modules/attendance/attendance.repository';
import { HolidaysRepository, type Holiday } from '../../../src/modules/holidays/holidays.repository';
import { WorkSchedule } from '../../../src/modules/attendance/domain';
import type { TransactionCoordinator } from '../../../src/database';
import {
  SystemRequest,
  workMinutes,
  type ExplanationCase,
  type RequestStatus,
  type SystemRequestProps
} from '../../../src/modules/requests/domain';

/** Nhân viên `nv01` (T2–T7) và thực tập sinh `tts01` (T2–T6) của các test đơn từ. */
export const NV_UUID = '0a7c4e2e-1111-4a6b-9c1d-000000000001';
export const TTS_UUID = '0a7c4e2e-2222-4a6b-9c1d-000000000002';
/** Người duyệt `admin` của các test: uuid khác tên đăng nhập như trên DB thật. */
export const ADMIN_UUID = '0a7c4e2e-3333-4a6b-9c1d-000000000003';

/** Hồ sơ nộp đơn: mặc định nv, ca 08:00–17:00, 12 ngày phép, mọi cờ bật. `employeeType: 'tts'` đổi sang mặc định tts. */
export function staffContext(overrides: Partial<StaffContext> = {}): StaffContext {
  const tts = overrides.employeeType === 'tts';
  return {
    employeeId: tts ? TTS_UUID : NV_UUID,
    employeeType: tts ? 'tts' : 'nv',
    defaultShift: { startTime: '08:00', endTime: '17:00' },
    leaveBalance: 12,
    leaveBalanceOn: null,
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

  constructor() {
    super({} as any);
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

/** Thay TransactionCoordinator: ghi khoá rồi chạy thẳng, đưa LOCK_TRX làm giao dịch của khoá. */
export class RecordingLock {
  keys: string[] = [];

  async withLock<T>(key: string, fn: (trx: any) => Promise<T>): Promise<T> {
    this.keys.push(key);
    return fn(LOCK_TRX);
  }
}

/** Service đủ phụ thuộc; "hôm nay" cố định 2026-11-04 (17:00 giờ Việt Nam). */
export function makeService() {
  const repo = new FakeRequestsRepository();
  const att = new FakeAttendanceRepository();
  const holidays = new FakeHolidaysRepository();
  const lock = new RecordingLock();
  const service = new RequestsService(repo, att, lock as unknown as TransactionCoordinator, holidays);
  service.now = () => new Date('2026-11-04T10:00:00Z');
  return { service, repo, att, holidays, lock };
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
