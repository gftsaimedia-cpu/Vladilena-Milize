import { addDays } from './working-days';

const monthOf = (date: string): string => date.slice(0, 7);

/**
 * Ngày đầu tiên còn giải trình được (R1): ngày 01 của tháng trước tháng của `today`. Ngày cũ hơn thì quá hạn giải trình:
 * nhân viên không tự nộp được nữa (Admin vẫn nộp hộ được tới khi kỳ lương được phê duyệt).
 */
export const explanationWindowFrom = (today: string): string => `${monthOf(addDays(`${monthOf(today)}-01`, -1))}-01`;

/** Ngày `date` đã quá hạn giải trình tính tới `today`. */
export const isExplanationExpired = (date: string, today: string): boolean => date < explanationWindowFrom(today);
