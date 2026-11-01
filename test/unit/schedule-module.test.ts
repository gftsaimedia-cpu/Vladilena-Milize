'use strict';
// Mô-đun thuần src/engine/work-schedule.ts: lịch của một người luôn suy từ loại nhân sự (type.<mã>.dows, workdays, workdaysMode của bộ tham số).
// Hợp đồng: WorkSchedule.create(params) / mặc định bằng create(DEFAULTS), các hàm scheduleOf, scheduleFor, isWorkDay, workdaysOf, scheduledDates, describe.
//
// Loại lạ: không ném lỗi, không có ngày làm, khác TTS (mã loại lạ KHÔNG BAO GIỜ rơi về tts, như request-rules.dowsOf).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../helpers/schedule-fixtures');
const WS = require('../../src/engine/work-schedule');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const sha = (value?) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Mô-đun dựng trên bộ tham số có sửa lịch của loại NV
const withNv = (over?) => WS.create({ ...DEFAULTS, ...over });

test('lịch theo loại: NV T2–T7, TTS T2–T6; isWorkDay đúng cả tuần ở mọi tháng, scheduledDates 2026-10 có 27 và 22 ngày', () => {
  const tts = WS.scheduleOf({ type: 'tts' });
  const nv = WS.scheduleOf({ type: 'nv' });
  assert.equal(tts.source, 'type');
  assert.equal(nv.source, 'type');
  for (const month of ['2026-02', '2026-09', '2026-10', '2026-12', '2027-03'])
    for (let d = 1; d <= F.daysInMonth(month); d++) {
      const date = `${month}-${F.pad(d)}`;
      assert.equal(WS.isWorkDay(tts, date), F.MON_FRI.includes(F.dowOf(date)), date);
      assert.equal(WS.isWorkDay(nv, date), F.MON_SAT.includes(F.dowOf(date)), date);
    }
  assert.deepEqual(WS.scheduledDates(tts, '2026-10'), F.datesOn('2026-10', F.MON_FRI));
  assert.equal(WS.scheduledDates(nv, '2026-10').length, 27);
});

test('hồ sơ mang sẵn staff.schedule (dữ liệu cũ) không đổi lịch: vẫn là lịch của loại nhân sự', () => {
  const old = [{ from: '2026-01', pattern: { type: 'week', dows: F.MWF }, workdays: { mode: 'fixed', value: 13 } }];
  const staff = { username: 'qa_s_nv', type: 'nv', schedule: old };
  const s = WS.scheduleOf(staff, '2026-10');
  assert.equal(s.source, 'type');
  assert.deepEqual([...s.pattern.dows], F.MON_SAT);
  assert.equal(WS.workdaysOf(s, '2026-10'), 26);
  assert.equal(WS.forPerson(staff, '2026-10').workdaysStd, undefined);
  assert.equal(WS.scheduleFor(staff, '2026-10-31').source, 'type');
});

test('mô-đun không còn hàm đọc hay kiểm lịch riêng: entryOf, validate', () => {
  for (const name of ['entryOf', 'validate']) assert.equal(name in WS, false, name);
});

test('loại lạ (constructor, __proto__, rỗng, thiếu) không ném lỗi, không có ngày làm và KHÔNG rơi về TTS', () => {
  for (const type of ['constructor', '__proto__', '', 'xyz', undefined, null]) {
    const s = WS.scheduleOf({ username: 'qa_s_x', type }, '2026-10');
    assert.deepEqual(WS.scheduledDates(s, '2026-10'), [], String(type));
    assert.equal(WS.isWorkDay(s, '2026-10-05'), false, String(type));
  }
  const tts = WS.scheduleOf({ type: 'tts' }, '2026-10');
  assert.notDeepEqual(
    WS.scheduledDates(WS.scheduleOf({ type: 'constructor' }, '2026-10'), '2026-10'),
    WS.scheduledDates(tts, '2026-10')
  );
});

