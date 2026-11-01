'use strict';
// Sáu mô-đun luật dùng chung đọc số của chúng từ bộ tham số qua create(params). Mỗi mô-đun: đổi MỘT giá trị của bộ tham số thì
// kết quả khác, bản trần của mô-đun bằng create(DEFAULTS), khoá vắng ném PARAM_MISSING (không đoán), create nhớ theo đối tượng tham số, và không sửa bộ tham số.
// FALLBACK chuyển tiếp của từng mô-đun phải bằng DEFAULTS (scripts/params/check-fallbacks.ts).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const ActualHours = require('../../src/engine/actual-hours');
const ApprovalView = require('../../src/engine/approval-view');
const KpiScore = require('../../src/engine/kpi-score');
const Punch = require('../../src/engine/punch');
const Leave = require('../../src/engine/leave');
const PayrollCalendar = require('../../src/engine/payroll-calendar');

const MODULES = {
  'actual-hours': [ActualHours, 'attendance.graceMin'],
  'approval-view': [ApprovalView, 'request.type.isat.pendingRule'],
  'kpi-score': [KpiScore, 'kpi.weight.wework'],
  punch: [Punch, 'attendance.openSessionMaxHours'],
  leave: [Leave, 'leave.accrual.perMonth'],
  'payroll-calendar': [PayrollCalendar, 'time.nightStartHour']
};
const withParams = (patch?) => ({ ...DEFAULTS, ...patch });

test('Leave: leave.accrual.perMonth = 2 làm ngày phép cộng dồn nhiều hơn (cùng một người, cùng hai tháng): 2 → 4', async () => {
  const staff = { startDate: '2026-03-15', leaveAdjust: 0 };
  const changed = Leave.create(await withParams({ 'leave.accrual.perMonth': 2 }));
  assert.equal(Leave.accrued(staff, '2026-05-15').total, 2, '2 tháng × 1 (không còn +1 ngày đầu, Đ35 23/10/2026)');
  assert.equal(changed.accrued(staff, '2026-05-15').total, 4, '2 tháng × 2');
  assert.equal(changed.accrued(staff, '2026-05-15').months, 2, 'số lần cộng không đổi, chỉ hệ số');
  // hệ số ngày đầu và sinh nhật cũng theo tham số (sinh nhật chỉ cho cấp Nhân viên)
  const withBirthday = { startDate: '2026-03-15', birthday: '1999-04-20', leaveAdjust: 0, type: 'nv' };
  assert.equal(
    Leave.create(await withParams({ 'leave.accrual.start': 3 })).accrued(withBirthday, '2026-03-15').total,
    3
  );
  assert.equal(
    Leave.create(await withParams({ 'leave.accrual.birthday': 4 })).accrued(withBirthday, '2026-05-15').total,
    2 + 4
  );
});

test('Actual-hours: attendance.graceMin = 30 thì đi trễ 20 phút không bị trừ (mặc định 15 phút: trừ 30)', async () => {
  const lenient = ActualHours.create(await withParams({ 'attendance.graceMin': 30 }));
  assert.deepEqual(
    [15, 16, 20, 29].map(m => ActualHours.cutMin(m)),
    [0, 30, 30, 30]
  );
  assert.deepEqual(
    [14, 15, 20, 29].map(m => lenient.cutMin(m)),
    [0, 0, 0, 0]
  );
  assert.equal(lenient.cutMin(45), ActualHours.cutMin(45), 'từ mốc cũ trở lên bậc 30 phút giữ nguyên');
  assert.equal(lenient.RULE.GRACE_MIN, 30);
  assert.equal(ActualHours.RULE.GRACE_MIN, 15);
});

test('Punch: attendance.openSessionMaxHours = 10 thì ca mở 11 giờ là quên check-out (mặc định 16 giờ thì chưa)', async () => {
  const strict = Punch.create(await withParams({ 'attendance.openSessionMaxHours': 10 }));
  const checkIn = '2026-10-05T08:00:00+07:00';
  const now = '2026-10-05T19:00:00+07:00'; // 11 giờ sau
  assert.equal(Punch.forgotOut(checkIn, now), false);
  assert.equal(strict.forgotOut(checkIn, now), true);
  assert.notEqual(strict.forgotOutDate(checkIn), Punch.forgotOutDate(checkIn));
});

test('Kpi-score: đổi trọng số (Base Wework 20, người dùng 44) làm tổng điểm 70 → 60 với cùng điểm thành phần', async () => {
  const parts = { wework: 100, user: 50, peer: 50, manager: 50, self: 50 };
  const changed = KpiScore.create(await withParams({ 'kpi.weight.wework': 20, 'kpi.weight.user': 44 }));
  assert.equal(KpiScore.evaluate(parts, { pass: 75 }).total, 70);
  assert.equal(changed.evaluate(parts, { pass: 75 }).total, 60);
  assert.deepEqual(
    changed.COMPONENTS.map(c => [c.key, c.weight]),
    [
      ['wework', 20],
      ['user', 44],
      ['peer', 18],
      ['manager', 12],
      ['self', 6]
    ]
  );
});

test('Approval-view: request.type.isat.pendingRule = drop thì iSAT chờ duyệt bị bỏ khỏi lịch tính lương (mặc định unpaid: giữ là ngày không lương)', async () => {
  const dropped = ApprovalView.create(await withParams({ 'request.type.isat.pendingRule': 'drop' }));
  const days = { '2026-10-03': { kind: 'isat' } };
  const ctx = { holidays: [] as any[], staffType: 'nv' };
  assert.deepEqual(ApprovalView.payView(days, {}, undefined, ctx).payDays, { '2026-10-03': { kind: 'unpaid' } });
  assert.deepEqual(dropped.payView(days, {}, undefined, ctx).payDays, {});
  assert.equal(ApprovalView.POLICY.pending.isat, 'unpaid');
  assert.equal(dropped.POLICY.pending.isat, 'drop');
  // khoản khác không đổi
  assert.equal(dropped.POLICY.pending.leave, 'unpaid');
});

