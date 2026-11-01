'use strict';
// Hồ sơ nhân sự sai KHÔNG được tính ra 0 ₫ âm thầm. src/engine/payroll-engine.ts → assertStaff làm cho
// computeMonth(input) và create(params).calcMonth(...) ném lỗi có mã, có `field`, thông báo tiếng Việt nêu tên trường và giá trị, không bao giờ trả tiền:
//   PAYROLL_BAD_TYPE   staff thiếu, loại không phải chuỗi, loại lạ ('xyz') hoặc trùng tên thuộc tính Object ('constructor');
//   PAYROLL_BAD_LEVEL  bậc null, object, 'abc', 0, 99, hoặc không có trong bảng bậc của loại (tts bậc 7).
// Nhân sự hợp lệ giữ nguyên kết quả (ca vàng và so sánh kép lo phần đó; ở đây chỉ một ca để thấy cổng không chặn nhầm).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { LEGACY_DEFAULTS } = require('../helpers/pay-oracle');
const { readGolden } = require('../helpers/golden');

const golden = readGolden();
const base = golden.cases.find(c => c.input.staff.type === 'nv' && c.input.staff.level === 1);
const engine = Engine.create(LEGACY_DEFAULTS); // khối cũ không đếm ngày có lương: ngưỡng không đóng bảo hiểm rất lớn
const clone = (value?) => JSON.parse(JSON.stringify(value));
const inputWith = (staff?) => ({ ...clone(base.input), staff });
const staffWith = (patch?) => ({ ...clone(base.input.staff), ...patch });
const near = (actual?, expected?, label = '') =>
  assert.ok(Math.abs(actual - expected) <= 3, `${label} ${actual} != ${expected}`);

// Mọi cách vào bộ máy phải ném cùng một lỗi
const ENTRIES = {
  'Engine.computeMonth(input, params)': (staff?) => Engine.computeMonth(inputWith(staff), LEGACY_DEFAULTS),
  'create(params).computeMonth(input)': (staff?) => engine.computeMonth(inputWith(staff)),
  'create(params).calcMonth(staff, ...)': (staff?) =>
    engine.calcMonth(staff, clone(base.input.days), { pct: null, amt: null }, [], base.input.month, null)
};
const expectCoded = (fn?, code?, field?) => {
  let error;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  assert.ok(error, 'phải ném lỗi, không được trả kết quả');
  assert.equal(error.code, code, `${code}: nhận ${error.code} (${error.message})`);
  assert.equal(error.field, field);
  assert.equal(typeof error.message, 'string');
  return error;
};

test('T16: loại nhân sự sai (thiếu staff, không phải chuỗi, lạ, trùng tên thuộc tính Object) ném PAYROLL_BAD_TYPE ở cả ba đường vào', () => {
  const BAD_STAFF = [
    undefined,
    null,
    {},
    staffWith({ type: undefined }),
    staffWith({ type: null }),
    staffWith({ type: 5 }),
    staffWith({ type: {} }),
    staffWith({ type: ['nv'] }),
    staffWith({ type: '' }),
    staffWith({ type: 'xyz' }),
    staffWith({ type: 'NV' }),
    staffWith({ type: 'constructor' }),
    staffWith({ type: '__proto__' }),
    staffWith({ type: 'toString' }),
    staffWith({ type: 'hasOwnProperty' }),
    staffWith({ type: 'levels' })
  ];
  for (const [name, enter] of Object.entries<any>(ENTRIES))
    for (const staff of BAD_STAFF) {
      const error = expectCoded(() => enter(staff), 'PAYROLL_BAD_TYPE', 'type');
      assert.match(error.message, /Loại nhân sự/, `${name}: ${JSON.stringify(staff)?.slice(0, 60)}`);
    }
});

test('T16: bậc lương sai (null, object, chuỗi lạ, 0, 99, mảng, thiếu, không có trong bảng của loại: tts 7, nv 5, ctv 5) ném PAYROLL_BAD_LEVEL', () => {
  const BAD = [
    staffWith({ level: null }),
    staffWith({ level: undefined }),
    staffWith({ level: {} }),
    staffWith({ level: [] }),
    staffWith({ level: 'abc' }),
    staffWith({ level: '' }),
    staffWith({ level: 0 }),
    staffWith({ level: -1 }),
    staffWith({ level: 99 }),
    staffWith({ level: 1.5 }),
    staffWith({ level: NaN }),
    staffWith({ level: true }),
    staffWith({ type: 'tts', level: 7 }),
    staffWith({ type: 'tts', level: 0 }),
    staffWith({ type: 'nv', level: 5 }),
    staffWith({ type: 'ctv', level: 5 }),
    (() => {
      const staff = staffWith({});
      delete staff.level;
      return staff;
    })()
  ];
  for (const [name, enter] of Object.entries<any>(ENTRIES))
    for (const staff of BAD) {
      const error = expectCoded(() => enter(staff), 'PAYROLL_BAD_LEVEL', 'level');
      assert.match(error.message, /Bậc lương/, `${name}: level=${String(staff.level)} type=${staff.type}`);
    }
});

