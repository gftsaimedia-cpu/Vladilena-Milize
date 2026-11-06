import { businessDateText } from '../../../common/business-date';
import { addDaysText } from './calendar';

/** Giờ (0–23) của một thời điểm theo giờ Việt Nam (UTC+7), không phụ thuộc múi giờ máy chủ. */
function vnHourOf(at: Date): number {
  return new Date(at.getTime() + 7 * 60 * 60 * 1000).getUTCHours();
}

export interface WorkDateOfPunchInput {
  at: Date;
  type: 'IN' | 'OUT';
  /** Tóm tắt dòng ngày D−1 (không có dòng thì cả hai là false). */
  previousDay: { crossesMidnight: boolean; hasInWithoutOut: boolean };
}

/**
 * Ngày công của một lần chấm không ghi sẵn ngày công (L21).
 * Ngày D là ngày theo giờ Việt Nam của lần chấm. Lần ra chấm trước 12:00 ngày D thuộc ngày D−1 khi ca của
 * ngày D−1 qua nửa đêm và ngày D−1 có lần vào mà chưa có lần ra; còn lại thuộc ngày D.
 */
export function workDateOfPunch(input: WorkDateOfPunchInput): string {
  const day = businessDateText(input.at);
  const { crossesMidnight, hasInWithoutOut } = input.previousDay;
  if (input.type === 'OUT' && vnHourOf(input.at) < 12 && crossesMidnight && hasInWithoutOut) {
    return addDaysText(day, -1);
  }
  return day;
}
