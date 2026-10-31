'use strict';
// Không còn loại ngày Làm bù cả ngày: bảng chọn loại ngày của nhân sự không có 'makeup' (giờ làm bù vẫn chọn được ở phần làm thêm),
// danh sách loại yêu cầu được duyệt của màn Phân quyền không có 'makeup_day', bộ giờ thực tế không còn hàm quy đổi ngày làm bù.
process.env.DB_PATH = process.env.DB_PATH || ':memory:'; // lib/roles nạp lib/db: DB trong RAM, không đụng DB thật
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../public/nhan-vien/logic.js');
const ActualHours = require('../../public/actual-hours.js');
const { APPROVAL_ITEMS } = require('../../lib/roles.js');

test('staff day picker offers no whole-day make-up kind, on scheduled and off-schedule days, for every position', () => {
  for (const type of ['tts', 'ctv', 'nv'])
    for (const date of ['2026-11-02', '2026-11-07']) {
      const plan = L.dayPlan({ me: { username: 'qa_x', type, level: 1 }, date, holidays: [], warn: true });
      const kinds = plan.kinds.map(k => k.value);
      assert.ok(!kinds.includes('makeup'), `${type} ${date}: ${kinds}`);
      assert.ok(kinds.includes('willmakeup'), `${type} ${date}: Nghỉ, sẽ làm bù vẫn còn`);
      assert.ok(plan.extraKinds.includes('makeup'), `${type} ${date}: giờ làm bù vẫn còn`);
    }
});

test('role screen approval types do not list makeup_day', () => {
  const ids = APPROVAL_ITEMS.map(i => i.id);
  assert.ok(!ids.includes('makeup_day'), ids.join(','));
  assert.ok(ids.includes('makeup_hours'));
  assert.ok(ids.includes('willmakeup'));
});

test('ActualHours no longer exposes whole-day make-up conversion', () => {
  assert.equal(ActualHours.makeupOnSchedule, undefined);
  assert.equal(ActualHours.makeupWindow, undefined);
});
