import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { TransactionCoordinator } from '../../database';
import { businessDateText } from '../../common/business-date';
import { AttendanceDaysRepository } from './attendance-days.repository';
import { AttendanceDaysService } from './attendance-days.service';
import { addDaysText, datesOfMonth, monthOfDate } from './domain/calendar';

/** Khoá cố vấn của job: hai lần chạy (cùng hay khác tiến trình) không bao giờ chồng nhau. */
export const ATTENDANCE_DAYS_JOB_LOCK = 'attendance_days_job';

/** Chu kỳ mặc định: mỗi giờ. */
const DEFAULT_INTERVAL_MS = 3_600_000;

/**
 * Job mỗi giờ (trigger T5): ghi các ngày còn thiếu dòng của tháng trước và tháng này, và ghi lại các dòng
 * `PENDING` đã tới hạn để ngày qua mốc xét (17:30 giờ VN) chuyển thành `ABSENT` mà không cần ai thao tác.
 */
@Injectable()
export class AttendanceDaysJob implements OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  // `@Inject` rõ ràng: tsx không phát metadata kiểu tham số, nên Nest không tự suy ra được.
  constructor(
    @Inject(AttendanceDaysRepository) private readonly repo: AttendanceDaysRepository,
    @Inject(AttendanceDaysService) private readonly days: AttendanceDaysService,
    @Inject(TransactionCoordinator) private readonly coordinator: TransactionCoordinator
  ) {}

  /**
   * Một lượt: với mỗi nhân sự còn làm việc trong khoảng [đầu tháng trước, cuối tháng này] (theo giờ VN của
   * `now`), ghi lại các ngày `datesNeedingRefresh`. Mỗi người một giao dịch riêng dưới khoá của người đó.
   * Người nào lỗi thì ghi log rồi bỏ qua, những người còn lại vẫn được ghi.
   * Trả về số người đã ghi (có ít nhất một ngày và không lỗi) và tổng số ngày đã ghi cho họ.
   */
  async runOnce(now: Date = new Date()): Promise<{ employees: number; days: number }> {
    const today = businessDateText(now);
    const thisMonth = monthOfDate(today);
    const from = `${monthOfDate(addDaysText(`${thisMonth}-01`, -1))}-01`;
    const monthDates = datesOfMonth(thisMonth);
    const to = monthDates[monthDates.length - 1];

    return await this.coordinator.withLock(ATTENDANCE_DAYS_JOB_LOCK, async () => {
      let employees = 0;
      let days = 0;
      // Tháng đã chốt công (hay xa hơn) thì đóng băng: job không được thêm hay đổi dòng ngày của tháng đó.
      const frozen = await this.repo.frozenMonths(from, to);
      for (const id of await this.repo.activeEmployeeIds(from, to)) {
        try {
          const dates = (await this.repo.datesNeedingRefresh(id, from, to, today)).filter(
            date => !frozen.has(monthOfDate(date))
          );
          if (dates.length === 0) continue;
          // Không truyền `trx`: mỗi người một giao dịch riêng với khoá `requests_<uuid>`.
          await this.days.refreshDays(id, dates, { now });
          employees += 1;
          days += dates.length;
        } catch (error) {
          console.error(`Job ngày công: lỗi khi ghi nhân sự ${id}:`, error);
        }
      }
      return { employees, days };
    });
  }

  /** Chạy ngay một lần (không chờ), rồi lặp mỗi `intervalMs`. Lần chạy trước chưa xong thì bỏ qua tick. */
  start(intervalMs: number = DEFAULT_INTERVAL_MS): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  onModuleDestroy(): void {
    this.stop();
  }

  /** Một tick: bỏ qua nếu đang chạy; lỗi chỉ ghi log để timer vẫn sống. */
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch (error) {
      console.error('Job ngày công: lượt chạy lỗi:', error);
    } finally {
      this.running = false;
    }
  }
}
