import { Injectable, Optional, Inject } from '@nestjs/common';
import { TransactionCoordinator, type DatabaseTransaction } from '../../database';
import {
  SystemRequest,
  RequestType,
  RequestStatus,
  LeaveType,
  SystemRequestDTO,
  EmployeeDays,
  addDays,
  eachDate,
  formatDayMonth,
  monthOf,
  requireDateRange,
  requireDateText,
  requireLeaveType,
  requireTimeText,
  windowError,
  dayCapError,
  workMinutes,
  formatHours,
  lastDayOfMonth,
  requireMakeupSlots,
  findShiftFrame,
  requireExplanationCases,
  optionalActualTime,
  vietnamToday,
  planClaims,
  DayConflictError,
  type ClaimPlan,
  type ClaimStatus,
  type ClockWindow,
  type DayClaim,
  type DayStatusRow,
  type NewRequestKind
} from './domain';
import { RequestsRepository, RequestListFilter, StaffContext } from './requests.repository';
import { DayStatusRepository } from './day-status.repository';
import { AttendanceRepository } from '../attendance/attendance.repository';
import { HolidaysRepository } from '../holidays/holidays.repository';
import { businessMonthText } from '../../common/business-date';

/** Thân đơn nghỉ (§6.1). Số ngày do server đếm: `daysCount` client gửi (nếu có) không được đọc. */
export interface CreateLeaveInput {
  employeeId: string;
  title: string;
  reason: string;
  leaveType: unknown;
  startDate: unknown;
  endDate: unknown;
}

const isActive = (r: SystemRequest): boolean => r.status === 'PENDING' || r.status === 'APPROVED';

/** Các loại đơn chiếm ngày trong `day_status`. */
const CLAIMING_TYPES: ReadonlySet<string> = new Set(['LEAVE', 'LEAVE_WITH_MAKEUP', 'SHIFT_CHANGE', 'ISAT']);

/**
 * Loại và ngày mà `planClaims` xét lại lúc duyệt, như lúc nộp: đơn theo khoảng xét các ngày làm việc trong khoảng của
 * đơn, đơn một ngày xét đúng ngày của đơn (Thứ Bảy iSAT, ngày OT, ngày giải trình). Tạm ứng không xét ngày: null.
 */
function recheckScope(req: SystemRequest): { kind: NewRequestKind; from: string; to: string; range: boolean } | null {
  const range = (kind: NewRequestKind, from: string | null, to: string | null) =>
    from ? { kind, from, to: to ?? from, range: true } : null;
  const single = (kind: NewRequestKind, date: string | null | undefined) =>
    date ? { kind, from: date, to: date, range: false } : null;
  switch (req.type) {
    case 'LEAVE':
    case 'LEAVE_WITH_MAKEUP':
      return range(req.type, req.leaveStartDate, req.leaveEndDate);
    case 'SHIFT_CHANGE':
      return range('SHIFT_CHANGE', req.changeStartDate, req.changeEndDate);
    case 'ISAT':
      return single('ISAT', req.isat?.saturday);
    case 'OVERTIME':
      return single('OVERTIME', req.otDate);
    case 'EXPLANATION':
      return single('EXPLANATION', req.explanationDate);
    default:
      return null;
  }
}

/**
 * Ngày đang thuộc một đơn khác mà đơn theo khoảng `req` được đứng cạnh theo luật nộp, nên không xét lại lúc duyệt:
 * Thứ Bảy iSAT đã duyệt (bỏ khỏi đơn, C2); với đơn đổi ca, ngày nghỉ hoặc iSAT (bỏ lúc nộp theo T4, hay thay ngày của
 * đơn đổi ca theo T3).
 */
function standsBeside(req: SystemRequest, claim: DayClaim | null): boolean {
  if (!claim || claim.requestId === req.id) return false;
  if (claim.status === 'ISAT' && claim.requestStatus === 'APPROVED') return true;
  return req.type === 'SHIFT_CHANGE' && claim.status !== 'SHIFT_CHANGE';
}

/** Dòng ghi lại khi trả ngày: giữ nhân sự và ngày, không còn đơn gốc, ghi đè trạng thái/đơn theo `over`. */
function releasedRow(day: DayClaim, over: Partial<Pick<DayStatusRow, 'status' | 'requestId'>>): DayStatusRow {
  return {
    employeeId: day.employeeId,
    date: day.date,
    status: over.status ?? day.status,
    requestId: over.requestId ?? day.requestId,
    baseRequestId: null
  };
}

/** Gom ngày theo nhân sự để xoá: `remove` xoá theo từng nhân sự. */
function groupDates(days: readonly DayClaim[]): Map<string, string[]> {
  const byEmployee = new Map<string, string[]>();
  for (const day of days) {
    byEmployee.set(day.employeeId, [...(byEmployee.get(day.employeeId) ?? []), day.date]);
  }
  return byEmployee;
}

/** Đơn vừa tạo kèm các cảnh báo (ngày bị bỏ khỏi đơn, ngày nghỉ giữ nguyên…); không có thì `warnings` rỗng. */
export type CreatedRequestDTO = SystemRequestDTO & { warnings: string[] };

/** 2 → '2', 2.5 → '2,5' */
const formatDays = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

