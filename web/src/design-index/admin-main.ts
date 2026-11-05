// Mục lục thiết kế của nhóm admin-main: mỗi file HTML của thiết kế 22/10 một dòng, `to` mở lại đúng màn đó.
const T = '?thang=2026-11';

export default [
  { file: 'tong-quan.html', title: 'Tổng quan', to: `/admin/tong-quan${T}` },
  { file: 'pop-chuong.html', title: 'Bảng nổi · Chuông việc cần xử lý', to: `/admin/tong-quan${T}&hop=chuong` },
  {
    file: 'pop-menu-tai-khoan.html',
    title: 'Bảng nổi · Menu tài khoản',
    to: `/admin/tong-quan${T}&hop=menu-tai-khoan`
  },
  { file: 'dlg-doi-mat-khau.html', title: 'Hộp thoại · Đổi mật khẩu', to: `/admin/tong-quan${T}&hop=doi-mat-khau` }
];
