// Tên loại yêu cầu và trạng thái duyệt theo mã của máy chủ (sheet.approvals[ngày].item / .status).
export const ITEM_LABEL = {
  isat: 'iSAT',
  approved: 'Nghỉ được duyệt',
  makeup_day: 'Làm bù cả ngày',
  ot: 'OT',
  makeup_hours: 'Làm bù theo giờ',
  holiday_work: 'Đi làm ngày lễ',
  leave: 'Nghỉ phép năm',
  willmakeup: 'Nghỉ, sẽ làm bù'
};
export const HOLIDAY_WORK = 'Đi làm ngày lễ';

// status: lớp màu của thẻ (p-pend, p-done, p-err); label: chữ trên thẻ của điện thoại; desktopLabel: chữ trên thẻ của máy tính
export const STATUS_VIEW = {
  pending: { status: 'pend', label: 'Chờ xử lý', desktopLabel: 'Chờ xử lý' },
  approved: { status: 'done', label: 'Đã đồng ý', desktopLabel: 'Đã duyệt' },
  rejected: { status: 'err', label: 'Đã từ chối', desktopLabel: 'Bị từ chối' }
};

/** Tên của một dòng duyệt: ngày lễ mang mục OT thì gọi là "Đi làm ngày lễ"; mã lạ hiện nguyên mã. */
export const titleOf = (approval?) =>
  approval.holiday ? HOLIDAY_WORK : ITEM_LABEL[approval.item] || String(approval.item || '');
