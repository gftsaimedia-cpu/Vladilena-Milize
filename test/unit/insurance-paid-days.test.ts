'use strict';
// Quy tắc bảo hiểm bắt buộc "từ 14 ngày không lương thì tháng đó không đóng" đếm theo NGÀY CÓ LƯƠNG:
//   paidDays = ngày công (kể cả ngày lễ có giờ làm) + phép năm + nghỉ lễ hưởng lương + iSAT hưởng lương, tính đến mốc tính;
//   noPayDays = max(0, ngày công chuẩn của người − paidDays); không đóng khi noPayDays so với tax.insurance.skipDays (14) theo skipCompare (gte).
// Nghỉ không lương, nghỉ được duyệt, vắng, ngày trước ngày bắt đầu, sau ngày nghỉ việc và ngày chưa tới không phải ngày có lương.
// Người bịa: NV bậc 1 (lương cơ bản 6.000.000 ₫, bảo hiểm 630.000 ₫ khi đóng, ngày công chuẩn 26, lịch Thứ Hai đến Thứ Bảy),
// TTS bậc 3 (ngày công chuẩn 22, lịch Thứ Hai đến Thứ Sáu); tháng 10/2026 có 27 ngày Thứ Hai đến Thứ Bảy và 22 ngày Thứ Hai đến Thứ Sáu.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../helpers/schedule-fixtures');
const { declaredPunches } = require('../helpers/declared-punches');

const NV_DAYS = F.datesOn('2026-10', F.MON_SAT);
const TTS_DAYS = F.datesOn('2026-10', F.MON_FRI);
const work = (dates?, kind = { ...F.WORK }) => Object.fromEntries(dates.map(d => [d, { ...kind }]));
const nv = (days?, o: any = {}, staff = F.nvStaff()) => F.run(staff, days, o);
const tts = (days?, o: any = {}, staff = F.ttsStaff({ insured: true })) => F.run(staff, days, o);
const insuranceOf = (base?) => Math.round(base * 0.08) + Math.round(base * 0.015) + Math.round(base * 0.01);
const bucket = (r?, key?) => r.m.net[key];

test('NV: 12 ngày công đến cuối tháng thì không đóng bảo hiểm, 13 ngày công thì đóng 630.000 ₫', async () => {
  const twelve = await nv(work(NV_DAYS.slice(0, 12)));
  assert.equal(twelve.m.paidDays, 12);
  assert.equal(bucket(twelve, 'noPayDays'), 14);
  assert.equal(bucket(twelve, 'insuredMonth'), false);
  assert.equal(bucket(twelve, 'insurance'), 0);
  assert.equal(bucket(twelve, 'employer'), 0);

  const thirteen = await nv(work(NV_DAYS.slice(0, 13)));
  assert.equal(thirteen.m.paidDays, 13);
  assert.equal(bucket(thirteen, 'noPayDays'), 13);
  assert.equal(bucket(thirteen, 'insuredMonth'), true);
  assert.equal(bucket(thirteen, 'insurance'), 630000);
  assert.ok(bucket(thirteen, 'employer') > 0);
});

test('NV: đi làm đủ tháng đóng 630.000 ₫ như trước; mức đóng không chia theo số ngày', async () => {
  const full = await nv(work(NV_DAYS));
  assert.equal(bucket(full, 'noPayDays'), 0);
  assert.equal(bucket(full, 'insurance'), 630000);
  assert.equal(bucket(await nv(work(NV_DAYS.slice(0, 20))), 'insurance'), 630000);
});

test('NV: người không có ngày nào hay chỉ 1 ngày công được xử lý như nhau, đều không đóng', async () => {
  const none = await nv({});
  assert.equal(none.m.paidDays, 0);
  assert.equal(bucket(none, 'noPayDays'), 26);
  assert.equal(bucket(none, 'insurance'), 0);
  const one = await nv(work(NV_DAYS.slice(0, 1)));
  assert.equal(bucket(one, 'insurance'), 0);
  assert.equal(bucket(one, 'insuredMonth'), false);
  assert.equal(bucket(one, 'gross'), 265384); // 1 ngày công; các ngày còn lại không chấm nên mất chuyên cần
  assert.equal(bucket(one, 'net'), bucket(one, 'gross') - bucket(one, 'advance'));
});

