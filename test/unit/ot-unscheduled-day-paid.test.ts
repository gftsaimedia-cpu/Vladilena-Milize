'use strict';
// OT đã duyệt vào ngày không nằm trong lịch của người được trả (trước đây ngày Chủ nhật bị bỏ khỏi tháng nên trả 0 đồng).
// Chuỗi đầy đủ: ActualHours.apply (ngày ngoài lịch có khoản duyệt thành ngày extraOnly chỉ còn đoạn OT) → calcMonth.
//   - calcMonth giữ ngày thuộc lịch và ngày extraOnly; ngày ngoài lịch không có khoản duyệt vẫn 0 đồng;
//   - ngày extraOnly chỉ trả đoạn OT: không lương ngày, không phụ cấp ca, không tính ngày công;
//   - phút OT vào Thứ Bảy, Chủ nhật không nằm trong lịch trả ×ot.weekendRate; ngày thường ngoài lịch trả ×ot.rate.
// Người mẫu qa_s_nv: NV bậc 1, lương cơ bản 6.000.000 ₫, lương giờ 28.846,15 ₫, ca n1 08:00–17:00.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../helpers/schedule-fixtures');

const HOURLY = 6000000 / 26 / 8;
const R = F.DEFAULTS['ot.rate'];
const RW = F.DEFAULTS['ot.weekendRate'];
const OPT = { actualFrom: '2026-10-01', asOf: '2026-11-04T09:00:00+07:00' };
const SUN = '2026-10-04';
const TUE = '2026-10-06';
const SAT = '2026-10-03';
const near = (actual?, expected?, label = '') =>
  assert.ok(Math.abs(actual - expected) < 1.5, `${label} ${actual} != ${expected}`); // tổng là cộng các dòng nguyên đồng
const ot = (extraOut = '21:00') => ({ ...F.WORK, extraKind: 'ot', extraOut });

// Tháng đầy đủ của lịch mặc định (Thứ Hai–Thứ Bảy) cộng ngày ngoài lịch `extra`; chấm công đủ ca, riêng ngày OT chấm thêm `stay` phút
async function monSat(extra?, { approve = [], punchDates = [], stay = 240 }: any = {}) {
  const staff = F.nvStaff();
  const days = { ...F.fullDays('2026-10', F.MON_SAT), ...extra };
  const regular = F.datesOn('2026-10', F.MON_SAT);
  const sessions = [
    ...F.punches(staff, regular, { sched: F.MON_SAT }),
    ...F.punches(staff, punchDates, { sched: F.MON_SAT, to: stay })
  ];
  return F.run(staff, days, {
    ...OPT,
    sessions,
    approvals: await F.approved(days, [], 'nv', approve)
  });
}
const rowOf = (r?, date?) => r.m.rows.find(x => x.date === date);

test('Chủ nhật ngoài lịch có OT 17:00–21:00 đã duyệt và có chấm công: trả 4 giờ ×ot.weekendRate = 230.769 ₫ (trước đây 0)', async () => {
  const r = await monSat({ [SUN]: ot() }, { approve: [SUN], punchDates: [SUN] });
  assert.equal(await F.state(r, SUN), 'ok');
  assert.equal(r.m.otHours, 4);
  assert.equal(r.m.otWeekendHours, 4);
  near(r.m.otWeekendPay, 4 * HOURLY * RW);
  const row = await rowOf(r, SUN);
  assert.ok(row, 'ngày Chủ nhật có dòng trong tháng');
  assert.equal(Math.round(row.total), 230769);
});

test('ngày OT ngoài lịch chỉ trả đoạn OT: không thêm ngày công, không lương ngày, không phụ cấp ca', async () => {
  const withSun = await monSat({ [SUN]: ot() }, { approve: [SUN], punchDates: [SUN] });
  const without = await monSat({}, {});
  assert.equal(withSun.m.count, without.m.count, 'số ngày công không đổi');
  assert.equal(withSun.m.absent, 0);
  near(withSun.m.total - without.m.total, 4 * HOURLY * RW, 'tháng chỉ tăng đúng tiền OT');
  near(withSun.m.basePay, without.m.basePay);
  near(withSun.m.bonus, without.m.bonus);
});

test('Chủ nhật có chấm công nhưng không có khoản OT được duyệt: 0 đồng, tháng không đổi', async () => {
  const none = await monSat({}, {});
  const present = await monSat({ [SUN]: ot() }, { approve: [], punchDates: [SUN] });
  assert.equal(present.m.otHours, 0);
  near(present.m.total, none.m.total);
  assert.equal(await rowOf(present, SUN), undefined);
});

test('Chủ nhật có khoản OT được duyệt nhưng chỉ chấm công tới 19:00: chỉ trả 2 giờ có mặt', async () => {
  const r = await monSat({ [SUN]: ot() }, { approve: [SUN], punchDates: [SUN], stay: 120 });
  assert.equal(r.m.otHours, 2);
  near(r.m.otWeekendPay, 2 * HOURLY * RW);
});

test('Thứ Bảy ngoài lịch của người làm Thứ Hai–Thứ Sáu: OT được duyệt 4 giờ ×ot.weekendRate', async () => {
  const staff = F.nvStaff();
  const days = { ...F.fullDays('2026-10', F.MON_FRI), [SAT]: ot() };
  const sessions = [
    ...F.punches(staff, F.datesOn('2026-10', F.MON_FRI), { sched: F.MON_FRI }),
    ...F.punches(staff, [SAT], { sched: F.MON_FRI, to: 240 })
  ];
  const r = F.run(staff, days, {
    ...OPT,
    sessions,
    approvals: await F.approved(days, [], 'nv', [SAT]),
    over: F.nvDows(F.MON_FRI)
  });
  assert.equal(r.m.otWeekendHours, 4);
  near(r.m.otWeekendPay, 4 * HOURLY * RW);
});

test('ngày thường ngoài lịch (Thứ Ba của người làm Thứ Hai–Thứ Tư–Thứ Sáu) có OT được duyệt: 4 giờ ×ot.rate = 173.077 ₫', async () => {
  const staff = F.nvStaff();
  const days = { ...F.fullDays('2026-10', F.MWF), [TUE]: ot() };
  const sessions = [
    ...F.punches(staff, F.datesOn('2026-10', F.MWF), { sched: F.MWF }),
    ...F.punches(staff, [TUE], { sched: F.MWF, to: 240 })
  ];
  const r = F.run(staff, days, {
    ...OPT,
    sessions,
    approvals: await F.approved(days, [], 'nv', [TUE]),
    over: F.nvDows(F.MWF)
  });
  assert.equal(r.m.otHours, 4);
  assert.equal(r.m.otWeekendHours, 0);
  near(r.m.otWeekdayPay, 4 * HOURLY * R);
  assert.equal(Math.round((await rowOf(r, TUE)).total), 173077);
});
