'use strict';
// Các class của module overtime và hạ tầng luật dùng chung (src/domain/shared/rule.ts, src/domain/overtime/*).
// Trọng tâm: MỘT nguồn con số (đổi trần trong bộ tham số thì mọi nơi kiểm trần theo) và thêm luật không phải sửa service.
require('../helpers/require-isolated-database');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const warnings = require('../../src/platform/warnings');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { Rule, RuleSet, Violation } = require('../../src/domain/shared/rule');
const { OtLimits } = require('../../src/domain/overtime/ot-limits');
const { SheetLimits } = require('../../src/domain/overtime/sheet-limits');
const { WorkedHours } = require('../../src/domain/overtime/worked-hours');
const { AdvanceRequestWindow } = require('../../src/domain/advance/advance-request-window');

after(() => store.db.close());

const PARAMS = {
  'time.breakHours': DEFAULTS['time.breakHours'],
  'time.breakAfterWorkHours': DEFAULTS['time.breakAfterWorkHours']
};
const ot = (extraOut?, extraIn = '') => ({
  kind: 'work',
  in: '08:00',
  out: '17:00',
  extraKind: 'ot',
  extraIn,
  extraOut
});
const days = (n?) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`2026-10-${String(i + 1).padStart(2, '0')}`, ot('21:00')]));
const codeOf = (c?) => err => err.status === 400 && err.details?.code === c;

class Always extends Rule {
  violation: any;

  constructor(violation?) {
    super();
    this.violation = violation;
  }

  *evaluate() {
    yield this.violation;
  }
}

test('RuleSet: duyệt theo thứ tự đăng ký, vi phạm chặn đầu tiên ném HttpError mang code và details', async () => {
  const set = new RuleSet([
    new Always(Violation.block('RULE_A', 'chặn A', { date: '2026-10-01' })),
    new Always(Violation.block('RULE_B', 'chặn B'))
  ]);
  await assert.rejects(
    () => set.check({}),
    err =>
      err.status === 400 &&
      err.message === 'chặn A' &&
      err.details.code === 'RULE_A' &&
      err.details.date === '2026-10-01'
  );
  const listed: any[] = [];
  for await (const violation of await set.violations({})) listed.push(violation);
  assert.deepEqual(
    listed.map(v => v.code),
    ['RULE_A', 'RULE_B'],
    'violations() liệt kê đủ, không ném'
  );
});

test('RuleSet: vi phạm cảnh báo đi qua warnIf (không ném) và rồi chạy tiếp tới luật sau', async () => {
  const set = new RuleSet([
    new Always(Violation.warn('W_ONE', 'cảnh báo một', 'hệ quả.')),
    new Always(Violation.warn('W_TWO', 'cảnh báo hai'))
  ]);
  const got = await warnings.run(async () => {
    await set.check({});
    return warnings.take();
  });
  assert.deepEqual(
    got.map(w => w.code),
    ['W_ONE', 'W_TWO']
  );
  assert.match(got[0].message, /cảnh báo một\. hệ quả\./);
});

test('RuleSet: chỉ nhận Rule; thêm luật mới là thêm một đối tượng, service dùng RuleSet không đổi', () => {
  assert.throws(() => new RuleSet([{ evaluate: () => [] }]), TypeError);
  const set = new RuleSet();
  assert.equal(set.size, 0);
  set.add(new Always(Violation.warn('W', 'm')));
  assert.equal(set.size, 1);
});

test('OtLimits: mặc định 12 giờ/ngày và 40 giờ/tháng từ registry; đọc từ bộ tham số khi có; từ chối giá trị không phải số dương', () => {
  const defaults = OtLimits.defaults();
  assert.equal(defaults.dayCap, DEFAULTS[OtLimits.DAY_KEY]);
  assert.equal(defaults.monthCap, DEFAULTS[OtLimits.MONTH_KEY]);
  assert.equal(OtLimits.of({ [OtLimits.MONTH_KEY]: 100 }).monthCap, 100);
  assert.equal(OtLimits.of({ [OtLimits.MONTH_KEY]: 100 }).dayCap, defaults.dayCap, 'khoá vắng thì rơi về mặc định');
  for (const bad of [0, -1, NaN, '40', null])
    assert.throws(() => OtLimits.of({ [OtLimits.MONTH_KEY]: bad }), /số dương/);
});

