'use strict';
// Lịch của kịch bản: ngày lễ chính thức 2026–2027 (nhập qua PUT /api/holidays), giờ sáu ca, ngày làm theo loại nhân sự, hàm ngày.
// Đây là dữ liệu đầu vào của kịch bản; ứng dụng không đọc file này.

// Ngày lễ Việt Nam: Tết Dương lịch, Tết Nguyên đán (5 ngày nghỉ quanh Mùng 1), Giỗ Tổ 10/3 âm (rơi Chủ nhật thì nghỉ bù thứ Hai),
// 30/4, 1/5, Quốc khánh 2/9 kèm một ngày liền kề. Ngày âm lịch theo trăng mới giờ Việt Nam: Mùng 1 Tết 17/02/2026 và 06/02/2027,
// 10/3 âm năm Bính Ngọ là 26/04/2026 (Chủ nhật, nghỉ bù 27/04), năm Đinh Mùi là 16/04/2027.
const HOLIDAYS = {
  '2026-01-01': 'Tết Dương lịch',
  '2026-02-16': 'Tết Nguyên đán (29 Tết, ngày cuối năm âm)',
  '2026-02-17': 'Tết Nguyên đán (Mùng 1)',
  '2026-02-18': 'Tết Nguyên đán (Mùng 2)',
  '2026-02-19': 'Tết Nguyên đán (Mùng 3)',
  '2026-02-20': 'Tết Nguyên đán (Mùng 4)',
  '2026-04-27': 'Giỗ Tổ Hùng Vương (nghỉ bù)',
  '2026-04-30': 'Ngày Giải phóng miền Nam',
  '2026-05-01': 'Quốc tế Lao động',
  '2026-09-01': 'Quốc khánh (ngày liền kề)',
  '2026-09-02': 'Quốc khánh',
  '2027-01-01': 'Tết Dương lịch',
  '2027-02-05': 'Tết Nguyên đán (29 Tết)',
  '2027-02-06': 'Tết Nguyên đán (Mùng 1)',
  '2027-02-08': 'Tết Nguyên đán (Mùng 3)',
  '2027-02-09': 'Tết Nguyên đán (Mùng 4)',
  '2027-02-10': 'Tết Nguyên đán (nghỉ bù Mùng 2)',
  '2027-04-16': 'Giỗ Tổ Hùng Vương',
  '2027-04-30': 'Ngày Giải phóng miền Nam',
  '2027-05-01': 'Quốc tế Lao động',
  '2027-09-02': 'Quốc khánh',
  '2027-09-03': 'Quốc khánh (ngày liền kề)'
};
const HOLIDAY_DATES = Object.keys(HOLIDAYS).sort();

// Giờ ca theo mã danh mục (giống bảng ca mặc định của ứng dụng)
const SHIFTS = {
  Normal1: { in: '08:00', out: '17:00', kind: 'normal' },
  Normal2: { in: '10:00', out: '19:00', kind: 'normal' },
  Flex1: { in: '06:00', out: '15:00', kind: 'flex' },
  Flex2: { in: '13:00', out: '22:00', kind: 'flex' },
  Night1: { in: '21:00', out: '06:00', kind: 'night' },
  Night2: { in: '22:00', out: '07:00', kind: 'night' }
};
// Ngày làm theo loại: NV và CTV thứ Hai–thứ Bảy, TTS thứ Hai–thứ Sáu (0 = Chủ nhật)
const TYPE_DOWS = { nv: [1, 2, 3, 4, 5, 6], ctv: [1, 2, 3, 4, 5, 6], tts: [1, 2, 3, 4, 5] };

const DAY_MS = 86400000;
const dateMs = (d?) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const msDate = (ms?) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d?, n?) => msDate(dateMs(d) + n * DAY_MS);
const dow = (d?) => new Date(dateMs(d)).getUTCDay();
const monthOf = (d?) => d.slice(0, 7);
function* daysBetween(from?, to?) {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}
const addMinutes = (hhmm?, n?) => {
  const t = (+hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5) + n + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const toMin = (hhmm?) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
const nextMonth = (m?) => {
  const y = +m.slice(0, 4),
    mo = +m.slice(5, 7);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};
const monthsBetween = (from?, to?) => {
  const out: any[] = [];
  for (let m = from; m <= to; m = nextMonth(m)) out.push(m);
  return out;
};
const isHoliday = (d?) => Object.hasOwn(HOLIDAYS, d);
// Ngày làm việc của loại nhân sự (không tính ngày lễ)
const isWorkday = (type?, d?) => TYPE_DOWS[type].includes(dow(d)) && !isHoliday(d);
// Ngày làm việc thứ n của tháng (thứ Hai–thứ Bảy, không lễ)
function nthWorkday(month?, n?) {
  let count = 0;
  for (const d of daysBetween(`${month}-01`, `${month}-28`)) if (isWorkday('nv', d) && ++count === n) return d;
  throw new Error(`Không có ngày làm việc thứ ${n} của ${month}`);
}
// Ngày làm việc kế tiếp sau d (thứ Hai–thứ Bảy, không lễ)
function nextWorkday(d?) {
  let x = addDays(d, 1);
  while (!isWorkday('nv', x)) x = addDays(x, 1);
  return x;
}
// Lùi n ngày làm việc trước d
function workdaysBefore(d?, n?) {
  let x = d;
  for (let i = 0; i < n; i++) {
    x = addDays(x, -1);
    while (!isWorkday('nv', x)) x = addDays(x, -1);
  }
  return x;
}

module.exports = {
  HOLIDAYS,
  HOLIDAY_DATES,
  SHIFTS,
  TYPE_DOWS,
  addDays,
  dow,
  monthOf,
  daysBetween,
  addMinutes,
  toMin,
  nextMonth,
  monthsBetween,
  isHoliday,
  isWorkday,
  nthWorkday,
  nextWorkday,
  workdaysBefore
};