/** Thân đơn đổi ca (§6.4): khoảng ngày và khung ca chọn theo `shiftType` + `startTime`; giờ ra lấy từ khung. */
export interface CreateShiftChangeInput {
  employeeId: string;
  title: string;
  reason: string;
  startDate: unknown;
  endDate: unknown;
  shiftType: unknown;
  startTime: unknown;
}

/** Thân đơn nghỉ có làm bù (§6.2): khoảng nghỉ và danh sách khung bù; số ngày và giờ bù do server tính. */
export interface CreateLeaveWithMakeupInput {
  employeeId: string;
  title: string;
  reason: string;
  startDate: unknown;
  endDate: unknown;
  slots: unknown;
}

/** Thân đơn OT (§6.3): một khung; `targetDate` nhận thay `otDate`. Giờ OT do server tính, `hours`/`otHours` không đọc. */
export interface CreateOvertimeInput {
  employeeId: string;
  title: string;
  reason: string;
  otDate?: unknown;
  targetDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
}

/** Mỗi ngày nghỉ của đơn nghỉ có làm bù cần đúng 480 phút (8 giờ) làm bù (§6.2). */
const MAKEUP_MINUTES_PER_LEAVE_DAY = 480;

/** Trần OT tháng: 40 giờ (Điều 107 Bộ luật Lao động), giữ như v2. */
const MONTH_OT_CAP_MINUTES = 40 * 60;

export interface CreateAdvanceInput {
  employeeId: string;
  title: string;
  reason: string;
  amount: number | bigint;
  period?: string;
}

/** Thân đơn giải trình (§6.5): ngày công, các trường hợp và giờ thực tế (không bắt buộc). */
export interface CreateExplanationInput {
  employeeId: string;
  title: string;
  reason: string;
  workDate: unknown;
  cases: unknown;
  actualCheckIn?: unknown;
  actualCheckOut?: unknown;
}

export interface CreateIsatInput {
  employeeId: string;
  saturday?: unknown;
  team?: unknown;
  conditions?: unknown;
}

/**
 * Các repository một thao tác dùng. Trong khoá, cả bốn chạy trên giao dịch của khoá: thao tác thành một khối
 * (lỗi ở đâu thì mọi thứ đã ghi đều huỷ) và chỉ giữ một kết nối của pool.
 */
interface RequestStores {
  requests: RequestsRepository;
  attendance?: AttendanceRepository;
  holidays?: HolidaysRepository;
  days?: DayStatusRepository;
}

@Injectable()
export class RequestsService {
  /** Thời điểm hiện tại; test đặt lại để cố định "hôm nay". */
  now: () => Date = () => new Date();

  constructor(
    @Inject(RequestsRepository) private readonly repo: RequestsRepository,
    @Optional() @Inject(AttendanceRepository) private readonly attendanceRepo?: AttendanceRepository,
    @Optional() @Inject(TransactionCoordinator) private readonly txCoordinator?: TransactionCoordinator,
    @Optional() @Inject(HolidaysRepository) private readonly holidaysRepo?: HolidaysRepository,
    @Optional() @Inject(DayStatusRepository) private readonly dayStatusRepo?: DayStatusRepository,
  ) {}

  /** Repository chạy trên `trx`; không có `trx` thì chạy trên pool. */
  private storesOn(trx?: DatabaseTransaction): RequestStores {
    if (!trx) {
      return { requests: this.repo, attendance: this.attendanceRepo, holidays: this.holidaysRepo, days: this.dayStatusRepo };
    }
    return {
      requests: this.repo.withTransaction(trx),
      attendance: this.attendanceRepo?.withTransaction(trx),
      holidays: this.holidaysRepo?.withTransaction(trx),
      days: this.dayStatusRepo?.withTransaction(trx)
    };
  }

  /**
   * Chạy `fn` dưới advisory lock `key`, với repository gắn vào giao dịch của khoá; `trx` là giao dịch đó (để lấy thêm
   * khoá trên cùng giao dịch). Không có txCoordinator thì chạy thẳng, `trx` là undefined.
   */
  private async underLock<T>(
    key: string,
    fn: (stores: RequestStores, trx?: DatabaseTransaction) => Promise<T>
  ): Promise<T> {
    if (this.txCoordinator) {
      return await this.txCoordinator.withLock(key, trx => fn(this.storesOn(trx), trx));
    }
    return await fn(this.storesOn());
  }

  /**
   * Lấy thêm khoá nhân viên `requests_<uuid>` trên giao dịch `trx` đang giữ khoá `request_<id>` (§4: duyệt, từ chối và
   * huỷ). Cùng giao dịch nên không mở thêm kết nối; nộp đơn chỉ lấy khoá nhân viên nên không thể khoá chéo.
   */
  private async lockEmployee(trx: DatabaseTransaction | undefined, employeeId: string): Promise<void> {
    if (trx && this.txCoordinator) {
      await this.txCoordinator.acquireAdvisoryLock(trx, `requests_${employeeId}`);
    }
  }

  /** Bảng `day_status` của `stores`; thiếu thì báo lỗi (mọi thao tác trên ngày cần bảng này). */
  private dayRepo(stores: RequestStores): DayStatusRepository {
    if (!stores.days) {
      throw new Error('Thiếu bảng trạng thái ngày');
    }
    return stores.days;
  }

