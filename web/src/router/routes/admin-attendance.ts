// Route của nhóm admin-attendance: Chấm công (3 tab), Nhân sự, Đánh giá KPI (2 tab). Layout 'admin'.
export default [
  {
    path: '/admin/cham-cong',
    component: () => import('@/views/admin/attendance/AttendanceShell.vue'),
    meta: { layout: 'admin', nav: 'cham-cong', title: 'Chấm công' },
    children: [
      { path: '', component: () => import('@/views/admin/attendance/TimesheetView.vue') },
      { path: 'bang-cong', redirect: (to?) => ({ path: '/admin/cham-cong', query: to.query }) },
      {
        path: 'hom-nay',
        redirect: (to?: any) => ({ path: '/admin/cham-cong', query: { ...to.query, hop: 'hom-nay' } })
      },
      {
        path: 'sua-gio',
        redirect: (to?: any) => ({ path: '/admin/cham-cong', query: { ...to.query, filter: 'pending' } })
      },
      {
        path: 'gio-ot',
        redirect: (to?: any) => ({ path: '/admin/cham-cong', query: { ...to.query, hop: 'duyet-ot' } })
      },
      {
        path: 'phep-con-lai',
        redirect: (to?: any) => ({ path: '/admin/cham-cong', query: to.query })
      },
      {
        path: 'ca-lam',
        redirect: (to?: any) => ({ path: '/admin/nhan-su', query: { ...to.query, loc: 'chua-co-ca' } })
      }
    ]
  },
  {
    path: '/admin/nhan-su',
    component: () => import('@/views/admin/staff/StaffView.vue'),
    meta: { layout: 'admin', nav: 'ho-so', title: 'Nhân sự' }
  },
  {
    path: '/admin/kpi',
    component: () => import('@/views/admin/kpi/KpiShell.vue'),
    meta: { layout: 'admin', nav: 'kpi', title: 'Đánh giá KPI' },
    children: [
      { path: '', component: () => import('@/views/admin/kpi/KpiScoresView.vue') },
      {
        path: 'lich-su',
        component: () => import('@/views/admin/kpi/KpiHistoryView.vue'),
        meta: { title: 'Đánh giá KPI · Lịch sử sửa điểm' }
      }
    ]
  }
];
