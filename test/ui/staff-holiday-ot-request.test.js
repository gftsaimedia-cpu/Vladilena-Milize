'use strict';
// Nhân viên tự gửi yêu cầu vào ngày lễ: làm ngày lễ là OT nên danh sách chỉ có "Nghỉ lễ" và "OT" khai giờ từ – đến, không có "Đi làm ngày lễ"
// hay "Đi làm" thường. Ngày ngoài lịch vẫn gửi được OT.
// Khai thay của Admin giữ mục "Đi làm" thường.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../public/nhan-vien/logic.js');

const WED = '2026-11-04'; // trong lịch nv (T2–T7)
const SUN = '2026-11-08';
const HOL = '2026-11-11'; // ngày lễ giả định trong lịch
const HOLIDAYS = [HOL];
const me = { type: 'nv', shiftCode: 'n1' };
const labels = plan => plan.kinds.map(k => k.label);

test('self mode on a holiday offers OT with hours, not "Đi làm ngày lễ"', () => {
  const hol = L.dayPlan({ me, date: HOL, holidays: HOLIDAYS, actualFrom: '2026-11-01', requestOnly: true });
  assert.deepEqual(labels(hol), ['Nghỉ lễ', 'OT']);
  assert.ok(!labels(hol).includes('Đi làm ngày lễ'));
  assert.equal(hol.extraOnly, false);
  assert.deepEqual(hol.extraKinds, []);
});

test('self mode keeps off-schedule OT; Admin on-behalf keeps plain "Đi làm"', () => {
  const sun = L.dayPlan({ me, date: SUN, holidays: HOLIDAYS, requestOnly: true });
  assert.ok(!labels(sun).includes('Đi làm'));
  assert.ok(
    sun.kinds.some(k => k.value === 'work' && /OT/.test(k.label)),
    'OT ngoài lịch vẫn gửi được'
  );
  const thay = L.dayPlan({ me, date: WED, holidays: HOLIDAYS, actualFrom: '2026-11-01', forName: 'Người A' });
  assert.ok(labels(thay).includes('Đi làm'));
  assert.ok(!thay.extraOnly);
});
