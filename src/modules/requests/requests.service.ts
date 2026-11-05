import { Injectable, Optional, Inject } from '@nestjs/common';
import { TransactionCoordinator } from '../../database';
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
  type ClockWindow
} from './domain';
import { RequestsRepository, RequestListFilter, StaffContext } from './requests.repository';
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

/** 2 → '2', 2.5 → '2,5' */
const formatDays = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

export interface CreateShiftChangeInput {
  employeeId: string;
  title: string;
  reason: string;
  changeDate: string;
  newShiftType: string;
  newStartTime: string;
  newEndTime: string;
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

export interface CreateExplanationInput {
  employeeId: string;
  title: string;
  reason: string;
  workDate: string;
  actualCheckIn?: string | null;
  actualCheckOut?: string | null;
}

export interface CreateIsatInput {
  employeeId: string;
  saturday?: unknown;
  team?: unknown;
  conditions?: unknown;
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
  ) {}

  /** Hồ sơ nộp đơn theo uuid hoặc username, cấu hình loại nhân sự xét đến `month` (YYYY-MM). */
  protected async resolveStaff(employeeIdOrUsername: string, month: string): Promise<StaffContext> {
    const staff = await this.repo.findStaffContext(employeeIdOrUsername, month);
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
   * Lịch, ngày lễ và đơn đang chờ/đã duyệt của nhân sự quanh [from, to]. Đọc rộng thêm một ngày mỗi phía
   * để thấy ca đêm hôm trước và ca hôm sau (§5.5 bước 2).
   */
  protected async loadDays(
    staff: StaffContext,
    from: string,
    to: string
  ): Promise<{ days: EmployeeDays; active: SystemRequest[] }> {
    if (!this.holidaysRepo) {
      throw new Error('Thiếu lịch lễ công ty');
    }
    const regularDows = this.requireTypeConfig(staff);
    const lo = addDays(from, -1);
    const hi = addDays(to, 1);
    const [schedules, holidays, active] = await Promise.all([
      this.repo.listScheduleDays(staff.employeeId, lo, hi),
      this.holidaysRepo.listBetween(lo, hi),
      this.repo.listActive(staff.employeeId)
    ]);
    const days = new EmployeeDays({
      regularDows,
      holidays: holidays.map(h => h.date),
      defaultShift: staff.defaultShift,
      schedules,
      activeRequests: active
    });
    return { days, active };
  }

  /** Mỗi lần nộp đơn của một nhân sự chạy dưới khoá `requests_<uuid>` (§5.6); không có txCoordinator thì chạy thẳng. */
  protected async underEmployeeLock<T>(employeeId: string, fn: () => Promise<T>): Promise<T> {
    if (this.txCoordinator) {
      return await this.txCoordinator.withLock(`requests_${employeeId}`, () => fn());
    }
    return await fn();
  }

  async createLeaveRequest(input: CreateLeaveInput): Promise<SystemRequestDTO> {
    const leaveType = requireLeaveType(input.leaveType);
    const { startDate, endDate } = requireDateRange(input.startDate, input.endDate);
    const staff = await this.resolveStaff(input.employeeId, monthOf(startDate));
    this.requireTypeConfig(staff);

    return this.underEmployeeLock(staff.employeeId, async () => {
      const { days, active } = await this.loadDays(staff, startDate, endDate);
      const leaveDays = days.workingDaysBetween(startDate, endDate);
      if (leaveDays.length === 0) {
        throw new Error('Khoảng nghỉ không có ngày làm việc');
      }
      this.assertLeaveRangeFree(days, active, startDate, endDate);

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
        if (leaveDays.length > remaining) {
          throw new Error(`Phép năm còn ${formatDays(remaining)} ngày, xin ${leaveDays.length} ngày`);
        }
      }

      const req = SystemRequest.createLeaveRequest({
        employeeId: staff.employeeId,
        title: input.title,
        reason: input.reason,
        leaveType,
        startDate,
        endDate,
        daysCount: leaveDays.length
      });
      await this.repo.save(req);
      return req.toJSON();
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

  /** Duyệt đơn nghỉ: mỗi ngày làm việc trong khoảng (tính lại lúc duyệt) ghi lịch ON_LEAVE; CN và ngày lễ không ghi. */
  protected async markLeaveDays(req: SystemRequest): Promise<void> {
    if (!this.attendanceRepo || !req.leaveStartDate) return;
    const start = req.leaveStartDate;
    const end = req.leaveEndDate ?? start;
    const staff = await this.resolveStaff(req.employeeId, monthOf(start));
    const { days } = await this.loadDays(staff, start, end);
    for (const date of days.workingDaysBetween(start, end)) {
      const sched = await this.attendanceRepo.ensureDefaultSchedule(staff.employeeId, date);
      await this.attendanceRepo.saveSchedule(sched.withLeave(req.id));
    }
  }

  async createShiftChangeRequest(input: CreateShiftChangeInput): Promise<SystemRequestDTO> {
    const req = SystemRequest.createShiftChangeRequest({
      employeeId: input.employeeId,
      title: input.title,
      reason: input.reason,
      changeDate: input.changeDate,
      newShiftType: input.newShiftType,
      newStartTime: input.newStartTime,
      newEndTime: input.newEndTime
    });

    await this.repo.save(req);
    return req.toJSON();
  }

  async createLeaveWithMakeupRequest(input: CreateLeaveWithMakeupInput): Promise<SystemRequestDTO> {
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

    return this.underEmployeeLock(staff.employeeId, async () => {
      const monthEnd = lastDayOfMonth(month);
      const { days, active } = await this.loadDays(staff, startDate, monthEnd);
      const leaveDays = days.workingDaysBetween(startDate, endDate);
      if (leaveDays.length === 0) {
        throw new Error('Khoảng nghỉ không có ngày làm việc');
      }
      this.assertLeaveRangeFree(days, active, startDate, endDate);
      if (endDate === monthEnd) {
        throw new Error('Không còn ngày trong tháng để xếp đủ giờ bù');
      }
      const otInMonth = active.some(
        r => r.type === 'OVERTIME' && isActive(r) && r.otDate !== null && monthOf(r.otDate) === month
      );
      if (otInMonth) {
        throw new Error(`Tháng ${month} đã có đơn OT, không nộp đơn nghỉ có làm bù được`);
      }

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

      const owed = MAKEUP_MINUTES_PER_LEAVE_DAY * leaveDays.length;
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
        daysCount: leaveDays.length,
        makeupSlots: slots.map(slot => ({ ...slot, workMinutes: workMinutes(slot.startTime, slot.endTime) }))
      });
      await this.repo.save(req);
      return req.toJSON();
    });
  }

  async createOvertimeRequest(input: CreateOvertimeInput): Promise<SystemRequestDTO> {
    const date = requireDateText(input.otDate ?? input.targetDate, 'otDate');
    const startTime = requireTimeText(input.startTime, 'startTime');
    const endTime = requireTimeText(input.endTime, 'endTime');
    const month = monthOf(date);
    const staff = await this.resolveStaff(input.employeeId, month);
    this.requireTypeConfig(staff);
    if (!staff.benefits.ot) {
      throw new Error('Loại nhân sự này không có OT');
    }

    return this.underEmployeeLock(staff.employeeId, async () => {
      const { days, active } = await this.loadDays(staff, date, date);
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
      await this.repo.save(req);
      return req.toJSON();
    });
  }

  async createAdvanceRequest(input: CreateAdvanceInput): Promise<SystemRequestDTO> {
    const period = input.period || businessMonthText(this.now());
    const staff = await this.resolveStaff(input.employeeId, period);
    return this.underEmployeeLock(staff.employeeId, async () => {
      const req = SystemRequest.createAdvanceRequest({
        employeeId: staff.employeeId,
        title: input.title,
        reason: input.reason,
        amount: input.amount,
        period
      });

      await this.repo.save(req);
      return req.toJSON();
    });
  }

  async createExplanationRequest(input: CreateExplanationInput): Promise<SystemRequestDTO> {
    const req = SystemRequest.createExplanationRequest({
      employeeId: input.employeeId,
      title: input.title,
      reason: input.reason,
      workDate: input.workDate,
      actualCheckIn: input.actualCheckIn,
      actualCheckOut: input.actualCheckOut
    });

    await this.repo.save(req);
    return req.toJSON();
  }

  async createIsatRequest(input: CreateIsatInput): Promise<SystemRequestDTO> {
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

    // Chống trùng Thứ Bảy với các đơn đang chờ hoặc đã duyệt (đơn đã bị từ chối không chặn)
    const saturday = req.isat!.saturday;
    const existing = await this.repo.list({
      employeeId: profile.employeeId,
      type: 'ISAT'
    });
    for (const item of existing) {
      if ((item.status === 'PENDING' || item.status === 'APPROVED') && item.isat?.saturday === saturday) {
        const [year, month, day] = saturday.split('-');
        throw new Error(`Đã có đơn iSAT cho Thứ Bảy ${day}/${month}/${year}`);
      }
    }

    await this.repo.save(req);
    return req.toJSON();
  }

  async reviewRequest(
    id: string,
    reviewerId: string,
    action: 'APPROVE' | 'REJECT',
    note?: string
  ): Promise<SystemRequestDTO> {
    const doReview = async () => {
      const req = await this.repo.findById(id);
      if (!req) {
        throw new Error(`Request with id '${id}' not found`);
      }

      if (action === 'APPROVE') {
        // Đơn iSAT mất dòng đăng ký thì không biết Thứ Bảy nào để ghi lịch: báo lỗi trước khi đổi trạng thái
        if (req.type === 'ISAT' && req.isat === null) {
          throw new Error(`Đơn iSAT thiếu dữ liệu đăng ký: ${req.id}`);
        }
        req.approve(reviewerId, note);

        if (this.attendanceRepo) {
          // Duyệt OT không ghi lịch (§7); khung bù của đơn nghỉ có làm bù cũng không ghi vào lịch.
          if (req.type === 'SHIFT_CHANGE') {
            const date = req.changeStartDate;
            if (date) {
              const sched = await this.attendanceRepo.ensureDefaultSchedule(req.employeeId, date);
              const updated = sched.withShiftChange(req.newShiftType as any, req.newStartTime!, req.newEndTime!, req.id);
              await this.attendanceRepo.saveSchedule(updated);
            }
          } else if (req.type === 'LEAVE' || req.type === 'LEAVE_WITH_MAKEUP') {
            // Chỉ ngày nghỉ được ghi ON_LEAVE; khung bù không ghi vào lịch.
            await this.markLeaveDays(req);
          } else if (req.type === 'ISAT' && req.isat) {
            const sched = await this.attendanceRepo.ensureDefaultSchedule(req.employeeId, req.isat.saturday);
            await this.attendanceRepo.saveSchedule(sched.withIsat(req.id));
          } else if (req.type === 'EXPLANATION') {
            const workDate = req.explanationDate;
            if (workDate) {
              await this.attendanceRepo.updateDayStatus(req.employeeId, workDate, 'VALID');
            }
          }
        }
      } else if (action === 'REJECT') {
        req.reject(reviewerId, note);
      } else {
        throw new Error(`Invalid review action '${action}'; must be 'APPROVE' or 'REJECT'`);
      }

      await this.repo.save(req);
      return req.toJSON();
    };

    if (this.txCoordinator) {
      return await this.txCoordinator.withLock(`request_${id}`, doReview);
    }
    return await doReview();
  }

  async cancelRequest(id: string, employeeId: string, reason?: string): Promise<SystemRequestDTO> {
    const req = await this.repo.findById(id);
    if (!req) {
      throw new Error(`Request with id '${id}' not found`);
    }

    // Đơn iSAT lưu theo uuid còn phiên đăng nhập gửi username: đổi sang uuid khi trùng tác giả, người lạ vẫn bị từ chối.
    let cancellerId = employeeId;
    if (employeeId !== req.employeeId) {
      const uuid = await this.repo.resolveStaffUuid(employeeId);
      if (uuid === req.employeeId) cancellerId = uuid;
    }

    req.cancel(cancellerId, reason);
    await this.repo.save(req);
    return req.toJSON();
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
