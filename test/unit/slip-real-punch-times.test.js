'use strict';
// Giờ bấm thật trên dòng ngày của phiếu (punchIn / punchOut, giờ Việt Nam HH:MM, null khi thiếu bên đó):
//   - ActualHours.apply ghi hai trường vào ngày hiệu lực, bộ máy chuyển sang snapshot.rows; tiền, giờ làm, phút cắt không đổi;
//   - ngày dùng lượt nào thì lấy giờ của lượt đó: lượt Admin khai thay (sheet.onBehalf) là giờ đã khai, lượt thật thắng lượt Admin;
//   - ca đêm: giờ ra là giờ đồng hồ của sáng hôm sau; quên Check-out chỉ có giờ vào; vắng không có giờ nào;
//   - bản chụp cũ chưa có hai trường: máy chủ lấy lúc đọc từ attendance_sessions (lib/slip-paid.js → withDayFigures) và so bản chụp
//     (verify) không tính hai trường này.
process.env.DB_PATH = process.env.DB_PATH || ':memory:';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../public/punch.js');
const Engine = require('../../public/payroll-engine.js');
const ActualHours = require('../../public/actual-hours.js');
const { DEFAULTS } = require('../../public/payroll-params.js');
const { AdminPresence } = require('../../lib/domain/attendance/admin-presence.js');
const store = require('../../lib/db');
const { withDayFigures, withoutPunchTimes } = require('../../lib/slip-paid.js');
const { declaredPunches } = require('../helpers/declared-punches');

const MONTH = '2026-10';
const ASOF = '2026-11-02T12:00:00+07:00';
const DAY = { username: 'qa_nv', type: 'nv', level: 1, startDate: '2025-01-06', shiftCode: 'Normal1' };
const NIGHT = {
  username: 'qa_night',
  type: 'nv',
  level: 1,
  nightPct: 40,
  startDate: '2025-01-06',
  shiftCode: 'Night2'
};
const who = staff => ({ shiftCode: staff.shiftCode, sched: [1, 2, 3, 4, 5, 6] });
const vn = (date, hm, plus = 0) => {
  const d = new Date(Date.parse(date + 'T00:00:00Z') + plus * 86400000).toISOString().slice(0, 10);
  return new Date(`${d}T${hm}:00+07:00`).toISOString();
};
let nextId = 1;
const session = (staff, date, entry, state = 'closed') => ({
  id: nextId,
  sessionId: nextId++,
  username: staff.username,
  date,
  state,
  entry
});
// Lượt bấm thật: vào inHm, ra outHm (+outPlus ngày) của ca gán ngày date; trễ / sớm được Admin xác nhận như màn Chấm công
function punch(staff, date, inHm, outHm, outPlus = 0, inPlus = 0) {
  const built = P.buildDay(who(staff), vn(date, inHm, inPlus), vn(date, outHm, outPlus), 'punch', {
    plannedShift: P.planShift(who(staff), date),
    approveIncomplete: true
  });
  return session(staff, built.date, built.entry);
}
// Lượt đã đóng thiếu giờ ra (quên Check-out)
function forgotOut(staff, date, inHm) {
  const plannedShift = P.planShift(who(staff), date);
  return session(staff, date, {
    kind: 'pending',
    reason: 'forgot-out',
    src: 'punch',
    presIn: vn(date, inHm),
    plannedShift
  });
}
function adminSession(staff, date, day) {
  const plannedShift = P.planShift(who(staff), date);
  const pres = AdminPresence.presenceOf(P, plannedShift, date, day);
  const built = P.buildDay(who(staff), pres.inIso, pres.outIso, 'admin', { plannedShift, approveIncomplete: true });
  return session(staff, built.date, { ...built.entry, origin: 'sheet.onBehalf' });
}
function month(staff, days, sessions) {
  const res = Engine.create(DEFAULTS).computeMonth({
    staff,
    days,
    approvals: {},
    sessions,
    kpi: { pct: null, amt: null, admPct: null, admAmt: null },
    holidays: [],
    month: MONTH,
    upTo: null,
    asOf: ASOF
  });
  return { ...res, row: date => res.m.rows.find(r => r.date === date) };
}
const dayShift = { kind: 'work', in: '08:00', out: '17:00' };
const nightShift = { kind: 'work', in: '22:00', out: '07:00' };
const TUE = '2026-10-06';

