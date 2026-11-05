import type { RequestStatus } from './types';

/** Trạng thái ngày do một đơn chiếm. */
export type ClaimStatus = 'LEAVE' | 'LEAVE_WITH_MAKEUP' | 'SHIFT_CHANGE' | 'ISAT';

/** Trạng thái của đơn còn giữ ngày: đơn đã từ chối hoặc huỷ không giữ ngày nào. */
export type ActiveStatus = 'PENDING' | 'APPROVED';

/** Một dòng của bảng `day_status`; `date` dạng YYYY-MM-DD. */
export interface DayStatusRow {
  employeeId: string;
  date: string;
  status: ClaimStatus;
  requestId: string;
  /** Đơn đổi ca bị đơn này thay đúng ngày này; chỉ có khi `status` không phải `SHIFT_CHANGE`. */
  baseRequestId: string | null;
}

/** Dòng `day_status` kèm trạng thái hiện tại của đơn giữ ngày và của đơn gốc. */
export interface DayClaim extends DayStatusRow {
  requestStatus: ActiveStatus;
  baseRequestStatus: RequestStatus | null;
}
