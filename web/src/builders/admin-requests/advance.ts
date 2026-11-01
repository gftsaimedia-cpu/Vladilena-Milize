import { vndc } from '@/utils/format';

// Yêu cầu tạm ứng của GET /advance-approvals?month= → dòng của bảng Yêu cầu. Số tiền do máy chủ tính.
const STATUS = {
  pending: ['p-pend', 'Chờ xử lý'],
  approved: ['p-done', 'Đã đồng ý'],
  rejected: ['p-err', 'Đã từ chối']
};

export function buildAdvanceRows(res?) {
  const month = res && res.month;
  const items = ((res && res.items) || []).map(x => {
    const st = STATUS[x.status] || STATUS.pending;
    return {
      id: x.username,
      username: x.username,
      rev: x.rev,
      name: x.name,
      type: x.username,
      position: '',
      date: x.requestedAt ? x.requestedAt.slice(0, 10) : '',
      month,
      kind: 'Tạm ứng',
      amount: x.amount,
      detail: x.eligible ? vndc(x.amount) : [vndc(x.amount), x.reason].filter(Boolean).join(' · '),
      sentAt: x.requestedAt,
      status: x.status,
      pillClass: st[0],
      statusLabel: st[1],
      note: x.note || '',
      canApprove: x.status === 'pending' && !!x.eligible,
      canReject: x.status === 'pending',
      canCancel: x.status === 'approved'
    };
  });
  return { month, rev: res ? res.rev : 0, pending: (res && res.pending) || 0, items };
}
