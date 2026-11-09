import type { Day } from './day';

/**
 * Nhãn của một ngày cho màn hình: MỘT định nghĩa dùng chung cho lịch Admin và lịch nhân viên (FE chỉ hiển thị).
 * Hai phần độc lập: `plan` = ngày này là ngày gì (lịch + đơn đã duyệt), `review` = kết quả chấm công đã hợp lệ chưa.
 */
export type PlanCode =
  | 'work'
  | 'ot'
  | 'makeup'
  | 'holiday'
  | 'leave_paid'
  | 'leave_unpaid'
  | 'leave_makeup'
  | 'isat'
  | 'rest'
  | 'outside';

/** none = chưa có gì để xét · valid = hợp lệ · needs_explanation = cần giải trình · pending = giải trình chờ duyệt ·
 *  approved = giải trình được duyệt · rejected = giải trình bị từ chối · expired = quá hạn giải trình. */
export type ReviewCode = 'none' | 'valid' | 'needs_explanation' | 'pending' | 'approved' | 'rejected' | 'expired';

export interface DayExtra {
  code: 'ot' | 'makeup' | 'half' | 'shift_change';
  text: string;
}

export interface DayTag {
  plan: PlanCode;
  planLabel: string;
  /** 'HC 08:00–17:00'; null khi không phải ngày làm. */
  shift: string | null;
  extras: DayExtra[];
  review: ReviewCode;
  reviewLabel: string;
  /** Có đơn chờ duyệt (nghỉ, đổi ca, nửa ca…) đè lên ngày này: viền vàng. */
  requestPending: boolean;
  /** Đơn của ngày bị từ chối hoặc huỷ và ngày chưa có lần chấm công nào: viền đỏ. Có chấm công rồi thì bỏ, nhãn trở về ngày đi làm. */
  declined: { status: 'rejected' | 'cancelled'; text: string } | null;
  /** Một dòng đủ ý, cho tên truy cập và chú thích. */
  text: string;
}

/** Kết quả chấm công của ngày (phần của `DaySummary` mà việc xét cần). */
export interface DayResult {
  explanationStatus: 'none' | 'pending' | 'approved' | 'rejected' | 'expired';
  cases: ReadonlyArray<{ affectsPay: boolean }>;
  /** Ngày có mặt làm việc (đi làm, muộn, cần xử lý, làm thêm). */
  worked: boolean;
  /** Ngày đã có lần chấm công (giờ vào). */
  checkedIn: boolean;
}

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

export const REVIEW_LABEL: Record<ReviewCode, string> = {
  none: '',
  valid: 'Hợp lệ',
  needs_explanation: 'Cần giải trình',
  pending: 'Giải trình chờ duyệt',
  approved: 'Giải trình được duyệt',
  rejected: 'Giải trình bị từ chối',
  expired: 'Quá hạn giải trình'
};

const SHIFT_NAME = { NORMAL: 'HC', FLEX: 'Linh hoạt', NIGHT: 'Đêm' } as const;
const hm = (t: string) => t.slice(0, 5);

function planOf(day: Day): PlanCode {
  switch (day.kind) {
    case 'WORK':
      return 'work';
    case 'EXTRA':
      return day.windows.some(w => w.kind === 'OT') ? 'ot' : 'makeup';
    case 'LEAVE_PAID':
      return 'leave_paid';
    case 'LEAVE_UNPAID':
      return 'leave_unpaid';
    case 'LEAVE_MAKEUP':
      return 'leave_makeup';
    case 'ISAT':
      return 'isat';
    case 'HOLIDAY':
      return 'holiday';
    case 'REST':
      return 'rest';
    default:
      return 'outside';
  }
}

function reviewOf(day: Day, r: DayResult): ReviewCode {
  if (!day.hasWorkTime) return 'none';
  const affects = r.cases.some(c => c.affectsPay);
  if (affects) {
    if (r.explanationStatus === 'pending' || r.explanationStatus === 'approved' || r.explanationStatus === 'rejected' || r.explanationStatus === 'expired') {
      return r.explanationStatus;
    }
    return day.isOver ? 'needs_explanation' : 'none';
  }
  return day.isOver && r.worked ? 'valid' : 'none';
}

const CLAIM_WORD: Record<string, string> = {
  LEAVE: 'nghỉ',
  LEAVE_MAKEUP: 'nghỉ có làm bù',
  ISAT: 'iSAT',
  HALF_SHIFT: 'nghỉ giữa ca',
  SHIFT_CHANGE: 'đổi ca',
  OT_WINDOW: 'làm thêm',
  MAKEUP_WINDOW: 'làm bù'
};

/** Nhãn của một ngày: `day` do lịch quyết, `result` là kết quả chấm công và giải trình của ngày đó. */
export function tagOf(day: Day, result: DayResult): DayTag {
  const plan = planOf(day);
  const shift = day.shift ? `${SHIFT_NAME[day.shift.type]} ${hm(day.shift.start)}–${hm(day.shift.end)}` : null;
  const extras: DayExtra[] = day.windows.map(w =>
    w.kind === 'OT'
      ? { code: 'ot' as const, text: `OT ${hm(w.start)}–${hm(w.end)}` }
      : { code: 'makeup' as const, text: `Làm bù ${hm(w.start)}–${hm(w.end)}` }
  );
  if (day.half) extras.push({ code: 'half', text: 'Nửa ca' });
  if (day.claims.some(c => c.kind === 'SHIFT_CHANGE' && c.status === 'APPROVED')) extras.push({ code: 'shift_change', text: 'Đổi ca' });
  const review = reviewOf(day, result);
  const requestPending = day.pending.length > 0;
  const gone = result.checkedIn ? null : day.declined;
  const declined = gone
    ? { status: gone.status === 'CANCELLED' ? ('cancelled' as const) : ('rejected' as const), text: `Đơn ${CLAIM_WORD[gone.kind] ?? ''} ${gone.status === 'CANCELLED' ? 'đã huỷ' : 'bị từ chối'}`.replace('  ', ' ') }
    : null;
  const pendingText = requestPending ? `Đơn ${CLAIM_WORD[day.pending[0].kind] ?? ''} chờ duyệt`.replace('  ', ' ') : '';
  const parts = [PLAN_LABEL[plan], shift, ...extras.map(e => e.text), REVIEW_LABEL[review], pendingText, declined?.text ?? ''].filter(Boolean);
  return { plan, planLabel: PLAN_LABEL[plan], shift, extras, review, reviewLabel: REVIEW_LABEL[review], requestPending, declined, text: parts.join(' · ') };
}
