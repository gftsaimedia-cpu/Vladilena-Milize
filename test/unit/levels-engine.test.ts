'use strict';
// Quyền lợi theo từng bậc (chuỗi bậc → chức vụ → toàn cục) ở bộ máy tính lương. Ghi đè level.<mã>.<bậc>.<đuôi> (khác null) thay type.<mã>.<đuôi>
// chỉ cho người ở bậc đó; không có ghi đè (hoặc null) thì cùng đối tượng tham số và tiền không đổi.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Engine, DEFAULTS, caseOf, clone, closeTo } = require('../helpers/pay-oracle');
const PayOptions = require('../../src/engine/pay-options-calc');

const KNOWN = 'known-kpi-five-100-90-80-85-100';
const run = (params?, level?) => {
  const input = clone(caseOf(KNOWN).input);
  input.staff.level = level;
  return Engine.create(params).computeMonth(input).m;
};

test('GĐ-bậc 1: levelView không có ghi đè nào của bậc thì trả đúng đối tượng tham số (không bản sao, tiền không đổi)', () => {
  const staff = { type: 'nv', level: 2 };
  assert.equal(PayOptions.levelView(DEFAULTS, staff), DEFAULTS);
  const withNull: Record<string, any> = { ...DEFAULTS, 'level.nv.2.travel': null, 'level.nv.2.benefit.kpi': null };
  assert.equal(PayOptions.levelView(withNull, staff), withNull, 'null = kế thừa, không tạo bản gộp');
  assert.equal(PayOptions.levelView(DEFAULTS, { type: 'nv' }), DEFAULTS);
  assert.equal(PayOptions.levelView(DEFAULTS, null), DEFAULTS);
});

test('GĐ-bậc 1: levelView nhớ một bản gộp cho mỗi chức vụ và bậc, bậc khác giữ đối tượng gốc', () => {
  const params = { ...DEFAULTS, 'level.nv.2.travel': 0.2 };
  const a = PayOptions.levelView(params, { type: 'nv', level: 2 });
  assert.notEqual(a, params);
  assert.equal(a['type.nv.travel'], 0.2);
  assert.equal(PayOptions.levelView(params, { type: 'nv', level: 2 }), a, 'cùng bản gộp ở lần gọi sau');
  assert.equal(PayOptions.levelView(params, { type: 'nv', level: 1 }), params);
  assert.equal(params['type.nv.travel'], DEFAULTS['type.nv.travel'], 'không sửa bộ tham số gốc');
});

test('GĐ-bậc 1: đi lại của NV bậc 2 ghi đè 20 % thì chỉ bậc 2 đổi (đi lại × 20/15), bậc 1 giữ nguyên từng đồng', () => {
  const params = { ...DEFAULTS, 'level.nv.2.travel': 0.2 };
  const base2 = run(DEFAULTS, 2);
  const over2 = run(params, 2);
  assert.ok(base2.travel > 0);
  assert.ok(closeTo(over2.travel, (base2.travel * 0.2) / DEFAULTS['type.nv.travel']), `${over2.travel}`);
  assert.notEqual(over2.total, base2.total);
  assert.deepEqual(run(params, 1), run(DEFAULTS, 1), 'bậc 1 không bị ảnh hưởng');
});

test('GĐ-bậc 1: tắt cờ KPI của bậc 2 NV cho đúng kết quả như tắt cờ ở cả chức vụ (với người bậc 2), bậc khác giữ nguyên; null (kế thừa) y hệt mặc định', () => {
  const off = { ...DEFAULTS, 'level.nv.2.benefit.kpi': false };
  const before = run(DEFAULTS, 2);
  assert.ok(before.kpiPay > 0, 'mặc định NV bậc 2 có tiền KPI');
  const viaLevel = run(off, 2);
  assert.equal(viaLevel.kpiPay, 0);
  assert.notEqual(viaLevel.total, before.total);
  assert.deepEqual(
    viaLevel,
    run({ ...DEFAULTS, 'type.nv.benefit.kpi': false }, 2),
    'cùng một kết quả với tắt ở chức vụ'
  );
  assert.deepEqual(run(off, 3), run(DEFAULTS, 3));
  assert.deepEqual(run({ ...DEFAULTS, 'level.nv.2.benefit.kpi': null }, 2), before);
});

test('GĐ-bậc 1: calcMonth trực tiếp của bộ máy cũng đọc ghi đè của bậc (đường AI soát dữ liệu)', () => {
  const params = { ...DEFAULTS, 'level.nv.2.travel': 0.2 };
  const input = clone(caseOf(KNOWN).input);
  input.staff.level = 2;
  const viaCompute = Engine.create(params).computeMonth(clone(input)).m;
  const engine = Engine.create(params);
  const direct = engine.calcMonth(input.staff, input.days, input.kpi, input.holidays, input.month);
  assert.ok(closeTo(direct.travel, viaCompute.travel));
});
