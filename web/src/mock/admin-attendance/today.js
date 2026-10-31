// Tab "Hôm nay" 26/11/2026: lượt Check-in/out mới nhất của từng người (cập nhật 12:15).
import { ROSTER } from './roster.js';
import { shiftLine } from './shifts.js';

// id → [giờ vào, giờ ra, phút trễ, trạng thái, số lượt]  (trạng thái: in · soon · none)
const T = {
  u01: ['07:57', null, 0, 'in', 1],
  u02: [null, null, 0, 'soon', 0],
  u03: ['07:56', null, 0, 'in', 1],
  u04: ['09:58', null, 0, 'in', 1],
  u05: ['07:58', null, 0, 'in', 1],
  u06: ['07:58', null, 0, 'in', 1],
  u07: ['08:04', null, 4, 'in', 1],
  u08: [null, null, 0, 'none', 0],
  u09: ['07:52', null, 0, 'in', 1],
  u10: ['07:54', null, 0, 'in', 1],
  u11: ['05:48', null, 0, 'in', 1],
  u12: ['07:59', null, 0, 'in', 1],
  u13: ['07:46', null, 0, 'in', 1],
  u14: ['09:50', null, 0, 'in', 1],
  u15: ['07:46', null, 0, 'in', 1],
  u16: ['10:03', null, 3, 'in', 1],
  u17: ['07:47', null, 0, 'in', 1],
  u18: ['07:51', null, 0, 'in', 1],
  u19: ['07:53', null, 0, 'in', 1],
  u20: ['05:54', null, 0, 'in', 1]
};

export const TODAY_INFO = { date: '2026-11-26', updatedAt: '12:15', counts: { all: 71, in: 57 } };

export const TODAY_ROWS = ROSTER.map(p => {
  const [checkIn, checkOut, lateMin, status, count] = T[p.id];
  return {
    id: p.id,
    name: p.name,
    sub: 'CTV',
    shiftLabel: shiftLine(p.shift),
    checkIn,
    checkOut,
    lateMin,
    status,
    count
  };
});