  /** Hồ sơ nộp đơn theo uuid hoặc username, cấu hình loại nhân sự xét đến `month` (YYYY-MM). */
  protected async resolveStaff(
    employeeIdOrUsername: string,
    month: string,
    stores: RequestStores = this.storesOn()
  ): Promise<StaffContext> {
    const staff = await stores.requests.findStaffContext(employeeIdOrUsername, month);
    if (!staff) {
      throw new Error(`Không tìm thấy nhân sự: ${employeeIdOrUsername}`);
    }
    return staff;
  }

  /** `regular_dows` của loại nhân sự; chưa cấu hình thì không xét được ngày làm việc (§5.1). */
  protected requireTypeConfig(staff: StaffContext): number[] {
    if (!staff.regularDows) {
      throw new Error(`Thiếu cấu hình loại nhân sự ${staff.employeeType}`);
    }
    return staff.regularDows;
  }

  /**
   * Lịch, ngày lễ, đơn đang chờ/đã duyệt và trạng thái ngày (`day_status`) của nhân sự quanh [from, to]. Đọc rộng thêm một ngày mỗi phía
   * để thấy ca đêm hôm trước và ca hôm sau (§5.5 bước 2).
   */
  protected async loadDays(
    staff: StaffContext,
    from: string,
    to: string,
    stores: RequestStores = this.storesOn()
  ): Promise<{ days: EmployeeDays; active: SystemRequest[] }> {
    const holidaysRepo = stores.holidays;
    if (!holidaysRepo) {
      throw new Error('Thiếu lịch lễ công ty');
    }
    const daysRepo = this.dayRepo(stores);
    const regularDows = this.requireTypeConfig(staff);
    const lo = addDays(from, -1);
    const hi = addDays(to, 1);
    // Trong giao dịch, các truy vấn chạy lần lượt trên cùng một kết nối dù gửi cùng lúc.
    const [schedules, holidays, active, claims] = await Promise.all([
      stores.requests.listScheduleDays(staff.employeeId, lo, hi),
      holidaysRepo.listBetween(lo, hi),
      stores.requests.listActive(staff.employeeId),
      daysRepo.listBetween(staff.employeeId, lo, hi)
    ]);
    const days = new EmployeeDays({
      regularDows,
      holidays: holidays.map(h => h.date),
      defaultShift: staff.defaultShift,
      schedules,
      activeRequests: active,
      claims
    });
    return { days, active };
  }

  /**
   * Ghi các ngày của kế hoạch `plan` vào `day_status` cho đơn `req`, sau khi đơn đã được lưu (khoá ngoại tới
   * `system_requests`). Ngày thay một đơn đổi ca ghi đơn đó vào `baseRequestId`.
   */
  private async claimDays(stores: RequestStores, req: SystemRequest, plan: ClaimPlan, status: ClaimStatus): Promise<void> {
    await this.dayRepo(stores).upsert(
      plan.take.map(({ date, replaces }) => ({
        employeeId: req.employeeId,
        date,
        status,
        requestId: req.id,
        baseRequestId: replaces?.requestId ?? null
      }))
    );
  }

  /**
   * Mỗi lần nộp đơn của một nhân sự chạy dưới khoá `requests_<uuid>` (§5.6); `fn` đọc và ghi qua `stores` (giao dịch
   * của khoá). Không có txCoordinator thì chạy thẳng trên pool.
   */
  protected async underEmployeeLock<T>(employeeId: string, fn: (stores: RequestStores) => Promise<T>): Promise<T> {
    return await this.underLock(`requests_${employeeId}`, fn);
  }

  async createLeaveRequest(input: CreateLeaveInput): Promise<CreatedRequestDTO> {
    const leaveType = requireLeaveType(input.leaveType);
    const { startDate, endDate } = requireDateRange(input.startDate, input.endDate);
    const staff = await this.resolveStaff(input.employeeId, monthOf(startDate));
    this.requireTypeConfig(staff);

    return this.underEmployeeLock(staff.employeeId, async stores => {
      const { days, active } = await this.loadDays(staff, startDate, endDate, stores);
      const leaveDays = days.workingDaysBetween(startDate, endDate);
      if (leaveDays.length === 0) {
        throw new Error('Khoảng nghỉ không có ngày làm việc');
      }
      this.assertLeaveRangeFree(days, active, startDate, endDate);
      const plan = planClaims({ kind: 'LEAVE', dates: leaveDays, days });

      if (leaveType === 'ANNUAL') {
        if (!staff.benefits.leaveAccount) {
          throw new Error('Loại nhân sự này không có Phép năm');
        }
        // Số dư = leave_balance − ngày của các đơn Phép năm đang chờ/đã duyệt từ mốc leave_balance_on (NULL = mọi đơn).
        const used = active
          .filter(r => r.type === 'LEAVE' && r.leaveType === 'ANNUAL' && isActive(r))
          .filter(r => staff.leaveBalanceOn === null || (r.leaveStartDate ?? '') >= staff.leaveBalanceOn)
          .reduce((sum, r) => sum + (r.leaveDaysCount ?? 0), 0);
        const remaining = staff.leaveBalance - used;
        if (plan.take.length > remaining) {
          throw new Error(`Phép năm còn ${formatDays(remaining)} ngày, xin ${plan.take.length} ngày`);
        }
      }

      const req = SystemRequest.createLeaveRequest({
        employeeId: staff.employeeId,
        title: input.title,
        reason: input.reason,
        leaveType,
        startDate,
        endDate,
        daysCount: plan.take.length
      });
      await stores.requests.save(req);
      await this.claimDays(stores, req, plan, 'LEAVE');
      return { ...req.toJSON(), warnings: plan.warnings };
    });
  }