test('qa_nv ca 08:00–17:00 bấm 07:55 / 17:10: dòng ngày mang đúng giờ bấm, giờ làm 8 và lương ngày 230.769 không đổi', () => {
  const { row } = month(DAY, { [TUE]: dayShift }, [punch(DAY, TUE, '07:55', '17:10')]);
  assert.equal(row(TUE).punchIn, '07:55');
  assert.equal(row(TUE).punchOut, '17:10');
  assert.equal(row(TUE).hours, 8);
  assert.equal(Math.round(row(TUE).total), 230769);
});

test('vào trễ 08:40, ra 17:00: giờ bấm thật 08:40 – 17:00, phút cắt vẫn là phút cắt của bộ máy', () => {
  const { row } = month(DAY, { [TUE]: dayShift }, [punch(DAY, TUE, '08:40', '17:00')]);
  assert.equal(row(TUE).punchIn, '08:40');
  assert.equal(row(TUE).punchOut, '17:00');
  assert.ok(row(TUE).cutStartMin > 0, `có phút cắt: ${row(TUE).cutStartMin}`);
  assert.equal(row(TUE).in, '08:00', 'giờ ca vẫn là giờ ca');
});

test('giờ bấm không đổi tiền: bấm đúng giờ và bấm sớm vào, muộn ra (không có phút cắt) cùng tổng tiền và giờ làm', () => {
  const on = month(DAY, { [TUE]: dayShift }, [punch(DAY, TUE, '08:00', '17:00')]).row(TUE);
  const off = month(DAY, { [TUE]: dayShift }, [punch(DAY, TUE, '07:50', '17:20')]).row(TUE);
  assert.equal(on.total, off.total);
  assert.equal(on.hours, off.hours);
});

test('ca đêm 22:00 – 07:00: giờ ra là giờ đồng hồ của sáng hôm sau', () => {
  const { row } = month(NIGHT, { [TUE]: nightShift }, [punch(NIGHT, TUE, '21:58', '07:05', 1)]);
  assert.equal(row(TUE).punchIn, '21:58');
  assert.equal(row(TUE).punchOut, '07:05');
});

test('quên Check-out: chờ xử lý, chỉ có giờ vào thật; giờ ra null', () => {
  const { row } = month(DAY, { [TUE]: dayShift }, [forgotOut(DAY, TUE, '07:58')]);
  assert.equal(row(TUE).kind, 'pending');
  assert.equal(row(TUE).punchIn, '07:58');
  assert.equal(row(TUE).punchOut, null);
});

test('khai đi làm mà không chấm: ngày vắng, cả hai giờ bấm null', () => {
  const { row } = month(DAY, { [TUE]: dayShift }, []);
  assert.equal(row(TUE).kind, 'noshow');
  assert.equal(row(TUE).punchIn, null);
  assert.equal(row(TUE).punchOut, null);
});

test('ngày chưa tới: dòng chờ "chưa tới" không mang giờ bấm', () => {
  const days = { '2026-10-30': dayShift };
  const res = Engine.create(DEFAULTS).computeMonth({
    staff: DAY,
    days,
    approvals: {},
    sessions: declaredPunches(DAY, days),
    kpi: { pct: null, amt: null, admPct: null, admAmt: null },
    holidays: [],
    month: MONTH,
    upTo: null,
    asOf: '2026-10-29T10:00:00+07:00'
  });
  const row = res.m.rows.find(r => r.date === '2026-10-30');
  assert.ok(!row || !('punchIn' in row), 'ngày chưa tới không có punchIn');
});