test('MỘT nguồn trần OT: đổi law.ceiling.otMonthHours trong bộ tham số thì kiểm lưu lịch theo số mới, không sửa chỗ nào khác', async () => {
  const limits = new SheetLimits();
  const check = (extra?, clean?) =>
    limits.checkMonth({ params: { ...PARAMS, ...extra }, month: '2026-10', clean, prevDays: {}, holidays: [] });
  const eleven = await days(11); // 44 giờ OT
  await assert.rejects(() => check({}, eleven), codeOf('OT_MONTH_CAP'), 'trần mặc định 40 chặn 44 giờ');
  await assert.doesNotReject(() => check({ [OtLimits.MONTH_KEY]: 100 }, eleven), 'nâng trần lên 100 thì 44 giờ được');
  await assert.rejects(
    async () => check({ [OtLimits.MONTH_KEY]: 100 }, await days(26)),
    codeOf('OT_MONTH_CAP'),
    '104 giờ vẫn vượt 100'
  );
});

test('MỘT nguồn trần giờ ngày: hạ law.ceiling.otDayTotalHours xuống 10 thì ngày 11 giờ ròng bị chặn', async () => {
  const limits = new SheetLimits();
  const clean = { '2026-10-05': ot('20:00') }; // ca 9 giờ trừ 1 giờ nghỉ + 3 giờ OT = 11 giờ ròng
  const run = (extra?) => limits.checkDays({ params: { ...PARAMS, ...extra }, clean, prevDays: {}, holidays: [] });
  await assert.doesNotReject(() => run({}));
  await assert.rejects(() => run({ [OtLimits.DAY_KEY]: 10 }), codeOf('DAY_HOURS_CAP'));
});

test('thêm luật mới vào bộ luật khai lịch không đụng SheetLimits: chỉ truyền thêm một Rule', async () => {
  class Forbidden extends Rule {
    *evaluate() {
      yield Violation.block('NO_OT_FRIDAY', 'Không OT thứ Sáu');
    }
  }
  const limits = new SheetLimits({ perMonth: new RuleSet([new Forbidden()]) });
  await assert.rejects(
    () => limits.checkMonth({ params: PARAMS, month: '2026-10', clean: {}, prevDays: {} }),
    codeOf('NO_OT_FRIDAY')
  );
});

test('WorkedHours: giờ ròng dùng giờ nghỉ của tham số; ca 9 giờ trừ 1 giờ nghỉ, ngày lễ không trừ', () => {
  const worked = WorkedHours.forParams(PARAMS);
  assert.equal(worked.dayNetHours({ in: '08:00', out: '17:00' }), 8);
  assert.equal(worked.dayNetHours({ in: '08:00', out: '17:00' }, { holiday: true }), 9);
  assert.equal(WorkedHours.shiftFor('22:00', '07:00'), 'night');
  assert.equal(WorkedHours.spanH('22:00', '06:00'), 8);
});

test('AdvanceRequestWindow: chỉ mở ngày 16 và 17, tháng xin phải là tháng của hôm nay', async () => {
  const window = new AdvanceRequestWindow();
  assert.equal(window.isOpen('2026-10-16'), true);
  assert.equal(window.isOpen('2026-10-18'), false);
  assert.deepEqual(await window.view('2026-10-17'), { days: [16, 17], open: true });
  assert.throws(
    () => window.assertOpen('2026-10-01'),
    err => err.status === 409 && err.details.code === 'ADVANCE_WINDOW_CLOSED'
  );
  assert.throws(
    () => window.assertMonthCurrent('2026-09', '2026-10-16'),
    err => err.status === 409 && err.details.code === 'ADVANCE_MONTH_NOT_CURRENT'
  );
  assert.doesNotThrow(() => window.assertMonthCurrent('2026-10', '2026-10-16'));
});