  /**
   * Khoảng nghỉ [start, end] không trùng đơn nghỉ/nghỉ có làm bù khác đang chờ hoặc đã duyệt, và không ngày lịch
   * nào trong khoảng đang có khung OT hoặc khung bù (§6.1 bước 4–5).
   */
  protected assertLeaveRangeFree(days: EmployeeDays, active: readonly SystemRequest[], start: string, end: string): void {
    for (const r of active) {
      if ((r.type !== 'LEAVE' && r.type !== 'LEAVE_WITH_MAKEUP') || !isActive(r) || !r.leaveStartDate) continue;
      const otherEnd = r.leaveEndDate ?? r.leaveStartDate;
      if (r.leaveStartDate <= end && start <= otherEnd) {
        throw new Error(`Đã có đơn nghỉ trùng ngày (${formatDayMonth(r.leaveStartDate)} – ${formatDayMonth(otherEnd)})`);
      }
    }
    for (const date of eachDate(start, end)) {
      if (days.windowsOn(date).length > 0) {
        throw new Error(`Ngày ${formatDayMonth(date)} đã có khung OT hoặc làm bù`);
      }
    }
  }

  /**
   * Duyệt đơn nghỉ hoặc nghỉ có làm bù: mỗi ngày đơn đang giữ trong `day_status` ghi lịch ON_LEAVE (§4.2). Ngày bị bỏ lúc
   * nộp (CN, ngày lễ, Thứ Bảy có iSAT đã duyệt) không có dòng nên không ghi; khung bù không ghi vào lịch.
   */
  protected async markLeaveDays(req: SystemRequest, stores: RequestStores = this.storesOn()): Promise<void> {
    const attendance = stores.attendance;
    if (!attendance) return;
    for (const day of await this.dayRepo(stores).listByRequest(req.id)) {
      const sched = await attendance.ensureDefaultSchedule(day.employeeId, day.date);
      await attendance.saveSchedule(sched.withLeave(req.id));
    }
  }

  async createShiftChangeRequest(input: CreateShiftChangeInput): Promise<CreatedRequestDTO> {
    const frame = findShiftFrame(input.shiftType, input.startTime);
    if (!frame) {
      throw new Error(`Khung ca không hợp lệ: ${String(input.shiftType)} ${String(input.startTime)}`);
    }
    const { startDate, endDate } = requireDateRange(input.startDate, input.endDate);
    const staff = await this.resolveStaff(input.employeeId, monthOf(startDate));
    this.requireTypeConfig(staff);

    return this.underEmployeeLock(staff.employeeId, async stores => {
      const { days } = await this.loadDays(staff, startDate, addDays(endDate, 1), stores);
      const changed = days.workingDaysBetween(startDate, endDate);
      if (changed.length === 0) {
        throw new Error('Khoảng đổi ca không có ngày làm việc');
      }
      // Ngày nghỉ và Thứ Bảy có iSAT đã duyệt bị bỏ khỏi đơn (kèm cảnh báo); ngày đang là dòng đổi ca của đơn khác bị
      // chặn ("đã có đơn đổi ca khác"). Từ đây chỉ xét các ngày đơn thật sự đổi.
      const plan = planClaims({ kind: 'SHIFT_CHANGE', dates: changed, days });
      const taken = plan.take.map(t => t.date);

      // Ca mới phải hợp với mọi khung OT/bù đã có của ngày được đổi và của hôm sau (ca đêm kéo sang sáng hôm sau).
      const next = days.withShiftOverride(taken, frame);
      const checkDates = [...new Set([...taken, ...taken.map(d => addDays(d, 1))])].sort();
      for (const date of checkDates) {
        const windows = next.windowsOn(date);
        for (const w of windows) {
          if (windowError(w, next.shiftsAround(date), []) !== null) {
            throw new Error(
              `${formatDayMonth(date)}: khung ${w.kind === 'OT' ? 'OT' : 'bù'} ${w.startTime}–${w.endTime} ` +
                `chạm ca mới ${frame.startTime}–${frame.endTime}`
            );
          }
        }
        const capProblem = dayCapError(date, next.shiftOf(date) !== null, windows);
        if (capProblem) {
          throw new Error(capProblem);
        }
      }

      const req = SystemRequest.createShiftChangeRequest({
        employeeId: staff.employeeId,
        title: input.title,
        reason: input.reason,
        startDate,
        endDate,
        frame
      });
      await stores.requests.save(req);
      await this.claimDays(stores, req, plan, 'SHIFT_CHANGE');
      return { ...req.toJSON(), warnings: plan.warnings };
    });
  }

  /**
   * Duyệt đơn đổi ca: ghi ca mới lên các ngày còn là dòng `SHIFT_CHANGE` của đơn (§4.2). Ngày đã bị đơn nghỉ hoặc iSAT
   * thay (T3) thuộc đơn kia nên không ghi; ngày bị bỏ lúc nộp (ngày nghỉ, iSAT đã duyệt, CN, ngày lễ) cũng không.
   */
  protected async markShiftChangeDays(req: SystemRequest, stores: RequestStores = this.storesOn()): Promise<void> {
    const attendance = stores.attendance;
    if (!attendance) return;
    for (const day of await this.dayRepo(stores).listByRequest(req.id)) {
      await this.writeShiftChange(attendance, req, day.employeeId, day.date);
    }
  }

