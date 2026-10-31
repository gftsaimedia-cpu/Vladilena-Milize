'use strict';
// Loại ngày iSAT chỉ được đưa ra ở Thứ Bảy và cho chức vụ có quyền lợi iSAT, ở màn nhân viên
// (logic.js → dayPlan) và hộp khai thay của Admin (cham-cong-khai.js → planOf). Không có ô iSAT viền nét đứt.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../../public/nhan-vien/logic.js');

const MONTH = '2026-11';
const WED = '2026-11-04';
const SAT = '2026-11-07';
const SUN = '2026-11-08';
const hasIsat = plan => plan.kinds.some(k => k.value === 'isat');

function loadAdmin() {
  const A = {
    esc: s => String(s),
    S: { month: MONTH, me: { username: 'qa_admin' } },
    actions: {},
    meInfo: { holidays: [] },
    fmtDM: ymd => `${ymd.slice(8)}/${ymd.slice(5, 7)}`,
    dowOf: ymd => new Date(`${ymd}T00:00:00Z`).getUTCDay(),
    holidaySet: () => new Set(),
    positions: { flag: (type, name) => name === 'isat' && type === 'nv' }
  };
  const window = { Admin: A, ApprovalView: {}, PayrollParams: { DEFAULTS: {} } };
  const file = path.join(__dirname, '..', '..', 'public', 'admin', 'cham-cong-khai.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window, document: {}, console });
  return A.CcKhai;
}

test('Màn nhân viên: iSAT chỉ có ở Thứ Bảy của chức vụ có quyền lợi iSAT', () => {
  for (const [type, date, expected] of [
    ['nv', SAT, true],
    ['nv', WED, false],
    ['nv', SUN, false],
    ['ctv', SAT, false],
    ['tts', SAT, false]
  ]) {
    const plan = L.dayPlan({ me: { type }, date, holidays: [], actualFrom: `${MONTH}-01` });
    assert.equal(hasIsat(plan), expected, `${type} ${date}`);
  }
});

test('Màn nhân viên: ngày iSAT đã lưu (sai thứ hoặc sai quyền lợi) vẫn hiện để xem và sửa', () => {
  const plan = L.dayPlan({ me: { type: 'ctv' }, date: WED, holidays: [], existingKind: 'isat' });
  assert.ok(hasIsat(plan));
  assert.match(plan.kinds.find(k => k.value === 'isat').hint, /Đã khai từ trước/);
});

test('Khai thay của Admin: iSAT chỉ có ở Thứ Bảy của chức vụ có quyền lợi iSAT; không có ô nét đứt cho iSAT', () => {
  const khai = loadAdmin();
  for (const [type, date, expected] of [
    ['nv', SAT, true],
    ['nv', WED, false],
    ['nv', SUN, false],
    ['ctv', SAT, false],
    ['tts', SAT, false]
  ]) {
    const plan = khai.planOf({
      type,
      name: 'Người A',
      date,
      month: MONTH,
      sheet: { scheduledDates: [WED, SAT] },
      holidays: new Set(),
      actualFrom: `${MONTH}-01`,
      existingKind: ''
    });
    assert.equal(hasIsat(plan), expected, `${type} ${date}`);
    if (expected) assert.notEqual(plan.kinds.find(k => k.value === 'isat').normal, false, 'ô iSAT không nét đứt');
  }
});
