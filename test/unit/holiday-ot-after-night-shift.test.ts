'use strict';
// OT sau ca đêm rơi vào ngày lễ: giờ OT thô (không trừ giờ nghỉ) tách theo NGÀY DÂN SỰ của từng phút.
//   - PayrollCalendar.splitExtraWork(entry, date, holidays) → { normalH, holidayH, holidayNightH }; normalH + holidayH = tổng giờ đoạn làm thêm;
//   - calcDay: phút ngày lễ của đoạn OT trả ×ot.holidayRate (cộng phần đêm lễ), nằm trong holWorkH / holWorkPay; phút ngày thường trả ×ot.rate;
//   - calcMonth: giờ OT ngày lễ nằm trong holWorkHours, không nằm trong otHours; exemptOt dùng trần holidayRate cho phần làm lễ.
// Mọi số là NV L1 (lương cơ bản 6.000.000 ₫): lương ngày 230.769,23 ₫, lương giờ 28.846,15 ₫.
//
// Số tính tay (g2 = ca đêm 22:00 ngày 07/10 đến 07:00 ngày 08/10; 08/10 là ngày lễ; OT 07:00–11:00 = 4 giờ; h = lương giờ):
//   Ca chính: 22:00–24:00 ngày thường 2 giờ, 00:00–07:00 ngày lễ 7 giờ (không trừ giờ nghỉ), trong đó 6 giờ đêm (00:00–06:00).
//   Tiền ca = 8h (ngày) − 7h + 7h × 3 + 6h × 0,6 + phụ cấp đêm 40% × 8h (3,2h) + tiền nghỉ đêm 1h × 1,3 (1,3h)
//           = 8 − 7 + 21 + 3,6 + 3,2 + 1,3 = 30,1h.
//   OT 07:00–11:00 ngày lễ: 4 giờ × 3 = 12h → tổng ngày 43,1h = 1.243.269 ₫ (ngày không lễ: 12,5h + OT 4 × 2 = 20,5h).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const Calendar = require('../../src/engine/payroll-calendar');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const k = Engine.create(DEFAULTS);
const PC = Calendar.create(DEFAULTS);
const nv = { type: 'nv', level: 1, nightPct: 40 };
const HOURLY = 6000000 / 26 / 8;
const HOL_RATE = DEFAULTS['ot.holidayRate'];
const OT_RATE = DEFAULTS['ot.rate'];
const H = (hours?) => hours * HOURLY;
const close = (actual?, expected?, label = '') =>
  assert.ok(Math.abs(actual - expected) < 1e-4, `${label} ${actual} != ${expected}`);
const work = (tin?, tout?, extra: any = {}) => ({ kind: 'work', in: tin, out: tout, ...extra });
const g2Ot = (extraOut = '11:00') => work('22:00', '07:00', { extraKind: 'ot', extraOut });
const g1Ot = (extraOut = '10:00') => work('21:00', '06:00', { extraKind: 'ot', extraOut });
const dayCtx = (holidays?, date = '2026-10-07') => ({ date, holidays });
const month = (days?, holidays?, staff = nv) => k.calcMonth(staff, days, null, holidays, '2026-10', null);
const toMin = (t?) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const fmt = (t?) => {
  t = ((t % 1440) + 1440) % 1440;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
};
function lcg(seed?) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('splitExtraWork: OT 07:00–11:00 sau ca g2, lễ 08/10 → cả 4 giờ là giờ ngày lễ; không lễ → cả 4 giờ là giờ thường', () => {
  const hol = PC.splitExtraWork(g2Ot(), '2026-10-07', ['2026-10-08']);
  assert.deepEqual({ ...hol }, { normalH: 0, holidayH: 4, holidayNightH: 0 });
  const plain = PC.splitExtraWork(g2Ot(), '2026-10-07', []);
  assert.deepEqual({ ...plain }, { normalH: 4, holidayH: 0, holidayNightH: 0 });
});

test('splitExtraWork: ca g1 21:00–06:00 + OT 06:00–10:00, lễ 08/10 → 4 giờ ngày lễ', () => {
  const s = PC.splitExtraWork(g1Ot(), '2026-10-07', ['2026-10-08']);
  assert.deepEqual({ ...s }, { normalH: 0, holidayH: 4, holidayNightH: 0 });
});

test('splitExtraWork: tách theo ngày dân sự của từng phút: lễ rơi vào ngày bắt đầu ca (07/10) thì OT sáng 08/10 vẫn là giờ thường', () => {
  const s = PC.splitExtraWork(g2Ot(), '2026-10-07', ['2026-10-07']);
  assert.deepEqual({ ...s }, { normalH: 4, holidayH: 0, holidayNightH: 0 });
});

test('splitExtraWork: đoạn OT 19:00–01:00 qua nửa đêm tính đủ 6 giờ thô, không trừ giờ nghỉ 23:00–00:00', () => {
  const entry = work('10:00', '19:00', { extraKind: 'ot', extraOut: '01:00' });
  // Lễ là ngày sau: chỉ 00:00–01:00 (1 giờ, giữa đêm) là giờ lễ
  const next = PC.splitExtraWork(entry, '2026-10-07', ['2026-10-08']);
  assert.deepEqual({ ...next }, { normalH: 5, holidayH: 1, holidayNightH: 1 });
  // Lễ là ngày bắt đầu: 19:00–24:00 (5 giờ, trong đó 22:00–24:00 là đêm) là giờ lễ, 00:00–01:00 là giờ thường
  const same = PC.splitExtraWork(entry, '2026-10-07', ['2026-10-07']);
  assert.deepEqual({ ...same }, { normalH: 1, holidayH: 5, holidayNightH: 2 });
});

