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
      ['kpi5', 'target', 'Đánh giá KPI', '/admin/cai-dat/kpi']
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
  danhGiaKpi: '/admin/kpi'
};
