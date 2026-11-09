import { Inject, Injectable } from '@nestjs/common';
import { AttendanceDaysRepository } from '../attendance/attendance-days.repository';
import { AttendanceSettingsPort } from '../attendance/attendance-settings.port';
import { datesOfMonth } from '../attendance/domain/calendar';
import { DayStatusRepository } from '../requests/day-status.repository';
import { requestDates } from '../requests/domain/request-dates';
import { RequestsRepository } from '../requests/requests.repository';
import { TypeWeekMissingError } from '../settings/settings.errors';
import type { SystemRequest } from '../requests/domain/system-request';
import type { DayClaim } from '../requests/domain/day-status';
import type { Claim, ClaimDetail, ClaimKind } from './domain/claim';
import { Month } from './domain/day';

/** Tuần làm khi chưa biết tuần của người đó: thứ Hai – thứ Bảy. */
export const DEFAULT_WORK_WEEK: readonly number[] = [1, 2, 3, 4, 5, 6];

const PENDING_KIND: Record<DayClaim['status'], ClaimKind> = {
  LEAVE: 'LEAVE',
  LEAVE_WITH_MAKEUP: 'LEAVE_MAKEUP',
  SHIFT_CHANGE: 'SHIFT_CHANGE',
  ISAT: 'ISAT',
  HALF_SHIFT: 'HALF_SHIFT'
};

function pendingDetail(kind: ClaimKind): ClaimDetail {
  switch (kind) {
    case 'LEAVE':
      return { kind, leaveType: null };
    case 'LEAVE_MAKEUP':
    case 'ISAT':
      return { kind };
    case 'HALF_SHIFT':
      return { kind, half: null, start: null, end: null };
    case 'SHIFT_CHANGE':
      return { kind, shift: null };
    default:
      return { kind: 'OT_WINDOW', start: '', end: '' };
  }
}

/** Dòng `day_status` của đơn đang chờ → Claim chờ duyệt. Đơn đã duyệt đã có trong lịch nên không lấy ở đây. */
export const pendingClaimOf = (c: DayClaim): Claim => {
  const kind = PENDING_KIND[c.status];
  return { requestId: c.requestId, date: c.date, kind, status: 'PENDING', detail: pendingDetail(kind) };
};

const DECLINED_KIND: Partial<Record<SystemRequest['type'], ClaimKind>> = {
  LEAVE: 'LEAVE',
  LEAVE_WITH_MAKEUP: 'LEAVE_MAKEUP',
  ISAT: 'ISAT',
  HALF_SHIFT_LEAVE: 'HALF_SHIFT',
  SHIFT_CHANGE: 'SHIFT_CHANGE',
  OVERTIME: 'OT_WINDOW'
};

/** Đơn bị từ chối hoặc huỷ → một Claim REJECTED / CANCELLED cho mỗi ngày đơn từng chạm tới. */
export function declinedClaimsOf(req: SystemRequest): Claim[] {
  const kind = DECLINED_KIND[req.type];
  if (!kind || (req.status !== 'REJECTED' && req.status !== 'CANCELLED')) return [];
  return requestDates(req).map(date => ({ requestId: req.id, date, kind, status: req.status as 'REJECTED' | 'CANCELLED', detail: pendingDetail(kind) }));
}

/** Nạp dữ kiện rồi dựng `Month` của một người. */
@Injectable()
export class CalendarService {
  constructor(
    @Inject(AttendanceDaysRepository) private readonly days: AttendanceDaysRepository,
    @Inject(AttendanceSettingsPort) private readonly settings: AttendanceSettingsPort,
    @Inject(DayStatusRepository) private readonly claims: DayStatusRepository,
    @Inject(RequestsRepository) private readonly requests: RequestsRepository
  ) {}

  /** Loại nhân sự chưa có tuần làm (vd. tài khoản quản trị đầu tiên) thì dùng T2–T7, như các màn hình đã làm. */
  private async workWeekOrDefault(employeeId: string, month: string): Promise<number[]> {
    try {
      return await this.settings.workWeek(employeeId, month);
    } catch (err) {
      if (err instanceof TypeWeekMissingError) return [...DEFAULT_WORK_WEEK];
      throw err;
    }
  }

  /** Mọi ngày của `month` ('YYYY-MM') của nhân sự `employeeId` (uuid), tính giai đoạn theo `now`. */
  async monthOf(employeeId: string, month: string, now: Date = new Date()): Promise<Month> {
    const dates = datesOfMonth(month);
    const { employee, benefitsByMonth, days } = await this.days.loadSources(employeeId, dates);
    const benefits = benefitsByMonth.get(month);
    if (!benefits) throw new Error(`Thiếu quyền lợi của tháng ${month}`);
    const workWeek = await this.workWeekOrDefault(employeeId, month);
    const held = await this.claims.listBetween(employeeId, dates[0], dates[dates.length - 1]);
    const pending = held.filter(c => c.requestStatus === 'PENDING').map(pendingClaimOf);
    const declined = (await this.requests.listDeclined(employeeId)).flatMap(declinedClaimsOf).filter(c => c.date >= dates[0] && c.date <= dates[dates.length - 1]);
    return Month.of(
      {
        month,
        context: {
          employment: { startDate: employee.startDate, resignedOn: employee.resignedOn },
          benefits,
          workWeek,
          defaultShift: employee.shiftOn
        },
        days,
        pending: [...pending, ...declined]
      },
      now
    );
  }
}
