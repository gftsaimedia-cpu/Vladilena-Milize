'use strict';
// Quy tắc ngày lễ, chạy trên bộ máy đang dùng (PayrollEngine.create + computeMonth, không phải khối đóng băng):
//   - ngày lễ có đi làm thật (Check-in/out hợp lệ hoặc lượt Admin khai thay đã tới giờ ra) là 1 ngày công; tiền ngày lễ không đổi;
//   - mọi giờ có mặt rơi vào ngày lễ (ca chính và đoạn trước / sau ca) là OT ngày lễ theo hệ số lễ, không cần duyệt OT riêng, không bị giữ vì giờ bù;
//     phút sang ngày thường như OT thường; ngày có OT vẫn hưởng phụ cấp ca và giờ nghỉ đêm như ngày không OT;
//   - khai "Đi làm ngày lễ" mà hết ca không có Check-in/out là vắng, mất lương lễ; ngày lễ không khai đi làm vẫn hưởng lương lễ;
//   - sau ngày nghỉ việc (staff.resignedOn) như trước ngày bắt đầu: không lương lễ, không vắng.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../src/engine/punch');
const AV = require('../../src/engine/approval-view');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');
const { AdminPresence } = require('../../src/domain/attendance/admin-presence');
const { declaredPunches } = require('../helpers/declared-punches');

const HOL = '2026-10-20'; // Thứ Ba, trong lịch NV (T2–T7)
const MON = '2026-10-19';
const ASOF = '2026-11-02T12:00:00+07:00';
const NIGHT = {
  username: 'qa_night40',
  type: 'nv',
  level: 1,
  nightPct: 40,
  startDate: '2025-01-06',
  shiftCode: 'Night2'
};
const DAY = { username: 'qa_day', type: 'nv', level: 1, startDate: '2025-01-06', shiftCode: 'Normal1' };
const HOURLY = 6000000 / 26 / 8; // NV L1: lương giờ
const HOL_RATE = DEFAULTS['ot.holidayRate'];
const OT_RATE = DEFAULTS['ot.rate'];
const vn = (date?, hm?, plus = 0) => {
  const d = new Date(Date.parse(date + 'T00:00:00Z') + plus * 86400000).toISOString().slice(0, 10);
  return new Date(`${d}T${hm}:00+07:00`).toISOString();
};
const who = (staff?) => ({ shiftCode: staff.shiftCode, sched: [1, 2, 3, 4, 5, 6] });
let nextId = 1;
const session = (staff?, date?, entry?) => ({
  id: nextId,
  sessionId: nextId++,
  username: staff.username,
  date,
  state: 'closed',
  entry
});
// Lượt bấm thật của ca gán ngày date: vào inHm (+inPlus ngày), ra outHm (+outPlus ngày)
function punch(staff?, date?, inHm?, outHm?, outPlus = 0, inPlus = 0) {
  const built = P.buildDay(who(staff), vn(date, inHm, inPlus), vn(date, outHm, outPlus), 'punch', {
    plannedShift: P.planShift(who(staff), date)
  });
  return session(staff, built.date, built.entry);
}
// Lượt Admin khai thay giờ vào / ra như AdminPresence (origin sheet.onBehalf)
function adminSession(staff?, date?, day?) {
  const plannedShift = P.planShift(who(staff), date);
  const pres = AdminPresence.presenceOf(P, plannedShift, date, day);
  const built = P.buildDay(who(staff), pres.inIso, pres.outIso, 'admin', { plannedShift, approveIncomplete: true });
  return session(staff, built.date, { ...built.entry, origin: 'sheet.onBehalf' });
}
const approvedAll = (days?, staff?) => {
  const out: Record<string, any> = {};
  for (const [date, day] of Object.entries<any>(days)) {
    const found = AV.itemOf(day, { date, holidays: [HOL], staffType: staff.type });
    if (found) out[date] = { item: found.item, fingerprint: found.fingerprint, status: 'approved' };
  }
  return out;
};
// actual: true dùng đúng các lượt truyền vào (mặc định không có lượt nào); không thì người đi làm đúng như lịch đã khai
function month(staff?, days?, { sessions = null, actual = false, approvals, asOf = ASOF }: any = {}) {
  const res = Engine.create(DEFAULTS).computeMonth({
    staff,
    days,
    approvals: approvals || approvedAll(days, staff),
    sessions: actual ? sessions || [] : sessions || declaredPunches(staff, days),
    kpi: { pct: null, amt: null, admPct: null, admAmt: null },
    holidays: [HOL],
    month: '2026-10',
    upTo: null,
    asOf
  });
  return { ...res, row: (date?) => res.m.rows.find(r => r.date === date) };
}
const near = (actual?, expected?, msg?) =>
  assert.ok(Math.abs(actual - expected) < 0.5, `${msg || ''} ${actual} != ${expected}`);