test('NV: 10 ngày công + 2 phép năm + 1 nghỉ lễ hưởng lương = 13 ngày có lương thì đóng 630.000 ₫; thiếu ngày lễ (12) thì không đóng', async () => {
  const leaveDates = NV_DAYS.slice(10, 12);
  const days = { ...work(NV_DAYS.slice(0, 10)), ...work(leaveDates, { kind: 'leave' }) };
  const holidays = [NV_DAYS[12]];
  const approvals = await F.approved(days, holidays, 'nv', leaveDates);
  const mixed = await nv(days, { holidays, approvals });
  assert.equal(mixed.m.paidDays, 13);
  assert.equal(mixed.m.holiday, 1);
  assert.equal(bucket(mixed, 'insurance'), 630000);
  const noHoliday = await nv(days, { approvals });
  assert.equal(noHoliday.m.leave, 2);
  assert.equal(noHoliday.m.paidDays, 12);
  assert.equal(bucket(noHoliday, 'insurance'), 0);
});

test('Ngày lễ có giờ làm là ngày công, đếm một lần (không đếm thêm là nghỉ lễ hưởng lương)', async () => {
  const days = work(NV_DAYS.slice(0, 12));
  const r = await nv(days, { holidays: [NV_DAYS[0]] });
  assert.equal(r.m.paidDays, 12);
  assert.equal(bucket(r, 'insurance'), 0);
  const withHolidayOff = await nv(days, { holidays: [NV_DAYS[12]] });
  assert.equal(withHolidayOff.m.paidDays, 13);
  assert.equal(bucket(withHolidayOff, 'insurance'), 630000);
});

test('Nghỉ không lương, nghỉ được duyệt, vắng không phép và ngày chờ xử lý không phải ngày có lương', async () => {
  const days = {
    ...work(NV_DAYS.slice(0, 12)),
    [NV_DAYS[12]]: { kind: 'unpaid' },
    [NV_DAYS[13]]: { kind: 'approved' },
    [NV_DAYS[14]]: { kind: 'noshow' },
    [NV_DAYS[15]]: { kind: 'pending' }
  };
  const r = await nv(days);
  assert.equal(r.m.paidDays, 12);
  assert.equal(bucket(r, 'noPayDays'), 14);
  assert.equal(bucket(r, 'insurance'), 0);
});

test('TTS (ngày công chuẩn 22): 8 ngày có lương không đóng, 9 ngày thì đóng theo nền của bậc', () => {
  const eight = tts(work(TTS_DAYS.slice(0, 8)));
  assert.equal(bucket(eight, 'noPayDays'), 14);
  assert.equal(bucket(eight, 'insurance'), 0);
  const nine = tts(work(TTS_DAYS.slice(0, 9)));
  assert.equal(bucket(nine, 'noPayDays'), 13);
  const base = F.Engine.kernelFor(nine.params).levelOf(F.ttsStaff({ insured: true })).base;
  assert.equal(bucket(nine, 'insurance'), insuranceOf(base));
  assert.ok(bucket(nine, 'insurance') > 0);
});

test('Người không tham gia bảo hiểm (insured = false) không đóng dù đủ ngày', async () => {
  const r = await nv(work(NV_DAYS), {}, F.nvStaff({ insured: false }));
  assert.equal(bucket(r, 'insuredMonth'), false);
  assert.equal(bucket(r, 'insurance'), 0);
  assert.equal(bucket(r, 'employer'), 0);
});

test('Bắt đầu làm 15/10: chỉ ngày từ 15/10 tính là ngày có lương, ngày trước đó khai nhầm cũng không tính', async () => {
  const staff = F.nvStaff({ startDate: '2026-10-15' });
  const r = await nv(work(NV_DAYS.filter(d => d >= '2026-10-15')), {}, staff);
  assert.equal(r.m.paidDays, 15);
  assert.equal(bucket(r, 'noPayDays'), 11);
  assert.equal(bucket(r, 'insurance'), 630000);

  const late = F.nvStaff({ startDate: '2026-10-20' });
  const lateRun = await nv(work(NV_DAYS), {}, late);
  assert.equal(lateRun.m.paidDays, 11);
  assert.equal(bucket(lateRun, 'noPayDays'), 15);
  assert.equal(bucket(lateRun, 'insurance'), 0);
});

test('Nghỉ việc giữa tháng: chỉ ngày đến hết ngày nghỉ việc tính là ngày có lương', async () => {
  const stay = await nv(work(NV_DAYS), {}, F.nvStaff({ resignedOn: '2026-10-17' }));
  assert.equal(stay.m.paidDays, 15);
  assert.equal(bucket(stay, 'insurance'), 630000);
  const leave = await nv(work(NV_DAYS), {}, F.nvStaff({ resignedOn: '2026-10-14' }));
  assert.equal(leave.m.paidDays, 12);
  assert.equal(bucket(leave, 'insurance'), 0);
});

