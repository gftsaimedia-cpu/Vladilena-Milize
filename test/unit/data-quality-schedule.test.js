'use strict';
// lib/data-quality.js đếm phép đã dùng theo lịch làm việc của người (public/work-schedule.js): chỉ ngày làm theo lịch mới tính, không phải mọi ngày khác Chủ nhật.
// Toàn người giả. 27/10/2026 là Thứ Ba; 28/10 là Thứ Tư.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const quality = require('../../lib/data-quality.js');

const TODAY = '2026-10-30';
const staffOf = extra => ({
  username: 'qa_dq',
  name: 'Người Giả',
  role: 'staff',
  type: 'nv',
  level: 1,
  startDate: '2026-10-30',
  birthday: null,
  leaveAdjust: -30,
  ...extra
});
const sheetOf = days => [{ username: 'qa_dq', month: '2026-10', days }];
const usedOf = (staff, days, holidays, extra = {}) => {
  const issue = quality
    .evaluate({ staff: [staff], sheets: sheetOf(days), holidays, today: TODAY, ...extra })
    .issues.find(i => i.code === 'negative-leave');
  return issue ? issue.used : 0;
};

test('S1-2d: lịch mặc định T2–T7, ngày lễ Thứ Ba nằm trong lịch: nghỉ phép năm ngày đó không trừ phép, ngày thường thì trừ', () => {
  const days = { '2026-10-27': { kind: 'leave' }, '2026-10-28': { kind: 'leave' } };
  assert.equal(usedOf(staffOf({}), days, ['2026-10-27']), 1);
});

test('S1-2d: loại NV làm T2/T4/T6, ngày lễ Thứ Ba ngoài lịch của loại: ngày nghỉ phép đó vẫn trừ phép (bỏ xấp xỉ dow khác Chủ nhật)', () => {
  const { DEFAULTS } = require('../../public/payroll-params.js');
  const days = { '2026-10-27': { kind: 'leave' } };
  assert.equal(usedOf(staffOf({}), days, ['2026-10-27']), 0, 'lịch mặc định: Thứ Ba trong lịch, ngày lễ, không trừ');
  const mwf = { ...DEFAULTS, 'type.nv.dows': [1, 3, 5] };
  assert.equal(usedOf(staffOf({}), days, ['2026-10-27'], { params: mwf }), 1, 'ngoài lịch của loại: trừ');
});

test('S1-2d: ngày phép có dòng duyệt bị từ chối (approvals) không tính vào phép đã dùng, ngày chờ duyệt thì vẫn tính; chỉ tính đến hôm nay', () => {
  const days = { '2026-10-27': { kind: 'leave' }, '2026-10-28': { kind: 'leave' }, '2026-11-05': { kind: 'leave' } };
  const row = (date, status) => ({ username: 'qa_dq', date, item: 'leave', status });
  assert.equal(usedOf(staffOf({}), days, []), 2, 'ngày sau hôm nay (05/11) không tính');
  assert.equal(usedOf(staffOf({}), days, [], { approvals: [row('2026-10-27', 'rejected')] }), 1, 'bị từ chối: trả lại');
  assert.equal(usedOf(staffOf({}), days, [], { approvals: [row('2026-10-27', 'pending')] }), 2, 'chờ duyệt: giữ chỗ');
});

test('quyền lợi theo bậc: bậc tắt cờ tài khoản phép (level.<mã>.<bậc>.benefit.leaveAccount) thì không đối soát phép của người ở bậc đó', () => {
  const { DEFAULTS } = require('../../public/payroll-params.js');
  const params = { ...DEFAULTS, 'level.nv.2.benefit.leaveAccount': false };
  const days = { '2026-10-28': { kind: 'leave' } };
  assert.equal(usedOf(staffOf({ level: 1 }), days, [], { params }), 1, 'bậc 1 kế thừa chức vụ: có tài khoản phép');
  assert.equal(usedOf(staffOf({ level: 2 }), days, [], { params }), 0, 'bậc 2 tắt: không đối soát');
});
