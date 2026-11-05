// Route của nhóm payslip: trang in phiếu lương A4 (layout 'blank'). Ngăn kéo phiếu và hộp in mở từ màn Bảng lương
// (/admin/bang-luong, nhóm admin-payroll), không có route riêng.
//   ?in=1  tự mở hộp in của trình duyệt khi phiếu dựng xong
export default [
  {
    path: '/in/phieu-luong/:month/:id',
    name: 'payslip-print',
    component: () => import('@/views/print/PayslipPrint.vue'),
    meta: { layout: 'blank', title: 'Phiếu lương A4' }
  },
  {
    path: '/in/phieu-luong/:month',
    name: 'payslip-print-all',
    component: () => import('@/views/print/PayslipPrint.vue'),
    meta: { layout: 'blank', title: 'In tất cả phiếu lương' }
  }
];
