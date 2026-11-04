// Route của nhóm admin-payroll: Bảng lương và các bước của kỳ lương.
// ?thang=YYYY-MM tháng · ?phieu=<mã nhân viên> ngăn kéo phiếu lương.
export default [
  {
    path: '/admin/bang-luong',
    component: () => import('@/views/admin/payroll/PayrollView.vue'),
    meta: { layout: 'admin', nav: 'luong', title: 'Bảng lương' }
  },
  { path: '/admin/kpi', redirect: (to: any) => ({ path: '/admin/bang-luong', query: to.query }) },
  { path: '/admin/kpi/lich-su', redirect: (to: any) => ({ path: '/admin/bang-luong', query: to.query }) }
];
