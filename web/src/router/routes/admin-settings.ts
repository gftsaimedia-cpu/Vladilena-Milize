// Route của nhóm admin-settings: mọi trang Cài đặt nằm dưới /admin/cai-dat, dùng vỏ Admin, mục "Cài đặt" sáng trên thanh bên.
// Menu con và các thẻ nhỏ (loại nhân sự, vai trò/tài khoản/xử lý yêu cầu) mỗi mục một địa chỉ riêng.
const meta = (title?) => ({ layout: 'admin', nav: 'cai-dat', title: `Cài đặt · ${title}` });

export default [
  {
    path: '/admin/cai-dat',
    component: () => import('@/views/admin/settings/PayFormulaView.vue'),
    meta: meta('Cách tính lương')
  },
  {
    path: '/admin/cai-dat/che-do/:loai(chuyen-trach|nhan-vien)?',
    component: () => import('@/views/admin/settings/BenefitsView.vue'),
    meta: meta('Chế độ theo loại nhân sự')
  },
  {
    path: '/admin/cai-dat/chuc-vu-bac',
    component: () => import('@/views/admin/settings/PositionsView.vue'),
    meta: meta('Chức vụ và bậc')
  },
  {
    path: '/admin/cai-dat/lich',
    component: () => import('@/views/admin/settings/CalendarView.vue'),
    meta: meta('Lịch, ca & chấm công')
  },
  {
    path: '/admin/cai-dat/kpi',
    component: () => import('@/views/admin/settings/KpiRulesView.vue'),
    meta: meta('Đánh giá KPI')
  },
  // Ma trận vai trò chỉ có ở dữ liệu giả: BE v2 chỉ có hai vai trò cố định (admin, staff) và chưa có API sửa. Với BE thật, địa chỉ
  // này đưa thẳng sang Tài khoản (tab Vai trò đã ẩn) thay vì một màn luôn báo lỗi.
  __MOCK__
    ? {
        path: '/admin/cai-dat/phan-quyen',
        component: () => import('@/views/admin/settings/PermRolesView.vue'),
        meta: meta('Phân quyền · Vai trò')
      }
    : { path: '/admin/cai-dat/phan-quyen', redirect: '/admin/cai-dat/phan-quyen/tai-khoan' },
  {
    path: '/admin/cai-dat/phan-quyen/tai-khoan',
    component: () => import('@/views/admin/settings/PermAccountsView.vue'),
    meta: meta('Phân quyền · Tài khoản')
  },
  // Xử lý yêu cầu chưa có API ở BE v2 (bảng v1 /settings/params đã bỏ): địa chỉ cũ đưa về Vai trò.
  { path: '/admin/cai-dat/phan-quyen/xu-ly-yeu-cau', redirect: __MOCK__ ? '/admin/cai-dat/phan-quyen' : '/admin/cai-dat/phan-quyen/tai-khoan' },
  {
    path: '/admin/cai-dat/nhat-ky',
    component: () => import('@/views/admin/settings/AuditLogView.vue'),
    meta: meta('Nhật ký thay đổi')
  },
  {
    path: '/admin/cai-dat/tat-ca',
    component: () => import('@/views/admin/settings/AllSettingsView.vue'),
    meta: meta('Tất cả cài đặt')
  }
];