test('ngày Admin ghi thay (Đã chấm công): giờ đã ghi; có lượt thật dùng được thì lấy lượt thật', () => {
  const onlyAdmin = month(DAY, { [TUE]: dayShift }, [adminSession(DAY, TUE, dayShift)]).row(TUE);
  assert.equal(onlyAdmin.punchIn, '08:00');
  assert.equal(onlyAdmin.punchOut, '17:00');
  const both = month(DAY, { [TUE]: dayShift }, [
    adminSession(DAY, TUE, dayShift),
    punch(DAY, TUE, '07:55', '17:10')
  ]).row(TUE);
  assert.equal(both.punchIn, '07:55');
  assert.equal(both.punchOut, '17:10');
});

test('lượt Admin thắng lượt thật bị chặn (quên Check-out): lấy giờ của lượt Admin đã dùng', () => {
  const sessions = [forgotOut(DAY, TUE, '07:58'), adminSession(DAY, TUE, dayShift)];
  const row = month(DAY, { [TUE]: dayShift }, sessions).row(TUE);
  assert.equal(row.kind, 'work');
  assert.equal(row.punchIn, '08:00');
  assert.equal(row.punchOut, '17:00');
});

test('nhiều lượt trong một ca: giờ vào sớm nhất, giờ ra muộn nhất', () => {
  const a = punch(DAY, TUE, '08:00', '12:00');
  const b = punch(DAY, TUE, '13:00', '17:05');
  const times = ActualHours.punchTimesOf([a, b]);
  assert.deepEqual(times[TUE], { punchIn: '08:00', punchOut: '17:05' });
});

test('bản chụp cũ chưa có giờ bấm: withDayFigures lấy lúc đọc từ attendance_sessions, ngày không có lượt thì null', () => {
  const user = 'qa_punch_read';
  const staff = { ...DAY, username: user };
  const built = P.buildDay(who(staff), vn(TUE, '07:55'), vn(TUE, '17:10'), 'punch', {
    plannedShift: P.planShift(who(staff), TUE),
    approveIncomplete: true
  });
  store.createSession(user, built.date, 'closed', built.entry);
  const { m } = month(staff, { [TUE]: dayShift, '2026-10-07': dayShift }, [punch(staff, TUE, '07:55', '17:10')]);
  const old = {
    ...m,
    rows: m.rows.map(({ punchIn, punchOut, ...rest }) => rest)
  };
  assert.ok(old.rows.every(r => !('punchIn' in r)));
  const shown = withDayFigures(old, { username: user, month: MONTH });
  const byDate = Object.fromEntries(shown.rows.map(r => [r.date, r]));
  assert.equal(byDate[TUE].punchIn, '07:55');
  assert.equal(byDate[TUE].punchOut, '17:10');
  assert.equal(byDate['2026-10-07'].punchIn, null);
  assert.equal(byDate['2026-10-07'].punchOut, null);
  assert.ok(
    old.rows.every(r => !('punchIn' in r)),
    'bản chụp gốc không bị sửa'
  );
});

test('dòng đã có giờ bấm thì máy chủ giữ nguyên, không lấy lại từ lượt chấm công', () => {
  const rows = [{ date: TUE, kind: 'work', hours: 8, daily: 230769.23, punchIn: '09:00', punchOut: null, total: 1 }];
  const shown = withDayFigures({ rows }, { username: 'qa_punch_read', month: MONTH });
  assert.equal(shown.rows[0].punchIn, '09:00');
  assert.equal(shown.rows[0].punchOut, null);
});

test('verify: bản chụp có và không có giờ bấm là cùng một bản chụp', () => {
  const rows = [{ date: TUE, kind: 'work', total: 1, punchIn: '07:55', punchOut: '17:10' }];
  const bare = [{ date: TUE, kind: 'work', total: 1 }];
  assert.deepEqual(withoutPunchTimes({ rows }), { rows: bare });
  assert.deepEqual(withoutPunchTimes({ rows: bare }), { rows: bare });
});
