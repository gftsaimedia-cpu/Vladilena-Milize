// Phần dựng chung cho các kịch bản tháng 11 của nhân viên (ca đêm, CTV, thực tập sinh, quên Check-out, yêu cầu chờ).
import { buildWeek } from './builders.js';
import { REQUEST_CAP } from './common.js';

export const WORKING_PANEL = (time, span) => ({
  title: `Thứ Năm, 26/11 · ${time} → đang làm`,
  sub: `Lượt 1 · ${span} tới giờ này`,
  pill: null,
  action: true
});

export const BH_SPLIT = [
  { label: 'Bảo hiểm xã hội · 8%', value: -480000 },
  { label: 'Bảo hiểm y tế · 1,5%', value: -90000 },
  { label: 'Bảo hiểm thất nghiệp · 1%', value: -60000 }
];

export const workingShift = (enter, early, worked, out) => ({
  status: { text: 'Đang trong ca', tone: 'on' },
  name: 'Normal 1 · 08:00–17:00',
  meta: [[{ t: `Vào ${enter} ` }, { t: `· sớm ${early} phút`, tone: 'dim' }], [{ t: `Đã làm ${worked}` }]],
  cta: { kind: 'out', label: 'Check-out', hint: `· ${out}` }
});

/** Dựng một kịch bản tháng 11 từ phần khác nhau; phần giống nhau lấy mặc định. */
export function scenario({ me, home, profile, attendance, income, requests, panels = {} }) {
  const month = {
    month: '2026-11',
    prev: null,
    next: null,
    attendance: {
      title: 'Chấm công tháng 11',
      cap: { text: 'Chưa tính lương', tone: 'est' },
      defaultDate: '2026-11-26',
      defaultPanel: panels['2026-11-26'] || null,
      ...attendance
    },
    income: { title: 'Thu nhập tháng 11', estimated: true, lock: null, alert: null, links: ['calc'], ...income },
    kpi: null,
    requests: { cap: REQUEST_CAP, items: [], empty: null, ...requests }
  };
  return {
    me,
    home: { week: buildWeek(), recent: null, me: { username: me.username, name: me.name }, ...home },
    profile,
    currentMonth: '2026-11',
    months: { '2026-11': month },
    panels
  };
}

export const profileOf = (me, extra) => ({
  fullName: me.name,
  username: me.username,
  roleLine: me.roleLine,
  account: 'Đang dùng',
  ...extra
});
