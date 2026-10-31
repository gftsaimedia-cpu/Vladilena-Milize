// Mục lục thiết kế của nhóm admin-attendance: [{ file: 'ten-man.html', title: 'Tên màn', to: '/duong-dan?kb=...' }]
const M = 'thang=2026-11';
export default [
  { file: 'cham-cong.html', title: 'Chấm công · Bảng công tháng 11', to: `/admin/cham-cong?${M}` },
  { file: 'cc-hom-nay.html', title: 'Chấm công · Hôm nay', to: `/admin/cham-cong/hom-nay?${M}` },
  { file: 'cc-sua-gio.html', title: 'Chấm công · Sửa giờ', to: `/admin/cham-cong/sua-gio?${M}` },
  { file: 'cc-gio-ot.html', title: 'Chấm công · Giờ OT', to: `/admin/cham-cong/gio-ot?${M}` },
  { file: 'cc-phep-con-lai.html', title: 'Chấm công · Phép còn lại', to: `/admin/cham-cong/phep-con-lai?${M}` },
  { file: 'cc-ca-lam.html', title: 'Chấm công · Ca làm', to: `/admin/cham-cong/ca-lam?${M}` },
  {
    file: 'dlg-cc-chi-tiet-ngay.html',
    title: 'Hộp chi tiết ngày công (mở từ Bảng công)',
    to: `/admin/cham-cong?${M}&hop=chi-tiet-ngay`
  },
  { file: 'nhan-su.html', title: 'Nhân sự', to: `/admin/nhan-su?${M}` },
  { file: 'ns-chua-co-ca.html', title: 'Nhân sự · Lọc chưa có ca', to: `/admin/nhan-su?${M}&loc=chua-co-ca` },
  { file: 'dlg-ns-them.html', title: 'Hộp Thêm nhân sự', to: `/admin/nhan-su?${M}&hop=them` },
  { file: 'drw-ns-sua-ho-so.html', title: 'Ngăn kéo Sửa hồ sơ', to: `/admin/nhan-su?${M}&hop=sua-ho-so` },
  { file: 'kpi.html', title: 'Đánh giá KPI · Nhập điểm', to: `/admin/kpi?${M}` },
  { file: 'kpi-lich-su.html', title: 'Đánh giá KPI · Lịch sử sửa điểm', to: `/admin/kpi/lich-su?${M}` }
];
