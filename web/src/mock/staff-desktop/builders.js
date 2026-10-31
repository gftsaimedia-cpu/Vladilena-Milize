// Hàm dựng dữ liệu giả cho màn nhân viên trên máy tính (chỉ dùng trong mock/, thay cho phần máy chủ trả về).
import { dayLong } from '@/utils/format.js';

const pad = n => String(n).padStart(2, '0');
const fmtTime = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const fmtSpan = min => `${Math.floor(min / 60)} giờ ${min % 60} phút`;
const dowOf = (month, d) => new Date(`${month}-${pad(d)}T00:00:00Z`).getUTCDay();

/** Số ngày của tháng 'YYYY-MM'. */
const daysIn = month => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/**
 * Lịch tháng: { lead, days: [{ d, date, kind, tag, tagCls }] }.
 * kind: ok | sun | hol | today | fut | miss | pend | off2. marks: { [ngày]: { kind, tag, small } } ghi đè từng ngày.
 */
export function buildMonth({ month, holidays = [], today = null, todayTag = 'Hôm nay', marks = {} }) {
  const lead = (dowOf(month, 1) + 6) % 7;
  const days = [];
  for (let d = 1; d <= daysIn(month); d++) {
    const day = { d, date: `${month}-${pad(d)}`, kind: 'ok', tag: '', tagCls: '' };
    const mark = marks[d];
    if (dowOf(month, d) === 0) day.kind = 'sun';
    else if (mark) {
      day.kind = mark.kind || 'ok';
      day.tag = mark.tag || '';
      day.tagCls = mark.small ? 'tag' : '';
    } else if (holidays.includes(d)) {
      day.kind = 'hol';
      day.tag = 'Lễ';
    } else if (d === today) {
      day.kind = 'today';
      day.tag = todayTag;
    } else if (today && d > today) day.kind = 'fut';
    days.push(day);
  }
  return { lead, days };
}

/** Dải 7 ngày của khối bên trái (T2 → CN). marks: { [ngày]: 'hol' | 'miss' | 'pend' | 'off' }. */
export function buildWeek({ from = 23, today = 26, marks = { 24: 'hol', 29: 'off' } } = {}) {
  const names = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  return names.map((label, i) => {
    const d = from + i;
    const mark = marks[d] || '';
    const isHoliday = mark === 'hol' || mark === 'pend';
    return { d, label: isHoliday ? 'Lễ' : label, cls: d === today ? 'cur' : mark };
  });
}

/** Chi tiết một ngày khi bấm vào lịch (máy chủ trả; ở đây dựng từ số ngày cho đủ dữ liệu giả). */
export function fakePanel(date, kind) {
  const d = Number(date.slice(8, 10));
  const title = dayLong(date);
  if (kind === 'hol')
    return { title: `${title} · Ngày lễ`, sub: 'Nghỉ lễ theo lịch công ty', pill: null, action: false };
  if (kind === 'miss') {
    return {
      title: `${title} · thiếu Check-in hoặc Check-out`,
      sub: 'Ngày công chờ Admin xử lý',
      pill: { text: 'Thiếu Check-out', cls: 'p-err' },
      action: false
    };
  }
  if (kind === 'today' || kind === 'pend') {
    return { title, sub: 'Chưa có lượt Check-in nào được ghi nhận', pill: null, action: kind === 'today' };
  }
  const inMin = 7 * 60 + 44 + ((d * 7) % 18);
  const outMin = 17 * 60 + ((d * 5) % 12);
  const late = Math.max(0, inMin - 8 * 60);
  return {
    title: `${title} · ${fmtTime(inMin)} → ${fmtTime(outMin)}`,
    sub: `Lượt 1 · ${fmtSpan(outMin - inMin)} có mặt · công ngày này 8 giờ · vào muộn, về sớm ${late} phút`,
    pill: { text: 'Đủ công', cls: 'p-done' },
    action: true
  };
}

/** Một dòng trong khối thu nhập. small: mảng chuỗi hoặc { label, value } (giao diện nối bằng " · "). */
export const row = (label, value, extra = {}) => ({ label, value, ...extra });
