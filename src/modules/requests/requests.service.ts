import { randomUUID } from 'node:crypto';
import { Injectable, Optional, Inject } from '@nestjs/common';
import { BadRequestError, NotEmployedError, assertEmployed } from '../../common';
import { isValidDateText } from '../../common/date-text';
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
  optionalActualTime,
  vietnamToday,
  filingWindow,
  isWholeHour,
  advanceDayOpen,
  advanceWindowEnd,
  planClaims,
  DayConflictError,
  requestDates,
  requestTitle,
  annualLeaveLeftOf,
  dayHourOptions,
  filingDayStates,
  FILING_RULES,
  MAKEUP_MINUTES_PER_LEAVE_DAY,
  MONTH_OT_CAP_MINUTES,
  LEAVE_TYPES,
  SHIFT_FRAMES,
  type ClaimPlan,
  type ClaimStatus,
  type ClockWindow,
  type DayClaim,
  type DayStatusRow,
  type FiledBy,
  type NewRequestKind
} from './domain';
import type { FilingKindState, FilingMonthState, RequestContextDTO } from './domain/request-context';
import { RequestsRepository, RequestListFilter, StaffContext } from './requests.repository';
import { DayStatusRepository } from './day-status.repository';
import { ExplanationsService } from './explanations.service';
import { loadEmployeeDays } from './load-days';
import { AttendanceRepository } from '../attendance/attendance.repository';
import { AttendanceDaysService } from '../attendance/attendance-days.service';
import { HolidaysRepository, type Holiday } from '../holidays/holidays.repository';
import { businessMonthText } from '../../common/business-date';
import { PayrollService } from '../payroll/payroll.service';
import { gateAllows, requestMonths, type GateUse, type PeriodStatus, type RequestDates } from '../periods/domain';
import { PeriodGate } from '../periods/period-gate';
import { PeriodLockedError } from '../periods/periods.errors';
import { SettingsReader } from '../settings';
import { AuditLog } from '../audit/audit-log';
import { withPersonWeek } from './staff-week';
import { ADVANCE_RATE_PCT, type AdvanceQuote } from '../payroll/domain';

/**
 * Loại đơn nộp qua `fileRequest` (nộp và xem trước). iSAT nộp riêng bằng `createIsatRequest`.
 * Ở mọi loại, tiêu đề do server đặt (`requestTitle`, spec 2.4): `title` client gửi không được đọc.
 */
export type FilingKind = 'leave' | 'leave-with-makeup' | 'overtime' | 'shift-change' | 'explanation' | 'advance';

/** Ai nộp: nhân viên tự nộp (`'self'`) hay Admin nộp thay (`'admin'`, mặc định). */
export interface FilingOptions {
  filedBy?: FiledBy;
}

/**
 * Kết quả xem trước (spec 2.2); `code` chỉ có khi là xung đột ngày, hoặc khi tháng của đơn đã khoá (cổng kỳ, kèm
 * `month` và `status` như lỗi 409 `PERIOD_LOCKED` lúc nộp).
 */
export type PreviewResult =
  | { ok: true; title: string; summary: Record<string, unknown>; warnings: string[] }
  | { ok: false; message: string; code?: 'DAY_CONFLICT' | 'NOT_EMPLOYED' | 'ADVANCE_NOT_ELIGIBLE' }
  | { ok: false; message: string; code: 'PERIOD_LOCKED'; month: string; status: PeriodStatus };

/** Thân đơn nghỉ (§6.1). Số ngày do server đếm: `daysCount` client gửi (nếu có) không được đọc. */
export interface CreateLeaveInput {
  employeeId: string;
  /** Không đọc: tiêu đề do server đặt. */
  title?: string;
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
  /** Không đọc: tiêu đề do server đặt. */
  title?: string;
  reason: string;
  startDate: unknown;
  endDate: unknown;
  shiftType: unknown;
  startTime: unknown;
}

/** Thân đơn nghỉ có làm bù (§6.2): khoảng nghỉ và danh sách khung bù; số ngày và giờ bù do server tính. */
export interface CreateLeaveWithMakeupInput {
  employeeId: string;
  /** Không đọc: tiêu đề do server đặt. */
  title?: string;
  reason: string;
  startDate: unknown;
  endDate: unknown;
  slots: unknown;
}

/** Thân đơn OT (§6.3): một khung; `targetDate` nhận thay `otDate`. Giờ OT do server tính, `hours`/`otHours` không đọc. */
export interface CreateOvertimeInput {
  employeeId: string;
  /** Không đọc: tiêu đề do server đặt. */
  title?: string;
  reason: string;
  otDate?: unknown;
  targetDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
}

/** Đơn OT đang chờ hoặc đã duyệt có ngày OT trong tháng `month` (YYYY-MM). */
const otRequestsIn = (requests: readonly SystemRequest[], month: string): SystemRequest[] =>
  requests.filter(r => r.type === 'OVERTIME' && isActive(r) && r.otDate !== null && monthOf(r.otDate) === month);

/** Tổng phút OT của các đơn OT. */
const otMinutesOf = (requests: readonly SystemRequest[]): number =>
  requests.reduce((sum, r) => sum + Math.round((r.otHours ?? 0) * 60), 0);

/** Đơn nghỉ có làm bù đang chờ hoặc đã duyệt có ngày nghỉ đầu trong tháng `month`. */
const makeupRequestsIn = (requests: readonly SystemRequest[], month: string): SystemRequest[] =>
  requests.filter(
    r => r.type === 'LEAVE_WITH_MAKEUP' && isActive(r) && r.leaveStartDate !== null && monthOf(r.leaveStartDate) === month
  );

/** Đơn tạm ứng đang chờ hoặc đã duyệt của tháng `period`: các đơn luật "mỗi tháng một đơn" đếm. */
const advancesFor = (requests: readonly SystemRequest[], period: string): SystemRequest[] =>
  requests.filter(r => r.type === 'ADVANCE' && r.advancePeriod === period && isActive(r));

/** Tháng `period` đã có đơn tạm ứng đang chờ hoặc đã duyệt. */
const hasAdvanceFor = (requests: readonly SystemRequest[], period: string): boolean => advancesFor(requests, period).length > 0;

/**
 * "Số đơn trong tháng" của form tạm ứng: số đơn tạm ứng của tháng mà luật mỗi tháng một đơn đếm (đang chờ, đã duyệt),
 * tính cả đơn sắp nộp. Đơn bị từ chối hay đã huỷ không tính, vì không chặn nộp lại.
 */
export const advanceOrdersAfterFiling = (requests: readonly SystemRequest[], period: string): number =>
  advancesFor(requests, period).length + 1;

const monthNumberOf = (period: string): number => Number(period.slice(5, 7));
const advanceDuplicateMessage = (period: string): string => `Tháng ${monthNumberOf(period)} đã có đơn tạm ứng`;
const advanceNoWorkDaysMessage = (period: string): string => `Chưa có ngày công 01–15/${period.slice(5, 7)}`;
const ADVANCE_QUOTE_FAILED = 'Chưa tính được số tiền tạm ứng';
const ADVANCE_NOT_ELIGIBLE = 'Bạn không thuộc diện tạm ứng';
const ADVANCE_PERIOD_TEXT = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Tháng tạm ứng của đơn: nhân viên tự nộp luôn là tháng hiện tại; Admin chọn được, mặc định tháng hiện tại. Chưa kiểm dạng. */
const advancePeriodOf = (input: { period?: string }, opts: FilingContext, today: string): string =>
  opts.filedBy === 'self' ? today.slice(0, 7) : input.period || today.slice(0, 7);

