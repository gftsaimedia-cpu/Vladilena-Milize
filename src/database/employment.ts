import { sql, type RawBuilder } from 'kysely';

// `staff.start_date` / `staff.resigned_on` là cột TEXT: chỉ nhận đúng 'YYYY-MM-DD' (bỏ khoảng trắng hai đầu); trống hay sai
// dạng thì coi như không ghi (như `parseStartDate` của RequestsRepository). Chuỗi 'YYYY-MM-DD' so sánh đúng thứ tự ngày.
const dateOrNull = (column: 'start_date' | 'resigned_on') =>
  sql`CASE WHEN trim(${sql.ref(column)}) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN trim(${sql.ref(column)}) END`;

/**
 * Điều kiện WHERE trên bảng `staff`: người có làm việc ít nhất một ngày trong [from, to] ('YYYY-MM-DD'), tức vào làm
 * không sau `to` và không nghỉ việc trước `from`. Không ghi ngày vào làm / nghỉ việc thì coi như còn làm.
 */
export function employedBetween(from: string, to: string): RawBuilder<boolean> {
  return sql<boolean>`(coalesce(${dateOrNull('start_date')}, '0000-01-01') <= ${to}
    AND coalesce(${dateOrNull('resigned_on')}, '9999-12-31') >= ${from})`;
}

/** Ngày đầu và ngày cuối ('YYYY-MM-DD') của tháng 'YYYY-MM'. */
export function monthDays(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}