test('Giữa tháng: ngày chưa tới không tính, BH xuất hiện khi đủ 13 ngày có lương và không phụ thuộc đoán ngày sau', () => {
  const days = work(NV_DAYS);
  const upTo = (date?) =>
    F.Engine.create(F.DEFAULTS).computeMonth({
      staff: F.clone(F.nvStaff()),
      days: F.clone(days),
      approvals: {},
      sessions: declaredPunches(F.clone(F.nvStaff()), F.clone(days)),
      kpi: null,
      holidays: [],
      month: '2026-10',
      upTo: date,
      asOf: '2026-11-04T09:00:00+07:00'
    }).m;
  const early = upTo('2026-10-10');
  assert.equal(early.paidDays, 9);
  assert.equal(early.net.insurance, 0);
  const justShort = upTo('2026-10-14');
  assert.equal(justShort.paidDays, 12);
  assert.equal(justShort.net.insurance, 0);
  const enough = upTo('2026-10-15');
  assert.equal(enough.paidDays, 13);
  assert.equal(enough.net.insurance, 630000);
});

test('Ghim số ngày công trên phiếu đổi luôn số ngày có lương dùng cho quy tắc bảo hiểm', async () => {
  const r = await nv(work(NV_DAYS.slice(0, 12)));
  assert.equal(bucket(r, 'insurance'), 0);
  const pinned = F.Engine.create(r.params).repin(r.m, F.nvStaff(), { workDays: 13 }, '2026-10');
  assert.equal(pinned.paidDays, 13);
  assert.equal(pinned.net.insurance, 630000);
});

test('Bản chụp cũ không có paidDays: bộ máy đếm lại từ các dòng ngày', async () => {
  const r = await nv(work(NV_DAYS.slice(0, 13)));
  const old = F.clone(r.m);
  delete old.paidDays;
  const net = F.Engine.create(r.params).calcNet(F.nvStaff(), old);
  assert.equal(net.noPayDays, 13);
  assert.equal(net.insurance, 630000);
});

test('Ngày ngoài lịch chỉ có giờ làm thêm đã duyệt (extraOnly) không phải ngày có lương của bảo hiểm', async () => {
  const SUN = '2026-10-04';
  const staff = F.nvStaff();
  const regular = NV_DAYS.slice(0, 12);
  const days = { ...work(regular), [SUN]: { ...F.WORK, extraKind: 'ot', extraOut: '21:00' } };
  const sessions = [
    ...F.punches(staff, regular, { sched: F.MON_SAT }),
    ...F.punches(staff, [SUN], { sched: F.MON_SAT, to: 240 })
  ];
  const r = await nv(days, {
    actualFrom: '2026-10-01',
    sessions,
    approvals: await F.approved(days, [], 'nv', [SUN])
  });
  assert.equal(await F.state(r, SUN), 'ok');
  assert.ok(
    r.m.rows.some(x => x.date === SUN && x.extraOnly),
    'Chủ nhật là ngày extraOnly'
  );
  assert.equal(r.m.paidDays, 12);
  assert.equal(bucket(r, 'noPayDays'), 14);
  assert.equal(bucket(r, 'insurance'), 0);
});

test('Phép so sánh và ngưỡng ngày không lương đọc từ tham số tax.insurance.skipCompare / skipDays', async () => {
  const days = work(NV_DAYS.slice(0, 12)); // 12 ngày có lương, 14 ngày không lương
  assert.equal(bucket(await nv(days), 'insurance'), 0, 'mặc định gte 14: không đóng');
  assert.equal(
    bucket(await nv(days, { over: { 'tax.insurance.skipCompare': 'gt' } }), 'insurance'),
    630000,
    'gt 14: 14 chưa vượt'
  );
  assert.equal(bucket(await nv(days, { over: { 'tax.insurance.skipDays': 15 } }), 'insurance'), 630000, 'gte 15: đóng');
  assert.equal(
    bucket(await nv(days, { over: { 'tax.insurance.skipDays': 14, 'tax.insurance.skipCompare': 'lt' } }), 'insurance'),
    630000,
    'lt 14: 14 không nhỏ hơn 14 nên vẫn đóng'
  );
});
