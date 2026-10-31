// Dữ liệu nhỏ của nhóm Chấm công: tiêu đề chung, tab Ca làm, hai tab chưa có dữ liệu.
import { SHIFTS } from './shifts.js';

export const ATTENDANCE_SUMMARY = {
  forgot: 3,
  deadline: '03/12',
  reconcile: 106,
  late: 1,
  closeFrom: '01/12',
  inShift: 57
};

export const SHIFT_OVERVIEW = {
  assigned: 68,
  shifts: SHIFTS.map(s => ({
    code: s.code,
    name: s.name,
    hours: `${s.from} – ${s.to}${s.nextDay ? ' hôm sau' : ''}`,
    type: s.type,
    count: s.count
  })),
  unassigned: [
    { username: 'demo_locked_clean', name: 'Lương Quang Khôi', sub: 'CTV · Practitioner' },
    { username: 'demo_over_hours', name: 'Đặng Tuấn Giang', sub: 'NV' }
  ]
};
