import type { Day } from './day';

/** Thao tác trên một ngày mà ngày tự cho biết được hay không. Các thao tác khác (nộp đơn, giải trình) thêm khi chuyển dần. */
export type DayAction = 'PUNCH_IN' | 'PUNCH_OUT';

export interface Verdict {
  allowed: boolean;
  /** Câu BE soạn sẵn khi không được; null khi được. */
  reason: string | null;
}

const ALLOWED: Verdict = { allowed: true, reason: null };

export class DayPolicy {
  /**
   * Vào ca chỉ trên ngày làm hoặc ngày ngoài tuần có khung OT/bù. Ra ca không bị chặn theo ngày: ca đêm ra sáng hôm sau
   * ở ngày nghỉ (việc ra mà chưa có lần vào do nơi chấm công kiểm).
   */
  can(action: DayAction, day: Day): Verdict {
    if (action === 'PUNCH_IN' && !day.hasWorkTime) return { allowed: false, reason: 'Hôm nay không phải ngày làm của bạn' };
    return ALLOWED;
  }
}
