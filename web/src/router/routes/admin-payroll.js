// Route của nhóm admin-payroll: Bảng lương và các bước của kỳ lương.
// ?thang=YYYY-MM tháng · ?kb= trạng thái · ?hop= hộp thoại mở sẵn · ?phieu=<username> ngăn kéo phiếu lương.
export default [
  {
    path: '/admin/bang-luong',
    component: () => import('@/views/admin/payroll/PayrollView.vue'),
    meta: { layout: 'admin', nav: 'luong', title: 'Bảng lương' }
  }
];
