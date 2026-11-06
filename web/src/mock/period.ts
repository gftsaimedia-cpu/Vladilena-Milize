import type { PeriodView } from '@/builders/api/period';
import { MOCK_MONTH } from './clock';
import { payrollView } from './payroll';

// Trạng thái kỳ giả theo cùng dạng GET /system/periods/:month: tháng hiện tại ở "Đã tính" (chờ phê duyệt), tháng trước đã trả.
// Phiếu chưa duyệt đếm từ bảng lương giả; test đặt `demo.unapproved` để mở khoá nút Phê duyệt kỳ.
export const demo: { unapproved?: number } = {};

export type MockStatus = PeriodView['status'];
export const initialStatus = (month: string): MockStatus => (month === MOCK_MONTH ? 'calculated' : 'paid');

export function periodView(month: string, status: MockStatus = initialStatus(month)): PeriodView {
  const at = '2026-10-28T02:40:00.000Z';
  const step = (from: MockStatus[]) => (from.includes(status) ? at : null);
  const actions: PeriodView['actions'] = {};
  if (status === 'calculated') {
    const c = payrollView(month).counts;
    const unapproved = demo.unapproved ?? (c ? c.draft + c.pending + c.rejected : 0);
    const blockers = { pendingRequests: 0, unapprovedSlips: unapproved, missingSlips: [] };
    actions.unlock = { enabled: true };
    actions.approve = unapproved
      ? { enabled: false, reason: `Còn ${unapproved} phiếu chưa duyệt`, blockers }
      : { enabled: true, blockers };
  } else if (status === 'approved') {
    actions.unapprove = { enabled: true };
  }
  return {
    month,
    status,
    steps: {
      lockedAt: step(['attendance_locked', 'calculated', 'approved', 'paid']),
      calculatedAt: step(['calculated', 'approved', 'paid']),
      approvedAt: step(['approved', 'paid']),
      paidAt: step(['paid'])
    },
    payday: '2026-11-10',
    actions
  };
}