const nightShift = { kind: 'work', in: '22:00', out: '07:00' };
const dayShift = { kind: 'work', in: '08:00', out: '17:00' };

test('ngày lễ: lượt Admin khai thay đã tới giờ ra là đi làm; chưa tới giờ ra thì chưa kết luận, vẫn lương lễ', async () => {
  const days = { [HOL]: nightShift };
  const done = await month(NIGHT, days, { sessions: [await adminSession(NIGHT, HOL, nightShift)], actual: true });
  assert.equal(done.actualReport.report[HOL].state, 'ok');
  assert.equal(Math.round((await done.row(HOL)).total), 741346);
  const early = await month(NIGHT, days, { actual: true, asOf: '2026-10-20T23:00:00+07:00' });
  assert.equal(early.actualReport.report[HOL].state, 'not-yet');
  assert.equal((await early.row(HOL)).kind, 'holiday');
  near((await early.row(HOL)).total, HOURLY * 8);
});

test('OT 08:00–20:00 ngày lễ đã duyệt: 12 giờ OT ngày lễ không trừ giờ nghỉ (theo lịch đã khai và theo Check-in/out)', async () => {
  const days = { [HOL]: { ...dayShift, extraKind: 'ot', extraIn: '', extraOut: '20:00' } };
  const declared = await month(DAY, days);
  const actual = await month(DAY, days, { sessions: [await punch(DAY, HOL, '08:00', '20:00')], actual: true });
  for (const r of [declared, actual]) {
    const row = await r.row(HOL);
    assert.equal(row.kind, 'holiday');
    assert.deepEqual([row.otH, row.otPay, row.holMainH, row.holWorkH], [0, 0, 9, 12]);
    near(row.holWorkPay, 12 * HOURLY * HOL_RATE);
    near(row.total, HOURLY * 8 + 12 * HOURLY * HOL_RATE);
    assert.deepEqual([r.m.otHours, r.m.holWorkHours, r.m.otDays], [0, 12, 0]);
    assert.equal(r.m.count, 1);
  }
  assert.equal(actual.actualReport.report[HOL].extra.keptOut, '20:00');
  // có mặt tới 19:00: chỉ trả tới 19:00 (cắt theo giờ có mặt như OT ngày thường)
  const short = await month(DAY, days, { sessions: [await punch(DAY, HOL, '08:00', '19:00')], actual: true });
  assert.equal((await short.row(HOL)).holWorkH, 11);
});

test('OT ngày lễ qua nửa đêm: chỉ phút của ngày lễ theo hệ số lễ (kể cả phần đêm lễ), phút của 21/10 là OT thường', async () => {
  const days = { [HOL]: { kind: 'work', in: '13:00', out: '22:00', extraKind: 'ot', extraIn: '', extraOut: '02:00' } };
  const row = await (await month(DAY, days)).row(HOL);
  // 13:00–24:00 của ngày lễ (11 giờ, không trừ nghỉ, gồm phần đêm lễ): OT ngày lễ; 00:00–02:00 của 21/10: OT thường
  assert.deepEqual([row.otH, row.holWorkH, row.holNightH], [2, 11, 2]);
  const holNight = DEFAULTS['night.otAddRate'] * HOL_RATE;
  near(row.otPay, 2 * HOURLY * OT_RATE);
  near(row.holWorkPay, 11 * HOURLY * HOL_RATE + 2 * HOURLY * holNight);
});

