import { Injectable, Inject, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isValidDateText } from '../../common/date-text';
import { TransactionCoordinator } from '../../database/transaction';
import { AuditLog } from '../audit/audit-log';
import { gateAllows } from '../periods/domain';
import { PeriodGate } from '../periods/period-gate';
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
 * Mỗi lần thêm/xoá chạy trong một transaction; dòng nhật ký ghi cuối cùng, lỗi thì huỷ cả hai. Cổng kỳ (`holiday`) chạy
 * đầu transaction đó, nên khoá chia sẻ của tháng giữ tới commit: Chốt công đợi lần ghi đang dở xong.
 */
@Injectable()
export class HolidaysService {
  constructor(
    @Inject(HolidaysRepository) private readonly repo: HolidaysRepository,
    @Inject(TransactionCoordinator) private readonly tx: Pick<TransactionCoordinator, 'run'>,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, 'append'>,
    @Optional() @Inject(PeriodGate) private readonly periodGate?: PeriodGate
  ) {}

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
    return this.tx.run(async trx => {
      await this.periodGate?.hold(trx, [date.slice(0, 7)], 'holiday');
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
  }

  /** Thêm bốn ngày lễ cố định của năm `year`; ngày đã có thì bỏ qua. Trả các ngày vừa thêm. */
  async quickAdd(year: unknown, actor: string): Promise<string[]> {
    const y = parseYear(year);
    return this.tx.run(async trx => {
      const repo = this.repo.withTransaction(trx);
      const added: Holiday[] = [];
      for (const { monthDay, name } of FIXED_HOLIDAYS) {
        const holiday = { date: `${y}-${monthDay}`, name };
        // Ngày của tháng đã chốt thì bỏ qua, không làm hỏng cả năm.
        if (this.periodGate && !gateAllows(await this.periodGate.statusOf(trx, holiday.date.slice(0, 7)), 'holiday')) continue;
        if (await repo.insert(holiday, actor)) added.push(holiday);
      }
      const requestId = randomUUID();
      for (const holiday of added) {
        await this.audit.append(trx, { actor, action: 'holiday.add', ...holidayEntry(holiday), after: holiday, requestId });
      }
      return added.map(h => h.date);
    });
  }

  async remove(date: string, actor: string): Promise<void> {
    if (!isValidDateText(date)) throw new Error(`Ngày lễ không hợp lệ: ${date}`);
    await this.tx.run(async trx => {
      await this.periodGate?.hold(trx, [date.slice(0, 7)], 'holiday');
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
  }
}
