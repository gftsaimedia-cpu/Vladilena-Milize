'use strict';
// Cờ gửi yêu cầu làm bù theo giờ (benefit.makeupHours), mặc định bật (cho gửi); máy chủ chặn khi tắt. Làm ngày lễ là OT nên theo benefit.ot (test/api/no-ot-benefit-holiday.test.ts).
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { SHIFT } = require('../../src/engine/punch');
const { sheetFlagsOf } = require('../../src/domain/positions');

const { F } = P;

before(F.start);
after(F.stop);

const makeupHoursDay = (person?) => {
  const [shiftIn, shiftOut] = SHIFT[person];
  const extraOut = `${String((Number(shiftOut.slice(0, 2)) + 1) % 24).padStart(2, '0')}:${shiftOut.slice(3)}`;
  return { kind: 'work', in: shiftIn, out: shiftOut, preset: person, extraKind: 'makeup', extraOut };
};
const put = async (who?, month?, date?, day?) =>
  await F.call('PUT', '/sheet', { who, body: { month, days: { [date]: day } } });

test('GĐ-bậc 2: mặc định cờ làm bù theo giờ bật cho mọi chức vụ (sheetFlagsOf); không còn cờ đi làm ngày lễ riêng', async () => {
  const M = await P.setupMonth();
  for (const type of ['tts', 'ctv', 'nv']) {
    const flags = sheetFlagsOf(await P.paramsOf(M), type, 1);
    assert.equal(flags.canMakeupHours, true, type);
    assert.equal(flags.canHolidayWork, undefined, type);
  }
});

test('GĐ-bậc 2: tắt benefit.makeupHours của CTV thì khai làm bù theo giờ vẫn lưu, kèm cảnh báo BENEFIT_NOT_ALLOWED; tháng chưa tắt khai không cảnh báo', async () => {
  const M = await P.setupMonth();
  const open = await P.setupMonth(); // tháng nhỏ hơn: cờ tắt từ M không áp ngược
  const save = await P.saveChanges([{ key: 'type.ctv.benefit.makeupHours', value: false }], { month: M });
  assert.equal(save.status, 200, JSON.stringify(save.data));
  const date = P.firstDow(M, 2);
  const warned = await put('qa_ctv1', M, date, makeupHoursDay('n2'));
  assert.equal(warned.status, 200, JSON.stringify(warned.data));
  const warning = warned.data.warnings.find(w => w.code === 'BENEFIT_NOT_ALLOWED');
  assert.ok(warning, JSON.stringify(warned.data.warnings));
  assert.match(warning.message, new RegExp(`Ngày .*làm bù theo giờ`));
  const allowed = await put('qa_ctv1', open, P.firstDow(open, 2), makeupHoursDay('n2'));
  assert.equal(allowed.status, 200, JSON.stringify(allowed.data));
  assert.ok(
    !(allowed.data.warnings || []).some(w => w.code === 'BENEFIT_NOT_ALLOWED'),
    JSON.stringify(allowed.data.warnings)
  );
});
