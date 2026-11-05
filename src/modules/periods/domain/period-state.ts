export type PeriodStatus = 'open' | 'attendance_locked' | 'calculated' | 'approved' | 'paid';
export type PeriodAction = 'lock' | 'unlock' | 'approve' | 'unapprove' | 'pay';
export type GateUse = 'punch' | 'recalculate' | 'file' | 'explain' | 'review' | 'holiday';

export interface ApproveBlockers {
  pendingRequests: number;
  unapprovedSlips: number;
  missingSlips: Array<{ username: string; name: string }>;
}

export interface ActionState {
  enabled: boolean;
  reason?: string;
  blockers?: ApproveBlockers;
}

export const STATUS_LABEL: Record<PeriodStatus, string> = {
  open: 'Đang chấm công',
  attendance_locked: 'Đã chốt công',
  calculated: 'Đã tính lương',
  approved: 'Đã phê duyệt',
  paid: 'Đã trả lương',
};

const TRANSITIONS: Record<PeriodStatus, Partial<Record<PeriodAction, PeriodStatus>>> = {
  open: { lock: 'attendance_locked' },
  attendance_locked: { unlock: 'open' },
  calculated: { unlock: 'open', approve: 'approved' },
  approved: { unapprove: 'calculated', pay: 'paid' },
  paid: {},
};

export function nextStatus(from: PeriodStatus, action: PeriodAction): PeriodStatus | null {
  return TRANSITIONS[from][action] ?? null;
}

/** Bảng cổng: kỳ ở trạng thái `status` có cho phép thao tác `use` không. */
export function gateAllows(status: PeriodStatus, use: GateUse): boolean {
  if (status === 'open') return true;
  if (status === 'attendance_locked' || status === 'calculated') return use === 'explain' || use === 'review';
  return false;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${m}/${y}`;
}

/** `today` (YYYY-MM-DD) lớn hơn ngày cuối của tháng. */
export function monthEnded(month: string, today: string): boolean {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return today > `${month}-${String(lastDay).padStart(2, '0')}`;
}

export function approveReason(b: ApproveBlockers): string | undefined {
  const parts: string[] = [];
  if (b.missingSlips.length > 0) parts.push(`${b.missingSlips.length} người chưa có phiếu`);
  if (b.unapprovedSlips > 0) parts.push(`${b.unapprovedSlips} phiếu chưa duyệt`);
  if (b.pendingRequests > 0) parts.push(`${b.pendingRequests} đơn chờ duyệt`);
  return parts.length ? `Còn ${parts.join(' · ')}` : undefined;
}

export function availableActions(i: {
  month: string;
  status: PeriodStatus;
  today: string;
  payday: string;
  blockers: ApproveBlockers | null;
}): Partial<Record<PeriodAction, ActionState>> {
  const out: Partial<Record<PeriodAction, ActionState>> = {};
  switch (i.status) {
    case 'open':
      if (monthEnded(i.month, i.today)) out.lock = { enabled: true };
      break;
    case 'attendance_locked':
      out.unlock = { enabled: true };
      break;
    case 'calculated': {
      out.unlock = { enabled: true };
      const reason = i.blockers ? approveReason(i.blockers) : undefined;
      const approve: ActionState = { enabled: reason === undefined };
      if (reason !== undefined) approve.reason = reason;
      if (i.blockers) approve.blockers = i.blockers;
      out.approve = approve;
      break;
    }
    case 'approved':
      out.unapprove = { enabled: true };
      if (i.today >= i.payday) out.pay = { enabled: true };
      break;
    case 'paid':
      break;
  }
  return out;
}
