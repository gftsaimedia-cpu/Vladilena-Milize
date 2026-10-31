// Mảnh dữ liệu dùng chung giữa các kịch bản của màn nhân viên trên máy tính.
export const CURRENT_MONTH = '2026-11';
export const TODAY = '2026-11-26';

const LEGEND_TEXT = {
  ok: 'Đủ công',
  hol: 'Ngày lễ',
  today: 'Hôm nay',
  miss: 'Thiếu Check-in/out',
  pend: 'Chờ xử lý',
  off2: 'Thứ Bảy nghỉ (lịch T2 – T6)',
  fut: 'Chưa tới'
};
export const LEGEND_HINT = { text: 'Bấm vào một ngày để xem giờ vào, ra' };

/** Chú thích dưới lịch: các ô màu theo thứ tự keys, rồi dòng gợi ý. */
export const legend = (keys = ['ok', 'hol', 'today', 'fut']) => [
  ...keys.map(key => ({ swatch: key, text: LEGEND_TEXT[key] })),
  LEGEND_HINT
];

const act = (icon, label, extra = {}) => ({ icon, label, ...extra });
/** Các nút trong khối "Yêu cầu". leaveHint: "còn 17 ngày" (không có thì nút không kèm chữ phụ). */
export const requestActions = leaveHint => [
  act('cal', 'Xin nghỉ phép năm', leaveHint ? { hint: leaveHint } : {}),
  act('clock', 'Khai OT hoặc làm bù'),
  act('edit', 'Khai một ngày khác'),
  act('history', 'Sửa giờ chấm công', { soon: true })
];

export const REQUEST_CAP = 'Gửi trước 03/12 cho tháng 11';
export const EST_NOTE = days =>
  `Tính trên ${days} ngày công đến 26/11 · chưa phải lương chính thức · phiếu chính thức gửi ngày 10/12`;

export const KPI_WAIT = { label: 'Lương KPI', small: ['Chờ chấm đủ 5 điểm'], value: 0, tone: 'muted' };

/** Chữ trên ô "Bật vị trí" của lúc chưa Check-in. */
export const LOCATION_NOTE =
  'Bật vị trí khi Check-in: bạn phải ở trong vùng chấm công. Vị trí chỉ dùng để kiểm tra lúc bấm, không được lưu.';
