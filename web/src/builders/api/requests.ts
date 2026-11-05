// Đơn từ của BE v2 (GET /api/v2/requests) đổi về đúng "dòng thô" mà các builder của màn Yêu cầu đang đọc
// (builders/admin-requests: requests, explanations, advance), để phần hiển thị giữ nguyên. Mỗi dòng mang requestId
// để duyệt / từ chối qua PATCH /requests/:id/review. Đơn đã huỷ không hiện.
import type { PersonInfo, RequestDTO } from './inbox';

export type FullRequestDTO = RequestDTO & {
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewNote?: string | null;
  makeupSlots?: { date: string; startTime: string; endTime: string; workMinutes: number }[];
};

const DAY_STATUS: Record<string, 'pending' | 'approved' | 'rejected'> = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const nameOf = (r: FullRequestDTO, people: Map<string, PersonInfo>) => people.get(r.employeeId)?.name || r.employeeId;

// Loại khoản theo mã của màn Duyệt (builders/admin-requests/requests.ts KIND_OF); null = không thuộc màn này.
function itemOf(r: FullRequestDTO): string | null {
  switch (r.type) {
    case 'LEAVE':
      return r.leaveType === 'ANNUAL' ? 'leave' : 'approved';
    case 'LEAVE_WITH_MAKEUP':
      return 'willmakeup';
    case 'OVERTIME':
      return 'ot';
    case 'ISAT':
      return 'isat';
    case 'SHIFT_CHANGE':
      return 'Đổi ca';
    default:
      return null; // giải trình và tạm ứng có nhóm riêng
  }
}

function dateOf(r: FullRequestDTO): string {
  return r.leaveStartDate || r.otDate || r.isat?.saturday || r.changeStartDate || r.createdAt.slice(0, 10);
}

function declaredOf(r: FullRequestDTO): Record<string, unknown> {
  if (r.type === 'OVERTIME') return { out: r.otStartTime, extraOut: r.otEndTime };
  if (r.type === 'LEAVE_WITH_MAKEUP') return { makeupPlans: (r.makeupSlots || []).map(s => ({ from: s.startTime, to: s.endTime })) };
  return {};
}

/** Dòng thô của bảng Duyệt (nghỉ, OT, làm bù, iSAT, đổi ca). */
export function approvalRowsFromRequests(list: FullRequestDTO[], people: Map<string, PersonInfo>) {
  const rows: any[] = [];
  for (const r of list) {
    const item = itemOf(r);
    const status = DAY_STATUS[r.status];
    if (!item || !status) continue;
    rows.push({
      requestId: r.id,
      username: r.employeeId,
      name: nameOf(r, people),
      date: dateOf(r),
      item,
      holiday: false,
      declared: declaredOf(r),
      submittedAt: r.createdAt,
      decidedAt: r.reviewedAt ?? null,
      status
    });
  }
  return rows;
}

/** Phản hồi dạng GET /explanations: đơn chờ duyệt là "answered" (nhân viên đã gửi, chờ Admin). */
export function explanationsResponseFromRequests(list: FullRequestDTO[], people: Map<string, PersonInfo>) {
  const STATUS: Record<string, string> = { PENDING: 'answered', APPROVED: 'approved', REJECTED: 'rejected' };
  const items = list
    .filter(r => r.type === 'EXPLANATION' && STATUS[r.status])
    .map(r => {
      const times = [r.actualCheckIn && `Giờ vào ${r.actualCheckIn}`, r.actualCheckOut && `Giờ ra ${r.actualCheckOut}`];
      return {
        id: r.id,
        rev: undefined,
        username: r.employeeId,
        name: nameOf(r, people),
        date: r.explanationDate || r.createdAt.slice(0, 10),
        kind: 'admin',
        prompt: '',
        answer: [...times, r.reason].filter(Boolean).join(' · '),
        status: STATUS[r.status],
        requestedAt: r.createdAt,
        answeredAt: r.createdAt,
        decisionNote: r.reviewNote || ''
      };
    });
  return { items };
}

/** Phản hồi dạng GET /advance-approvals?month=: đơn tạm ứng trừ vào lương tháng `month`. */
export function advanceResponseFromRequests(list: FullRequestDTO[], people: Map<string, PersonInfo>, month: string) {
  const items = list
    .filter(r => r.type === 'ADVANCE' && r.advancePeriod === month && DAY_STATUS[r.status])
    .map(r => ({
      requestId: r.id,
      username: r.employeeId,
      name: nameOf(r, people),
      eligible: true,
      amount: r.advanceAmount ?? 0,
      status: DAY_STATUS[r.status],
      rev: undefined,
      requestedAt: r.createdAt,
      decidedAt: r.reviewedAt ?? null,
      decidedBy: r.reviewedBy ?? null,
      note: r.reviewNote || ''
    }));
  return { month, rev: undefined, pending: items.filter(i => i.status === 'pending').length, items };
}
