// Nhãn ngày do BE dựng (calendar/domain/day-tag.ts), dùng chung cho lịch Admin và lịch nhân viên. FE chỉ hiển thị.
export type PlanCode = 'work' | 'ot' | 'makeup' | 'holiday' | 'leave_paid' | 'leave_unpaid' | 'leave_makeup' | 'isat' | 'rest' | 'outside';
export type ReviewCode = 'none' | 'valid' | 'needs_explanation' | 'pending' | 'approved' | 'rejected' | 'expired';
export type DayTag = {
  plan: PlanCode;
  planLabel: string;
  shift: string | null;
  extras: { code: 'ot' | 'makeup' | 'half' | 'shift_change'; text: string }[];
  review: ReviewCode;
  reviewLabel: string;
  requestPending: boolean;
  text: string;
};

/** Chữ viết tắt trên ô ngày; ngày làm thường và ngày không có ca không cần chữ. */
export const PLAN_SHORT: Record<PlanCode, string> = {
  work: '',
  ot: 'OT',
  makeup: 'Bù',
  holiday: 'Lễ',
  leave_paid: 'P',
  leave_unpaid: 'KL',
  leave_makeup: 'NB',
  isat: 'iS',
  rest: '',
  outside: ''
};
export const EXTRA_SHORT = { ot: 'OT', makeup: 'Bù', half: '½', shift_change: 'Ca' } as const;
export const REVIEW_GLYPH: Record<ReviewCode, string> = {
  none: '',
  valid: '✓',
  needs_explanation: '!',
  pending: '…',
  approved: '✓✓',
  rejected: '✕',
  expired: '⊘'
};

/** Chú giải: mỗi dòng một dấu và nghĩa của nó. */
export const PLAN_LEGEND: { code: PlanCode; label: string }[] = [
  { code: 'ot', label: 'Làm thêm (OT)' },
  { code: 'makeup', label: 'Làm bù' },
  { code: 'holiday', label: 'Nghỉ lễ' },
  { code: 'leave_paid', label: 'Nghỉ có lương' },
  { code: 'leave_unpaid', label: 'Nghỉ không lương' },
  { code: 'leave_makeup', label: 'Nghỉ có làm bù' },
  { code: 'isat', label: 'Nghỉ iSAT' }
];
export const REVIEW_LEGEND: { code: ReviewCode; label: string }[] = [
  { code: 'valid', label: 'Hợp lệ' },
  { code: 'needs_explanation', label: 'Cần giải trình' },
  { code: 'pending', label: 'Giải trình chờ duyệt' },
  { code: 'approved', label: 'Giải trình được duyệt' },
  { code: 'rejected', label: 'Giải trình bị từ chối' },
  { code: 'expired', label: 'Quá hạn giải trình' }
];
