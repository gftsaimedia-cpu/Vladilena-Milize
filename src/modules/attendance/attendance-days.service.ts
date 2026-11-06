import { Inject, Injectable } from '@nestjs/common';
import { TransactionCoordinator, type DatabaseTransaction } from '../../database';
import { AttendanceDaysRepository, type AttendanceDayRecord } from './attendance-days.repository';
import { AttendanceSettingsPort } from './attendance-settings.port';
import { buildDay, type AttendanceDay, type DaySources } from './domain/attendance-day';
import { datesOfMonth, monthOfDate } from './domain/calendar';

/** Khoá cố vấn theo nhân sự, trùng đúng khoá module requests đang dùng để hai module xếp hàng chung. */
export const employeeLockKey = (employeeId: string): string => `requests_${employeeId}`;

export interface RefreshOptions {
  /** Giao dịch đang mở của người gọi; có thì ghi trên đó (người gọi tự commit / rollback). */
  trx?: DatabaseTransaction;
  /** Thời điểm tính; mặc định là bây giờ. */
  now?: Date;
}

/** Ghi lại các dòng ngày chấm công (`timesheet_entries`) từ nguồn sự thật, dưới khoá của nhân sự. */
@Injectable()
export class AttendanceDaysService {
  // `@Inject` rõ ràng: tsx không phát metadata kiểu tham số, nên Nest không tự suy ra được.
  constructor(
    @Inject(AttendanceDaysRepository) private readonly repo: AttendanceDaysRepository,
    @Inject(AttendanceSettingsPort) private readonly settings: AttendanceSettingsPort,
    @Inject(TransactionCoordinator) private readonly coordinator: TransactionCoordinator
  ) {}

  /**
   * Tính lại và ghi các ngày `dates` của một nhân sự, trả về các dòng đọc lại từ DB (theo ngày tăng),
   * nên dòng đã khoá kỳ hiện đúng giá trị đang lưu.
   */
  async refreshDays(
    employeeId: string,
    dates: readonly string[],
    opts: RefreshOptions = {}
  ): Promise<AttendanceDayRecord[]> {
    const sorted = [...new Set(dates)].sort();
    if (sorted.length === 0) return [];
    const now = opts.now ?? new Date();

    if (opts.trx) {
      await this.coordinator.acquireAdvisoryLock(opts.trx, employeeLockKey(employeeId));
      return await this.refreshOn(opts.trx, employeeId, sorted, now);
    }
    return await this.coordinator.withLock(employeeLockKey(employeeId), trx =>
      this.refreshOn(trx, employeeId, sorted, now)
    );
  }

  /**
   * Các tháng 'YYYY-MM' trong [from, to] mà kỳ lương đã rời `open` (chốt công trở đi): dòng ngày của tháng đó
   * không được ghi lại thêm bởi các tác vụ tự động (job mỗi giờ, lưu hồ sơ).
   */
  async frozenMonths(from: string, to: string): Promise<Set<string>> {
    return await this.repo.frozenMonths(from, to);
  }

  /** Tính lại cả tháng `month` ('YYYY-MM'). */
  async refreshMonth(employeeId: string, month: string, opts: RefreshOptions = {}): Promise<AttendanceDayRecord[]> {
    return await this.refreshDays(employeeId, datesOfMonth(month), opts);
  }

  /**
   * Tính lại một ngày cho mọi nhân sự còn hiệu lực trong ngày đó. Mỗi người một giao dịch riêng: người đã
   * ghi xong vẫn được giữ, nhưng gặp lỗi ở ai thì dừng và ném lỗi ngay, không chạy tiếp những người sau
   * (hành động của Admin cần thấy lỗi). Trả về số người đã ghi.
   */
  async refreshDateForAll(date: string, opts: { now?: Date } = {}): Promise<number> {
    const ids = await this.repo.activeEmployeeIds(date, date);
    for (const id of ids) {
      await this.refreshDays(id, [date], { now: opts.now });
    }
    return ids.length;
  }

  /** Phần chạy trong giao dịch `trx` (khoá đã lấy): gom nguồn, dựng từng ngày, ghi rồi đọc lại. `sorted` đã khử trùng. */
  private async refreshOn(
    trx: DatabaseTransaction,
    employeeId: string,
    sorted: readonly string[],
    now: Date
  ): Promise<AttendanceDayRecord[]> {
    const repo = this.repo.withTransaction(trx);
    const { employee, benefitsByMonth, days } = await repo.loadSources(employeeId, sorted);

    // Mỗi tháng có trong `dates` hỏi cổng một lần.
    const settingsByMonth = new Map<string, { workWeek: number[]; graceMinutes: number }>();
    for (const month of new Set(sorted.map(monthOfDate))) {
      settingsByMonth.set(month, {
        workWeek: await this.settings.workWeek(employeeId, month, trx),
        graceMinutes: await this.settings.graceMinutes(month, trx)
      });
    }

    const built: AttendanceDay[] = days.map(facts => {
      const month = monthOfDate(facts.date);
      const monthly = settingsByMonth.get(month);
      const benefits = benefitsByMonth.get(month);
      if (!monthly || !benefits) throw new Error(`Thiếu cài đặt hoặc quyền lợi của tháng ${month}`);
      const sources: DaySources = {
        ...facts,
        now,
        employment: { startDate: employee.startDate, resignedOn: employee.resignedOn },
        benefits,
        workWeek: monthly.workWeek,
        graceMinutes: monthly.graceMinutes,
        defaultShift: employee.defaultShift
      };
      return buildDay(employeeId, sources);
    });
    await repo.upsertDays(built, now);

    const stored = await repo.listDays(employeeId, sorted[0], sorted[sorted.length - 1]);
    const wanted = new Set(sorted);
    return stored.filter(row => wanted.has(row.workDate));
  }
}