test('ngày lễ có OT được trả: giữ phụ cấp ca và tiền giờ nghỉ đêm như ngày lễ không OT, tiền OT cộng thêm', async () => {
  const plain = await (await month(NIGHT, { [HOL]: nightShift })).row(HOL);
  assert.ok(plain.bonus > 0 && plain.breakPay > 0);
  const ot = await (
    await month(NIGHT, { [HOL]: { ...nightShift, extraKind: 'ot', extraIn: '20:00', extraOut: '' } })
  ).row(HOL);
  assert.deepEqual([ot.otH, ot.holWorkH - plain.holWorkH], [0, 2]);
  // phụ cấp ca = lương ngày × 40 % = 6.000.000 / 26 × 0,4 ≈ 92.308 (lớn hơn sàn phụ trội đêm 7 giờ × lương giờ × 0,3 ≈ 60.577)
  near(ot.bonus, plain.bonus);
  near(ot.bonus, ((6000000 / 26) * NIGHT.nightPct) / 100);
  // giờ nghỉ đêm: 1 giờ × lương giờ × (1 + 0,3) = 37.500
  near(ot.breakPay, plain.breakPay);
  near(ot.breakPay, HOURLY * (1 + DEFAULTS['night.breakPremium']));
  // OT 20:00–22:00 nằm trong ngày lễ: 2 giờ × lương giờ × hệ số lễ vào OT ngày lễ; tổng = tổng ngày lễ không OT + 173.077 (≈ 741.346 + 173.077)
  near(ot.holWorkPay - plain.holWorkPay, 2 * HOURLY * HOL_RATE);
  near(ot.total, plain.total + 2 * HOURLY * HOL_RATE);
});

test('OT ngày lễ chưa duyệt: chờ duyệt, không trả; ngày lễ chưa duyệt thì hưởng lương lễ như không đi làm', async () => {
  const days = { [HOL]: { ...dayShift, extraKind: 'ot', extraIn: '', extraOut: '20:00' } };
  const pending = await month(DAY, days, { approvals: {} });
  assert.deepEqual(pending.pendingItems, [{ date: HOL, item: 'ot', status: 'pending' }]);
  assert.equal(pending.m.otHours, 0);
  near((await pending.row(HOL)).total, HOURLY * 8);
  // duyệt ngày lễ trước khi khai OT (dấu vân tay cũ): đổi đoạn OT thì phải duyệt lại
  const old = { [HOL]: { item: 'holiday_work', fingerprint: 'holiday_work|08:00-17:00', status: 'approved' } };
  assert.equal((await month(DAY, days, { approvals: old })).pendingItems.length, 1);
  // ngày khoá (src) chưa có otReview: giờ sau ca trong ngày lễ vẫn là OT ngày lễ, không chờ duyệt OT riêng
  const k = Engine.create(DEFAULTS);
  const locked = { ...days[HOL], src: 'admin' };
  const wait = k.calcDay(DAY, locked, true, null, { date: HOL, holidays: [HOL] });
  assert.deepEqual([wait.otH, wait.otWait, wait.otPay, wait.holWorkH], [0, 0, 0, 12]);
});

test('OT ngày lễ khi giờ bù trước đó chưa cân: không bị giữ, vẫn là OT ngày lễ', async () => {
  const days = {
    '2026-10-05': { kind: 'willmakeup' },
    [HOL]: { ...dayShift, extraKind: 'ot', extraIn: '', extraOut: '20:00' }
  };
  const r = await month(DAY, days);
  assert.deepEqual([(await r.row(HOL)).otH, (await r.row(HOL)).otHold, (await r.row(HOL)).holWorkH], [0, 0, 12]);
  assert.equal(r.m.otHoldHours, 0);
});

