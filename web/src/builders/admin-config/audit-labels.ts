// Nhãn tiếng Việt của nhật ký thay đổi: 17 mã việc (spec mục 6) và tên người thực hiện.
export const ACTION_LABELS: Record<string, string> = {
  'param.set': 'Sửa tham số lương',
  'setting.set': 'Sửa cài đặt chung',
  'holiday.add': 'Thêm ngày lễ',
  'holiday.remove': 'Xoá ngày lễ',
  'position.save': 'Sửa chức vụ',
  'level.save': 'Sửa bậc',
  'staff.create': 'Thêm nhân sự',
  'staff.update': 'Sửa nhân sự',
  'staff.delete': 'Xoá nhân sự',
  'password.reset': 'Đặt lại mật khẩu',
  'request.decide': 'Duyệt / từ chối đơn',
  'request.cancel': 'Huỷ đơn',
  'punch.correct': 'Sửa giờ chấm công',
  'period.lock': 'Chốt công',
  'payroll.calculate': 'Tính lương',
  'payroll.decide': 'Quyết định phiếu lương',
  'kpi.score': 'Chấm điểm KPI'
};

// request.decide ghi after.status là APPROVED hoặc REJECTED; thiếu thì hiện nhãn chung của dropdown. Mã lạ hiện nguyên văn.
export function actionLabel(action: string, after?: unknown): string {
  if (action === 'request.decide') {
    const status = after && typeof after === 'object' ? (after as { status?: unknown }).status : undefined;
    if (status === 'APPROVED') return 'Duyệt đơn';
    if (status === 'REJECTED') return 'Từ chối đơn';
  }
  return ACTION_LABELS[action] ?? action;
}

// Có tên thì hiện tên; 'system' hiện "Hệ thống"; còn lại hiện tên đăng nhập.
export function personLabel(username: string, name: string | null): string {
  return name ?? (username === 'system' ? 'Hệ thống' : username);
}
