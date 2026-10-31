// Bảng công tháng 11/2026: 1/11 là Chủ nhật, lễ 24/11, hôm nay 26/11 (ca đang mở), 27–30 chưa tới.
// Máy chủ trả sẵn dấu của từng ô: ok (đủ công) · w (chờ xử lý) · q (quên Check-in/out) · late (đi trễ, chưa tới mức trừ)
// · lv (xin nghỉ chờ xử lý) · hw (đi làm ngày lễ) · in (đang trong ca). Ô trống = không có khoá.
import { MONTH, hhmm, pad, toMin } from './util.js';
import { ROSTER, personOf } from './roster.js';
import { SHIFTS, shiftLine, shiftOf } from './shifts.js';

export const TODAY = '2026-11-26';
export const HOLIDAYS = ['2026-11-24'];
const SUN = [1, 8, 15, 22, 29];
const HOL = 24;
const NOW = 26;
const day = d => `${MONTH}-${pad(d)}`;

// id → [điều kiện, có mặt, chờ xử lý, ghi chú cạnh tên]
const SPEC = {
  u01: [{ w: [5, 6, 12, 19] }, 16, 4],
  u02: [{ w: [2, 12], noToday: true }, 18, 2],
  u03: [{ w: [9] }, 19, 1],
  u04: [{ w: [5, 7] }, 18, 2],
  u05: [{ w: [4, 12, 13] }, 17, 3],
  u06: [{ w: [2] }, 19, 1],
  u07: [{ q: [12] }, 19, 1],
  u08: [{ noShift: true }, 0, 0],
  u09: [{ from: 16, w: [20] }, 7, 1, 'bắt đầu 16/11'],
  u10: [{ w: [3, 19], hw: true }, 19, 2],
  u11: [{ w: [16] }, 19, 1],
  u12: [{ w: [13, 16, 18], lv: [17], blank: [19] }, 15, 3],
  u13: [{}, 20, 0],
  u14: [{ w: [7] }, 19, 1],
  u15: [{ w: [11] }, 19, 1],
  u16: [{}, 20, 0],
  u17: [{ w: [9, 12] }, 18, 2],
  u18: [{ w: [12, 25], hw: true }, 19, 2],
  u19: [{ w: [3, 4, 5, 6, 9, 10, 12], late: { 11: "5'" } }, 13, 7],
  u20: [{ w: [4, 16] }, 18, 2]
};

function buildCells(o) {
  const cells = {};
  if (o.noShift) return cells;
  for (let d = 1; d <= 30; d++) {
    if (SUN.includes(d) || d > NOW || (o.from && d < o.from) || (o.blank || []).includes(d)) continue;
    if (d === NOW) {
      if (!o.noToday) cells[day(d)] = { k: 'in' };
    } else if (d === HOL) {
      if (o.hw) cells[day(d)] = { k: 'hw' };
    } else if ((o.w || []).includes(d)) cells[day(d)] = { k: 'w' };
    else if ((o.q || []).includes(d)) cells[day(d)] = { k: 'q' };
    else if ((o.lv || []).includes(d)) cells[day(d)] = { k: 'lv' };
    else if (o.late && o.late[d]) cells[day(d)] = { k: 'late', t: o.late[d] };
    else cells[day(d)] = { k: 'ok' };
  }
  return cells;
}

export const TIMESHEET_ROWS = ROSTER.map(p => {
  const [o, present, pending, note] = SPEC[p.id];
  const line = shiftLine(p.shift);
  return {
    id: p.id,
    name: p.name,
    sub: o.noShift ? 'CTV · chưa gán ca' : `CTV · ${note ? `${shiftOf(p.shift).name} · ${note}` : line}`,
    noShift: !!o.noShift,
    cells: buildCells(o),
    present,
    pending
  };
});

export const TIMESHEET_COUNTS = { all: 71, tts: 9, ctv: 23, nv: 38 };

/** Chi tiết một ô ngày (hộp "Bùi Đức Khoa · Thứ Tư 04/11/2026"). Ô bất kỳ khác suy ra từ ca và dấu của ô. */
export function dayDetailOf(personId, date) {
  const p = personOf(personId);
  if (!p) return null;
  const row = TIMESHEET_ROWS.find(r => r.id === personId);
  const cell = row?.cells[date] || null;
  const shift = shiftOf(p.shift);
  const base = {
    personId,
    name: p.name,
    date,
    role: 'Chuyên trách viên',
    shiftLabel: shift ? `ca ${shiftLine(p.shift)}` : 'chưa có ca',
    shiftOptions: [
      { value: '', label: 'Giữ ca đã gán' },
      ...SHIFTS.map(s => ({ value: s.code, label: `${s.name} · ${s.from}–${s.to}` }))
    ]
  };
  if (personId === 'u01' && date === '2026-11-04') {
    return {
      ...base,
      punches: [
        {
          id: 1102,
          status: 'Đã đóng',
          closed: true,
          checkIn: '07:56',
          checkOut: '17:06',
          lateMin: 0,
          ot: '—',
          result: 'Đủ công'
        }
      ]
    };
  }
  if (!cell || !shift) return { ...base, punches: [] };
  const start = toMin(shift.from);
  const end = toMin(shift.to) + (shift.nextDay ? 1440 : 0);
  const mk = (inMin, outMin, late, result, closed = true) => ({
    id: 1000 + Number(date.slice(8)) * 11 + Number(personId.slice(1)),
    status: closed ? 'Đã đóng' : 'Đang mở',
    closed,
    checkIn: hhmm(inMin),
    checkOut: outMin == null ? null : hhmm(outMin),
    lateMin: late,
    ot: '—',
    result
  });
  const kinds = {
    ok: () => [mk(start - 4, end + 6, 0, 'Đủ công')],
    hw: () => [mk(start - 4, end + 6, 0, 'Đi làm ngày lễ')],
    late: () => [mk(start + parseInt(cell.t, 10), end + 6, parseInt(cell.t, 10), 'Đủ công')],
    w: () => [mk(start + 18, end + 2, 18, 'Chờ xử lý')],
    q: () => [mk(start - 3, null, 0, 'Quên Check-in/out', false)],
    in: () => [mk(start - 3, null, 0, 'Đang trong ca', false)],
    lv: () => []
  };
  return { ...base, punches: kinds[cell.k]() };
}
