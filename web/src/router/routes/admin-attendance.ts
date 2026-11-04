// Route của nhóm admin-attendance: Chấm công (một màn theo tuần), Nhân sự. Layout 'admin'.
// Các đường dẫn cũ của Chấm công chuyển hướng về màn tuần, giữ query.
const toWeek = (extra: Record<string, string> = {}) => (to: any) => ({
  path: '/admin/cham-cong',
  query: { ...to.query, ...extra }
});

export default [
  {
    path: '/admin/cham-cong',
    component: () => import('@/views/admin/attendance/AttendanceWeekView.vue'),
    meta: { layout: 'admin', nav: 'cham-cong', title: 'Chấm công' }
  },
  {
    path: '/admin/cham-cong/nhan-vien/:id',
    component: () => import('@/views/admin/attendance/AttendanceEmployeeView.vue'),
    meta: { layout: 'admin', nav: 'cham-cong', title: 'Hồ sơ chấm công' }
  },
  { path: '/admin/cham-cong/bang-cong', redirect: toWeek() },
  { path: '/admin/cham-cong/hom-nay', redirect: toWeek() },
  { path: '/admin/cham-cong/phep-con-lai', redirect: toWeek() },
  { path: '/admin/cham-cong/sua-gio', redirect: toWeek({ xem: 'can-xu-ly' }) },
  { path: '/admin/cham-cong/gio-ot', redirect: toWeek({ xem: 'can-xu-ly' }) },
  {
    path: '/admin/cham-cong/ca-lam',
    redirect: (to?: any) => ({ path: '/admin/nhan-su', query: { ...to.query, loc: 'chua-co-ca' } })
  },
  {
    path: '/admin/nhan-su',
    component: () => import('@/views/admin/staff/StaffView.vue'),
    meta: { layout: 'admin', nav: 'ho-so', title: 'Nhân sự' }
  }
];