test('splitExtraWork: không có đoạn làm thêm, ngày sai, hoặc không có bản ghi → toàn số 0', () => {
  for (const [entry, date] of [
    [work('22:00', '07:00'), '2026-10-07'],
    [g2Ot(), '2026-02-30'],
    [null, '2026-10-07']
  ]) {
    const s = PC.splitExtraWork(entry, date, ['2026-10-08']);
    assert.deepEqual({ ...s }, { normalH: 0, holidayH: 0, holidayNightH: 0 });
  }
});

test('splitExtraWork: bất biến normalH + holidayH = số giờ thô của đoạn làm thêm cho 2.000 ca và bộ ngày lễ ngẫu nhiên', () => {
  const rnd = lcg(20261014);
  const shifts = [
    ['08:00', '17:00'],
    ['10:00', '19:00'],
    ['06:00', '15:00'],
    ['13:00', '22:00'],
    ['21:00', '06:00'],
    ['22:00', '07:00']
  ];
  const dates = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
  for (let i = 0; i < 2000; i++) {
    const [tin, tout] = shifts[Math.floor(rnd() * shifts.length)];
    const entry = work(tin, tout, { extraKind: 'ot' });
    const post = rnd() < 0.7 ? (1 + Math.floor(rnd() * 12 * 4)) * 15 : 0;
    const pre = rnd() < 0.3 ? (1 + Math.floor(rnd() * 8 * 4)) * 15 : 0;
    if (post) entry.extraOut = fmt(toMin(tout) + post);
    if (pre) entry.extraIn = fmt(toMin(tin) - pre);
    const holidays = dates.filter(() => rnd() < 0.4);
    const s = PC.splitExtraWork(entry, '2026-10-07', holidays);
    close(s.normalH + s.holidayH, (post + pre) / 60, `${JSON.stringify(entry)} lễ ${holidays}`);
    assert.ok(s.normalH >= 0 && s.holidayH >= 0 && s.holidayNightH >= 0);
    assert.ok(s.holidayNightH <= s.holidayH + 1e-9, 'giờ đêm lễ không thể nhiều hơn giờ lễ');
  }
});

test('calcDay: OT không chạm ngày lễ (ca g2 ngày 06/10, OT sáng 07/10, lễ 08/10) vẫn ×ot.rate', () => {
  const d = k.calcDay(nv, g2Ot(), false, 0, dayCtx(['2026-10-08'], '2026-10-06'));
  close(d.otPay, H(4 * OT_RATE));
  assert.equal(d.holWorkH, 0);
});

test('calcDay ngẫu nhiên (2.000 ca): sau ca đêm với lễ ở ngày sau, mọi giờ OT trả ×holidayRate; không lễ trả ×rate', () => {
  const rnd = lcg(20261016);
  for (let i = 0; i < 2000; i++) {
    const night = rnd() < 0.5 ? work('22:00', '07:00') : work('21:00', '06:00');
    const outMin = night.out === '07:00' ? 420 : 360;
    const post = (1 + Math.floor(rnd() * 16)) * 15; // 15 phút – 4 giờ, bước 15 phút
    const entry: Record<string, any> = { ...night, extraKind: 'ot', extraOut: fmt(outMin + post) };
    const label = JSON.stringify(entry);
    const holCtx = dayCtx(['2026-10-08']);
    const withOt = k.calcDay(nv, entry, false, 0, holCtx);
    const without = k.calcDay(nv, night, false, 0, holCtx);
    close(withOt.total - without.total, (post / 60) * HOURLY * HOL_RATE, `lễ: ${label}`);
    const plain = k.calcDay(nv, entry, false, 0, dayCtx([]));
    close(plain.otPay, (post / 60) * HOURLY * OT_RATE, `không lễ: ${label}`);
    assert.equal(plain.holWorkH, 0);
  }
});

const MONTH_DAYS = { '2026-10-07': g2Ot() };
const MONTH_HOLIDAYS = ['2026-10-08'];

test('calcMonth: OT ngày lễ nằm trong holWorkHours / holWorkPay (11 giờ), không nằm trong otHours / otPay', async () => {
  const m = await month(MONTH_DAYS, MONTH_HOLIDAYS);
  assert.deepEqual([m.otHours, m.otPay, m.otDays], [0, 0, 0]);
  close(m.holWorkHours, 11, 'holWorkHours');
  close(m.holWorkPay, H(36.6), 'holWorkPay');
});

test('OT bị giữ vì còn nợ giờ bù thì chưa tính; OT ngày lễ không bị giữ vì là giờ làm ngày lễ', async () => {
  // 05/10 ra ngoài 60 phút → thiếu 1 giờ, chưa bù
  const days = { '2026-10-05': work('08:00', '17:00', { breakMin: 60 }), ...MONTH_DAYS };
  const holiday = await month(days, MONTH_HOLIDAYS);
  assert.deepEqual([holiday.otPay, holiday.otHours, holiday.otHoldHours], [0, 0, 0]);
  close(holiday.holWorkHours, 11);
  const ordinary = await month(days, []);
  assert.equal(ordinary.otPay, 0);
  close(ordinary.otHoldHours, 4, 'otHoldHours');
});
