import { businessDateText } from '../../../common/business-date';
import type { RequestStatus, RequestType } from './types';

/** 6 loại đơn của tab Yêu cầu: nhân viên chỉ nộp 6 loại này, iSAT không nằm trên tab. */
export const TAB_REQUEST_TYPES = ['LEAVE', 'LEAVE_WITH_MAKEUP', 'SHIFT_CHANGE', 'OVERTIME', 'ADVANCE', 'EXPLANATION'] as const;
export type TabRequestType = (typeof TAB_REQUEST_TYPES)[number];

/** Một nhóm (trạng thái, loại) đã đếm; `oldest` là thời điểm tạo sớm nhất trong nhóm. */
export interface RequestCountInput {
  status: RequestStatus;
  type: RequestType;
  total: number;
  oldest: Date | null;
}

/** Số đếm cho hàng thẻ trạng thái và cột loại đơn của tab Yêu cầu. */
export interface RequestCounts {
  byStatus: { all: number } & Record<RequestStatus, number>;
  pendingByType: Record<TabRequestType, number>;
  /** Ngày (giờ Việt Nam) tạo của đơn chờ cũ nhất; null khi không còn đơn chờ. */
  oldestPendingDate: string | null;
}

const isTabType = (type: string): type is TabRequestType => (TAB_REQUEST_TYPES as readonly string[]).includes(type);

export function requestCountsOf(groups: readonly RequestCountInput[]): RequestCounts {
  const counts: RequestCounts = {
    byStatus: { all: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 },
    pendingByType: { LEAVE: 0, LEAVE_WITH_MAKEUP: 0, SHIFT_CHANGE: 0, OVERTIME: 0, ADVANCE: 0, EXPLANATION: 0 },
    oldestPendingDate: null
  };
  let oldest: Date | null = null;
  for (const g of groups) {
    if (!isTabType(g.type)) continue;
    counts.byStatus.all += g.total;
    counts.byStatus[g.status] += g.total;
    if (g.status !== 'PENDING') continue;
    counts.pendingByType[g.type] += g.total;
    if (g.oldest && (!oldest || g.oldest < oldest)) oldest = g.oldest;
  }
  counts.oldestPendingDate = oldest ? businessDateText(oldest) : null;
  return counts;
}