/** Hồ sơ tắt cờ tạm ứng (`staff.advance_on = 0`, D8): 400 mã `ADVANCE_NOT_ELIGIBLE`. */
export class AdvanceNotEligibleError extends BadRequestError {
  constructor() {
    super(ADVANCE_NOT_ELIGIBLE, { code: 'ADVANCE_NOT_ELIGIBLE' });
  }
}

/** Hồ sơ được tạm ứng: cờ thiếu (dữ liệu cũ, test) coi như bật, như hồ sơ nhân sự đọc NULL. */
const canAdvance = (staff: StaffContext): boolean => staff.canAdvance !== false;
const NO_FILING_DAYS = 'Không còn ngày đăng ký được';

/** Số ngày phép năm còn lại của hồ sơ trước các đơn `active`; null = loại nhân sự không có tài khoản phép. */
const annualLeaveLeftOfStaff = (staff: StaffContext, active: readonly SystemRequest[]): number | null =>
  annualLeaveLeftOf(
    { leaveBalance: staff.leaveBalance, leaveBalanceOn: staff.leaveBalanceOn, leaveAccount: staff.benefits.leaveAccount },
    active
  );

export interface CreateAdvanceInput {
  employeeId: string;
  /** Chỉ Admin dùng; nhân viên tự nộp luôn là tháng hiện tại. Mặc định tháng hiện tại. */
  period?: string;
}

/** Thân đơn giải trình (§6.5): ngày công, các trường hợp và giờ thực tế (không bắt buộc). */
export interface CreateExplanationInput {
  employeeId: string;
  /** Không đọc: tiêu đề do server đặt. */
  title?: string;
  reason: string;
  workDate: unknown;
  cases?: unknown;
  actualCheckIn?: unknown;
  actualCheckOut?: unknown;
}

export interface CreateIsatInput {
  employeeId: string;
  saturday?: unknown;
  team?: unknown;
  conditions?: unknown;
}

/** Kết quả tự tính lại phiếu lương của một tháng sau khi duyệt đơn (spec kỳ lương §6); `error` chỉ có khi `ok` là false. */
export type RecalcResult = { month: string; ok: boolean; error?: string };

/** Phần của PayrollService mà đơn từ dùng: số tiền tạm ứng, và tính lại / đưa phiếu về nháp sau khi duyệt đơn. */
type RequestsPayroll = Pick<PayrollService, 'advanceQuote' | 'calculatePeriodPayslips' | 'resetDecision'>;

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

/**
 * Đơn đã lập, chưa lưu: các ngày đơn sẽ giữ trong `day_status` (null = loại đơn không giữ ngày), tóm tắt cho xem trước
 * (spec 2.2) và các cảnh báo.
 */
interface PlannedRequest {
  request: SystemRequest;
  claims: { plan: ClaimPlan; status: ClaimStatus } | null;
  summary: Record<string, unknown>;
  warnings: string[];
}

/** Phần ngoài khoá của planner đã xong (dữ liệu vào hợp lệ, đã tìm thấy nhân sự); `plan` lập đơn trong khoá. */
interface Filing {
  staff: StaffContext;
  plan: (stores: RequestStores) => Promise<PlannedRequest>;
}

/** Tuỳ chọn nộp đã điền mặc định. */
type FilingContext = Required<FilingOptions>;

const createdOf = (planned: PlannedRequest): CreatedRequestDTO => ({
  ...planned.request.toJSON(),
  warnings: planned.warnings
});

