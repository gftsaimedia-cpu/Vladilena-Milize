'use strict';
// Làm ngày lễ là OT, nên quyền lợi duy nhất quyết định là type.<mã>.benefit.ot (không còn cờ benefit.holidayWork):
//   - chức vụ không có quyền lợi OT (TTS, hoặc chức vụ tắt cờ ot): bộ máy trả 0 đồng tiền làm ngày lễ cho MỌI giờ ngày lễ, kể cả giờ ca chính;
//     người đó vẫn hưởng lương nghỉ lễ (holBase) nếu chức vụ có quyền lợi nghỉ lễ có lương;
//   - ApprovalView không tạo khoản OT ngày lễ cho chức vụ này (nên không có gì để duyệt);
//   - màn nhân viên vẫn đưa mục OT ngày lễ cho chức vụ này, kèm câu "Chức vụ chưa có quyền lợi này.";
//   - cờ holidayWork không còn trong bộ tham số mặc định, danh sách cờ chức vụ và dữ liệu registry.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../public/payroll-engine.js');
const ApprovalView = require('../../public/approval-view.js');
const { DEFAULTS } = require('../../public/payroll-params.js');
const Logic = require('../../public/nhan-vien/logic.js');
const { BENEFIT_FLAGS } = require('../../lib/params/positions');
const fs = require('node:fs');
const path = require('node:path');

const HOLIDAY = '2026-10-20'; // Thứ Ba
const WORK = { kind: 'work', in: '08:00', out: '17:00' };
const DAILY = 6000000 / 26;
const HOURLY = DAILY / 8;
const ctx = (staffType, date = HOLIDAY) => ({ date, holidays: [HOLIDAY], staffType });
const noOtParams = { ...DEFAULTS, 'type.nv.benefit.ot': false };

test('chức vụ tắt quyền lợi OT (NV, tắt type.nv.benefit.ot): giờ ngày lễ trả 0 kể cả giờ ca chính; vẫn hưởng lương nghỉ lễ', () => {
  const nv = { type: 'nv', level: 1, nightPct: 40 };
  const withOt = Engine.create(DEFAULTS).calcDay(nv, WORK, true, 0, { date: HOLIDAY, holidays: [HOLIDAY] });
  const noOt = Engine.create(noOtParams).calcDay(nv, WORK, true, 0, { date: HOLIDAY, holidays: [HOLIDAY] });
  assert.equal(withOt.holWorkH, 9);
  assert.ok(Math.abs(withOt.holWorkPay - 9 * HOURLY * DEFAULTS['ot.holidayRate']) < 1e-6);
  assert.equal(noOt.kind, 'holiday');
  assert.equal(noOt.holWorkH || 0, 0);
  assert.equal(noOt.holWorkPay || 0, 0);
  assert.ok(Math.abs(noOt.holBase - DAILY) < 1e-6, 'lương nghỉ lễ vẫn được trả');
  assert.ok(Math.abs(noOt.total - DAILY) < 1e-6);
});

test('calcMonth: chức vụ không có OT làm ngày lễ có khung 08:00–17:00 vẫn chỉ nhận lương ngày lễ, giờ làm ngày lễ bằng 0', () => {
  const nv = { type: 'nv', level: 1, nightPct: 40 };
  const m = Engine.create(noOtParams).calcMonth(nv, { [HOLIDAY]: WORK }, null, [HOLIDAY], '2026-10', null);
  assert.equal(m.holWorkHours, 0);
  assert.equal(m.holWorkPay, 0);
  assert.equal(m.holiday, 1);
});

test('TTS (không có lương nghỉ lễ, không có OT): làm ngày lễ trả 0 đồng', () => {
  const day = Engine.create(DEFAULTS).calcDay({ type: 'tts', level: 1 }, WORK, true, 0, {
    date: HOLIDAY,
    holidays: [HOLIDAY]
  });
  assert.equal(day.total, 0);
  assert.equal(day.holWorkPay || 0, 0);
});

test('ApprovalView: chức vụ có OT thì ngày lễ khai khung giờ là khoản OT ngày lễ; TTS và chức vụ tắt cờ OT thì không có khoản', () => {
  const found = ApprovalView.itemOf(WORK, ctx('nv'));
  assert.deepEqual({ ...found }, { item: 'ot', fingerprint: 'holiday_work|08:00-17:00', holiday: true });
  assert.equal(ApprovalView.itemOf(WORK, ctx('tts')), null);
  const noOt = ApprovalView.create(noOtParams);
  assert.equal(noOt.itemOf(WORK, ctx('nv')), null);
});

test('màn nhân viên: chức vụ không có OT vẫn có mục OT ngày lễ kèm câu nói rõ; chức vụ có OT thì không kèm câu', () => {
  const me = { username: 'qa_tts', type: 'tts', level: 1 };
  const plan = Logic.dayPlan({ me, date: HOLIDAY, holidays: [HOLIDAY] });
  assert.ok(plan.kinds.some(k => k.value === 'holiday'));
  const work = plan.kinds.find(k => k.value === 'work');
  assert.ok(work);
  assert.match(work.hint, /Chức vụ chưa có quyền lợi này\./);
  const nvPlan = Logic.dayPlan({
    me: { username: 'qa_nv', type: 'nv', level: 1 },
    date: HOLIDAY,
    holidays: [HOLIDAY]
  });
  const nvWork = nvPlan.kinds.find(k => k.value === 'work' && k.label === 'OT');
  assert.ok(nvWork);
  assert.doesNotMatch(nvWork.hint, /Chức vụ chưa có quyền lợi này\./);
});

test('cờ benefit.holidayWork không còn: không trong tham số mặc định, danh sách cờ chức vụ hay registry', () => {
  assert.ok(!Object.keys(DEFAULTS).some(key => key.endsWith('.benefit.holidayWork')));
  assert.ok(!BENEFIT_FLAGS.includes('holidayWork'));
  const registryText = fs.readFileSync(path.join(__dirname, '../../lib/params/registry.data.json'), 'utf8');
  assert.ok(!/benefit\.holidayWork/.test(registryText));
});
