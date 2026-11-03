'use strict';
// Làm ngày lễ là OT: khai giờ OT từ – đến trong ngày lễ (ngày đi làm có giờ vào – ra trên ngày lễ), Admin duyệt như mọi OT.
// Tiền = giờ được duyệt ∩ giờ có mặt liền mạch (Check-in/out), phút của chính ngày lễ × lương giờ × ot.holidayRate (+ đêm lễ), không trừ
// giờ nghỉ; giờ có mặt ngoài khung đã duyệt không được trả. Cộng lương ngày lễ 100 %. Chức vụ không có quyền lợi OT (TTS): 0 giờ OT ngày lễ.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../src/engine/punch');
const AV = require('../../src/engine/approval-view');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');
const { declaredPunches } = require('../helpers/declared-punches');

const HOL = '2026-10-20'; // Thứ Ba, trong lịch NV
const ASOF = '2026-11-02T12:00:00+07:00';
const NIGHT = { username: 'qa_night40', type: 'nv', level: 1, nightPct: 40, startDate: '2025-01-06', shiftCode: 'g2' };
const DAY = { username: 'qa_day', type: 'nv', level: 1, startDate: '2025-01-06', shiftCode: 'n1' };
const TTS = { username: 'qa_tts', type: 'tts', level: 3, startDate: '2025-01-06', shiftCode: 'n1' };
const HOURLY = 6000000 / 26 / 8;
const HOL_RATE = DEFAULTS['ot.holidayRate'];
const HOL_NIGHT = DEFAULTS['night.otAddRate'] * HOL_RATE;
const near = (actual?, expected?, msg?) =>
  assert.ok(Math.abs(actual - expected) < 0.5, `${msg || ''} ${actual} != ${expected}`);
const vn = (date?, hm?, plus = 0) => {
  const d = new Date(Date.parse(date + 'T00:00:00Z') + plus * 86400000).toISOString().slice(0, 10);
  return new Date(`${d}T${hm}:00+07:00`).toISOString();
};
const who = (staff?) => ({ shiftCode: staff.shiftCode, sched: [1, 2, 3, 4, 5, 6] });
let nextId = 1;
// Lượt bấm thật của ca gán ngày date: vào inHm, ra outHm (+outPlus ngày)
function punch(staff?, date?, inHm?, outHm?, outPlus = 0) {
  const built = P.buildDay(who(staff), vn(date, inHm), vn(date, outHm, outPlus), 'punch', {
    plannedShift: P.planShift(who(staff), date)
  });
  const id = nextId++;
  return { id, sessionId: id, username: staff.username, date: built.date, state: 'closed', entry: built.entry };
}
const approvedAll = (days?, staff?, holidays?) => {
  const out: Record<string, any> = {};
  for (const [date, day] of Object.entries<any>(days)) {
    const found = AV.itemOf(day, { date, holidays, staffType: staff.type });
    if (found) out[date] = { item: found.item, fingerprint: found.fingerprint, status: 'approved' };
  }
  return out;
};
function month(staff?, days?, sessions?, holidays = [HOL]) {
  const res = Engine.create(DEFAULTS).computeMonth({
    staff,
    days,
    approvals: approvedAll(days, staff, holidays),
    sessions: sessions || declaredPunches(staff, days),
    kpi: { pct: null, amt: null, admPct: null, admAmt: null },
    holidays,
    month: '2026-10',
    upTo: null,
    asOf: ASOF
  });
  return { ...res, row: (date?) => res.m.rows.find(r => r.date === date) };
}
const work = (inHm?, outHm?) => ({ kind: 'work', in: inHm, out: outHm });

test('khai OT ngày lễ là khoản OT: mục ot kèm cờ holiday, vẫn đọc được dấu vân tay holiday_work cũ', () => {
  const found = AV.itemOf(work('08:00', '17:00'), { date: HOL, holidays: [HOL], staffType: 'nv' });
  assert.deepEqual([found.item, found.holiday, found.fingerprint], ['ot', true, 'holiday_work|08:00-17:00']);
  // dòng duyệt lưu từ trước (mục holiday_work) vẫn áp được lên ngày
  const old = AV.payView({ [HOL]: work('08:00', '17:00') }, { [HOL]: { item: 'holiday_work', status: 'approved' } });
  assert.equal(old.pendingItems.length, 0);
  assert.equal(old.payDays[HOL].in, '08:00');
});

