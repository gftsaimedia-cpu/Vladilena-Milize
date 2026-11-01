// Giải trình của GET /explanations → dòng của bảng Yêu cầu (cột Nhân sự, Loại yêu cầu, Chi tiết, Kết quả).
const KIND = {
  'late-checkout': 'Check-out muộn',
  'punch-in': 'Check-in',
  'punch-out': 'Check-out',
  admin: 'Giải trình ngày',
  ai: 'Giải trình ngày'
};
// Trạng thái máy chủ → thẻ: requested (chờ nhân viên trả lời), answered (chờ Admin), approved, rejected
const STATUS = {
  requested: ['p-pend', 'Chờ nhân viên trả lời'],
  answered: ['p-pend', 'Chờ xử lý'],
  approved: ['p-done', 'Đã đồng ý'],
  rejected: ['p-err', 'Đã từ chối']
};

/** Số giải trình đang chờ Admin quyết (trạng thái answered); month ('YYYY-MM') thì chỉ tính ngày thuộc tháng đó. */
export function countWaiting(items?, month?) {
  return (items || []).filter(x => x.status === 'answered' && (!month || String(x.date).slice(0, 7) === month)).length;
}

/** Giải trình có ngày thuộc tháng month cùng mọi giải trình còn chờ Admin quyết (kể cả tháng khác); ngày cũ trước. */
export function buildExplanationRows(res?, month?) {
  const items = ((res && res.items) || [])
    .filter(x => !month || String(x.date).slice(0, 7) === month || x.status === 'answered')
    .sort((a: any, b: any) => a.date.localeCompare(b.date) || a.id - b.id)
    .map(x => {
      const st = STATUS[x.status] || STATUS.requested;
      return {
        id: x.id,
        rev: x.rev,
        name: x.name,
        type: x.username,
        position: '',
        date: x.date,
        kind: KIND[x.kind] || KIND.admin,
        detail: x.answer || x.prompt || '',
        sentAt: x.answeredAt || x.requestedAt,
        status: x.status,
        pillClass: st[0],
        statusLabel: st[1],
        note: x.decisionNote || '',
        canApprove: x.status === 'answered' || x.status === 'rejected',
        canReject: x.status === 'answered' || x.status === 'approved'
      };
    });
  return { items, waiting: items.filter(x => x.status === 'answered').length };
}