test('workdaysOf: cố định trả value; tự đếm theo lịch của loại: T2–T7 tháng 10 = 27, tháng 9 = 26, tháng 11 = 25, tháng 12 = 27; Hai-Tư-Sáu tháng 10 = 13; T2–T6 tháng 10 = 22', async () => {
  const computed = { 'type.nv.workdaysMode': 'computed' };
  const count = (dows?, month?) => {
    const ws = withNv({ 'type.nv.dows': dows, ...computed });
    return ws.workdaysOf(ws.scheduleOf({ type: 'nv' }), month);
  };
  assert.equal(await count(F.MWF, '2026-10'), 13);
  assert.equal(await count(F.MON_SAT, '2026-10'), 27);
  assert.equal(await count(F.MON_SAT, '2026-09'), 26);
  assert.equal(await count(F.MON_SAT, '2026-11'), 25);
  assert.equal(await count(F.MON_SAT, '2026-12'), 27);
  assert.equal(await count(F.MON_FRI, '2026-10'), 22);
  const fixed = withNv({ 'type.nv.dows': F.MWF, 'type.nv.workdays': 13 });
  assert.equal(fixed.workdaysOf(fixed.scheduleOf({ type: 'nv' }), '2026-10'), 13);
  // ngày công chuẩn mặc định của loại (cố định): 22, 26, 26
  assert.deepEqual(
    ['tts', 'ctv', 'nv'].map(t => WS.workdaysOf(WS.scheduleOf({ type: t }, '2026-10'), '2026-10')),
    [22, 26, 26]
  );
});

test('bất biến: đầu vào không bị sửa, kết quả đóng băng, cùng đầu vào cùng kết quả, không gọi Date.now', () => {
  const staff = { username: 'qa_s_nv', type: 'nv' };
  const ws = withNv({ 'type.nv.dows': F.MWF, 'type.nv.workdaysMode': 'computed' });
  const before = sha(staff);
  const realNow = Date.now;
  Date.now = () => {
    throw new Error('work-schedule.js không được đọc đồng hồ');
  };
  try {
    const a = ws.scheduleOf(staff, '2026-11');
    const b = ws.scheduleOf(staff, '2026-11');
    assert.deepEqual(a, b);
    assert.deepEqual(ws.scheduledDates(a, '2026-11'), ws.scheduledDates(b, '2026-11'));
    assert.equal(ws.workdaysOf(a, '2026-11'), 13);
    assert.ok(Object.isFrozen(a) && Object.isFrozen(a.pattern), 'kết quả đóng băng');
    assert.throws(() => {
      a.pattern.dows.push(0);
    }, TypeError);
  } finally {
    Date.now = realNow;
  }
  assert.equal(sha(staff), before, 'đầu vào bị sửa');
  const source = fs.readFileSync(path.join(__dirname, '../../src/engine/work-schedule.ts'), 'utf8');
  assert.doesNotMatch(source, /Date\.now|new Date\(\)/, 'không tham chiếu đồng hồ');
});

test('Chủ nhật: scheduledDates của ba loại mặc định không bao giờ chứa Chủ nhật', () => {
  for (const type of ['tts', 'ctv', 'nv'])
    for (const month of ['2026-09', '2026-10', '2026-11', '2026-12']) {
      const s = WS.scheduleOf({ type }, month);
      for (const d of WS.scheduledDates(s, month)) assert.notEqual(F.dowOf(d), 0, `${type} ${d}`);
    }
});

test('describe cho nhãn: T2 – T7, T2 – T6, và T2, T4, T6 khi loại NV chỉ làm Hai-Tư-Sáu', () => {
  const label = (type?) => WS.describe(WS.scheduleOf({ type }, '2026-10')).label;
  assert.equal(label('nv'), 'T2 – T7');
  assert.equal(label('tts'), 'T2 – T6');
  const mwf = withNv({ 'type.nv.dows': F.MWF });
  assert.equal(mwf.describe(mwf.scheduleOf({ type: 'nv' })).label, 'T2, T4, T6');
});