  /** Ghi ca mới của đơn đổi ca `change` lên lịch ngày `date`; đơn thiếu giờ ca thì không ghi. */
  private async writeShiftChange(
    attendance: AttendanceRepository,
    change: SystemRequest,
    employeeId: string,
    date: string
  ): Promise<void> {
    if (!change.newStartTime || !change.newEndTime) return;
    const sched = await attendance.ensureDefaultSchedule(employeeId, date);
    await attendance.saveSchedule(
      sched.withShiftChange(change.newShiftType as any, change.newStartTime, change.newEndTime, change.id)
    );
  }

  /** Duyệt đơn iSAT: Thứ Bảy đơn đang giữ ghi lịch iSAT (nghỉ có lương). */
  private async markIsatDay(req: SystemRequest, stores: RequestStores): Promise<void> {
    const attendance = stores.attendance;
    if (!attendance) return;
    for (const day of await this.dayRepo(stores).listByRequest(req.id)) {
      const sched = await attendance.ensureDefaultSchedule(day.employeeId, day.date);
      await attendance.saveSchedule(sched.withIsat(req.id));
    }
  }

  async createLeaveWithMakeupRequest(input: CreateLeaveWithMakeupInput): Promise<CreatedRequestDTO> {
    const { startDate, endDate } = requireDateRange(input.startDate, input.endDate);
    const slots = requireMakeupSlots(input.slots);
    const month = monthOf(startDate);
    const staff = await this.resolveStaff(input.employeeId, month);
    this.requireTypeConfig(staff);
    if (!staff.benefits.makeup) {
      throw new Error('Loại nhân sự này không có làm bù');
    }
    if (monthOf(endDate) !== month || slots.some(slot => monthOf(slot.date) !== month)) {
      throw new Error('Ngày nghỉ và khung bù phải nằm trong cùng một tháng');
    }

    return this.underEmployeeLock(staff.employeeId, async stores => {
      const monthEnd = lastDayOfMonth(month);
      const { days, active } = await this.loadDays(staff, startDate, monthEnd, stores);
      const leaveDays = days.workingDaysBetween(startDate, endDate);
      if (leaveDays.length === 0) {
        throw new Error('Khoảng nghỉ không có ngày làm việc');
      }
      this.assertLeaveRangeFree(days, active, startDate, endDate);
      const plan = planClaims({ kind: 'LEAVE_WITH_MAKEUP', dates: leaveDays, days });
      if (endDate === monthEnd) {
        throw new Error('Không còn ngày trong tháng để xếp đủ giờ bù');
      }
      const otInMonth = active.some(
        r => r.type === 'OVERTIME' && isActive(r) && r.otDate !== null && monthOf(r.otDate) === month
      );
      if (otInMonth) {
        throw new Error(`Tháng ${month} đã có đơn OT, không nộp đơn nghỉ có làm bù được`);
      }

      // Khung bù không chiếm ngày, chỉ bị chặn ở Thứ Bảy có iSAT (không có dòng nào ghi cho khung).
      planClaims({ kind: 'MAKEUP_SLOT', dates: slots.map(slot => slot.date), days });
      const windows: ClockWindow[] = slots.map(slot => ({ ...slot, kind: 'MAKEUP' }));
      for (const window of windows) {
        const { date } = window;
        if (date <= endDate) {
          throw new Error(`Khung bù ngày ${formatDayMonth(date)} phải sau ngày nghỉ cuối ${formatDayMonth(endDate)}`);
        }
        if (days.isOnLeave(date)) {
          throw new Error(`Ngày ${formatDayMonth(date)} đang nghỉ, không xếp khung bù được`);
        }
        const others = windows.filter(w => w !== window && w.date === date);
        const problem = windowError(window, days.shiftsAround(date), [...days.windowsOn(date), ...others]);
        if (problem) {
          throw new Error(problem);
        }
      }
      for (const date of [...new Set(windows.map(w => w.date))]) {
        const sameDay = windows.filter(w => w.date === date);
        const problem = dayCapError(date, days.shiftOf(date) !== null, [...days.windowsOn(date), ...sameDay]);
        if (problem) {
          throw new Error(problem);
        }
      }

      const owed = MAKEUP_MINUTES_PER_LEAVE_DAY * plan.take.length;
      const total = slots.reduce((sum, slot) => sum + workMinutes(slot.startTime, slot.endTime), 0);
      if (total !== owed) {
        throw new Error(`Cần đúng ${formatHours(owed)} giờ bù, đang xếp ${formatHours(total)} giờ`);
      }

      const req = SystemRequest.createLeaveWithMakeupRequest({
        employeeId: staff.employeeId,
        title: input.title,
        reason: input.reason,
        startDate,
        endDate,
        daysCount: plan.take.length,
        makeupSlots: slots.map(slot => ({ ...slot, workMinutes: workMinutes(slot.startTime, slot.endTime) }))
      });
      await stores.requests.save(req);
      await this.claimDays(stores, req, plan, 'LEAVE_WITH_MAKEUP');
      return { ...req.toJSON(), warnings: plan.warnings };
    });
  }

