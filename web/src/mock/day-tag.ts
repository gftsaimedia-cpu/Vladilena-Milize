// Nhãn ngày giả, cùng dạng với `tag` mà BE dựng (calendar/domain/day-tag.ts). Suy từ loại ô của dữ liệu giả; không tính nghiệp vụ.
import type { DayTag, PlanCode, ReviewCode } from '../builders/api/day-tag';

const PLAN_LABEL: Record<PlanCode, string> = {
  work: 'Ngày làm',
  ot: 'Làm thêm (OT)',
  makeup: 'Làm bù',
  holiday: 'Nghỉ lễ',
  leave_paid: 'Nghỉ có lương',
  leave_unpaid: 'Nghỉ không lương',
  leave_makeup: 'Nghỉ có làm bù',
  isat: 'Nghỉ iSAT',
  rest: 'Không có ca',
  outside: 'Ngoài thời gian làm việc'
};
const REVIEW_LABEL: Record<ReviewCode, string> = {
  none: '',
  valid: 'Hợp lệ',
  needs_explanation: 'Cần giải trình',
  pending: 'Giải trình chờ duyệt',
  approved: 'Giải trình được duyệt',
  rejected: 'Giải trình bị từ chối',
  expired: 'Quá hạn giải trình'
};

/** Ngày giả có đơn nghỉ chờ duyệt / bị từ chối / đã huỷ (đơn không giữ ngày, nên chỉ hiện ở nhãn). */
const MOCK_REQUEST_DAYS: Record<string, 'pend' | 'rej' | 'cancel'> = { '2026-10-30': 'pend', '2026-10-31': 'rej', '2026-10-29': 'cancel' };

/** `kind` là loại ô của dữ liệu giả ('work' | 'late' | 'leave' | 'absent' | 'todo' | 'off' | 'fu' | 'nocheck' | 'future'). */
export function mockTag(kind: string, date = '', shift = 'HC 08:00–17:00'): DayTag {
  const req = MOCK_REQUEST_DAYS[date];
  const plan: PlanCode = kind === 'leave' ? 'leave_paid' : kind === 'off' ? 'rest' : 'work';
  const review: ReviewCode =
    kind === 'work' ? 'valid' : kind === 'late' || kind === 'absent' ? 'needs_explanation' : kind === 'todo' ? 'pending' : 'none';
  const shiftText = plan === 'work' ? shift : null;
  const reviewLabel = REVIEW_LABEL[review];
  const declined = req === 'rej' || req === 'cancel' ? { status: req === 'rej' ? ('rejected' as const) : ('cancelled' as const), text: req === 'rej' ? 'Đơn nghỉ bị từ chối' : 'Đơn nghỉ đã huỷ' } : null;
  const pendingText = req === 'pend' ? 'Đơn nghỉ chờ duyệt' : '';
  const text = [PLAN_LABEL[plan], shiftText, reviewLabel, pendingText, declined?.text ?? ''].filter(Boolean).join(' · ');
  return { plan, planLabel: PLAN_LABEL[plan], shift: shiftText, extras: [], review, reviewLabel, requestPending: req === 'pend', declined, text };
}
