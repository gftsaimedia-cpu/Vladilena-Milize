// Hàm thuần dùng chung của các builder nhân viên điện thoại: giờ Việt Nam, nhãn chấm công, danh sách tháng.
const VN_OFFSET = 7 * 3600000;
const pad = (n?) => String(n).padStart(2, '0');

/** Ngày YYYY-MM-DD theo giờ Việt Nam của một mốc ISO. */
export const vnDate = (iso?) => new Date(Date.parse(iso) + VN_OFFSET).toISOString().slice(0, 10);
/** Giờ HH:mm theo giờ Việt Nam của một mốc ISO. */
export const vnTime = (iso?) => new Date(Date.parse(iso) + VN_OFFSET).toISOString().slice(11, 16);
/** "X giờ Y phút" từ số phút (dưới 1 giờ thì chỉ "Y phút"). */
export function hoursText(totalMin?) {
  const m = Math.max(0, Math.round(totalMin));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} phút`;
  return r ? `${h} giờ ${r} phút` : `${h} giờ`;
}
export const minutesBetween = (fromIso?, toIso?) => Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000);
/** Chữ cái đầu của hai từ cuối của tên. */
export function initialsOf(name?) {
  const w = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = w.length > 1 ? w[w.length - 2][0] : '';
  return (first + (w[w.length - 1] || '')[0] || '').toUpperCase();
}

// Sáu nhãn chấm công theo mã trạng thái của máy chủ; cls là lớp màu của thẻ nhãn.
export const STATUS_LABELS = {
  'checked-in': { label: 'Đã Check-in', cls: 'live' },
  'checked-out': { label: 'Đã Check-out', cls: 'p-done' },
  pending: { label: 'Chờ xử lý', cls: 'p-draft' },
  approved: { label: 'Được phê duyệt', cls: 'p-done' },
  rejected: { label: 'Bị từ chối', cls: 'p-draft' },
  admin: { label: 'Đã chấm công (Admin)', cls: 'p-done' }
};
export const statusOf = (s?) => STATUS_LABELS[s && s.status] || { label: '', cls: 'p-draft' };

/** Các tháng từ tháng bắt đầu làm tới tháng hiện tại, tăng dần. */
export function monthsBetween(startMonth?, currentMonth?) {
  const out: any[] = [];
  let [y, m] = (startMonth && startMonth <= currentMonth ? startMonth : currentMonth).split('-').map(Number);
  const [cy, cm] = currentMonth.split('-').map(Number);
  while (y < cy || (y === cy && m <= cm)) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
export function neighbors(list?, month?) {
  const i = list.indexOf(month);
  return { prevMonth: i > 0 ? list[i - 1] : null, nextMonth: i >= 0 && i < list.length - 1 ? list[i + 1] : null };
}
export const daysInMonth = (month?) => new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
export const dowOf = (iso?) => new Date(iso + 'T00:00:00Z').getUTCDay();

/** Tên ca "Normal 1 · 08:00–17:00" (ca qua đêm thêm "hôm sau"). */
export function shiftName(shifts?, code?) {
  const s = shifts && shifts[code];
  if (!s) return '';
  return `${s.name} · ${s.start}–${s.end}${s.end <= s.start ? ' hôm sau' : ''}`;
}
