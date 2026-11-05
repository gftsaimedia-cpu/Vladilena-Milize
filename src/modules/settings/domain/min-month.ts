// Tháng sớm nhất còn được đổi cài đặt: tháng sau tháng đã chốt gần nhất; chưa chốt tháng nào thì tháng hiện tại.
import { businessMonthText } from '../../../common/business-date';

export function minMonthFrom(lastClosedMonth: string | null, now: Date): string {
  if (lastClosedMonth === null) return businessMonthText(now);
  const year = Number(lastClosedMonth.slice(0, 4));
  const mon = Number(lastClosedMonth.slice(5, 7));
  const nextYear = mon === 12 ? year + 1 : year;
  const nextMon = mon === 12 ? 1 : mon + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMon).padStart(2, '0')}`;
}
