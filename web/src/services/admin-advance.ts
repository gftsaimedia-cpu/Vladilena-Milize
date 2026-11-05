// Tạm ứng phía Admin: đơn loại ADVANCE của GET /api/v2/requests?type=ADVANCE (trừ vào lương tháng advancePeriod),
// đổi về dạng mà builders/admin-requests/advance đọc. Duyệt / từ chối: PATCH /api/v2/requests/:id/review.
// BE chưa có "huỷ duyệt": thao tác đó báo chưa nối.
import { buildAdvanceRows } from '@/builders/admin-requests/advance';
import { advanceResponseFromRequests } from '@/builders/api/requests';
import { peopleOf } from './admin-main';
import { notConnected } from './data-mode';
import { ApiError, api, qs } from './http';

async function monthResponse(month?) {
  const [res, emp] = await Promise.all([
    api('GET', `/requests${qs({ type: 'ADVANCE', limit: 1000 })}`),
    api('GET', '/employees').catch(() => ({ employees: [] }))
  ]);
  return advanceResponseFromRequests(res.items || [], peopleOf(emp.employees || []), month);
}

/** Yêu cầu tạm ứng đã gửi của tháng month ('YYYY-MM'). */
export async function listAdvances({ month }: any = {}) {
  return buildAdvanceRows(await monthResponse(month));
}

const review = (requestId: string, approve: boolean, note?: string) =>
  api('PATCH', `/requests/${encodeURIComponent(requestId)}/review`, {
    action: approve ? 'APPROVE' : 'REJECT',
    ...(note ? { note } : {})
  });

/** Duyệt hoặc từ chối yêu cầu đang chờ của một người trong tháng (action 'approve' | 'reject'; 'cancel' chưa có API). */
export async function decideAdvance({ month, username, action, note }: any) {
  if (action === 'cancel') return notConnected();
  const res = await monthResponse(month);
  const hit = res.items.find(i => i.username === username && i.status === 'pending');
  if (!hit) throw new ApiError(409, 'Yêu cầu này đã được xử lý.', { code: 'REQUEST_STALE' });
  return review(hit.requestId, action === 'approve', note);
}

/** Duyệt mọi yêu cầu đang chờ của tháng. */
export async function approveAllAdvances({ month }: any) {
  const res = await monthResponse(month);
  const approved: string[] = [];
  const skipped: { username: string; code: string }[] = [];
  for (const item of res.items.filter(i => i.status === 'pending')) {
    try {
      await review(item.requestId, true);
      approved.push(item.username);
    } catch (e) {
      skipped.push({ username: item.username, code: (e as ApiError).code || 'error' });
    }
  }
  return { month, approved, skipped };
}
