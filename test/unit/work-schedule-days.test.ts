'use strict';
// Ngày làm của lịch: chỉ có ngày thuộc lịch (type.<mã>.dows). Không có ngày làm thêm / ngày tuỳ chọn:
// ngày ngoài lịch không tính công; người cần thêm ngày gửi yêu cầu (OT, giờ làm bù, đi làm ngày lễ).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const WS = require('../../src/engine/work-schedule');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');
const Positions = require('../../src/params/positions');
const { declaredPunches } = require('../helpers/declared-punches');

const TTS = { username: 'qa_tts', type: 'tts', level: 1, shiftCode: 'Normal1', startDate: '2025-01-06' };
const SAT = '2026-10-10';
test('Lịch chức vụ chỉ có pattern và workdays; TTS làm T2–T6, thứ Bảy không phải ngày làm', () => {
  const s = WS.scheduleOf({ type: 'tts' }, '2026-10');
  assert.deepEqual([...s.pattern.dows], [1, 2, 3, 4, 5]);
  assert.equal('extra' in s, false);
  assert.equal(WS.isWorkDay(s, SAT), false);
  assert.equal(WS.isWorkDay(s, '2026-10-09'), true);
  assert.equal(WS.scheduledDates(s, '2026-10').length, 22);
});

test('Mô-đun lịch không còn hàm hỏi ngày làm thêm; DEFAULTS không còn khoá extraDows', () => {
  for (const name of ['isExtraDay', 'extraDates', 'acceptsDay']) assert.equal(name in WS, false, name);
  assert.deepEqual(
    Object.keys(DEFAULTS).filter(k => k.endsWith('.extraDows')),
    []
  );
});

test('Bộ máy lương: ngày thuộc lịch mới có tiền; thứ Bảy của TTS (ngoài lịch) không có ngày công và không tính nghỉ không lương', () => {
  const run = (extra?) => {
    const days: Record<string, any> = {};
    for (let d = 1; d <= 31; d++) {
      const date = `2026-10-${String(d).padStart(2, '0')}`;
      const dow = new Date(date + 'T00:00:00Z').getUTCDay();
      if (dow >= 1 && dow <= 5) days[date] = { kind: 'work', in: '08:00', out: '17:00' };
    }
    if (extra) days[SAT] = extra;
    return Engine.create(DEFAULTS).computeMonth({
      staff: TTS,
      days,
      approvals: {},
      sessions: declaredPunches(TTS, days),
      kpi: { pct: null, amt: null, admPct: null, admAmt: null },
      holidays: [],
      month: '2026-10',
      upTo: null,
      asOf: '2026-11-02T12:00:00+07:00'
    }).m;
  };
  const base = run(null);
  assert.equal(base.count, 22);
  for (const day of [
    { kind: 'work', in: '08:00', out: '17:00' },
    { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraOut: '20:00' },
    { kind: 'unpaid' },
    { kind: 'willmakeup' }
  ]) {
    const m = run(day);
    assert.equal(m.count, base.count, JSON.stringify(day));
    assert.equal(m.net.gross, base.net.gross, JSON.stringify(day));
    assert.equal(m.net.noPayDays, 0, JSON.stringify(day));
    assert.equal(m.makeupHours, 0, JSON.stringify(day));
  }
});

test('Lịch chức vụ trong tham số: danh sách chức vụ không có extraDows; kiểm chéo chỉ báo lịch rỗng', () => {
  const set = { ...DEFAULTS };
  assert.equal('extraDows' in Positions.list(set)[0], false);
  assert.deepEqual(Positions.scheduleErrors(set), []);
  assert.deepEqual(
    Positions.scheduleErrors({ ...set, 'type.tts.dows': [] }).map(e => e.code),
    ['SCHEDULE_EMPTY']
  );
});