  async createOvertimeRequest(input: CreateOvertimeInput): Promise<CreatedRequestDTO> {
    const date = requireDateText(input.otDate ?? input.targetDate, 'otDate');
    const startTime = requireTimeText(input.startTime, 'startTime');
    const endTime = requireTimeText(input.endTime, 'endTime');
    const month = monthOf(date);
    const staff = await this.resolveStaff(input.employeeId, month);
    this.requireTypeConfig(staff);
    if (!staff.benefits.ot) {
      throw new Error('Loại nhân sự này không có OT');
    }

    return this.underEmployeeLock(staff.employeeId, async stores => {
      const { days, active } = await this.loadDays(staff, date, date, stores);
      planClaims({ kind: 'OVERTIME', dates: [date], days });
      if (days.isOnLeave(date)) {
        throw new Error(`Ngày ${formatDayMonth(date)} đang nghỉ, không đăng ký OT được`);
      }

      const window: ClockWindow = { date, startTime, endTime, kind: 'OT' };
      const existing = days.windowsOn(date);
      const windowProblem =
        windowError(window, days.shiftsAround(date), existing) ??
        dayCapError(date, days.shiftOf(date) !== null, [...existing, window]);
      if (windowProblem) {
        throw new Error(windowProblem);
      }

      const minutes = workMinutes(startTime, endTime);
      const monthMinutes = active
        .filter(r => r.type === 'OVERTIME' && isActive(r) && r.otDate !== null && monthOf(r.otDate) === month)
        .reduce((sum, r) => sum + Math.round((r.otHours ?? 0) * 60), 0);
      if (monthMinutes + minutes > MONTH_OT_CAP_MINUTES) {
        throw new Error(
          `Tổng số giờ làm thêm trong tháng ${month} không được vượt quá 40 giờ theo Luật Lao động ` +
            `(đã có ${formatHours(monthMinutes)}h, đăng ký thêm ${formatHours(minutes)}h)`
        );
      }

      const makeupInMonth = active.some(
        r => r.type === 'LEAVE_WITH_MAKEUP' && isActive(r) && r.leaveStartDate !== null && monthOf(r.leaveStartDate) === month
      );
      if (makeupInMonth) {
        throw new Error(`Tháng ${month} đã có đơn nghỉ có làm bù, không đăng ký OT được`);
      }

      const req = SystemRequest.createOvertimeRequest({
        employeeId: staff.employeeId,
        title: input.title,
        reason: input.reason,
        otDate: date,
        startTime,
        endTime,
        hours: minutes / 60
      });
      await stores.requests.save(req);
      return { ...req.toJSON(), warnings: [] };
    });
  }

  async createAdvanceRequest(input: CreateAdvanceInput): Promise<CreatedRequestDTO> {
    const period = input.period || businessMonthText(this.now());
    const staff = await this.resolveStaff(input.employeeId, period);
    return this.underEmployeeLock(staff.employeeId, async stores => {
      const req = SystemRequest.createAdvanceRequest({
        employeeId: staff.employeeId,
        title: input.title,
        reason: input.reason,
        amount: input.amount,
        period
      });

      await stores.requests.save(req);
      return { ...req.toJSON(), warnings: [] };
    });
  }

  async createExplanationRequest(input: CreateExplanationInput): Promise<CreatedRequestDTO> {
    const workDate = requireDateText(input.workDate, 'workDate');
    if (workDate > vietnamToday(this.now())) {
      throw new Error('Không giải trình cho ngày trong tương lai');
    }
    const cases = requireExplanationCases(input.cases);
    const actualCheckIn = optionalActualTime(input.actualCheckIn);
    const actualCheckOut = optionalActualTime(input.actualCheckOut);
    // Giải trình không phụ thuộc lịch làm việc nên không cần cấu hình loại nhân sự.
    const staff = await this.resolveStaff(input.employeeId, monthOf(workDate));

    return this.underEmployeeLock(staff.employeeId, async stores => {
      // Thứ Bảy có iSAT chỉ xét được khi loại nhân sự có cấu hình; chưa cấu hình thì giải trình như trước, không kiểm iSAT.
      if (staff.regularDows) {
        const { days } = await this.loadDays(staff, workDate, workDate, stores);
        planClaims({ kind: 'EXPLANATION', dates: [workDate], days });
      }
      // Một ngày một đơn: đơn đã bị từ chối vẫn chặn, đơn đã huỷ thì không.
      const existing = await stores.requests.list({ employeeId: staff.employeeId, type: 'EXPLANATION' });
      const taken = existing.some(
        r => r.explanationDate === workDate && (isActive(r) || r.status === 'REJECTED')
      );
      if (taken) {
        throw new Error(`Ngày ${formatDayMonth(workDate)} đã có đơn giải trình`);
      }

      const req = SystemRequest.createExplanationRequest({
        employeeId: staff.employeeId,
        title: input.title,
        reason: input.reason,
        workDate,
        cases,
        actualCheckIn,
        actualCheckOut
      });
      await stores.requests.save(req);
      return { ...req.toJSON(), warnings: [] };
    });
  }