/** Ngày của kế hoạch giữ ngày, theo thứ tự ngày. */
const takenDates = (plan: ClaimPlan): string[] => plan.take.map(t => t.date);

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
    @Optional() @Inject(PeriodGate) private readonly periodGate?: Pick<PeriodGate, 'statusOf' | 'hold'>,
    @Optional() @Inject(PayrollService) private readonly payroll?: RequestsPayroll,
    @Optional() @Inject(ExplanationsService) private readonly explanations?: ExplanationsService,
    // Ruling: `settings` giữ chỗ thứ 9 như main (bắt buộc trong DI, không @Optional; kiểu TS tuỳ chọn cho test dựng tay),
    // `audit` (bắt buộc trong DI) thứ 10 như main; `attendanceDays` (@Optional) đứng cuối để không tham số bắt buộc nào
    // đứng sau nó.
    @Inject(SettingsReader) private readonly settings?: Pick<SettingsReader, 'workWeekOf'>,
    // Bắt buộc khi chạy thật (Nest tiêm); test chạy không có giao dịch thì bỏ qua nhật ký.
    @Inject(AuditLog) private readonly audit?: Pick<AuditLog, 'append'>,
    @Optional() @Inject(AttendanceDaysService) private readonly attendanceDays?: AttendanceDaysService
  ) {}

  /**
   * Tháng `month` (YYYY-MM) không nhận đơn loại thường (cổng kỳ `file`: kỳ không còn 'open'). Chỉ để dựng form (spec
   * 2.1); lúc nộp, cổng kỳ trong `fileRequest` mới là nơi chặn. Không có cổng kỳ thì không tháng nào bị khoá.
   */
  protected async isClosedMonth(month: string): Promise<boolean> {
    if (!this.periodGate) return false;
    return !gateAllows(await this.periodGate.statusOf(undefined, month), 'file');
  }

  /**
   * Luật chỉ áp khi nhân viên tự nộp (`filedBy === 'self'`; Admin giữ hành vi cũ), theo thứ tự: giờ tròn, mọi ngày
   * nằm trong `filingWindow(hôm nay)`. Tháng đã chốt thì cổng kỳ trong `fileRequest` chặn, cho cả Admin.
   */
  private assertSelfFiling(opts: FilingContext, dates: readonly string[], times: readonly string[] = []): void {
    if (opts.filedBy !== 'self') return;
    if (times.some(time => !isWholeHour(time))) {
      throw new Error('Chỉ chọn giờ tròn');
    }
    const { from, to } = filingWindow(vietnamToday(this.now()));
    if (dates.some(date => date < from || date > to)) {
      throw new Error(`Chỉ chọn ngày từ ${formatDayMonth(from)} đến ${formatDayMonth(to)}`);
    }
  }

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

  /**
   * T2: ghi lại các dòng ngày công mà đơn `req` chạm tới (`requestDates`), trên giao dịch `trx` đang giữ khoá nhân viên.
   * Gọi sau khi đơn và lịch đã lưu, vì dòng ngày dựng từ chính các bảng đó. Đơn không có ngày (tạm ứng) thì không gọi.
   */
  private async rewriteDays(req: SystemRequest, trx?: DatabaseTransaction): Promise<void> {
    if (!this.attendanceDays) return;
    const dates = requestDates(req);
    if (dates.length === 0) return;
    await this.attendanceDays.refreshDays(req.employeeId, dates, { trx, now: this.now() });
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
    return withPersonWeek(staff, month, this.settings);
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
  ): Promise<{ days: EmployeeDays; active: SystemRequest[]; holidays: Holiday[] }> {
    return await loadEmployeeDays(stores, staff, from, to);
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
   * của khoá), `trx` là giao dịch đó. Không có txCoordinator thì chạy thẳng trên pool, `trx` là undefined.
   */
  protected async underEmployeeLock<T>(
    employeeId: string,
    fn: (stores: RequestStores, trx?: DatabaseTransaction) => Promise<T>
  ): Promise<T> {
    return await this.underLock(`requests_${employeeId}`, fn);
  }

  /** Các ngày của đơn theo dạng cổng kỳ đọc, để biết đơn chạm tới những tháng nào. */
  private datesOf(req: SystemRequest): RequestDates {
    return {
      leaveStartDate: req.leaveStartDate,
      leaveEndDate: req.leaveEndDate,
      otDate: req.otDate,
      explanationDate: req.explanationDate,
      changeStartDate: req.changeStartDate,
      changeEndDate: req.changeEndDate,
      advancePeriod: req.advancePeriod,
      makeupDates: req.makeupSlots.map(s => s.date),
      isatSaturday: req.isat?.saturday ?? null
    };
  }

  /**
   * Cổng kỳ (spec kỳ lương §5): một tháng đơn chạm tới không cho `use` thì ném `PeriodLockedError` (409 `PERIOD_LOCKED`).
   * Chạy trên `trx` của khoá nên giữ khoá chia sẻ của các tháng tới hết giao dịch: Chốt công hay Phê duyệt kỳ đợi lần
   * ghi đang dở xong. Không có cổng (test cũ) thì không chặn gì.
   */
  private async guardPeriods(trx: DatabaseTransaction | undefined, req: SystemRequest, use: GateUse): Promise<void> {
    await this.periodGate?.hold(trx, requestMonths(this.datesOf(req)), use);
  }

  /**
   * Các ngày client gửi, đọc như planner của loại đơn sẽ đọc nhưng không báo lỗi: giá trị sai dạng thì bỏ, planner báo sau.
   * Để cổng kỳ chạy trước mọi luật của đơn (tháng đã khoá thì báo PERIOD_LOCKED, không báo lỗi luật).
   */
  private inputDates(kind: FilingKind, input: any, opts: FilingContext): RequestDates {
    const date = (value: unknown): string | null => (isValidDateText(value) ? value : null);
    switch (kind) {
      case 'leave':
        return { leaveStartDate: date(input?.startDate), leaveEndDate: date(input?.endDate) };
      case 'leave-with-makeup':
        return {
          leaveStartDate: date(input?.startDate),
          leaveEndDate: date(input?.endDate),
          makeupDates: Array.isArray(input?.slots)
            ? input.slots.map((slot: any) => date(slot?.date)).filter((d: string | null): d is string => d !== null)
            : []
        };
      case 'overtime':
        return { otDate: date(input?.otDate ?? input?.targetDate) };
      case 'shift-change':
        return { changeStartDate: date(input?.startDate), changeEndDate: date(input?.endDate) };
      case 'explanation':
        return { explanationDate: date(input?.workDate) };
      case 'advance': {
        const period = advancePeriodOf(input ?? {}, opts, vietnamToday(this.now()));
        return { advancePeriod: ADVANCE_PERIOD_TEXT.test(period) ? period : null };
      }
      default:
        return {};
    }
  }

  /** Số ngày Phép năm còn lại (trước các đơn đang chờ và đã duyệt đã trừ); null nếu loại nhân sự không có tài khoản phép. */
  async annualLeaveLeft(employeeIdOrUsername: string): Promise<number | null> {
    const staff = await this.resolveStaff(employeeIdOrUsername, monthOf(vietnamToday(this.now())));
    return annualLeaveLeftOfStaff(staff, await this.repo.listActive(staff.employeeId));
  }

  /**
   * Mọi thứ các form đơn của nhân viên cần (spec 2.1), tính ở server để client không tự suy luật: khoảng nộp, loại đơn
   * mở hay khoá (kèm lý do), hai tháng nộp được, từng ngày trong khoảng với các lựa chọn giờ OT/bù, ngày cần giải trình
   * và số tiền tạm ứng. Chỉ đọc. Số tiền tạm ứng không tính được chỉ khoá loại tạm ứng, không làm hỏng cả lời gọi.
   */
  async requestContext(employeeIdOrUsername: string): Promise<RequestContextDTO> {
    const today = vietnamToday(this.now());
    const currentMonth = monthOf(today);
    const window = filingWindow(today);
    const staff = await this.resolveStaff(employeeIdOrUsername, currentMonth);
    const { days, active, holidays } = await this.loadDays(staff, window.from, window.to);

    const months = await this.filingMonths([currentMonth, monthOf(window.to)], active);
    const explanationDays = this.explanations ? await this.explanations.dueDays(employeeIdOrUsername) : [];
    const advance = await this.advanceState(staff, today, active);

    const openMonths = months.filter(m => !m.closed);
    const lockedUnless = (kind: FilingKindState['kind'], open: boolean): FilingKindState =>
      open ? { kind, enabled: true } : { kind, enabled: false, reason: NO_FILING_DAYS };
    const kinds: FilingKindState[] = [{ kind: 'leave', enabled: true }];
    if (staff.benefits.makeup) {
      kinds.push(lockedUnless('leave-with-makeup', openMonths.some(m => !m.hasOvertime)));
    }
    if (staff.benefits.ot) {
      kinds.push(lockedUnless('overtime', openMonths.some(m => !m.hasMakeupLeave && m.otMinutes < MONTH_OT_CAP_MINUTES)));
    }
    kinds.push(lockedUnless('shift-change', openMonths.length > 0));
    kinds.push(
      explanationDays.length > 0
        ? { kind: 'explanation', enabled: true }
        : { kind: 'explanation', enabled: false, reason: 'Không có ngày cần giải trình' }
    );
    kinds.push(advance.kind);

    const holidayNames = new Map(holidays.map(h => [h.date, h.name]));
    const baseDays = eachDate(window.from, window.to).map(date => {
      const shift = days.shiftOf(date);
      const claim = days.claimOn(date);
      return {
        date,
        workday: days.isWorkingDay(date),
        shift: shift ? { start: shift.startTime, end: shift.endTime } : null,
        holiday: holidayNames.get(date) ?? null,
        claim: claim ? { status: claim.status, pending: claim.requestStatus === 'PENDING' } : null,
        hours: days.isOnLeave(date) || claim?.status === 'ISAT'
          ? []
          : dayHourOptions({ date, shifts: days.shiftsAround(date), hasShift: shift !== null, windows: days.windowsOn(date) })
      };
    });
    const annualLeaveLeft = annualLeaveLeftOfStaff(staff, active);
    const { days: dayStates, choices } = filingDayStates({ days: baseDays, months, annualLeaveLeft });

    return {
      today,
      window,
      kinds,
      months,
      leaveTypes: LEAVE_TYPES.filter(t => t.code !== 'ANNUAL' || staff.benefits.leaveAccount).map(({ code, label }) => ({
        code,
        label
      })),
      annualLeaveLeft,
      shiftFrames: SHIFT_FRAMES.map(f => ({ shiftType: f.shiftType, start: f.startTime, end: f.endTime })),
      days: dayStates,
      explanationDays,
      advance: advance.quote,
      choices,
      rules: FILING_RULES
    };
  }

  /** Trạng thái từng tháng nộp được: chốt công chưa, số phút OT, đã có OT hay nghỉ có làm bù chưa. */
  private async filingMonths(months: readonly string[], active: readonly SystemRequest[]): Promise<FilingMonthState[]> {
    return await Promise.all(
      months.map(async month => {
        const ot = otRequestsIn(active, month);
        return {
          month,
          closed: await this.isClosedMonth(month),
          otMinutes: otMinutesOf(ot),
          otCapMinutes: MONTH_OT_CAP_MINUTES as 2400,
          otLeftMinutes: Math.max(0, MONTH_OT_CAP_MINUTES - otMinutesOf(ot)),
          hasOvertime: ot.length > 0,
          hasMakeupLeave: makeupRequestsIn(active, month).length > 0
        };
      })
    );
  }

  /**
   * Loại tạm ứng trên form, xét theo thứ tự (spec 2.1): hồ sơ được tạm ứng (D8), ngày 16–17, chưa có đơn của tháng, tính
   * được số tiền, có ngày công. Chỉ tính tiền khi ba điều kiện đầu qua; tính lỗi chỉ khoá loại này.
   */
  private async advanceState(
    staff: StaffContext,
    today: string,
    active: readonly SystemRequest[]
  ): Promise<{ kind: FilingKindState; quote: RequestContextDTO['advance'] }> {
    const month = monthOf(today);
    const locked = (reason: string) => ({ kind: { kind: 'advance', enabled: false, reason } as FilingKindState, quote: null });
    if (!canAdvance(staff)) return locked(ADVANCE_NOT_ELIGIBLE);
    if (!advanceDayOpen(today)) return locked('Chỉ nộp ngày 16 và 17');
    if (hasAdvanceFor(active, month)) return locked(advanceDuplicateMessage(month));
    let quote: AdvanceQuote;
    try {
      quote = await this.advanceQuoteOf(staff.employeeId, month);
    } catch {
      return locked(ADVANCE_QUOTE_FAILED);
    }
    if (quote.amount === 0) return locked(advanceNoWorkDaysMessage(month));
    return {
      kind: { kind: 'advance', enabled: true },
      quote: {
        month,
        ...quote,
        windowEnd: advanceWindowEnd(month),
        ordersThisMonth: advanceOrdersAfterFiling(active, month),
        ratePct: ADVANCE_RATE_PCT
      }
    };
  }

  async createLeaveRequest(input: CreateLeaveInput, opts?: FilingOptions): Promise<CreatedRequestDTO> {
    return createdOf(await this.fileRequest('leave', input, opts, true));
  }

  async createLeaveWithMakeupRequest(input: CreateLeaveWithMakeupInput, opts?: FilingOptions): Promise<CreatedRequestDTO> {
    return createdOf(await this.fileRequest('leave-with-makeup', input, opts, true));
  }

  async createOvertimeRequest(input: CreateOvertimeInput, opts?: FilingOptions): Promise<CreatedRequestDTO> {
    return createdOf(await this.fileRequest('overtime', input, opts, true));
  }

  async createShiftChangeRequest(input: CreateShiftChangeInput, opts?: FilingOptions): Promise<CreatedRequestDTO> {
    return createdOf(await this.fileRequest('shift-change', input, opts, true));
  }

  async createExplanationRequest(input: CreateExplanationInput, opts?: FilingOptions): Promise<CreatedRequestDTO> {
    return createdOf(await this.fileRequest('explanation', input, opts, true));
  }

  async createAdvanceRequest(input: CreateAdvanceInput, opts?: FilingOptions): Promise<CreatedRequestDTO> {
    return createdOf(await this.fileRequest('advance', input, opts, true));
  }

  /**
   * Xem trước (spec 2.2): lập đơn đúng như lúc nộp, trong cùng khoá nhân viên, qua cùng cổng kỳ, rồi bỏ; không ghi gì.
   * Lỗi nghiệp vụ (Error không có `code`) thành `ok: false`, xung đột ngày kèm `code: 'DAY_CONFLICT'`, tháng đã khoá kèm
   * `code: 'PERIOD_LOCKED'`, `month`, `status`; lỗi có `code` (lỗi DB) ném lại.
   */
  async previewRequest(kind: FilingKind, input: any, opts?: FilingOptions): Promise<PreviewResult> {
    try {
      const planned = await this.fileRequest(kind, input, opts, false);
      return { ok: true, title: planned.request.title, summary: planned.summary, warnings: planned.warnings };
    } catch (error) {
      if (error instanceof DayConflictError) {
        return { ok: false, message: error.message, code: 'DAY_CONFLICT' };
      }
      if (error instanceof NotEmployedError) {
        return { ok: false, message: error.message, code: 'NOT_EMPLOYED' };
      }
      if (error instanceof AdvanceNotEligibleError) {
        return { ok: false, message: error.message, code: 'ADVANCE_NOT_ELIGIBLE' };
      }
      if (error instanceof PeriodLockedError) {
        const { month, status } = error.details as { month: string; status: PeriodStatus };
        return { ok: false, message: error.message, code: 'PERIOD_LOCKED', month, status };
      }
      if (error instanceof Error && (error as { code?: unknown }).code === undefined) {
        return { ok: false, message: error.message };
      }
      throw error;
    }
  }

  /**
   * Nộp (`save`) hoặc xem trước một đơn. Cổng kỳ chạy trước tiên, trên các ngày client gửi: tháng đã khoá thì báo
   * PERIOD_LOCKED trước mọi luật của đơn (khoảng nộp, thời gian làm việc, ngày làm việc…). Giải trình qua cổng `explain`
   * (nộp được tới khi kỳ được phê duyệt, D2), loại khác qua cổng `file` (chỉ tháng 'open'), cả nhân viên tự nộp lẫn Admin
   * nộp thay. Rồi planner của loại đơn kiểm dữ liệu vào và tìm nhân sự, lập đơn trong khoá `requests_<uuid>` (§5.6); đơn
   * lập xong qua cổng kỳ lần nữa trên giao dịch của khoá (cả lúc xem trước), để giữ khoá chia sẻ của các tháng tới khi
   * ghi xong. Khi `save`, đơn và các ngày đơn giữ được ghi trong cùng khoá, cùng giao dịch.
   */
  private async fileRequest(
    kind: FilingKind,
    input: any,
    opts: FilingOptions | undefined,
    save: boolean
  ): Promise<PlannedRequest> {
    const context: FilingContext = { filedBy: opts?.filedBy ?? 'admin' };
    const use: GateUse = kind === 'explanation' ? 'explain' : 'file';
    await this.periodGate?.hold(undefined, requestMonths(this.inputDates(kind, input, context)), use);
    const filing = await this.planFiling(kind, input, context);
    return this.underEmployeeLock(filing.staff.employeeId, async (stores, trx) => {
      const planned = await filing.plan(stores);
      await this.guardPeriods(trx, planned.request, use);
      if (save) {
        await stores.requests.save(planned.request);
        if (planned.claims) {
          await this.claimDays(stores, planned.request, planned.claims.plan, planned.claims.status);
        }
        await this.rewriteDays(planned.request, trx);
      }
      return planned;
    });
  }

  private async planFiling(kind: FilingKind, input: any, opts: FilingContext): Promise<Filing> {
    switch (kind) {
      case 'leave':
        return this.planLeave(input, opts);
      case 'leave-with-makeup':
        return this.planMakeup(input, opts);
      case 'overtime':
        return this.planOvertime(input, opts);
      case 'shift-change':
        return this.planShiftChange(input, opts);
      case 'explanation':
        return this.planExplanation(input, opts);
      case 'advance':
        return this.planAdvance(input, opts);
      default:
        throw new Error(`Loại đơn không hợp lệ: ${String(kind)}`);
    }
  }

  /** Đơn nghỉ (§6.1): giữ các ngày làm việc trong khoảng; Phép năm kiểm số dư (spec 2.7). */
  private async planLeave(input: CreateLeaveInput, opts: FilingContext): Promise<Filing> {
    const leaveType = requireLeaveType(input.leaveType);
    const { startDate, endDate } = requireDateRange(input.startDate, input.endDate);
    this.assertSelfFiling(opts, [startDate, endDate]);
    const staff = await this.resolveStaff(input.employeeId, monthOf(startDate));
    assertEmployed(staff, [startDate, endDate]);
    this.requireTypeConfig(staff);

    const planInLock = async (stores: RequestStores): Promise<PlannedRequest> => {
      const { days, active } = await this.loadDays(staff, startDate, endDate, stores);
      const leaveDays = days.workingDaysBetween(startDate, endDate);
      if (leaveDays.length === 0) {
        throw new Error('Khoảng nghỉ không có ngày làm việc');
      }
      this.assertLeaveRangeFree(days, active, startDate, endDate);
      const plan = planClaims({ kind: 'LEAVE', dates: leaveDays, days });
      const daysCount = plan.take.length;

      // Phép năm còn lại trước đơn này; null = loại nhân sự không có tài khoản phép.
      const annualLeft = annualLeaveLeftOfStaff(staff, active);
      if (leaveType === 'ANNUAL') {
        if (annualLeft === null) {
          throw new Error('Loại nhân sự này không có Phép năm');
        }
        if (daysCount > annualLeft) {
          throw new Error(`Phép năm còn ${formatDays(annualLeft)} ngày, xin ${daysCount} ngày`);
        }
      }

      const request = SystemRequest.createLeaveRequest({
        employeeId: staff.employeeId,
        title: requestTitle({ kind: 'leave', leaveType, startDate, endDate }),
        reason: input.reason,
        leaveType,
        startDate,
        endDate,
        daysCount
      });
      // Spec 2.2: null khi không phải Phép năm. (Phép năm mà annualLeft null thì đã báo lỗi ở trên.)
      const annualLeaveLeftAfter = leaveType === 'ANNUAL' && annualLeft !== null ? annualLeft - daysCount : null;
      return {
        request,
        claims: { plan, status: 'LEAVE' },
        summary: { dates: takenDates(plan), daysCount, annualLeaveLeftAfter },
        warnings: plan.warnings
      };
    };
    return { staff, plan: planInLock };
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

  /** Đơn đổi ca (§6.4): giữ các ngày làm việc trong khoảng, trừ ngày nghỉ và Thứ Bảy có iSAT đã duyệt. */
  private async planShiftChange(input: CreateShiftChangeInput, opts: FilingContext): Promise<Filing> {
    const frame = findShiftFrame(input.shiftType, input.startTime);
    if (!frame) {
      throw new Error(`Khung ca không hợp lệ: ${String(input.shiftType)} ${String(input.startTime)}`);
    }
    const { startDate, endDate } = requireDateRange(input.startDate, input.endDate);
    this.assertSelfFiling(opts, [startDate, endDate]);
    const staff = await this.resolveStaff(input.employeeId, monthOf(startDate));
    assertEmployed(staff, [startDate, endDate]);
    this.requireTypeConfig(staff);

    const planInLock = async (stores: RequestStores): Promise<PlannedRequest> => {
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

      const request = SystemRequest.createShiftChangeRequest({
        employeeId: staff.employeeId,
        title: requestTitle({ kind: 'shift-change', frame, startDate, endDate }),
        reason: input.reason,
        startDate,
        endDate,
        frame
      });
      return {
        request,
        claims: { plan, status: 'SHIFT_CHANGE' },
        // Ngày giữ nguyên: ngày nghỉ và Thứ Bảy có iSAT đã duyệt trong khoảng, bị bỏ khỏi đơn.
        summary: { dates: taken, keptDates: plan.skipped },
        warnings: plan.warnings
      };
    };
    return { staff, plan: planInLock };
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

  /** Đơn nghỉ có làm bù (§6.2): giữ các ngày nghỉ như đơn nghỉ; khung bù chỉ được kiểm, đủ đúng 8 giờ mỗi ngày nghỉ. */
  private async planMakeup(input: CreateLeaveWithMakeupInput, opts: FilingContext): Promise<Filing> {
    const { startDate, endDate } = requireDateRange(input.startDate, input.endDate);
    const slots = requireMakeupSlots(input.slots);
    this.assertSelfFiling(
      opts,
      [startDate, endDate, ...slots.map(slot => slot.date)],
      slots.flatMap(slot => [slot.startTime, slot.endTime])
    );
    const month = monthOf(startDate);
    const staff = await this.resolveStaff(input.employeeId, month);
    assertEmployed(staff, [startDate, endDate, ...slots.map(slot => slot.date)]);
    this.requireTypeConfig(staff);
    if (!staff.benefits.makeup) {
      throw new Error('Loại nhân sự này không có làm bù');
    }
    if (monthOf(endDate) !== month || slots.some(slot => monthOf(slot.date) !== month)) {
      throw new Error('Ngày nghỉ và khung bù phải nằm trong cùng một tháng');
    }

    const planInLock = async (stores: RequestStores): Promise<PlannedRequest> => {
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
      if (otRequestsIn(active, month).length > 0) {
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
      if (total < owed) {
        throw new Error(`Còn thiếu ${formatHours(owed - total)} giờ bù`);
      }
      if (total > owed) {
        throw new Error(`Cần đúng ${formatHours(owed)} giờ bù, đang xếp ${formatHours(total)} giờ`);
      }

      const request = SystemRequest.createLeaveWithMakeupRequest({
        employeeId: staff.employeeId,
        title: requestTitle({ kind: 'leave-with-makeup', startDate, endDate }),
        reason: input.reason,
        startDate,
        endDate,
        daysCount: plan.take.length,
        makeupSlots: slots.map(slot => ({ ...slot, workMinutes: workMinutes(slot.startTime, slot.endTime) }))
      });
      return {
        request,
        claims: { plan, status: 'LEAVE_WITH_MAKEUP' },
        summary: {
          dates: takenDates(plan),
          daysCount: plan.take.length,
          makeupMinutesRequired: owed,
          makeupMinutesPlanned: total
        },
        warnings: plan.warnings
      };
    };
    return { staff, plan: planInLock };
  }

  /** Đơn OT (§6.3): một khung, không giữ ngày; trần 40 giờ mỗi tháng. */
  private async planOvertime(input: CreateOvertimeInput, opts: FilingContext): Promise<Filing> {
    const date = requireDateText(input.otDate ?? input.targetDate, 'otDate');
    const startTime = requireTimeText(input.startTime, 'startTime');
    const endTime = requireTimeText(input.endTime, 'endTime');
    this.assertSelfFiling(opts, [date], [startTime, endTime]);
    const month = monthOf(date);
    const staff = await this.resolveStaff(input.employeeId, month);
    assertEmployed(staff, [date]);
    this.requireTypeConfig(staff);
    if (!staff.benefits.ot) {
      throw new Error('Loại nhân sự này không có OT');
    }

    const planInLock = async (stores: RequestStores): Promise<PlannedRequest> => {
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
      const monthMinutes = otMinutesOf(otRequestsIn(active, month));
      if (monthMinutes + minutes > MONTH_OT_CAP_MINUTES) {
        throw new Error(
          `Tổng số giờ làm thêm trong tháng ${month} không được vượt quá 40 giờ theo Luật Lao động ` +
            `(đã có ${formatHours(monthMinutes)}h, đăng ký thêm ${formatHours(minutes)}h)`
        );
      }

      if (makeupRequestsIn(active, month).length > 0) {
        throw new Error(`Tháng ${month} đã có đơn nghỉ có làm bù, không đăng ký OT được`);
      }

      const request = SystemRequest.createOvertimeRequest({
        employeeId: staff.employeeId,
        title: requestTitle({ kind: 'overtime', date, startTime, endTime }),
        reason: input.reason,
        otDate: date,
        startTime,
        endTime,
        hours: minutes / 60
      });
      return {
        request,
        claims: null,
        summary: { minutes, monthMinutesAfter: monthMinutes + minutes },
        warnings: []
      };
    };
    return { staff, plan: planInLock };
  }

  /**
   * Đơn tạm ứng (spec 2.5): số tiền, tiêu đề và lý do do server đặt, client không gửi được. Nhân viên tự nộp luôn cho
   * tháng hiện tại và chỉ ngày 16–17; Admin nộp cho kỳ `period` (mặc định tháng hiện tại) vào bất kỳ ngày nào. Mỗi tháng
   * một đơn đang chờ hoặc đã duyệt (kiểm trong khoá nhân viên). Không giữ ngày.
   */
  private async planAdvance(input: CreateAdvanceInput, opts: FilingContext): Promise<Filing> {
    const today = vietnamToday(this.now());
    const period = advancePeriodOf(input, opts, today);
    if (!ADVANCE_PERIOD_TEXT.test(period)) {
      throw new Error(`period must be a valid YYYY-MM period string, got: ${period}`);
    }
    const staff = await this.resolveStaff(input.employeeId, period);
    // D8: hồ sơ tắt cờ tạm ứng thì không ai nộp được cho người này, ngày nào cũng vậy; báo trước hạn nộp.
    if (!canAdvance(staff)) {
      throw new AdvanceNotEligibleError();
    }
    if (opts.filedBy === 'self' && !advanceDayOpen(today)) {
      throw new Error('Chỉ nộp tạm ứng ngày 16 và 17');
    }

    // Tính số tiền trước khoá nhân viên: bộ tính lương lấy một kết nối pool riêng, không được xin khi khoá đang giữ một
    // kết nối (xem cảnh báo ở database/kysely.ts). Giữ cả giá trị lẫn lỗi; trong khoá vẫn kiểm trùng tháng trước rồi
    // mới báo lỗi tính.
    let quote: AdvanceQuote | null = null;
    let quoteError: unknown = null;
    try {
      quote = await this.advanceQuoteOf(staff.employeeId, period);
    } catch (err) {
      quoteError = err;
    }

    const planInLock = async (stores: RequestStores): Promise<PlannedRequest> => {
      const existing = await stores.requests.list({ employeeId: staff.employeeId, type: 'ADVANCE' });
      if (hasAdvanceFor(existing, period)) {
        throw new Error(advanceDuplicateMessage(period));
      }
      if (!quote) throw quoteError;
      if (quote.amount === 0) {
        throw new Error(advanceNoWorkDaysMessage(period));
      }
      const title = requestTitle({ kind: 'advance', month: period });
      const request = SystemRequest.createAdvanceRequest({
        employeeId: staff.employeeId,
        title,
        reason: title,
        amount: quote.amount,
        period
      });
      return {
        request,
        claims: null,
        summary: { month: period, amount: quote.amount, workDays: quote.workDays },
        warnings: []
      };
    };
    return { staff, plan: planInLock };
  }

  /** Số tiền được ứng của `period`; không tính được (thiếu bộ tính lương hoặc tính lỗi) thì báo một câu chung. */
  private async advanceQuoteOf(employeeId: string, period: string): Promise<AdvanceQuote> {
    const failure = new Error(ADVANCE_QUOTE_FAILED);
    if (!this.payroll) throw failure;
    try {
      return await this.payroll.advanceQuote(employeeId, period);
    } catch {
      throw failure;
    }
  }

  /**
   * Đơn giải trình (§6.5, spec 3.3), cả Admin lẫn nhân viên tự nộp: ngày phải đang cần giải trình (`checkStaffDay`, xét
   * ngoài khoá như tra hồ sơ), trường hợp do server tìm (`cases` client gửi không đọc), giờ thực tế chỉ nhận khi ngày cần
   * (giờ không cần thì ghi null). Một ngày một đơn, kiểm lại trong khoá. Không giữ ngày.
   */
  private async planExplanation(input: CreateExplanationInput, _opts: FilingContext): Promise<Filing> {
    const workDate = requireDateText(input.workDate, 'workDate');
    if (!this.explanations) {
      throw new Error('Chưa cấu hình giải trình');
    }
    const staff = await this.resolveStaff(input.employeeId, monthOf(workDate));
    assertEmployed(staff, [workDate]);
    // Tháng của ngày công do cổng kỳ `explain` trong `fileRequest` xét (trong khoá), không xét ở đây.
    const check = await this.explanations.checkStaffDay(staff, workDate, { period: false });
    if (!check.ok) {
      throw new Error(check.message);
    }
    const { cases, needs, shift } = check;
    const actualCheckIn = needs.checkIn ? optionalActualTime(input.actualCheckIn) : null;
    const actualCheckOut = needs.checkOut ? optionalActualTime(input.actualCheckOut) : null;
    if (needs.checkIn && actualCheckIn === null) {
      throw new Error('Nhập giờ vào thực tế');
    }
    if (needs.checkOut && actualCheckOut === null) {
      throw new Error('Nhập giờ ra thực tế');
    }
    // R-P5 (người dùng chốt 06/11: "giờ ra phải lớn hơn hoặc bằng giờ vào"): chỉ so hai giờ khai với nhau; giờ ra bằng giờ
    // vào vẫn nhận. Ca đêm (giờ hết ca không sau giờ vào ca) thì giờ ra rơi vào sáng hôm sau, không so được với giờ vào.
    // D7 (06/11): giờ khai không so với lần chấm thật còn lại của ngày; Admin xét khi duyệt.
    const overnight = shift.endTime <= shift.startTime;
    if (!overnight && actualCheckIn !== null && actualCheckOut !== null && actualCheckOut < actualCheckIn) {
      throw new Error('Giờ ra không được trước giờ vào');
    }

    const planInLock = async (stores: RequestStores): Promise<PlannedRequest> => {
      // Một ngày một đơn, kiểm lại trong khoá: đơn khác có thể vừa được nộp sau lúc xét ngày. Đơn đã bị từ chối vẫn
      // chặn, đơn đã huỷ thì không.
      const existing = await stores.requests.list({ employeeId: staff.employeeId, type: 'EXPLANATION' });
      const taken = existing.some(
        r => r.explanationDate === workDate && (isActive(r) || r.status === 'REJECTED')
      );
      if (taken) {
        throw new Error(`Ngày ${formatDayMonth(workDate)} đã có đơn giải trình`);
      }

      const request = SystemRequest.createExplanationRequest({
        employeeId: staff.employeeId,
        title: requestTitle({ kind: 'explanation', date: workDate }),
        reason: input.reason,
        workDate,
        cases,
        actualCheckIn,
        actualCheckOut
      });
      return { request, claims: null, summary: { cases, needs }, warnings: [] };
    };
    return { staff, plan: planInLock };
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
    // Luật người dùng chốt 2026-11-05: iSAT đăng ký trước, nên Thứ Bảy đã qua và chính hôm nay đều bị từ chối.
    if (saturday <= vietnamToday(this.now())) {
      throw new Error('Chỉ đăng ký iSAT cho Thứ Bảy sắp tới');
    }
    const staff = await this.resolveStaff(profile.employeeId, monthOf(saturday));
    assertEmployed(staff, [saturday]);

    return this.underEmployeeLock(staff.employeeId, async (stores, trx) => {
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

      // iSAT không đi qua `fileRequest`: cùng cổng kỳ `file`, ngay trước khi lưu.
      await this.guardPeriods(trx, req, 'file');
      await stores.requests.save(req);
      if (plan) {
        await this.claimDays(stores, req, plan, 'ISAT');
      }
      await this.rewriteDays(req, trx);
      return { ...req.toJSON(), warnings: [] };
    });
  }

  /**
   * `reviewer` là uuid hoặc tên đăng nhập; reviewed_by tham chiếu staff(uuid) nên luôn ghi uuid.
   * Chạy dưới khoá `request_<id>` rồi khoá nhân viên trên cùng giao dịch (§4). Kiểm lại, lịch, `day_status` và trạng thái
   * đơn đọc và ghi trên giao dịch đó: một bước lỗi thì không gì được ghi, đơn vẫn chờ duyệt.
   * Chỉ chạy giao dịch duyệt, không tính lại phiếu lương sau commit: nơi gọi trong sản phẩm phải dùng
   * `reviewAndRecalculate` (spec kỳ lương D6). Còn public cho test của phần duyệt đơn.
   */
  async reviewRequest(
    id: string,
    reviewer: string,
    action: 'APPROVE' | 'REJECT',
    note?: string
  ): Promise<SystemRequestDTO> {
    return (await this.decide(id, reviewer, action, note)).dto;
  }

  /**
   * Duyệt hoặc từ chối như `reviewRequest` (trong giao dịch đó, phiếu của người nộp ở mỗi tháng `calculated` đã về
   * nháp: `resetCalculatedSlips`); sau khi giao dịch đã commit (spec kỳ lương R6), với từng tháng của đơn (tăng dần)
   * đang ở `calculated`, tính lại phiếu lương của người nộp (§6). Tháng khác không tính lại. Tính lại lỗi thì quyết
   * định duyệt đơn vẫn giữ: lỗi nằm trong `recalculated`, không ném ra. Không đọc được trạng thái kỳ của một tháng sau
   * commit thì tháng đó báo lỗi và không tính lại (phiếu đã về nháp trong giao dịch duyệt nếu kỳ đang `calculated`),
   * rồi xét tháng sau. Thiếu cổng kỳ hay PayrollService (test cũ) thì `recalculated` rỗng.
   */
  async reviewAndRecalculate(
    id: string,
    reviewer: string,
    action: 'APPROVE' | 'REJECT',
    note?: string
  ): Promise<{ request: SystemRequestDTO; recalculated: RecalcResult[] }> {
    const { dto, months, employeeId } = await this.decide(id, reviewer, action, note);
    const recalculated: RecalcResult[] = [];
    if (this.periodGate && this.payroll) {
      for (const month of months) {
        let status: PeriodStatus;
        try {
          status = await this.periodGate.statusOf(undefined, month);
        } catch (err) {
          recalculated.push({ month, ok: false, error: err instanceof Error ? err.message : String(err) });
          continue;
        }
        if (status !== 'calculated') continue;
        recalculated.push(await this.recalculate(this.payroll, month, employeeId, reviewer));
      }
    }
    return { request: dto, recalculated };
  }

  /**
   * Tính lại phiếu tháng `month` của một người. Lỗi (ném ra, hoặc trả trong `errors`) thì đưa phiếu cũ của người đó
   * trong lần chạy nháp về nháp thêm một lần (lưới an toàn, vd. Admin đã duyệt lại phiếu đó sau commit); lỗi được trả về
   * chứ không ném. Lần này lỗi hay không tìm thấy phiếu cũ cũng vô hại: phiếu đã về nháp trong giao dịch duyệt, nên Phê
   * duyệt kỳ vẫn bị chặn tới khi phiếu người này được duyệt lại (Admin nên tính lại người đó trước).
   */
  private async recalculate(
    payroll: RequestsPayroll,
    month: string,
    employeeId: string,
    actor: string
  ): Promise<RecalcResult> {
    let error: string;
    try {
      const { errors } = await payroll.calculatePeriodPayslips(month, [employeeId], actor);
      if (errors.length === 0) return { month, ok: true };
      error = errors[0].message;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    try {
      await payroll.resetDecision(month, employeeId);
    } catch {
      // Đơn đã duyệt xong: phản hồi không được thành lỗi, lỗi tính lại ở trên đã đủ báo cho Admin.
    }
    return { month, ok: false, error };
  }

  /**
   * Thân của duyệt/từ chối: chạy trong khoá và giao dịch của `reviewRequest`, qua cổng kỳ (`review`) ngay sau khoá nhân
   * viên; lưu đơn xong thì đưa phiếu của người nộp về nháp ở các tháng `calculated`, rồi ghi nhật ký, cùng giao dịch.
   * Trả đơn đã lưu, các tháng đơn chạm tới (tăng dần) và người nộp, để tính lại sau commit.
   */
  private async decide(
    id: string,
    reviewer: string,
    action: 'APPROVE' | 'REJECT',
    note?: string
  ): Promise<{ dto: SystemRequestDTO; months: string[]; employeeId: string }> {
    return await this.underLock(`request_${id}`, async (stores, trx) => {
      const req = await stores.requests.findById(id);
      if (!req) {
        throw new Error(`Request with id '${id}' not found`);
      }
      const was = req.status;
      const reviewerId = await stores.requests.resolveStaffUuid(reviewer);
      if (!reviewerId) {
        throw new Error(`Không tìm thấy người duyệt: ${reviewer}`);
      }
      await this.lockEmployee(trx, req.employeeId);
      await this.guardPeriods(trx, req, 'review');

      if (action === 'APPROVE') {
        // Đơn iSAT mất dòng đăng ký thì không biết Thứ Bảy nào để ghi lịch: báo lỗi trước khi đổi trạng thái
        if (req.type === 'ISAT' && req.isat === null) {
          throw new Error(`Đơn iSAT thiếu dữ liệu đăng ký: ${req.id}`);
        }
        // Kiểm lại trước khi đổi trạng thái hay ghi gì; đơn không còn chờ duyệt thì để `approve` báo lỗi trạng thái.
        if (req.status === 'PENDING') {
          await this.recheck(req, stores);
          await this.dropHolidayDays(req, stores);
        }
        req.approve(reviewerId, note);

        // Lịch ghi theo các ngày đơn đang giữ trong `day_status` (§4.2). Duyệt OT và tạm ứng không ghi lịch (§7).
        if (req.type === 'SHIFT_CHANGE') {
          await this.markShiftChangeDays(req, stores);
        } else if (req.type === 'LEAVE' || req.type === 'LEAVE_WITH_MAKEUP') {
          await this.markLeaveDays(req, stores);
        } else if (req.type === 'ISAT') {
          await this.markIsatDay(req, stores);
        }
      } else if (action === 'REJECT') {
        req.reject(reviewerId, note);
        // Trả ngày trước khi lưu: sau khi lưu, JOIN của `day_status` không còn thấy dòng của đơn đã từ chối.
        await this.releaseDays(req, stores);
      } else {
        throw new Error(`Invalid review action '${action}'; must be 'APPROVE' or 'REJECT'`);
      }

      await stores.requests.save(req);
      await this.rewriteDays(req, trx);
      const months = requestMonths(this.datesOf(req));
      await this.resetCalculatedSlips(trx, months, req.employeeId);
      await this.logRequest(trx, stores, req, 'request.decide', reviewer, was, note);
      return { dto: req.toJSON(), months, employeeId: req.employeeId };
    });
  }

  /**
   * D6, trong giao dịch duyệt hoặc từ chối (đang giữ khoá chia sẻ `period:<tháng>` của các tháng của đơn, lấy ở
   * `guardPeriods`): với mỗi tháng (tăng dần) đọc được là `calculated` trên giao dịch đó, phiếu của người nộp trong lần
   * chạy nháp về nháp và mất quyết định, ngay trên giao dịch đó. Phê duyệt kỳ cần khoá độc quyền của tháng nên chỉ chạy
   * sau commit, và khi đó thấy phiếu chưa duyệt; vậy kỳ không thể được duyệt với số cũ của người này, kể cả khi bước
   * tính lại sau commit lỗi hay tiến trình dừng trước bước đó (R6). Đưa về nháp lỗi thì cả lần duyệt bị huỷ, đơn vẫn chờ.
   * Thiếu cổng kỳ hay PayrollService (test cũ) thì không làm gì.
   */
  private async resetCalculatedSlips(
    trx: DatabaseTransaction | undefined,
    months: readonly string[],
    employeeId: string
  ): Promise<void> {
    const { periodGate, payroll } = this;
    if (!periodGate || !payroll) return;
    for (const month of months) {
      if ((await periodGate.statusOf(trx, month)) !== 'calculated') continue;
      await payroll.resetDecision(month, employeeId, trx);
    }
  }

  /** Huỷ đơn còn chờ duyệt: cùng khoá và cùng giao dịch như duyệt (§4.3); các ngày đơn giữ được trả lại. */
  /**
   * `actor`: người đăng nhập ở route Admin. Admin huỷ thay người nộp thì ghi `request.cancel`; nhân viên tự huỷ
   * (route /me, hoặc Admin huỷ đơn của chính mình) thì không ghi (spec audit-log mục 6).
   */
  async cancelRequest(id: string, employeeId: string, reason?: string, actor?: string): Promise<SystemRequestDTO> {
    return await this.underLock(`request_${id}`, async (stores, trx) => {
      const req = await stores.requests.findById(id);
      if (!req) {
        throw new Error(`Request with id '${id}' not found`);
      }
      const was = req.status;

      // Đơn iSAT lưu theo uuid còn phiên đăng nhập gửi username: đổi sang uuid khi trùng tác giả, người lạ vẫn bị từ chối.
      let cancellerId = employeeId;
      if (employeeId !== req.employeeId) {
        const uuid = await stores.requests.resolveStaffUuid(employeeId);
        if (uuid === req.employeeId) cancellerId = uuid;
      }
      await this.lockEmployee(trx, req.employeeId);

      req.cancel(cancellerId, reason);
      // Trả ngày trước khi lưu: sau khi lưu, JOIN của `day_status` không còn thấy dòng của đơn đã huỷ.
      await this.releaseDays(req, stores);
      await stores.requests.save(req);
      await this.rewriteDays(req, trx);
      if (actor && (await stores.requests.resolveStaffUuid(actor)) !== req.employeeId) {
        await this.logRequest(trx, stores, req, 'request.cancel', actor, was, reason);
      }
      return req.toJSON();
    });
  }

  /** Một dòng nhật ký cho đơn vừa lưu, ghi cuối giao dịch. Người thao tác và người nộp ghi theo tên đăng nhập. */
  private async logRequest(
    trx: DatabaseTransaction | undefined,
    stores: RequestStores,
    req: SystemRequest,
    action: 'request.decide' | 'request.cancel',
    actor: string,
    was: string,
    reason: string | undefined
  ): Promise<void> {
    if (!trx || !this.audit) return;
    await this.audit.append(trx, {
      actor: (await stores.requests.resolveStaffUsername(actor)) ?? actor,
      action,
      entityKind: 'request',
      entityId: req.id,
      subject: await stores.requests.resolveStaffUsername(req.employeeId),
      subjectUuid: req.employeeId,
      before: { status: was },
      after: { status: req.status },
      reason: reason?.trim() || null,
      requestId: randomUUID()
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
    await this.giveBack(req.id, held, replaced, stores);
  }

  /**
   * Ngày lễ thắng đơn nghỉ (luật người dùng chốt 2026-11-05): ngày đơn nghỉ đang giữ mà đã thành ngày lễ trước lúc duyệt
   * rời khỏi đơn và được trả như khi từ chối; đơn còn giữ bao nhiêu ngày thì đếm bấy nhiêu. Không duyệt được (Admin chỉ
   * còn từ chối) khi đơn nghỉ có làm bù có ngày như vậy (giờ bù đã xếp theo số ngày cũ, phải nộp lại) hoặc khi mọi ngày
   * của đơn đều đã thành ngày lễ.
   */
  private async dropHolidayDays(req: SystemRequest, stores: RequestStores): Promise<void> {
    if (req.type !== 'LEAVE' && req.type !== 'LEAVE_WITH_MAKEUP') return;
    const held = await this.dayRepo(stores).listByRequest(req.id);
    if (held.length === 0) return;
    const holidaysRepo = stores.holidays;
    if (!holidaysRepo) {
      throw new Error('Thiếu lịch lễ công ty');
    }
    const dates = held.map(day => day.date).sort();
    const holidays = new Set((await holidaysRepo.listBetween(dates[0], dates[dates.length - 1])).map(h => h.date));
    const dropped = held.filter(day => holidays.has(day.date)).sort((a, b) => a.date.localeCompare(b.date));
    if (dropped.length === 0) return;

    const refuse = (message: string) =>
      new DayConflictError(message, { date: dropped[0].date, requestId: null, requestType: null, requestStatus: null }).forReview();
    if (req.type === 'LEAVE_WITH_MAKEUP') {
      throw refuse(`Ngày ${formatDayMonth(dropped[0].date)} đã thành ngày lễ, đơn nghỉ có làm bù cần nộp lại.`);
    }
    if (dropped.length === held.length) {
      throw refuse('Các ngày nghỉ của đơn đều đã thành ngày lễ.');
    }
    await this.giveBack(req.id, dropped, [], stores);
    req.keepLeaveDays(held.length - dropped.length);
  }

  /**
   * Trả các ngày `held` của đơn `requestId` (quy tắc như `releaseDays`) và bỏ liên kết của các ngày `replaced` mà đơn
   * khác đã thay của đơn này.
   */
  private async giveBack(
    requestId: string,
    held: readonly DayClaim[],
    replaced: readonly DayClaim[],
    stores: RequestStores
  ): Promise<void> {
    const daysRepo = this.dayRepo(stores);
    const handedBack = held.filter(
      day => day.baseRequestId !== null && (day.baseRequestStatus === 'PENDING' || day.baseRequestStatus === 'APPROVED')
    );
    const freed = held.filter(day => !handedBack.includes(day));

    for (const [employeeId, dates] of groupDates(freed)) {
      await daysRepo.remove(employeeId, dates, requestId);
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
