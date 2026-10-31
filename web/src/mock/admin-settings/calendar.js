// Dữ liệu giả: Cài đặt › Lịch, ca & chấm công.
// Ngày lễ: from/to dạng 'YYYY-MM-DD' (to = from khi chỉ một ngày). Tên ngày lễ chỉ có khi người dùng tự thêm.
export const CALENDAR = {
  year: 2026,
  startDay: 1, // ngày bắt đầu tính công hằng tháng
  payDay: 10, // ngày trả lương của tháng sau
  holidays: [
    { id: 'h1', from: '2026-01-01', to: '2026-01-01', name: '' },
    { id: 'h2', from: '2026-02-14', to: '2026-02-14', name: '' },
    { id: 'h3', from: '2026-02-16', to: '2026-02-21', name: '' },
    { id: 'h4', from: '2026-04-27', to: '2026-04-27', name: '' },
    { id: 'h5', from: '2026-04-30', to: '2026-05-01', name: '' },
    { id: 'h6', from: '2026-09-01', to: '2026-09-02', name: '' },
    { id: 'h7', from: '2026-11-24', to: '2026-11-24', name: '' }
  ],
  checkin: { appFrom: '2026-10-01', hoursFrom: '2026-11-01' },
  // type: 'Normal' | 'Flex' | 'Night' · nextDay: giờ ra sang hôm sau
  shifts: [
    { name: 'Normal 1', start: '08:00', end: '17:00', type: 'Normal', nextDay: false },
    { name: 'Normal 2', start: '10:00', end: '19:00', type: 'Normal', nextDay: false },
    { name: 'Flex 1', start: '06:00', end: '15:00', type: 'Flex', nextDay: false },
    { name: 'Flex 2', start: '13:00', end: '22:00', type: 'Flex', nextDay: false },
    { name: 'Night 1', start: '21:00', end: '06:00', type: 'Night', nextDay: true },
    { name: 'Night 2', start: '22:00', end: '07:00', type: 'Night', nextDay: true }
  ],
  zone: { radius: 150, lat: null, lng: null }
};
