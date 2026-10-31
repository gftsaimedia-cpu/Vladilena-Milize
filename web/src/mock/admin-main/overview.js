// Dữ liệu giả: phần cố định của Tổng quan (phần theo yêu cầu/cảnh báo do server.js ghép từ trạng thái hiện tại).
export const OVERVIEW = {
  month: '2026-11',
  closeOn: '2026-12-03',
  daysLeft: 7,
  blockers: {
    cap: 'Tháng công 01/11 – 30/11',
    note: 'Tháng 11 hết ngày 30/11 · từ 01/12 mới chốt công được',
    // blocking: việc chặn chốt công. Dòng "requests" được server.js điền count và sub theo yêu cầu đang chờ.
    rows: [
      {
        key: 'requests',
        blocking: true,
        count: 0,
        title: 'Yêu cầu chờ xử lý',
        sub: '',
        action: { label: 'Xử lý yêu cầu', to: '/admin/yeu-cau' }
      },
      {
        key: 'forgot',
        blocking: true,
        count: 3,
        title: 'Ngày quên Check-in/out chờ xử lý',
        sub: 'Sửa giờ, hoặc tick Bỏ qua khi chốt công',
        action: { label: 'Sửa giờ', to: '/admin/cham-cong/sua-gio' }
      },
      {
        key: 'start',
        blocking: true,
        count: 1,
        title: 'Nhân sự thiếu ngày bắt đầu làm',
        sub: 'Chưa xác định được ngày công chuẩn',
        action: { label: 'Mở hồ sơ', to: '/admin/nhan-su' }
      },
      {
        key: 'open',
        blocking: false,
        count: 57,
        title: 'Lượt Check-in còn đang mở',
        sub: 'Tự đóng khi nhân sự Check-out, bạn không cần làm gì',
        action: { label: 'Xem hôm nay', to: '/admin/cham-cong' }
      },
      {
        key: 'noshift',
        blocking: false,
        count: 2,
        title: 'Nhân sự chưa có ca cố định',
        sub: 'Không chặn chốt công, nhưng chưa tính được giờ làm',
        action: { label: 'Gán ca', to: '/admin/nhan-su' }
      }
    ]
  },
  // money: số đồng; of: mẫu số; est: số chưa chốt (nét gạch chân đứt)
  kpis: [
    {
      key: 'fund',
      label: 'Quỹ lương tháng 11',
      money: 404461658,
      est: true,
      note: '68 phiếu · 2 phiếu chưa tính được'
    },
    { key: 'net', label: 'Thực nhận tháng 11', money: 229760025, est: true, note: 'Sau tạm ứng', noteMoney: 136779731 },
    { key: 'staff', label: 'Nhân sự đang làm việc', value: 69, note: 'TTS 9 · CTV 22 · NV 37 · 1 chưa xếp loại' },
    { key: 'attend', label: 'Còn giữ phụ cấp chuyên cần', value: 35, of: 37, note: 'Trên 37 nhân viên (NV)' }
  ],
  upcoming: [
    { date: '2026-11-30', title: 'Hết tháng công 11', sub: '' },
    { date: '2026-12-03', title: 'Hạn chốt công', sub: 'Nhân sự hoàn tất chấm công trước ngày này' },
    { date: '2026-12-10', title: 'Trả lương tháng 11', sub: 'Gửi phiếu lương cho nhân sự' },
    { date: '2026-12-16', title: 'Tạm ứng giữa tháng 12', sub: 'Từ 16/12 đến 20/12' }
  ]
};
