// Mục lục thiết kế của nhóm admin-attendance: [{ file: 'ten-man.html', title: 'Tên màn', to: '/duong-dan?kb=...' }]
const M = 'thang=2026-11';
// Chấm công, chuông và hồ sơ chấm công có dữ liệu giả của tháng 10/2026; tháng 11 chưa có nên các dòng đó dùng A, không dùng M.
const A = 'thang=2026-10';
export default [
  { file: 'cham-cong.html', title: 'Chấm công · Bảng công tháng 10', to: `/admin/cham-cong?${A}` },
  { file: 'cc-hom-nay.html', title: 'Chấm công · Hôm nay', to: `/admin/cham-cong/hom-nay?${A}` },
  { file: 'cc-sua-gio.html', title: 'Chấm công · Sửa giờ', to: `/admin/cham-cong/sua-gio?${A}` },
  { file: 'cc-gio-ot.html', title: 'Chấm công · Giờ OT', to: `/admin/cham-cong/gio-ot?${A}` },
  { file: 'cc-phep-con-lai.html', title: 'Chấm công · Phép còn lại', to: `/admin/cham-cong/phep-con-lai?${A}` },
  { file: 'cc-ca-lam.html', title: 'Chấm công · Ca làm', to: `/admin/cham-cong/ca-lam?${A}` },
  {
    file: 'dlg-cc-chi-tiet-ngay.html',
    title: 'Hộp chi tiết ngày công (mở từ Bảng công)',
    to: `/admin/cham-cong?${A}&hop=chi-tiet-ngay&nv=le-hoang-nam&ngay=2026-10-27`
  },
  { file: 'drw-thong-bao.html', title: 'Ngăn kéo Thông báo (chuông)', to: `/admin/tong-quan?${A}&hop=chuong` },
  {
    file: 'cc-ho-so.html',
    title: 'Chấm công · Hồ sơ chấm công một nhân viên',
    to: `/admin/cham-cong/nhan-vien/le-hoang-nam?${A}`
  },
  { file: 'nhan-su.html', title: 'Nhân sự', to: `/admin/nhan-su?${M}` },
  { file: 'drw-ns-ho-so.html', title: 'Ngăn kéo Hồ sơ nhân sự · Hoàng Thị Mai', to: '/admin/nhan-su?nv=hoang-thi-mai' }
];
