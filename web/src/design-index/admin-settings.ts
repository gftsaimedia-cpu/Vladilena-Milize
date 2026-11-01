// Mục lục thiết kế của nhóm admin-settings: [{ file: 'ten-man.html', title: 'Tên màn', to: '/duong-dan?kb=...' }]
const B = '/admin/cai-dat';

export default [
  { file: 'cai-dat.html', title: 'Cài đặt · Cách tính lương', to: B },
  { file: 'cd-quyen-loi.html', title: 'Cài đặt · Chế độ theo loại · Thực tập sinh', to: `${B}/che-do` },
  {
    file: 'cd-che-do-ctv.html',
    title: 'Cài đặt · Chế độ theo loại · Chuyên trách viên',
    to: `${B}/che-do/chuyen-trach`
  },
  { file: 'cd-che-do-nv.html', title: 'Cài đặt · Chế độ theo loại · Nhân viên', to: `${B}/che-do/nhan-vien` },
  { file: 'cd-lich.html', title: 'Cài đặt · Lịch, ca & chấm công', to: `${B}/lich` },
  { file: 'cd-kpi5.html', title: 'Cài đặt · Đánh giá KPI', to: `${B}/kpi` },
  { file: 'cd-phan-quyen.html', title: 'Cài đặt · Phân quyền · Vai trò', to: `${B}/phan-quyen` },
  { file: 'cd-tai-khoan.html', title: 'Cài đặt · Phân quyền · Tài khoản', to: `${B}/phan-quyen/tai-khoan` },
  { file: 'cd-quy-tac-duyet.html', title: 'Cài đặt · Phân quyền · Xử lý yêu cầu', to: `${B}/phan-quyen/xu-ly-yeu-cau` },
  { file: 'cd-nhat-ky.html', title: 'Cài đặt · Nhật ký thay đổi', to: `${B}/nhat-ky` },
  { file: 'cd-tat-ca.html', title: 'Cài đặt · Tất cả cài đặt', to: `${B}/tat-ca` },
  { file: 'drw-cd-luong-ngay-cong.html', title: 'Ngăn kéo · Lương theo ngày công', to: `${B}?hop=luong-ngay-cong` },
  { file: 'drw-cd-lam-them.html', title: 'Ngăn kéo · Tiền làm thêm giờ', to: `${B}?hop=lam-them` },
  { file: 'drw-cd-phu-cap.html', title: 'Ngăn kéo · Phụ cấp', to: `${B}?hop=phu-cap` },
  { file: 'drw-cd-luong-kpi.html', title: 'Ngăn kéo · Lương KPI', to: `${B}?hop=luong-kpi` },
  { file: 'drw-cd-khau-tru.html', title: 'Ngăn kéo · Khấu trừ đi muộn, về sớm', to: `${B}?hop=khau-tru` },
  { file: 'drw-cd-tam-ung.html', title: 'Ngăn kéo · Tạm ứng', to: `${B}?hop=tam-ung` },
  {
    file: 'dlg-cd-doi-ngay-checkin.html',
    title: 'Hộp thoại · Đổi ngày bắt đầu Check-in',
    to: `${B}/lich?hop=doi-ngay-checkin`
  },
  { file: 'dlg-cd-them-ngay-le.html', title: 'Hộp thoại · Thêm ngày lễ', to: `${B}/lich?hop=them-ngay-le` },
  { file: 'dlg-cd-tao-vai-tro.html', title: 'Hộp thoại · Tạo vai trò', to: `${B}/phan-quyen?hop=tao-vai-tro` },
  { file: 'dlg-cd-them-che-do.html', title: 'Hộp thoại · Thêm chế độ phụ cấp', to: `${B}/che-do?hop=them-che-do` },
  { file: 'dlg-cd-them-chuc-vu.html', title: 'Hộp thoại · Thêm chức vụ', to: `${B}/tat-ca?hop=them-chuc-vu` }
];
