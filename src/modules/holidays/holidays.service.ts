import { Injectable, Inject } from '@nestjs/common';
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

/** Ngày có thật trong lịch, dạng YYYY-MM-DD ('2026-02-30' không hợp lệ). */
function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

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

@Injectable()
export class HolidaysService {
  constructor(@Inject(HolidaysRepository) private readonly repo: HolidaysRepository) {}

  async list(year: unknown): Promise<Holiday[]> {
    const y = parseYear(year);
    return this.repo.listBetween(`${y}-01-01`, `${y}-12-31`);
  }

  async add(input: { date: unknown; name: unknown }, createdBy: string | null): Promise<Holiday> {
    const { date, name } = input;
    if (!isValidDate(date)) throw new Error(`Ngày lễ không hợp lệ: ${date}`);
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (trimmed.length === 0) throw new Error('Tên ngày lễ không được trống');
    const holiday: Holiday = { date, name: trimmed };
    if (!(await this.repo.insert(holiday, createdBy))) {
      throw new Error(`Ngày ${formatFullDate(date)} đã có trong lịch lễ`);
    }
    return holiday;
  }

  /** Thêm bốn ngày lễ cố định của năm `year`; ngày đã có thì bỏ qua. Trả các ngày vừa thêm. */
  async quickAdd(year: unknown, createdBy: string | null): Promise<string[]> {
    const y = parseYear(year);
    const added: string[] = [];
    for (const { monthDay, name } of FIXED_HOLIDAYS) {
      const date = `${y}-${monthDay}`;
      if (await this.repo.insert({ date, name }, createdBy)) added.push(date);
    }
    return added;
  }

  async remove(date: string): Promise<void> {
    if (!isValidDate(date)) throw new Error(`Ngày lễ không hợp lệ: ${date}`);
    if (!(await this.repo.remove(date))) throw new HolidayNotFoundError(date);
  }
}