test('khai đi làm ngày lễ mà không có Check-in/out: vắng, 0 đồng, không lương lễ, m.noshow +1', async () => {
  const sessions = [await punch(NIGHT, MON, '22:00', '07:00', 1)];
  const declared = await month(NIGHT, { [MON]: nightShift, [HOL]: nightShift }, { sessions, actual: true });
  const undeclared = await month(NIGHT, { [MON]: nightShift }, { sessions, actual: true });
  assert.equal(declared.actualReport.report[HOL].state, 'absent');
  assert.ok(declared.actualReport.absent.includes(HOL));
  const row = await declared.row(HOL);
  assert.deepEqual([row.kind, row.total, row.holBase || 0], ['noshow', 0, 0]);
  assert.equal(declared.m.noshow, undeclared.m.noshow + 1);
  assert.equal(declared.m.holiday, undeclared.m.holiday - 1);
  assert.equal(declared.m.overHours, undeclared.m.overHours + DEFAULTS['time.workHoursPerDay']);
  near(declared.m.work, undeclared.m.work - HOURLY * 8);
  // ngày lễ không khai đi làm: lương lễ, không bao giờ vắng
  assert.equal((await undeclared.row(HOL)).kind, 'holiday');
  near((await undeclared.row(HOL)).total, HOURLY * 8);
  assert.ok(!undeclared.actualReport.absent.includes(HOL));
  // "Đi làm" không có giờ trên ngày lễ cũng là nghỉ lễ
  const noTimes = await month(NIGHT, { [MON]: nightShift, [HOL]: { kind: 'work' } }, { sessions, actual: true });
  assert.equal((await noTimes.row(HOL)).kind, 'holiday');
  near((await noTimes.row(HOL)).total, HOURLY * 8);
});

test('nghỉ việc 15/10: không lương lễ 20/10, không ngày vắng nào sau 15/10; chính ngày 15/10 vẫn là ngày làm việc', async () => {
  const resigned = { ...DAY, resignedOn: '2026-10-15' };
  const actual = await month(resigned, {}, { actual: true });
  assert.equal(await actual.row(HOL), undefined);
  assert.deepEqual(
    actual.m.rows.filter(r => r.date > '2026-10-15'),
    []
  );
  assert.equal(actual.m.holiday, 0);
  assert.equal((await actual.row('2026-10-15')).kind, 'noshow');
  assert.deepEqual(
    Object.keys(actual.actualReport.report).filter(d => d > '2026-10-15'),
    []
  );
  assert.deepEqual(
    actual.actualReport.absent.filter(d => d > '2026-10-15'),
    []
  );
  const declared = await month(resigned, {});
  assert.equal(declared.m.holiday, 0);
  assert.equal(declared.m.off, 0);
  // nghỉ việc sau ngày lễ: vẫn hưởng lương lễ
  const later = await month({ ...DAY, resignedOn: '2026-10-25' }, {});
  near((await later.row(HOL)).total, HOURLY * 8);
});

test('ca đêm ngày lễ vào 00:30 hôm sau (giờ lễ bị cắt hết): vẫn là ngày công và ca đêm (m.night)', async () => {
  const days = { [HOL]: nightShift };
  const late = await month(NIGHT, days, { sessions: [await punch(NIGHT, HOL, '00:30', '07:00', 1, 1)], actual: true });
  const row = await late.row(HOL);
  assert.equal(late.actualReport.report[HOL].cutStartMin, 150);
  assert.deepEqual([row.kind, row.holWorkH], ['holiday', 0]);
  assert.ok(row.hours > 0 && row.bonus > 0);
  assert.deepEqual([late.m.night, late.m.count], [1, 1]);
});
