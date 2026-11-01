// Mục lục thiết kế của nhóm admin-payroll: Bảng lương và các hộp thoại của kỳ lương, mở đúng kịch bản.
// prettier-ignore
export default [
  { file: 'luong.html', title: 'Bảng lương · tháng 11 chưa tính lương', to: '/admin/bang-luong?thang=2026-11' },
  { file: 'bl-t11-du-cot.html', title: 'Bảng lương · tháng 11 xem đủ cột', to: '/admin/bang-luong?thang=2026-11&kb=du-cot' },
  { file: 'bl-t10-tam-tinh.html', title: 'Bảng lương · tháng 10', to: '/admin/bang-luong?thang=2026-10&kb=tam-tinh' },
  { file: 'bl-t10-da-chot-cong.html', title: 'Bảng lương · tháng 10 đã chốt công', to: '/admin/bang-luong?thang=2026-10&kb=da-chot-cong' },
  { file: 'bl-t10-cho-phe-duyet.html', title: 'Bảng lương · tháng 10 chờ phê duyệt', to: '/admin/bang-luong?thang=2026-10&kb=cho-phe-duyet' },
  { file: 'bl-t10-chon-phieu.html', title: 'Bảng lương · tháng 10 chọn phiếu để phê duyệt', to: '/admin/bang-luong?thang=2026-10&kb=chon-phieu' },
  { file: 'bl-t10-da-duyet-50.html', title: 'Bảng lương · tháng 10 đã phê duyệt 50 phiếu', to: '/admin/bang-luong?thang=2026-10&kb=da-duyet-50' },
  { file: 'bl-t10-can-tinh-lai.html', title: 'Bảng lương · tháng 10 cần tính lại', to: '/admin/bang-luong?thang=2026-10&kb=can-tinh-lai' },
  { file: 'bl-t10-da-phe-duyet.html', title: 'Bảng lương · tháng 10 đã phê duyệt kỳ lương', to: '/admin/bang-luong?thang=2026-10&kb=da-phe-duyet' },
  { file: 'bl-t10-da-tra-luong.html', title: 'Bảng lương · tháng 10 đã trả lương', to: '/admin/bang-luong?thang=2026-10&kb=da-tra-luong' },
  { file: 'dlg-t10-chot-cong.html', title: 'Hộp Chốt công tháng 10', to: '/admin/bang-luong?thang=2026-10&kb=tam-tinh&hop=chot-cong' },
  { file: 'dlg-t10-tinh-luong.html', title: 'Hộp Tính lương tháng 10', to: '/admin/bang-luong?thang=2026-10&kb=da-chot-cong&hop=tinh-luong' },
  { file: 'dlg-t10-phe-duyet-50.html', title: 'Hộp Phê duyệt 50 phiếu', to: '/admin/bang-luong?thang=2026-10&kb=chon-phieu&hop=phe-duyet-50' },
  { file: 'dlg-t10-phe-duyet-ky-bi-chan.html', title: 'Hộp Phê duyệt kỳ lương · còn 18 phiếu chưa duyệt', to: '/admin/bang-luong?thang=2026-10&kb=da-duyet-50&hop=phe-duyet-ky' },
  { file: 'dlg-t10-phe-duyet-ky-con-1.html', title: 'Hộp Phê duyệt kỳ lương · còn 1 phiếu chưa duyệt', to: '/admin/bang-luong?thang=2026-10&kb=can-tinh-lai&hop=phe-duyet-ky' },
  { file: 'dlg-t10-da-tra-luong.html', title: 'Hộp Đánh dấu đã trả lương', to: '/admin/bang-luong?thang=2026-10&kb=da-phe-duyet&hop=da-tra-luong' },
  { file: 'dlg-t11-chot-cong.html', title: 'Hộp Chốt công tháng 11', to: '/admin/bang-luong?thang=2026-11&hop=chot-cong' },
  { file: 'dlg-t11-them-khoan.html', title: 'Hộp Thêm khoản cộng/trừ', to: '/admin/bang-luong?thang=2026-11&hop=them-khoan' }
];
