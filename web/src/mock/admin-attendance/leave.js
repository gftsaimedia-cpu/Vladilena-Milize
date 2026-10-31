// Tab "Phép còn lại": phép năm tính đến 26/11/2026 (ngày). tag: adj · neg · zero · null.
import { ROSTER } from './roster.js';

// id → [được cộng, đã dùng, điều chỉnh, còn lại, nhãn, ghi chú cạnh tên]
const L = {
  u01: [18, 0, 0, 18],
  u02: [18, 0, 0, 18],
  u03: [2, 0, 0, 2, null, 'vào làm 15/10/2026'],
  u04: [17, 0, 0, 17],
  u05: [18, 0, 0, 18],
  u06: [17, 8, 60, 69, 'adj'],
  u07: [17, 0, 0, 17],
  u08: [17, 2, 0, 15],
  u09: [1, 2, 0, -1, 'neg', 'vào làm 16/11/2026'],
  u10: [17, 0, 0, 17],
  u11: [17, 0, 0, 17],
  u12: [6, 6, 0, 0, 'zero'],
  u13: [17, 0, 0, 17],
  u14: [4, 0, 0, 4],
  u15: [17, 0, 0, 17],
  u16: [17, 0, 0, 17],
  u17: [18, 0, 0, 18],
  u18: [18, 0, 0, 18],
  u19: [18, 0, 0, 18],
  u20: [17, 0, 0, 17]
};

export const LEAVE_INFO = { asOf: '2026-11-26', counts: { all: 61, neg: 2 }, total: 61 };

export const LEAVE_ROWS = ROSTER.map(p => {
  const [granted, used, adjust, left, tag, note] = L[p.id];
  return { id: p.id, name: p.name, sub: note ? `CTV · ${note}` : 'CTV', granted, used, adjust, left, tag: tag || null };
});
