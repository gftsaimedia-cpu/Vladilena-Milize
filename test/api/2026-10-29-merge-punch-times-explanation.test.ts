'use strict';
// Giờ bấm thật trên dòng ngày (punchIn / punchOut) khớp với giải trình ngày và công thức Chi tiết của phiếu Admin:
//   - ngày quên chấm được duyệt giải trình có lượt Admin theo giờ ca: Vào – ra in giờ ca (ca đêm: giờ ra là sáng hôm sau);
//   - ngày Admin khai thay cũng in giờ đã khai; ngày đi trễ có giờ bấm thật; ngày giải trình bị từ chối không có dòng công;
//   - ngưỡng giải trình (trễ quá 15 phút mới cắt) và công thức Trừ giờ: công thức tính ra đúng số cắt của dòng, 15 phút không có dòng cắt.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const X = require('../helpers/explanation-flow');
const { cellsOf } = require('../../src/domain/payroll/slip-paid');
const { formulasOf } = require('../../src/domain/payroll/slip-formulas');
const { evaluate, plainAll } = require('../helpers/formula-eval');

const { MONTH } = X;
const clone = (v?) => JSON.parse(JSON.stringify(v));

// Kết quả tính lương của một người cùng hồ sơ và tham số, để dựng công thức như lúc phát hành phiếu
async function slipOf(username?) {
  await F.at('2026-10-29T12:00:00');
  const service = require('../../src/domain/payroll/payroll-service');
  const inputs = await service.loadInputs(MONTH, { usernames: [username] });
  const staff = inputs.people.get(username).staff;
  const params = (await service.paramsFor(MONTH)).params;
  const paid = await service.computeFor(MONTH, staff, inputs, params);
  const snapshot = clone({ ...paid.m, trace: paid.m.trace });
  const cells = cellsOf(snapshot);
  return { paid, cells, formulas: plainAll(formulasOf({ snapshot, staffTerms: staff, params, month: MONTH, cells })) };
}
const rowOf = async (username?, date?) => (await X.payOf(username)).m.rows.find(r => r.date === date);
const times = (row?) => [row.punchIn, row.punchOut];

// số tiền của chuỗi "0,5 giờ thiếu × 28.846,15 đ/giờ" hoặc "1/6 giờ thiếu × 28.846,15 đ/giờ"
const lateCutValue = evaluate;

before(async () => {
  await F.start();
  await F.at('2026-10-29T12:00:00');
  for (const name of ['chi', 'dung', 'em', 'tre', 'dung15', 'tre45']) await F.person(name);
  await F.person('dem', 'staff', { shiftCode: 'g1' });
  await F.person('admin', 'admin');
});
after(() => F.stop());

test('Quên Check-out được duyệt giải trình: Vào – ra là giờ ca (lượt Admin), không còn là giờ vào thật trễ', async () => {
  await X.forgotOut('chi', '2026-10-20', '08:40', 'mp-chi-in');
  assert.deepEqual(times(await rowOf('chi', '2026-10-20')), ['08:40', null]); // chờ giải trình: chỉ có giờ vào thật
  const held = await X.askAndAnswer('chi', '2026-10-20');
  assert.equal((await X.decide(held.id, true)).data.recorded, true);
  assert.deepEqual(times(await rowOf('chi', '2026-10-20')), ['08:00', '17:00']);
});

test('Ngày không chấm gì được duyệt giải trình: Vào – ra là giờ ca; ca đêm giờ ra là giờ đồng hồ của sáng hôm sau', async () => {
  const day = await X.askAndAnswer('em', '2026-10-21');
  assert.equal((await X.decide(day.id, true)).data.recorded, true);
  assert.deepEqual(times(await rowOf('em', '2026-10-21')), ['08:00', '17:00']);
  const night = await X.askAndAnswer('dem', '2026-10-20');
  assert.equal((await X.decide(night.id, true)).data.recorded, true);
  assert.deepEqual(times(await rowOf('dem', '2026-10-20')), ['21:00', '06:00']);
});

test('Ngày Admin khai thay: Vào – ra là giờ đã khai, cùng ô với ngày duyệt giải trình', async () => {
  await X.declareOnBehalf('dung', '2026-10-20');
  assert.deepEqual(times(await rowOf('dung', '2026-10-20')), ['08:00', '17:00']);
});

test('Giải trình bị từ chối: ngày không tính công, không có giờ Vào – ra', async () => {
  await X.forgotOut('em', '2026-10-22', '08:05', 'mp-em-in');
  const held = await X.askAndAnswer('em', '2026-10-22');
  const res = await X.decide(held.id, false);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(
    (await X.payOf('em')).m.rows.some(r => r.date === '2026-10-22' && r.kind === 'work'),
    false
  );
});

test('Trễ 16 phút được duyệt: Vào – ra là giờ bấm thật, Trừ giờ 30 phút và công thức tính ra đúng số cắt', async () => {
  await X.fullDay('tre', '2026-10-19', '08:16', '17:00', 'mp-tre');
  const item = await X.askAndAnswer('tre', '2026-10-19');
  assert.equal((await X.decide(item.id, true)).status, 200);
  assert.deepEqual(times(await rowOf('tre', '2026-10-19')), ['08:16', '17:00']);
  const slip = await slipOf('tre');
  assert.ok(slip.cells.lateCut > 0, 'có tiền trừ giờ');
  assert.match(slip.formulas.lateCut, /^0,5 giờ thiếu × /);
  assert.ok(Math.abs(lateCutValue(slip.formulas.lateCut) - slip.cells.lateCut) <= 1, slip.formulas.lateCut);
});

test('Trễ 45 phút: Trừ giờ 1 giờ; trễ đúng 15 phút: không cắt và không có dòng công thức Trừ giờ', async () => {
  await X.fullDay('tre45', '2026-10-19', '08:45', '17:00', 'mp-tre45');
  const a = await X.askAndAnswer('tre45', '2026-10-19');
  assert.equal((await X.decide(a.id, true)).status, 200);
  const long = await slipOf('tre45');
  assert.match(long.formulas.lateCut, /^1 giờ thiếu × /);
  assert.ok(Math.abs(lateCutValue(long.formulas.lateCut) - long.cells.lateCut) <= 1, long.formulas.lateCut);

  await X.fullDay('dung15', '2026-10-19', '08:15', '17:00', 'mp-dung15');
  const b = await X.askAndAnswer('dung15', '2026-10-19');
  assert.equal((await X.decide(b.id, true)).status, 200);
  const grace = await slipOf('dung15');
  assert.deepEqual(times(await rowOf('dung15', '2026-10-19')), ['08:15', '17:00']);
  assert.equal(grace.cells.lateCut || 0, 0);
  assert.ok(!grace.formulas.lateCut, `không có công thức Trừ giờ: ${grace.formulas.lateCut}`);
});
