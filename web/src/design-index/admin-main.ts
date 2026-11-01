// Mục lục thiết kế của nhóm admin-main: mỗi file HTML của thiết kế 22/10 một dòng, `to` mở lại đúng màn đó.
const T = '?thang=2026-11';

export default [
  { file: 'tong-quan.html', title: 'Tổng quan', to: `/admin/tong-quan${T}` },
  { file: 'duyet.html', title: 'Yêu cầu · tháng 11', to: `/admin/yeu-cau${T}` },
  { file: 'yc-moi-thang.html', title: 'Yêu cầu · mọi tháng', to: `/admin/yeu-cau/moi-thang${T}` },
  { file: 'tro-ly-ai.html', title: 'Trợ lý AI · còn thiếu gì trước khi chốt công', to: `/admin/tro-ly-ai${T}` },
  { file: 'ai-nhieu-phep.html', title: 'Trợ lý AI · ai còn nhiều phép', to: `/admin/tro-ly-ai${T}&kb=nhieu-phep` },
  { file: 'dlg-ai-ly-do.html', title: 'Hộp thoại · Lý do AI cảnh báo', to: `/admin/tro-ly-ai${T}&hop=ly-do` },
  { file: 'dlg-yc-dong-y-5.html', title: 'Hộp thoại · Đồng ý 5 yêu cầu', to: `/admin/yeu-cau${T}&hop=dong-y-5` },
  {
    file: 'drw-tq-ly-do-ai.html',
    title: 'Ngăn kéo · Lý do AI (từ Tổng quan)',
    to: `/admin/tong-quan${T}&hop=ly-do-ai`
  },
  { file: 'drw-yc-ly-do-ai.html', title: 'Ngăn kéo · Lý do AI (từ Yêu cầu)', to: `/admin/yeu-cau${T}&hop=ly-do-ai` },
  { file: 'pop-chuong.html', title: 'Bảng nổi · Chuông việc cần xử lý', to: `/admin/tong-quan${T}&hop=chuong` },
  {
    file: 'pop-menu-tai-khoan.html',
    title: 'Bảng nổi · Menu tài khoản',
    to: `/admin/tong-quan${T}&hop=menu-tai-khoan`
  },
  { file: 'dlg-doi-mat-khau.html', title: 'Hộp thoại · Đổi mật khẩu', to: `/admin/tong-quan${T}&hop=doi-mat-khau` }
];