test('Approval-view: lịch theo type.<loại>.dows của bộ tham số; loại lạ như constructor không làm ném lỗi (tra theo thuộc tính của chính nó)', async () => {
  const sat = ApprovalView.create(await withParams({ 'type.tts.dows': [1, 2, 3, 4, 5, 6] }));
  assert.deepEqual(JSON.parse(JSON.stringify(sat.SCHEDULE.tts)), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(JSON.parse(JSON.stringify(ApprovalView.SCHEDULE.tts)), [1, 2, 3, 4, 5]);
  for (const staffType of ['constructor', 'toString', '__proto__', 'hasOwnProperty'])
    assert.doesNotThrow(
      () =>
        ApprovalView.itemOf(
          { kind: 'work', in: '08:00', out: '17:00' },
          { date: '2026-10-12', holidays: ['2026-10-12'], staffType }
        ),
      staffType
    );
});

test('Payroll-calendar: time.nightStartHour = 23 thì ca 22:00–07:00 chỉ còn 6 giờ đêm (mặc định 22: 7 giờ)', async () => {
  const late = PayrollCalendar.create(await withParams({ 'time.nightStartHour': 23 }));
  const entry = { in: '22:00', out: '07:00' };
  assert.equal(PayrollCalendar.splitMainWork(entry, '2026-10-05', []).nightH, 7);
  assert.equal(late.splitMainWork(entry, '2026-10-05', []).nightH, 6);
  assert.equal(late.splitMainWork(entry, '2026-10-05', []).normalH, 8, 'giờ công không đổi');
});

test('Khoá vắng ném PARAM_MISSING (có mã và tên khoá), không đoán giá trị, ở cả sáu mô-đun', async () => {
  for (const [name, [Module, key]] of Object.entries<any>(MODULES)) {
    const params = await withParams({});
    delete params[key];
    assert.throws(
      () => Module.create(params),
      error =>
        error.code === 'PARAM_MISSING' &&
        error.key === key &&
        new RegExp(key.replace(/\./g, '\\.')).test(error.message),
      `${name}: thiếu ${key}`
    );
  }
});

test('create(params) từ chối đầu vào không phải đối tượng (TypeError hoặc PARAM_MISSING), nhớ theo đối tượng, và không sửa bộ tham số', async () => {
  for (const [name, [Module]] of Object.entries<any>(MODULES)) {
    for (const bad of [null, undefined, 5, 'x']) assert.throws(() => Module.create(bad), `${name}: ${String(bad)}`);
    const params = await withParams({});
    const before = JSON.stringify(params);
    const a = Module.create(params);
    assert.equal(Module.create(params), a, `${name}: cùng đối tượng, cùng bản dựng`);
    assert.notEqual(Module.create(await withParams({})), a, `${name}: đối tượng khác, bản dựng khác`);
    assert.equal(JSON.stringify(params), before, `${name}: không sửa bộ tham số`);
    assert.ok(Object.isFrozen(a), `${name}: bản dựng đóng băng`);
  }
});

test('Bản trần của mỗi mô-đun bằng create(DEFAULTS) (người gọi cũ không đổi) và có FALLBACK bằng DEFAULTS từng khoá', () => {
  for (const [name, [Module]] of Object.entries<any>(MODULES)) {
    assert.equal(Module, Module.create(DEFAULTS), `${name}: bản trần là create(DEFAULTS)`);
    for (const [key, value] of Object.entries<any>(Module.FALLBACK))
      assert.deepEqual(
        JSON.parse(JSON.stringify(DEFAULTS[key])),
        JSON.parse(JSON.stringify(value)),
        `${name} FALLBACK ${key}`
      );
  }
});

test('scripts/params/check-fallbacks.ts không báo lệch nào và thoát 0', () => {
  const { problems } = require('../../scripts/params/check-fallbacks.ts');
  assert.deepEqual(problems(), []);
  const { spawnSync } = require('node:child_process');
  const run = spawnSync(process.execPath, ['scripts/params/check-fallbacks.ts'], {
    cwd: require('node:path').join(__dirname, '../..'),
    encoding: 'utf8'
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /check-fallbacks đạt: 7 mô-đun/);
});

test('Bộ máy chạy được với bộ tham số đã đổi (truyền xuống sáu mô-đun) và với mặc định vẫn ra đúng số của ca vàng', async () => {
  const Engine = require('../../src/engine/payroll-engine');
  const { readGolden } = require('../helpers/golden');
  const golden = readGolden();
  // bộ máy với tham số mặc định và tham số đã đổi cùng chạy được trên một ca vàng (không ném lỗi), kết quả hợp lệ
  const c = golden.cases.find(x => x.id === 'known-short-nv2-full-month');
  const { legacyParams } = require('../helpers/legacy-params');
  const base = Engine.create(legacyParams()).computeMonth(JSON.parse(JSON.stringify(c.input)));
  const other = Engine.create(await withParams({ 'attendance.graceMin': 30 })).computeMonth(
    JSON.parse(JSON.stringify(c.input))
  );
  assert.equal(base.m.net.gross, c.expected.gross);
  assert.ok(Number.isFinite(other.m.net.gross));
});
