'use strict';
// Với lịch MẶC ĐỊNH của ba chức vụ (người không có lịch riêng), kết quả tháng không mang dấu vết của lịch riêng.
//   - 300 đầu vào ca vàng: người không có lịch riêng không mang khoá workdaysStd (ca có staff.sched giữ ngày công chuẩn của chức vụ) và mọi đẳng thức tiền (test/helpers/payroll-invariants.ts) đều đúng;
//   - ca hạt cố định (mặc định 600; PAYROLL_DIFF_CASES=5000 cho đủ 5.000): ghi tường minh type.<mã>.workdaysMode = 'fixed' cho cùng kết quả từng bit với không ghi, VÀ không ca nào có m.workdaysStd hay staff.schedule;
//   - sáu ca ghim Z1..Z6 (số tính tay);
//   - bản chụp canonical: kết quả tháng của người mặc định không mang khoá workdaysStd và tính hai lần cho cùng một bản chụp JSON (như src/domain/period/periods.ts lưu).
// Phần đọc `src/engine/work-schedule.ts` chạy khi tệp đó có mặt.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Engine, DEFAULTS, LEGACY_DEFAULTS, golden, clone: cloneOf } = require('../helpers/pay-oracle');
const { caseProblems } = require('../helpers/payroll-invariants');
const { payrollEngineDifferential } = require('../helpers/payroll-differential');
const { generateCases } = require('../helpers/payroll-cases');
const { loadPayroll } = require('../helpers/payroll-vm');
const { pending } = require('../helpers/red');
const F = require('../helpers/schedule-fixtures');

const FIXED_SEED = 20261016;
const CASES = Number(process.env.PAYROLL_DIFF_CASES) || 600;
const hasKey = (value?, key?) => {
  if (!value || typeof value !== 'object') return false;
  if (Object.hasOwn(value, key)) return true;
  return Object.values<any>(value).some(item => hasKey(item, key));
};

test('S1: lịch mặc định, 300 ca vàng: đủ đẳng thức tiền; người không có lịch riêng không có khoá workdaysStd, người có staff.sched giữ mẫu số của chức vụ', () => {
  const engine = Engine.create(LEGACY_DEFAULTS);
  const wrong: any[] = [];
  const leaked: any[] = [];
  const changed: any[] = [];
  for (const c of golden.cases) {
    const out = engine.computeMonth(cloneOf(c.input));
    if (caseProblems(input => engine.computeMonth(input), c.input).length) wrong.push(c.id);
    if (Array.isArray(c.input.staff.sched)) {
      // lịch riêng dạng staff.sched chỉ đổi các ngày làm, ngày công chuẩn cố định vẫn là của chức vụ
      if (out.m.workdaysStd !== DEFAULTS[`type.${c.input.staff.type}.workdays`]) changed.push(c.id);
    } else if (hasKey(out.m, 'workdaysStd') || hasKey(out, 'workdaysStd')) leaked.push(c.id);
  }
  assert.deepEqual(wrong, []);
  assert.deepEqual(leaked, [], 'người mặc định không được có m.workdaysStd (thiết kế 3.3, R2)');
  assert.deepEqual(changed, [], 'người có staff.sched giữ ngày công chuẩn cố định của chức vụ');
});

test(`S1: lịch mặc định, ${CASES} ca hạt cố định (ba chức vụ, bốn tháng 09 đến 12/2026): ghi tường minh workdaysMode 'fixed' bằng không ghi từng bit; PAYROLL_DIFF_CASES=5000 cho đủ 5.000 ca`, () => {
  const unset = Engine.create(LEGACY_DEFAULTS);
  const fixed = Engine.create({
    ...LEGACY_DEFAULTS,
    'type.tts.workdaysMode': 'fixed',
    'type.ctv.workdaysMode': 'fixed',
    'type.nv.workdaysMode': 'fixed'
  });
  payrollEngineDifferential(input => fixed.computeMonth(input), {
    cases: CASES,
    seed: FIXED_SEED,
    label: 'schedule-defaults-zero-drift',
    reference: (input?) => unset.computeMonth(input)
  });
});

test(`S1: lịch mặc định, ${CASES} ca hạt cố định: không ca nào mang m.workdaysStd, và bộ máy không ghi staff.schedule vào đầu vào`, () => {
  const engine = Engine.create(LEGACY_DEFAULTS);
  const leaked: any[] = [];
  for (const c of generateCases(FIXED_SEED, CASES)) {
    assert.equal(Object.hasOwn(c.input.staff, 'schedule'), false, `${c.id}: bộ sinh ca không có lịch riêng`);
    const input = cloneOf(c.input);
    const out = engine.computeMonth(input);
    if (hasKey(out, 'workdaysStd')) leaked.push(c.id);
    assert.equal(Object.hasOwn(input.staff, 'schedule'), false, `${c.id}: bộ máy sửa đầu vào`);
  }
  assert.deepEqual(leaked, []);
});

