// Mục lục thiết kế của nhóm payslip: mỗi file HTML của thiết kế 22/10 một dòng, `to` mở lại đúng màn đó.
export default [
  {
    file: 'phieu-t10-chinh-thuc.html',
    title: 'Phiếu lương · tháng 10 chính thức (ngăn kéo)',
    to: '/admin/bang-luong?thang=2026-10&kb=da-phe-duyet&phieu=demo_a_broken'
  },
  {
    file: 'phieu-t10-da-duyet.html',
    title: 'Phiếu lương · tháng 10 đã duyệt (ngăn kéo)',
    to: '/admin/bang-luong?thang=2026-10&kb=da-duyet-50&phieu=demo_a_broken'
  },
  {
    file: 'phieu-t11-tam-tinh.html',
    title: 'Phiếu lương · tháng 11 (ngăn kéo)',
    to: '/admin/bang-luong?thang=2026-11&phieu=demo_a_broken'
  },
  {
    file: 'dlg-t11-ban-in.html',
    title: 'Hộp xem trước bản in A4 một phiếu',
    to: '/admin/bang-luong?thang=2026-11&phieu=demo_a_broken&hop=ban-in'
  },
  {
    file: 'dlg-t10-in-tat-ca.html',
    title: 'Hộp in tất cả phiếu đã phê duyệt',
    to: '/admin/bang-luong?thang=2026-10&kb=da-tra-luong&hop=in-tat-ca'
  },
  {
    file: 'a4-t10-chinh-thuc.html',
    title: 'Bản in A4 · tháng 10 chính thức',
    to: '/in/phieu-luong/2026-10/demo_a_broken'
  },
  { file: 'a4-t11-tam-tinh.html', title: 'Bản in A4 · tháng 11', to: '/in/phieu-luong/2026-11/demo_a_broken' }
];