test('T16: thông báo nêu tên trường và giá trị sai (cắt gọn) và tài khoản, bằng tiếng Việt, không chứa số tiền', () => {
  const level = expectCoded(
    () => ENTRIES['create(params).computeMonth(input)'](staffWith({ level: 99 })),
    'PAYROLL_BAD_LEVEL',
    'level'
  );
  assert.match(level.message, /Bậc lương "?99"?/);
  assert.ok(level.message.includes(base.input.staff.username), 'nêu tài khoản để Admin sửa đúng hồ sơ');
  assert.match(level.message, /sửa bậc trong hồ sơ nhân sự/);
  const type = expectCoded(
    () => ENTRIES['create(params).computeMonth(input)'](staffWith({ type: 'xyz' })),
    'PAYROLL_BAD_TYPE',
    'type'
  );
  assert.match(type.message, /xyz/);
  assert.match(type.message, /sửa loại trong hồ sơ nhân sự/);
  for (const error of [level, type]) assert.doesNotMatch(error.message, /\d{1,3}(\.\d{3}){1,}\s?₫|total|gross|net/i);
  // giá trị quá dài không làm thông báo phình ra
  const long = expectCoded(
    () => ENTRIES['create(params).computeMonth(input)'](staffWith({ type: 'x'.repeat(5000) })),
    'PAYROLL_BAD_TYPE',
    'type'
  );
  assert.ok(long.message.length < 600, `thông báo dài ${long.message.length} ký tự`);
  // giá trị không nêu được thì nói sai kiểu, không ném lỗi lạ
  const weird = expectCoded(
    () => ENTRIES['create(params).computeMonth(input)'](staffWith({ level: { toString: 'x' } })),
    'PAYROLL_BAD_LEVEL',
    'level'
  );
  assert.match(weird.message, /sai kiểu dữ liệu/);
});

test('T16: loại sai được báo trước bậc sai (xyz bậc 99 là PAYROLL_BAD_TYPE); staff hợp lệ khác loại vẫn tính', () => {
  expectCoded(() => engine.computeMonth(inputWith(staffWith({ type: 'xyz', level: 99 }))), 'PAYROLL_BAD_TYPE', 'type');
  // bậc 6 chỉ có ở TTS, bậc 7 không có ở đâu cả
  for (const [type, level] of [
    ['tts', 1],
    ['tts', 6],
    ['ctv', 1],
    ['ctv', 4],
    ['nv', 1],
    ['nv', 4]
  ]) {
    const out = engine.computeMonth(inputWith(staffWith({ type, level })));
    assert.equal(typeof out.m.total, 'number', `${type} bậc ${level}`);
    assert.ok(Number.isFinite(out.m.net.gross));
  }
});

test('T16: nhân sự hợp lệ giữ nguyên kết quả đến từng đồng (một ca vàng; toàn bộ 300 ca do payroll-golden và so sánh kép giữ)', () => {
  const out = engine.computeMonth(clone(base.input));
  // bản đóng băng cộng số thực rồi làm tròn; bộ máy cộng các dòng nguyên đồng nên lệch tối đa vài đồng
  near(out.m.net.gross, base.expected.gross);
  near(out.m.total, base.expected.total);
  // tính tay: 1 ngày công NV bậc 1 = 230.769 (6.000.000 ÷ 26) + đi lại 34.615 (900.000 ÷ 26) + chuyên cần 57.692 (1.500.000 ÷ 26) + KPI 5.532.000 (6.000.000 × 92,2 %) = 5.855.076;
  // trừ bảo hiểm 10,5 % × 6.000.000 = 630.000, thuế 0, không có khoản tạm ứng nào được duyệt nên không trừ tạm ứng
  assert.equal(out.m.net.gross, 5855076);
  assert.equal(out.m.net.net, 5855076 - 630000);
  const calc = engine.calcMonth(
    clone(base.input.staff),
    out.payDays,
    clone(base.input.kpi),
    base.input.holidays,
    base.input.month,
    base.input.upTo
  );
  near(calc.net.gross, base.expected.gross, 'calcMonth gọi trực tiếp (như AI soát dữ liệu) cũng không đổi');
});

test('T16: lỗi hồ sơ ném TRƯỚC khi tính: đầu vào không bị sửa và không có lượt tính dở nào để lại', () => {
  const input = inputWith(staffWith({ level: 99 }));
  const before = JSON.stringify(input);
  assert.throws(
    () => engine.computeMonth(input),
    error => error.code === 'PAYROLL_BAD_LEVEL'
  );
  assert.equal(JSON.stringify(input), before);
  // gọi lại với hồ sơ đúng ngay sau đó vẫn ra kết quả bình thường (không có trạng thái dính)
  const ok = engine.computeMonth(clone(base.input));
  near(ok.m.net.gross, base.expected.gross);
});
