// Đích của các nút trỏ sang nhóm màn khác (đường dẫn của nhóm Cài đặt, Yêu cầu, Bảng lương).
export const LINKS = {
  settings: '/admin/cai-dat',
  shifts: '/admin/cai-dat/lich', // Cài đặt › Lịch, ca & chấm công
  kpiRules: '/admin/cai-dat/kpi', // Cài đặt › Đánh giá KPI
  auditLog: '/admin/cai-dat/nhat-ky', // Cài đặt › Nhật ký thay đổi
  requests: '/admin/yeu-cau',
  payroll: '/admin/bang-luong'
};

/** Hồ sơ chấm công của một nhân viên. */
export const employeePath = (id: string) => `/admin/cham-cong/nhan-vien/${id}`;
