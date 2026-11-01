// Thanh kỳ lương trên đầu mọi màn Admin, dựng từ GET /periods/:month.
// Mỗi bước: [trạng thái 'done' | 'cur' | '', nhãn]; bước hiện tại là bước kế tiếp của trạng thái kỳ.

const STEP_LABELS = ['Chấm công', 'Chốt công', 'Tính lương', 'Phê duyệt', 'Trả lương'];
const RANK = { open: 1, attendance_locked: 2, calculated: 3, reviewed: 4, approved: 5, paid: 6 };
const STATE_LABEL = {
  open: 'Chưa tính lương',
  attendance_locked: 'Đã chốt công',
  calculated: 'Bản nháp',
  reviewed: 'Chờ phê duyệt',
  approved: 'Đã phê duyệt',
  paid: 'Đã trả lương'
};
const FINAL = ['approved', 'paid'];

export function monthTitle(month?) {
  return `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`;
}

/** Thanh khi chưa tải được kỳ: chỉ có tên tháng. */
export function emptyStrip(month?) {
  return { month: monthTitle(month), state: '', stateCls: '', steps: [] };
}

/** period: phản hồi GET /periods/:month. */
export function buildStrip(month?, period?) {
  const labels = STEP_LABELS;
  let cur = RANK[period.status] ?? 1;
  if (cur >= 4) cur -= 1;
  const base = STATE_LABEL[period.status] || '';
  return {
    month: monthTitle(month),
    state: period.needsRecalculate ? `${base} · cần tính lại` : base,
    stateCls: FINAL.includes(period.status)
      ? 'ok'
      : period.status === 'calculated' || period.status === 'reviewed'
        ? 'draft'
        : '',
    steps: labels.map((label, i) => [i < cur ? 'done' : i === cur ? 'cur' : '', label])
  };
}
