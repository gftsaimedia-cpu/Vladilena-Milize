import { Inject, Injectable } from '@nestjs/common';
import { TransactionCoordinator, type DatabaseTransaction } from '../../database';
import {
  AttendanceDaysRepository,
  newSourcesCache,
  type AttendanceDayRecord,
  type SourcesCache
} from './attendance-days.repository';
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

/** Số nhân sự dựng lại song song trong `refreshMany`; mỗi người một giao dịch và một khoá riêng nên không chờ nhau. */
const REFRESH_CONCURRENCY = 4;

type MonthlySettings = { workWeek: number[]; graceMinutes: number };

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
      const trx = opts.trx;
      await this.coordinator.acquireAdvisoryLock(trx, employeeLockKey(employeeId));
      return await this.refreshOn(trx, employeeId, sorted, now, month => this.settingsOf(employeeId, month, trx));
    }
    return await this.coordinator.withLock(employeeLockKey(employeeId), trx =>
      this.refreshOn(trx, employeeId, sorted, now, month => this.settingsOf(employeeId, month, trx))
    );
  }

  /** Tính lại cả tháng `month` ('YYYY-MM'). */
  async refreshMonth(employeeId: string, month: string, opts: RefreshOptions = {}): Promise<AttendanceDayRecord[]> {
    return await this.refreshDays(employeeId, datesOfMonth(month), opts);
  }

  /**
   * Tính lại cả các tháng `months` cho nhiều nhân sự (cài đặt đổi từ tháng cũ). Cùng kết quả như gọi `refreshMonth` từng
   * người, từng tháng, nhưng: cài đặt của mỗi tháng đọc một lần cho tất cả; quyền lợi và ngày lễ dùng chung; mỗi người
   * một giao dịch cho mọi tháng (một lần đọc nguồn, một lần ghi) và không đọc lại dòng; vài người chạy song song. Gặp lỗi ở
   * ai thì không bắt đầu người mới và ném lỗi đầu tiên sau khi các giao dịch đang chạy kết thúc.
   */
  async refreshMany(employeeIds: readonly string[], months: readonly string[], opts: { now?: Date } = {}): Promise<void> {
    if (employeeIds.length === 0 || months.length === 0) return;
    const now = opts.now ?? new Date();
    const dates = months.flatMap(datesOfMonth);

    // Cài đặt đã commit trước khi người gọi báo, nên đọc ngoài giao dịch của từng người.
    const monthly = new Map<string, { graceMinutes: number; weeks: ReadonlyMap<string, number[]> }>();
    for (const month of months) {
      monthly.set(month, {
        graceMinutes: await this.settings.graceMinutes(month),
        weeks: await this.settings.workWeeksAt(month)
      });
    }
    const cache = newSourcesCache();

    let next = 0;
    let failed = false;
    let failure: unknown;
    const worker = async (): Promise<void> => {
      while (!failed && next < employeeIds.length) {
        const employeeId = employeeIds[next++];
        try {
          await this.coordinator.withLock(employeeLockKey(employeeId), async trx => {
            await this.refreshOn(
              trx,
              employeeId,
              dates,
              now,
              async month => {
                const shared = monthly.get(month)!;
                return {
                  graceMinutes: shared.graceMinutes,
                  workWeek: shared.weeks.get(employeeId) ?? (await this.settings.workWeek(employeeId, month, trx))
                };
              },
              cache
            );
          });
        } catch (err) {
          if (!failed) failure = err;
          failed = true;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(REFRESH_CONCURRENCY, employeeIds.length) }, worker));
    if (failed) throw failure;
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

  /** Cài đặt chấm công của một người ở `month`, đọc trên giao dịch `trx`. */
  private async settingsOf(employeeId: string, month: string, trx: DatabaseTransaction): Promise<MonthlySettings> {
    return {
      workWeek: await this.settings.workWeek(employeeId, month, trx),
      graceMinutes: await this.settings.graceMinutes(month, trx)
    };
  }

  /**
   * Phần chạy trong giao dịch `trx` (khoá đã lấy): gom nguồn, dựng từng ngày, ghi rồi đọc lại. `sorted` đã khử trùng.
   * `settingsOf` cho cài đặt của từng tháng (mỗi tháng hỏi một lần). Có `cache` (dựng hàng loạt) thì ghi xong không đọc lại
   * dòng và trả mảng rỗng.
   */
  private async refreshOn(
    trx: DatabaseTransaction,
    employeeId: string,
    sorted: readonly string[],
    now: Date,
    settingsOf: (month: string) => Promise<MonthlySettings>,
    cache?: SourcesCache
  ): Promise<AttendanceDayRecord[]> {
    const repo = this.repo.withTransaction(trx);
    const { employee, benefitsByMonth, days } = await repo.loadSources(employeeId, sorted, cache);

    const settingsByMonth = new Map<string, MonthlySettings>();
    for (const month of new Set(sorted.map(monthOfDate))) settingsByMonth.set(month, await settingsOf(month));

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
    if (cache) return [];

    const stored = await repo.listDays(employeeId, sorted[0], sorted[sorted.length - 1]);
    const wanted = new Set(sorted);
    return stored.filter(row => wanted.has(row.workDate));
  }
}
