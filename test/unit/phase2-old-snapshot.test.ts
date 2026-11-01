'use strict';
// Bộ tham số chụp cũ (payroll_runs.params_json) không có các khoá thêm sau lúc chụp (phương án bảo hiểm và thuế, chức vụ, khối,
// lịch, khoá nối thêm, ngưỡng AI). Khoá thiếu đọc bằng MẶC ĐỊNH, không ném PARAM_MISSING, để verify và tính lại kỳ cũ cho đúng số lúc chụp.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS, LATE_KEYS } = require('../../src/engine/payroll-params');
const { readGolden } = require('../helpers/golden');
const clone = (value?) => JSON.parse(JSON.stringify(value));
const snapshotBefore = () => {
  const old = { ...DEFAULTS };
  for (const key of LATE_KEYS) delete old[key];
  return old;
};

test('GĐ2: bản chụp tham số cũ (thiếu mọi khoá đợt 16/10) tính 300 ca vàng ra đúng từng trường như bộ tham số đầy đủ, không ném lỗi', () => {
  assert.ok(LATE_KEYS.length >= 45, 'danh sách khoá thêm sau 16/10');
  const old = snapshotBefore();
  for (const key of LATE_KEYS) assert.ok(!(key in old) && key in DEFAULTS, key);
  const cases = readGolden().cases;
  assert.ok(cases.length >= 300);
  for (const c of cases) {
    const before = Engine.create(old).computeMonth(clone(c.input)).m;
    // KHÔNG dùng test/helpers/legacy-params.ts ở đây: đồ đó tắt cả request.type.approved.countsAbsent (cách hiểu của khối công thức cũ),
    // còn bản chụp cũ thì fillLate điền khoá muộn bằng MẶC ĐỊNH (Có) — hai bên phải cùng cách hiểu mới so được.
    const now = Engine.create(DEFAULTS).computeMonth(clone(c.input)).m;
    assert.deepEqual(JSON.parse(JSON.stringify(before)), JSON.parse(JSON.stringify(now)), c.id);
  }
});

test('GĐ2: khoá của các đợt TRƯỚC 16/10 vẫn bắt buộc: thiếu ot.rate là PARAM_MISSING (chỉ khoá trong LATE_KEYS có mặc định thay thế)', () => {
  const broken = { ...DEFAULTS };
  delete broken['ot.rate'];
  assert.throws(
    () => Engine.create(broken),
    e => e.code === 'PARAM_MISSING' && e.key === 'ot.rate'
  );
});
