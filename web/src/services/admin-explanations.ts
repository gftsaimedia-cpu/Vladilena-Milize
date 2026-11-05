// Giải trình phía Admin: đơn loại EXPLANATION của GET /api/v2/requests?type=EXPLANATION, đổi về dạng phản hồi mà
// builders/admin-requests/explanations đọc. Duyệt / không duyệt: PATCH /api/v2/requests/:id/review.
import { buildExplanationRows } from '@/builders/admin-requests/explanations';
import { explanationsResponseFromRequests } from '@/builders/api/requests';
import { useSessionStore } from '@/stores/session';
import { peopleOf } from './admin-main';
import { api, qs } from './http';

const q = (v?) => encodeURIComponent(v);

async function explanations() {
  const [res, emp] = await Promise.all([
    api('GET', `/requests${qs({ type: 'EXPLANATION', limit: 1000 })}`),
    api('GET', '/employees').catch(() => ({ employees: [] }))
  ]);
  return explanationsResponseFromRequests(res.items || [], peopleOf(emp.employees || []));
}

/** Giải trình của mọi người trong tháng month ('YYYY-MM'), ngày cũ trước. */
export async function listExplanations({ month }: any = {}) {
  return buildExplanationRows(await explanations(), month);
}

/**
 * Giải trình đang chờ Admin quyết của mọi tháng (dòng thô). Không có năng lực duyệt giải trình hoặc máy chủ lỗi thì rỗng:
 * số đếm không chặn màn nào.
 */
export async function listWaitingExplanations() {
  if (!useSessionStore().caps.includes('attendance.correct')) return [];
  try {
    return (await explanations()).items.filter(x => x.status === 'answered');
  } catch {
    return [];
  }
}

/** Duyệt (action 'approve') hoặc không duyệt (action 'reject'). */
export const decideExplanation = ({ id, action, note }: any) =>
  api('PATCH', `/requests/${q(id)}/review`, {
    action: action === 'approve' ? 'APPROVE' : 'REJECT',
    ...(note ? { note } : {})
  });