test('NV khung OT 08:00–17:00, Check-in 07:50 – Check-out 17:20: 9 giờ OT ngày lễ + lương ngày lễ', async () => {
  const r = await month(DAY, { [HOL]: work('08:00', '17:00') }, [await punch(DAY, HOL, '07:50', '17:20')]);
  const row = await r.row(HOL);
  assert.deepEqual([row.holWorkH, row.holMainH, row.otH], [9, 9, 0]);
  near(row.holWorkPay, 9 * HOURLY * HOL_RATE);
  near(row.total, HOURLY * 8 + 9 * HOURLY * HOL_RATE);
  assert.deepEqual([r.m.holWorkHours, r.m.count], [9, 1]);
});

test('Check-out 16:00: chỉ 8 giờ (giờ có mặt giới hạn khung đã duyệt, như OT thường)', async () => {
  const row = await (
    await month(DAY, { [HOL]: work('08:00', '17:00') }, [await punch(DAY, HOL, '08:00', '16:00')])
  ).row(HOL);
  assert.equal(row.holWorkH, 8);
  near(row.holWorkPay, 8 * HOURLY * HOL_RATE);
});

test('có mặt 06:00–20:00 nhưng chỉ duyệt 08:00–17:00: giờ ngoài khung đã duyệt không được trả', async () => {
  const row = await (
    await month(DAY, { [HOL]: work('08:00', '17:00') }, [await punch(DAY, HOL, '06:00', '20:00')])
  ).row(HOL);
  assert.equal(row.holWorkH, 9);
  assert.equal(row.extraKind, '');
  near(row.total, HOURLY * 8 + 9 * HOURLY * HOL_RATE);
});

test('khung đã duyệt khác ca được gán (09:00–12:00 trong ca 08:00–17:00): trả đúng 3 giờ trong khung, không theo ca', async () => {
  const row = await (
    await month(DAY, { [HOL]: work('09:00', '12:00') }, [await punch(DAY, HOL, '08:00', '17:00')])
  ).row(HOL);
  assert.equal(row.holWorkH, 3);
  near(row.holWorkPay, 3 * HOURLY * HOL_RATE);
});

test('khung 22:00–07:00 bắt đầu ngày lễ, có mặt đủ: 741.346 = lương lễ + 6 giờ thường + OT lễ 2 giờ (×3 cộng đêm) + phụ cấp đêm + Off Paid', async () => {
  const r = await month(NIGHT, { [HOL]: work('22:00', '07:00') });
  const row = await r.row(HOL);
  assert.deepEqual([row.holMainH, row.holWorkH, row.holNightH, row.normalWorkH], [2, 2, 2, 6]);
  near(row.holWorkPay, 2 * HOURLY * HOL_RATE + 2 * HOURLY * HOL_NIGHT);
  near(row.total, 741346);
  assert.deepEqual([r.m.holWorkHours, r.m.otHours], [2, 0]);
});

test('TTS (không có quyền lợi OT): ngày lễ có khai giờ và có mặt vẫn không có giờ OT ngày lễ nào, kể cả giờ ca chính', async () => {
  assert.equal(DEFAULTS['type.tts.benefit.ot'], false);
  const r = await month(TTS, { [HOL]: work('08:00', '17:00') }, [await punch(TTS, HOL, '08:00', '17:00')]);
  const row = await r.row(HOL);
  assert.deepEqual([row.kind, row.total, row.holWorkH ?? 0, row.holWorkPay ?? 0], ['holiday', row.holBase, 0, 0]);
  assert.deepEqual([r.m.holWorkHours, r.m.holWorkPay, r.m.otHours], [0, 0, 0]);
  // không có khoản duyệt: ngày lễ của TTS không phải khoản OT
  assert.equal(AV.itemOf(work('08:00', '17:00'), { date: HOL, holidays: [HOL], staffType: 'tts' }), null);
});

test('TTS: ca đêm qua nửa đêm sang ngày lễ tính như ngày thường (không giờ OT ngày lễ)', async () => {
  const eve = '2026-10-19';
  const row = await (await month({ ...TTS, shiftCode: 'g2' }, { [eve]: work('22:00', '07:00') })).row(eve);
  assert.deepEqual([row.holMainH, row.holWorkH], [0, 0]);
});
