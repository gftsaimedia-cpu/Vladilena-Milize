import { Injectable, Inject, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isValidDateText } from '../../common/date-text';
import { TransactionCoordinator } from '../../database/transaction';
import { AttendanceDaysService } from '../attendance/attendance-days.service';
import { AuditLog } from '../audit/audit-log';
import { HolidayNotFoundError } from './holidays.errors';
import { HolidaysRepository, type Holiday } from './holidays.repository';

/** Bốn ngày lễ cố định của nút "thêm nhanh", theo thứ tự ngày. */
export const FIXED_HOLIDAYS: ReadonlyArray<{ monthDay: string; name: string }> = [
  { monthDay: '01-01', name: 'Tết Dương lịch' },
  { monthDay: '04-30', name: 'Ngày Giải phóng miền Nam' },
  { monthDay: '05-01', name: 'Quốc tế Lao động' },
  { monthDay: '09-02', name: 'Quốc khánh' }
];

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** Số nguyên 2000–2100. Query string gửi năm dạng chuỗi số nên chuỗi toàn chữ số cũng được nhận. */
function parseYear(value: unknown): number {
  const year = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof year !== 'number' || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new Error(`Năm không hợp lệ: ${value}`);
  }
  return year;
}

/** '2026-09-02' → '02/09/2026' */
function formatFullDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** Dòng nhật ký của một ngày lễ: mã là ngày, tháng là tháng của ngày đó. */
const holidayEntry = (holiday: Holiday) => ({
  entityKind: 'holiday',
  entityId: holiday.date,
  month: holiday.date.slice(0, 7)
});

/**
 * Mỗi lần thêm/xoá chạy trong một transaction; dòng nhật ký ghi cuối cùng, lỗi thì huỷ cả hai.
 * Sau khi transaction đó đã commit, các dòng ngày công của ngày lễ được ghi lại cho mọi người còn hiệu lực
 * (mỗi người một giao dịch riêng). Ghi lại lỗi thì lỗi trả về cho Admin; ngày lễ vẫn nằm trong lịch, làm lại thao tác là đủ.
 */
@Injectable()
export class HolidaysService {
  /** Thời điểm tính dòng ngày công; test đặt cố định. */
  now: () => Date = () => new Date();

  // `@Inject` rõ ràng: tsx không phát metadata kiểu tham số, thiếu thì Nest cấp `undefined` mà không báo lỗi.
  constructor(
    @Inject(HolidaysRepository) private readonly repo: HolidaysRepository,
    @Inject(TransactionCoordinator) private readonly tx: Pick<TransactionCoordinator, 'run'>,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, 'append'>,
    @Optional() @Inject(AttendanceDaysService) private readonly attendanceDays?: Pick<AttendanceDaysService, 'refreshDateForAll'>
  ) {}

  /** Ghi lại dòng ngày công của `date` cho mọi người còn hiệu lực. Gọi sau khi giao dịch ghi lịch lễ đã commit (P4). */
  private async refreshDate(date: string): Promise<void> {
    await this.attendanceDays?.refreshDateForAll(date, { now: this.now() });
  }

  async list(year: unknown): Promise<Holiday[]> {
    const y = parseYear(year);
    return this.repo.listBetween(`${y}-01-01`, `${y}-12-31`);
  }

  async add(input: { date: unknown; name: unknown }, actor: string): Promise<Holiday> {
    const { date, name } = input;
    if (!isValidDateText(date)) throw new Error(`Ngày lễ không hợp lệ: ${date}`);
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed.length === 0) throw new Error('Tên ngày lễ không được trống');
    const holiday: Holiday = { date, name: trimmed };
    const saved = await this.tx.run(async trx => {
      if (!(await this.repo.withTransaction(trx).insert(holiday, actor))) {
        throw new Error(`Ngày ${formatFullDate(date)} đã có trong lịch lễ`);
      }
      await this.audit.append(trx, {
        actor,
        action: 'holiday.add',
        ...holidayEntry(holiday),
        after: holiday,
        requestId: randomUUID()
      });
      return holiday;
    });
    await this.refreshDate(saved.date);
    return saved;
  }

  /** Thêm bốn ngày lễ cố định của năm `year`; ngày đã có thì bỏ qua. Trả các ngày vừa thêm. */
  async quickAdd(year: unknown, actor: string): Promise<string[]> {
    const y = parseYear(year);
    const dates = await this.tx.run(async trx => {
      const repo = this.repo.withTransaction(trx);
      const added: Holiday[] = [];
      for (const { monthDay, name } of FIXED_HOLIDAYS) {
        const holiday = { date: `${y}-${monthDay}`, name };
        if (await repo.insert(holiday, actor)) added.push(holiday);
      }
      const requestId = randomUUID();
      for (const holiday of added) {
        await this.audit.append(trx, { actor, action: 'holiday.add', ...holidayEntry(holiday), after: holiday, requestId });
      }
      return added.map(h => h.date);
    });
    for (const date of dates) await this.refreshDate(date);
    return dates;
  }

  async remove(date: string, actor: string): Promise<void> {
    if (!isValidDateText(date)) throw new Error(`Ngày lễ không hợp lệ: ${date}`);
    await this.tx.run(async trx => {
      const removed = await this.repo.withTransaction(trx).remove(date);
      if (!removed) throw new HolidayNotFoundError(date);
      await this.audit.append(trx, {
        actor,
        action: 'holiday.remove',
        ...holidayEntry(removed),
        before: removed,
        requestId: randomUUID()
      });
    });
    await this.refreshDate(date);
  }
}
