import type { HalfShift } from '../../../common/half-shift';
import type { LeaveType } from '../../requests/domain/leave-types';
import type { ShiftFacts } from '../../attendance/domain/attendance-day';

/** Một đơn đè lên một ngày kiểu gì. Giải trình không phải Claim: nó bổ sung cho kết quả chấm công, không đổi kế hoạch của ngày. */
export type ClaimKind =
  | 'LEAVE' //          nghỉ (leaveType quyết có lương hay không)
  | 'LEAVE_MAKEUP' //   nghỉ có làm bù
  | 'ISAT' //           thứ Bảy iSAT
  | 'HALF_SHIFT' //     nghỉ giữa ca (làm một nửa)
  | 'SHIFT_CHANGE' //   đổi ca
  | 'OT_WINDOW' //      khung làm thêm
  | 'MAKEUP_WINDOW'; // khung làm bù

/** Đơn từ chối hoặc huỷ không giữ ngày; claim REJECTED / CANCELLED chỉ để lịch báo "đơn bị từ chối / huỷ" và không đổi loại ngày. */
export type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** Phần riêng theo `kind`; trường nào chưa biết (đơn đang chờ, nguồn cũ) để null. */
export type ClaimDetail =
  | { kind: 'LEAVE'; leaveType: LeaveType | null }
  | { kind: 'LEAVE_MAKEUP' }
  | { kind: 'ISAT' }
  | { kind: 'HALF_SHIFT'; half: HalfShift | null; start: string | null; end: string | null }
  | { kind: 'SHIFT_CHANGE'; shift: ShiftFacts | null }
  | { kind: 'OT_WINDOW' | 'MAKEUP_WINDOW'; start: string; end: string };

export interface Claim {
  /** Id đơn sinh ra claim; null khi nguồn không ghi (khung OT/bù đọc từ bảng khung). */
  readonly requestId: string | null;
  readonly date: string;
  readonly kind: ClaimKind;
  readonly status: ClaimStatus;
  readonly detail: ClaimDetail;
}