  async createIsatRequest(input: CreateIsatInput): Promise<CreatedRequestDTO> {
    const profile = await this.repo.findIsatProfile(input.employeeId, businessMonthText());
    if (!profile) {
      throw new Error(`Không tìm thấy nhân sự: ${input.employeeId}`);
    }
    if (!profile.isatEnabled) {
      throw new Error('iSAT chỉ áp dụng cho nhóm Nhân viên');
    }

    // Đơn lưu theo uuid của nhân sự (input có thể là username); domain kiểm tra form và tự REJECT khi chưa đạt đủ điều kiện
    const req = SystemRequest.createIsatRequest({
      employeeId: profile.employeeId,
      saturday: input.saturday,
      team: input.team,
      conditions: input.conditions,
      profile: profile.snapshot
    });

    const saturday = req.isat!.saturday;
    const staff = await this.resolveStaff(profile.employeeId, monthOf(saturday));

    return this.underEmployeeLock(staff.employeeId, async stores => {
      // Chống trùng Thứ Bảy với các đơn đang chờ hoặc đã duyệt (đơn đã bị từ chối không chặn)
      const existing = await stores.requests.list({
        employeeId: profile.employeeId,
        type: 'ISAT'
      });
      for (const item of existing) {
        if ((item.status === 'PENDING' || item.status === 'APPROVED') && item.isat?.saturday === saturday) {
          const [year, month, day] = saturday.split('-');
          throw new Error(`Đã có đơn iSAT cho Thứ Bảy ${day}/${month}/${year}`);
        }
      }

      // Đơn bị domain tự từ chối không giữ ngày nào, nên không xét xung đột (§4.1).
      const pending = req.status === 'PENDING';
      let plan: ClaimPlan | null = null;
      if (pending) {
        const { days } = await this.loadDays(staff, saturday, saturday, stores);
        plan = planClaims({ kind: 'ISAT', dates: [saturday], days });
      }

      await stores.requests.save(req);
      if (plan) {
        await this.claimDays(stores, req, plan, 'ISAT');
      }
      return { ...req.toJSON(), warnings: [] };
    });
  }

  /**
   * `reviewer` là uuid hoặc tên đăng nhập; reviewed_by tham chiếu staff(uuid) nên luôn ghi uuid.
   * Chạy dưới khoá `request_<id>` rồi khoá nhân viên trên cùng giao dịch (§4). Kiểm lại, lịch, `day_status` và trạng thái
   * đơn đọc và ghi trên giao dịch đó: một bước lỗi thì không gì được ghi, đơn vẫn chờ duyệt.
   */
  async reviewRequest(
    id: string,
    reviewer: string,
    action: 'APPROVE' | 'REJECT',
    note?: string
  ): Promise<SystemRequestDTO> {
    return await this.underLock(`request_${id}`, async (stores, trx) => {
      const req = await stores.requests.findById(id);
      if (!req) {
        throw new Error(`Request with id '${id}' not found`);
      }
      const reviewerId = await stores.requests.resolveStaffUuid(reviewer);
      if (!reviewerId) {
        throw new Error(`Không tìm thấy người duyệt: ${reviewer}`);
      }
      await this.lockEmployee(trx, req.employeeId);

      if (action === 'APPROVE') {
        // Đơn iSAT mất dòng đăng ký thì không biết Thứ Bảy nào để ghi lịch: báo lỗi trước khi đổi trạng thái
        if (req.type === 'ISAT' && req.isat === null) {
          throw new Error(`Đơn iSAT thiếu dữ liệu đăng ký: ${req.id}`);
        }
        // Kiểm lại trước khi đổi trạng thái hay ghi gì; đơn không còn chờ duyệt thì để `approve` báo lỗi trạng thái.
        if (req.status === 'PENDING') {
          await this.recheck(req, stores);
        }
        req.approve(reviewerId, note);

        // Lịch ghi theo các ngày đơn đang giữ trong `day_status` (§4.2). Duyệt OT và tạm ứng không ghi lịch (§7).
        if (req.type === 'SHIFT_CHANGE') {
          await this.markShiftChangeDays(req, stores);
        } else if (req.type === 'LEAVE' || req.type === 'LEAVE_WITH_MAKEUP') {
          await this.markLeaveDays(req, stores);
        } else if (req.type === 'ISAT') {
          await this.markIsatDay(req, stores);
        } else if (req.type === 'EXPLANATION' && stores.attendance && req.explanationDate) {
          await stores.attendance.updateDayStatus(req.employeeId, req.explanationDate, 'VALID');
        }
      } else if (action === 'REJECT') {
        req.reject(reviewerId, note);
        await this.releaseDays(req, stores);
      } else {
        throw new Error(`Invalid review action '${action}'; must be 'APPROVE' or 'REJECT'`);
      }

      await stores.requests.save(req);
      return req.toJSON();
    });
  }

  /** Huỷ đơn còn chờ duyệt: cùng khoá và cùng giao dịch như duyệt (§4.3); các ngày đơn giữ được trả lại. */
  async cancelRequest(id: string, employeeId: string, reason?: string): Promise<SystemRequestDTO> {
    return await this.underLock(`request_${id}`, async (stores, trx) => {
      const req = await stores.requests.findById(id);
      if (!req) {
        throw new Error(`Request with id '${id}' not found`);
      }

      // Đơn iSAT lưu theo uuid còn phiên đăng nhập gửi username: đổi sang uuid khi trùng tác giả, người lạ vẫn bị từ chối.
      let cancellerId = employeeId;
      if (employeeId !== req.employeeId) {
        const uuid = await stores.requests.resolveStaffUuid(employeeId);
        if (uuid === req.employeeId) cancellerId = uuid;
      }
      await this.lockEmployee(trx, req.employeeId);

      req.cancel(cancellerId, reason);
      await this.releaseDays(req, stores);
      await stores.requests.save(req);
      return req.toJSON();
    });
  }

