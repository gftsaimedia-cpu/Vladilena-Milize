// Tạm ứng của tôi từ GET /advance-approvals?month=: số tiền do máy chủ tính (nhân viên chỉ bấm xin, không nhập số).
import { STATUS_VIEW } from './catalog';

/** item: trạng thái yêu cầu của tháng (status null = chưa xin). window: các ngày được tạo yêu cầu và hôm nay có phải một trong số đó không. */
export function buildAdvance(res?) {
  const item = (res && res.item) || {};
  const view = item.status ? STATUS_VIEW[item.status] : null;
  const days = res && res.window && Array.isArray(res.window.days) ? res.window.days : [];
  return {
    month: res.month,
    rev: item.rev,
    amount: item.amount,
    eligible: !!item.eligible,
    reason: item.reason || '',
    open: !!(res.window && res.window.open),
    days,
    status: view ? view.status : null,
    statusLabel: view ? view.label : '',
    note: item.note || '',
    canRequest: !!item.eligible && !item.status,
    canWithdraw: item.status === 'pending'
  };
}