test('S1: lịch mặc định, bản chụp canonical: kết quả tháng của người mặc định không mang khoá workdaysStd và tính hai lần cho cùng một bản chụp JSON', () => {
  const engine = Engine.create(LEGACY_DEFAULTS);
  const c = golden.cases.find(x => x.input.staff.type === 'nv' && !Array.isArray(x.input.staff.sched));
  const out = engine.computeMonth(cloneOf(c.input));
  assert.ok(!('workdaysStd' in out.m));
  // chụp lại bằng JSON (như payslips.snapshot) rồi so với lần tính thứ hai: ổn định, không có khoá phụ thuộc lịch
  const first = JSON.stringify(out.m);
  const second = JSON.stringify(Engine.create(LEGACY_DEFAULTS).computeMonth(cloneOf(c.input)).m);
  assert.equal(first, second);
});

/* ---------- sáu ca ghim ---------- */
const DAYS27 = () => F.fullDays('2026-10', F.MON_SAT);
const unpaid = (days, ...dates) => F.withDays(days, Object.fromEntries(dates.map(d => [d, { kind: 'unpaid' }])));

test('S1: Z1 NV đi đủ Thứ Hai đến Thứ Bảy (27 ngày): gộp 8.723.076, thực lĩnh 8.093.076 (chưa có tạm ứng đã duyệt)', async () => {
  const r = F.run(F.nvStaff(), DAYS27());
  assert.equal(r.m.count, 27);
  assert.deepEqual(await F.money(r), { gross: 8723076, net: 8093076 });
  assert.equal('workdaysStd' in r.m, false);
});
test('S1: Z2 TTS đi đủ Thứ Hai đến Thứ Sáu (22 ngày): gộp 2.000.000, thực lĩnh 2.000.000 (chưa có tạm ứng đã duyệt)', async () => {
  const r = F.run(F.ttsStaff(), F.fullDays('2026-10', F.MON_FRI));
  assert.equal(r.m.count, 22);
  assert.deepEqual(await F.money(r), { gross: 2000000, net: 2000000 });
});
test('S1: Z3 NV nghỉ không lương 3 ngày (05, 06, 07/10): 24 ngày, vắng 3, mất chuyên cần, gộp 6.369.231', () => {
  const r = F.run(F.nvStaff(), unpaid(DAYS27(), '2026-10-05', '2026-10-06', '2026-10-07'));
  assert.equal(r.m.count, 24);
  assert.equal(r.m.absent, 3);
  assert.equal(r.m.attendance, 0);
  assert.equal(r.m.net.gross, 6369231);
});
test('S1: Z4 NV nghỉ không lương 2 ngày: vắng 2, còn chuyên cần, gộp 8.076.924', () => {
  const r = F.run(F.nvStaff(), unpaid(DAYS27(), '2026-10-05', '2026-10-06'));
  assert.equal(r.m.absent, 2);
  assert.ok(r.m.attendance > 0);
  assert.equal(r.m.net.gross, 8076924);
});
test('S1: Z5 NV, lễ Thứ Bảy 10/10 (ngày đó không khai): 1 ngày lễ, gộp 8.630.769, thực lĩnh 8.000.769 (chưa có tạm ứng đã duyệt)', async () => {
  const r = F.run(F.nvStaff(), F.without(DAYS27(), '2026-10-10'), { holidays: ['2026-10-10'] });
  assert.equal(r.m.holiday, 1);
  assert.deepEqual(await F.money(r), { gross: 8630769, net: 8000769 });
});
test('S1: Z6 TTS, lễ Thứ Bảy 10/10: không hưởng lễ, gộp vẫn 2.000.000', () => {
  const r = F.run(F.ttsStaff(), F.fullDays('2026-10', F.MON_FRI), { holidays: ['2026-10-10'] });
  assert.equal(r.m.holiday, 0);
  assert.equal(r.m.net.gross, 2000000);
});

/* ---------- đọc từ mô-đun lịch ---------- */
const moduleReady = pending('S1-2a: src/engine/work-schedule.ts chưa có', 'src/engine/work-schedule.ts');

test(
  'S1: scheduleOf của ba chức vụ mặc định, mọi tháng 2026 và 2027, đúng {dows, workdays} của khối cũ; workdaysOf = 22, 26, 26; không có lịch riêng thì nguồn là chức vụ',
  moduleReady,
  () => {
    const WS = require('../../src/engine/work-schedule');
    const { api: legacy } = loadPayroll({
      append:
        'this.t = Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, { dows: t.dows, workdays: t.workdays }]));',
      exportAs: 't',
      timeout: 1000
    });
    for (const type of ['tts', 'ctv', 'nv'])
      for (const year of [2026, 2027])
        for (let m = 1; m <= 12; m++) {
          const month = `${year}-${F.pad(m)}`;
          const s = WS.scheduleOf({ username: 'qa_s', type }, month);
          const want = legacy[type];
          assert.equal(s.source, 'type', `${type} ${month}`);
          assert.deepEqual([...s.pattern.dows], [...want.dows], `${type} ${month} dows`);
          assert.equal(WS.workdaysOf(s, month), want.workdays, `${type} ${month} workdays`);
        }
    assert.deepEqual(
      ['tts', 'ctv', 'nv'].map(t => WS.scheduledDates(WS.scheduleOf({ type: t }, '2026-10'), '2026-10').length),
      [22, 27, 27]
    );
  }
);