  /**
   * Kiểm lại lúc duyệt (§4.2): `planClaims` cùng loại và cùng ngày như lúc nộp, trên trạng thái hiện tại, dòng và khung
   * của chính đơn coi như trống. Theo luật nộp, chỉ dữ liệu sai mới bị chặn ở đây; lỗi mang thêm câu cho người duyệt.
   * Ruling (plan): khung bù của đơn nghỉ có làm bù không xét lại.
   */
  private async recheck(req: SystemRequest, stores: RequestStores): Promise<void> {
    const scope = recheckScope(req);
    if (!scope) return;
    const staff = await this.resolveStaff(req.employeeId, monthOf(scope.from), stores);
    // Như lúc nộp: giải trình của loại nhân sự chưa cấu hình không xét ngày.
    if (scope.kind === 'EXPLANATION' && !staff.regularDows) return;
    const { days } = await this.loadDays(staff, scope.from, scope.to, stores);

    let dates = [scope.from];
    if (scope.range) {
      // Ruling (Task 6): ngày đơn đứng cạnh một đơn khác đúng luật nộp không phải xung đột, và đơn không ghi lịch lên
      // ngày đó; bỏ ra trước để luật "khoảng không còn ngày" của lúc nộp không chặn việc duyệt.
      dates = days.workingDaysBetween(scope.from, scope.to).filter(date => !standsBeside(req, days.claimOn(date)));
      if (dates.length === 0) return;
    }

    try {
      planClaims({ kind: scope.kind, dates, days, ownRequestId: req.id });
    } catch (error) {
      if (error instanceof DayConflictError) throw error.forReview();
      throw error;
    }
  }

  /**
   * Trả các ngày đơn `req` đang giữ khi đơn bị từ chối hoặc huỷ (§4.3):
   * - ngày đơn này đã thay của một đơn đổi ca còn chờ hoặc đã duyệt: trả lại cho đơn đổi ca đó; đơn đó đã duyệt thì ghi
   *   lại ca mới lên lịch ngày đó;
   * - ngày khác: xoá dòng, ngày về trạng thái suy ra (với T4 là ca thường);
   * - ngày đơn khác đã thay của đơn này (đơn này là đơn đổi ca): bỏ liên kết tới đơn này.
   * Đơn chưa duyệt chưa ghi lịch nào, nên ngày bị xoá không cần sửa lịch.
   */
  private async releaseDays(req: SystemRequest, stores: RequestStores): Promise<void> {
    if (!CLAIMING_TYPES.has(req.type)) return;
    const daysRepo = this.dayRepo(stores);
    const [held, replaced] = await Promise.all([daysRepo.listByRequest(req.id), daysRepo.listByBase(req.id)]);

    const handedBack = held.filter(
      day => day.baseRequestId !== null && (day.baseRequestStatus === 'PENDING' || day.baseRequestStatus === 'APPROVED')
    );
    const freed = held.filter(day => !handedBack.includes(day));

    for (const [employeeId, dates] of groupDates(freed)) {
      await daysRepo.remove(employeeId, dates);
    }
    // Hai nhóm không chung ngày: dòng của đơn này và dòng của đơn khác không cùng (nhân sự, ngày) (khoá chính).
    await daysRepo.upsert([
      ...handedBack.map(day => releasedRow(day, { status: 'SHIFT_CHANGE', requestId: day.baseRequestId! })),
      ...replaced.map(day => releasedRow(day, {}))
    ]);

    const attendance = stores.attendance;
    if (!attendance) return;
    const bases = new Map<string, SystemRequest | null>();
    for (const day of handedBack) {
      if (day.baseRequestStatus !== 'APPROVED') continue;
      const baseId = day.baseRequestId!;
      if (!bases.has(baseId)) bases.set(baseId, await stores.requests.findById(baseId));
      const base = bases.get(baseId);
      if (base) await this.writeShiftChange(attendance, base, day.employeeId, day.date);
    }
  }

  async getById(id: string): Promise<SystemRequestDTO | null> {
    const req = await this.repo.findById(id);
    return req ? req.toJSON() : null;
  }

  async listRequests(filter: RequestListFilter = {}): Promise<{ items: SystemRequestDTO[]; total: number }> {
    // Đơn iSAT lưu theo uuid, các loại khác có thể lưu theo username: lọc theo cả hai khi biết uuid của nhân sự.
    const { employeeId, ...rest } = filter;
    const scoped: RequestListFilter = employeeId ? { ...rest, employeeIds: await this.employeeIdsFor(employeeId) } : filter;

    const [items, total] = await Promise.all([
      this.repo.list(scoped),
      this.repo.count({
        employeeId: scoped.employeeId,
        employeeIds: scoped.employeeIds,
        type: scoped.type,
        status: scoped.status
      })
    ]);

    return {
      items: items.map(r => r.toJSON()),
      total
    };
  }

  private async employeeIdsFor(employeeId: string): Promise<string[]> {
    const uuid = await this.repo.resolveStaffUuid(employeeId);
    return [...new Set([employeeId, uuid].filter((id): id is string => !!id))];
  }
}
