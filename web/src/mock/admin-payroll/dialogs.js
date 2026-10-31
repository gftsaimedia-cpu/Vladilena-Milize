// Dữ liệu giả cho các hộp thoại của kỳ lương: việc còn lại trước khi chốt công, khoản cộng/trừ thêm.

// Việc còn lại trước khi chốt công.
// tone: 'err' | 'pend' | 'draft' (màu số đếm)
// mode: 'block' không bỏ qua được | 'skip' bỏ qua được kèm lý do | 'info' chỉ để biết
export const CLOSE_CHECKS = {
  '2026-10': {
    sub: 'Còn 2 việc trước khi khoá bảng công',
    items: [
      { id: 'req', n: 40, tone: 'pend', label: 'Yêu cầu chờ xử lý', mode: 'skip' },
      { id: 'nostart', n: 1, tone: 'pend', label: 'Nhân sự thiếu ngày bắt đầu làm', mode: 'skip' }
    ],
    blockedNote: ''
  },
  '2026-11': {
    sub: 'Còn 5 việc trước khi khoá bảng công, 1 mục để biết',
    items: [
      { id: 'open-month', n: 1, tone: 'err', label: 'Tháng 11 chưa kết thúc · hết ngày 30/11', mode: 'block' },
      { id: 'open-checkin', n: 57, tone: 'err', label: 'Lượt Check-in còn đang mở', mode: 'block' },
      { id: 'forgot', n: 3, tone: 'pend', label: 'Ngày quên Check-in/out chờ xử lý', mode: 'skip' },
      { id: 'req', n: 8, tone: 'pend', label: 'Yêu cầu chờ xử lý', mode: 'skip' },
      { id: 'nostart', n: 1, tone: 'pend', label: 'Nhân sự thiếu ngày bắt đầu làm', mode: 'skip' },
      { id: 'noshift', n: 2, tone: 'draft', label: 'Nhân sự chưa có ca cố định', mode: 'info' }
    ],
    blockedNote: 'Còn 2 việc không bỏ qua được nên chưa chốt công được. Sớm nhất là từ 01/12.'
  }
};

// Khoản cộng/trừ thêm trong tháng (tháng 10 chưa có khoản nào). status: pending | approved | rejected | cancelled
export const EXTRAS = { '2026-10': [], '2026-11': [] };

// Danh sách chọn người nhận khoản (tên và tên đăng nhập)
export const EXTRA_PEOPLE = [
  { username: 'demo_a_broken', name: 'Lương Minh My' },
  { username: 'demo_a_nhat_vy', name: 'Võ Nhật Vy' },
  { username: 'demo_a_gia_hieu', name: 'Ngô Gia Hiếu' },
  { username: 'demo_a_thu_tri', name: 'Kiều Thu Trí' },
  { username: 'demo_a_ot_check', name: 'Hoàng Quang Châu' },
  { username: 'demo_a_nhat_mai', name: 'Mai Nhật Mai' },
  { username: 'demo_a_my_khoa', name: 'Dương Mỹ Khoa' },
  { username: 'demo_a_nhat_chau', name: 'Nguyễn Nhật Châu' },
  { username: 'demo_a_minh_quynh', name: 'Chu Minh Quỳnh' },
  { username: 'demo_a_phuong_quynh', name: 'Kiều Phương Quỳnh' },
  { username: 'demo_a_hong_binh', name: 'Hoàng Hồng Bình' },
  { username: 'demo_a_ngoc_ha', name: 'Đặng Ngọc Hà' }
];
