// Mục lục thiết kế của nhóm admin-main: mỗi file HTML của thiết kế 22/10 một dòng, `to` mở lại đúng màn đó.
const T = '?thang=2026-11';

export default [
  { file: 'tong-quan.html', title: 'Tổng quan', to: `/admin/tong-quan${T}` },
  { file: 'duyet.html', title: 'Yêu cầu · tháng 11', to: `/admin/yeu-cau${T}` },
  { file: 'yc-moi-thang.html', title: 'Yêu cầu · mọi tháng', to: `/admin/yeu-cau/moi-thang${T}` },
  { file: 'dlg-yc-dong-y-5.html', title: 'Hộp thoại · Đồng ý 5 yêu cầu', to: `/admin/yeu-cau${T}&hop=dong-y-5` },
  { file: 'pop-chuong.html', title: 'Bảng nổi · Chuông việc cần xử lý', to: `/admin/tong-quan${T}&hop=chuong` },
  {
    file: 'pop-menu-tai-khoan.html',
    title: 'Bảng nổi · Menu tài khoản',
    to: `/admin/tong-quan${T}&hop=menu-tai-khoan`
  },
  { file: 'dlg-doi-mat-khau.html', title: 'Hộp thoại · Đổi mật khẩu', to: `/admin/tong-quan${T}&hop=doi-mat-khau` }
];
