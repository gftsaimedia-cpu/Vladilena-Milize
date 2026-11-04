// Menu con của Cài đặt (theo cd.js của bản HTML): [nhóm, [khoá, biểu tượng, nhãn, đường dẫn]].
export const SETTINGS_NAV: any[] = [
  [
    'Lương',
    [
      ['cong-thuc', 'grid', 'Cách tính lương', '/admin/cai-dat'],
      ['quyen-loi', 'gift', 'Chế độ theo loại', '/admin/cai-dat/che-do'],
      ['chuc-vu', 'users', 'Chức vụ và bậc', '/admin/cai-dat/chuc-vu-bac']
    ]
  ],
  [
    'Vận hành',
    [
      ['lich', 'cal', 'Lịch, ca & chấm công', '/admin/cai-dat/lich'],
      ['kpi5', 'target', 'Quy tắc KPI', '/admin/cai-dat/kpi']
    ]
  ],
  [
    'Kiểm soát',
    [
      ['phan-quyen', 'shield', 'Phân quyền', '/admin/cai-dat/phan-quyen'],
      ['nhat-ky', 'history', 'Nhật ký thay đổi', '/admin/cai-dat/nhat-ky']
    ]
  ],
  ['Tra cứu', [['tat-ca', 'search', 'Tất cả cài đặt', '/admin/cai-dat/tat-ca']]]
];

// This is the actual data rendered by AdminSidebar; tests exercise the same hierarchy.
export const ADMIN_SIDEBAR_GROUPS = [
  [
    null,
    [['tong-quan', 'grid', 'Tổng quan', '/admin/tong-quan']]
  ],
  [
    'Kỳ lương',
    [
      ['cham-cong', 'clock', 'Chấm công', '/admin/cham-cong'],
      ['luong', 'cash', 'Bảng lương', '/admin/bang-luong']
    ]
  ],
  ['Đội ngũ', [['ho-so', 'file', 'Nhân sự', '/admin/nhan-su']]]
];

// Đường dẫn dùng lại ở nhiều màn (liên kết chéo)
export const PATHS = {
  congThuc: '/admin/cai-dat',
  cheDo: '/admin/cai-dat/che-do',
  lich: '/admin/cai-dat/lich',
  kpi: '/admin/cai-dat/kpi',
  canhBao: '/admin/cai-dat/canh-bao',
  vaiTro: '/admin/cai-dat/phan-quyen',
  taiKhoan: '/admin/cai-dat/phan-quyen/tai-khoan',
  xuLyYeuCau: '/admin/cai-dat/phan-quyen/xu-ly-yeu-cau',
  nhatKy: '/admin/cai-dat/nhat-ky',
  tatCa: '/admin/cai-dat/tat-ca',
  bangLuong: '/admin/bang-luong'
};
