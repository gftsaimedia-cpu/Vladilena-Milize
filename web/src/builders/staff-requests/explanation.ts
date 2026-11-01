// Giải trình của tôi từ GET /explanations: yêu cầu giải trình và giải trình gắn với lượt chấm công,
// cùng các ngày vắng của tháng (GET /sheet → actualReport.absent) chưa có giải trình nào (máy chủ chỉ nhận một giải trình mỗi ngày).
import { STATUS_VIEW } from './catalog';

// Trạng thái của máy chủ → thẻ: requested (chờ tôi trả lời), answered (chờ Admin), approved, rejected
const VIEW = {
  requested: { status: 'pend', label: 'Chờ xử lý' },
  answered: { status: 'pend', label: 'Chờ xử lý' },
  approved: STATUS_VIEW.approved,
  rejected: STATUS_VIEW.rejected
};

// Câu hỏi của máy chủ cho ngày không có Check-in/Check-out
export const ABSENT_PROMPT = 'Không có Check-in/Check-out trong ngày';

export function buildExplanations(res?, sheet?) {
  const items = ((res && res.items) || []).map(x => {
    const view = VIEW[x.status] || VIEW.requested;
    return {
      id: x.id,
      rev: x.rev,
      date: x.date,
      kind: x.kind,
      sessionId: x.sessionId || null,
      prompt: x.prompt || '',
      answer: x.answer || '',
      decisionNote: x.decisionNote || '',
      status: view.status,
      statusLabel: view.label,
      canAnswer: x.status === 'requested',
      canResubmit: x.status === 'rejected' && x.kind === 'late-checkout' && !!x.sessionId
    };
  });
  const explained = new Set<any>(items.map(x => x.date));
  const absent = (((sheet && sheet.actualReport) || {}).absent || [])
    .filter(date => !explained.has(date))
    .map(date => ({
      id: `absent-${date}`,
      date,
      kind: 'absent',
      sessionId: null,
      prompt: ABSENT_PROMPT,
      decisionNote: '',
      canAnswer: false,
      canResubmit: false,
      canExplain: true
    }));
  return { items, absent, waiting: (res && res.waitingForYou) || 0 };
}
