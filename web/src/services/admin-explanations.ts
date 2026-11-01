// Giải trình phía Admin.
//   GET  /explanations                  { items: [{ id, rev, username, name, date, kind, sessionId, prompt, answer, status, requestedBy, requestedAt, answeredAt, decisionNote }], waitingForYou, toRead }
//   POST /explanations/:id/decide       { approve: boolean, note?, expectedRev? }  → { item, recorded }
import { buildExplanationRows } from '@/builders/admin-requests/explanations';
import { useSessionStore } from '@/stores/session';
import { api } from './http';

const q = (v?) => encodeURIComponent(v);

/** Giải trình của mọi người trong tháng month ('YYYY-MM'), ngày cũ trước. */
export async function listExplanations({ month }: any = {}) {
  return buildExplanationRows(await api('GET', '/explanations'), month);
}

/**
 * Giải trình đang chờ Admin quyết của mọi tháng (GET /explanations?status=answered), dòng thô của máy chủ.
 * Không có năng lực duyệt giải trình hoặc máy chủ lỗi thì rỗng: số đếm không chặn màn nào.
 */
export async function listWaitingExplanations() {
  if (!useSessionStore().caps.includes('attendance.correct')) return [];
  try {
    const res = await api('GET', '/explanations?status=answered');
    return (res && res.items) || [];
  } catch {
    return [];
  }
}

/** Duyệt (action 'approve') hoặc không duyệt (action 'reject'); rev của dòng đi kèm làm expectedRev. */
export const decideExplanation = ({ id, action, note, rev }: any) =>
  api('POST', `/explanations/${q(id)}/decide`, {
    approve: action === 'approve',
    ...(note ? { note } : {}),
    ...(rev !== undefined ? { expectedRev: rev } : {})
  });
