'use strict';
// POST /api/positions/:mã/levels { name, base, kpi?, effectiveMonth, reason } thêm bậc kế tiếp cho một chức vụ (config.payroll); một lô qua save() nên có
// tháng áp dụng, lý do, nhật ký; bậc không bao giờ xoá; mọi bộ đếm bậc (levelCountOf, bảng bậc của bộ máy, GET /positions) thấy bậc mới.
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Engine, caseOf, clone, closeTo } = require('../helpers/pay-oracle');
const { levelCountOf } = require('../../src/platform/request-rules');

const { F } = P;

before(F.start);
after(F.stop);

const addLevel = async (month?, code?, body?, who = 'admin') =>
  await F.call('POST', `/positions/${code}/levels`, {
    who,
    body: { effectiveMonth: month, reason: 'Thêm bậc để thử', ...body }
  });

test('GĐ-bậc 3: thêm bậc 5 cho NV (mặc định có 4): sinh level.nv.5.name, base, kpi; GET /positions và levelCountOf thấy 5 bậc; nhật ký ghi lý do', async () => {
  const M = await P.setupMonth();
  const audit0 = (await P.auditRows('param.set')).length;
  const res = await addLevel(M, 'nv', { name: 'Senior Lead', base: 8000000, kpi: 8000000 });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data.level, { position: 'nv', level: 5, name: 'Senior Lead', base: 8000000, effectiveMonth: M });
  const set = await P.paramsOf(M);
  assert.equal(set['level.nv.5.name'], 'Senior Lead');
  assert.equal(set['level.nv.5.base'], 8000000);
  assert.equal(set['level.nv.5.kpi'], 8000000);
  assert.equal(levelCountOf(set, 'nv'), 5);
  assert.ok((await P.auditRows('param.set')).length > audit0, 'có dòng nhật ký');
  const list = await F.call('GET', `/positions?month=${M}`, { who: 'admin' });
  const nv = list.data.positions.find(p => p.code === 'nv');
  assert.equal(nv.levels.length, 5);
  assert.equal(nv.levels[4].name, 'Senior Lead');
  const cells = (await F.call('GET', `/entitlements?month=${M}`, { who: 'admin' })).data.levelCells;
  assert.ok(
    cells.find(c => c.position === 'nv' && c.level === 5),
    'bảng quyền lợi theo bậc có bậc 5'
  );
});

test('GĐ-bậc 3: bộ máy tính lương nhận bậc mới: người bậc 5 có lương cơ bản của bậc đó; bậc cũ không đổi một đồng', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Bậc bộ máy', copyFrom: 'nv' }); // bản sao riêng: mỗi test một chức vụ để không trùng số bậc với test khác
  const res = await addLevel(M, code, { name: 'Chuyên gia', base: 9000000, kpi: 9000000 });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const engine = Engine.create(await P.paramsOf(M));
  const input = clone(caseOf('known-kpi-five-100-90-80-85-100').input);
  input.staff.type = code;
  const m1 = engine.computeMonth(clone(input)).m;
  assert.ok(closeTo(m1.base, 6000000 / 26), 'lương ngày bậc 1 = 6.000.000 ÷ 26');
  input.staff.level = 5;
  assert.ok(closeTo(engine.computeMonth(input).m.base, 9000000 / 26), 'lương ngày bậc 5 = 9.000.000 ÷ 26');
});

test('GĐ-bậc 3: thêm hai bậc liên tiếp ở hai lần gọi cho ra bậc 5 rồi bậc 6; trùng tên bậc 409 LEVEL_NAME_CLASH và không ghi gì', async () => {
  const M = await P.setupMonth();
  assert.equal((await addLevel(M, 'tts', { name: 'Bậc 7', base: 6000000 })).status, 200);
  assert.equal(levelCountOf(await P.paramsOf(M), 'tts'), 7);
  const before = await F.snapshot();
  const dup = await addLevel(M, 'tts', { name: 'bậc 7', base: 6500000 });
  assert.equal(dup.status, 409, JSON.stringify(dup.data));
  assert.equal(dup.data.code, 'LEVEL_NAME_CLASH');
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});

test('GĐ-bậc 3: chức vụ thêm bằng sao chép cũng thêm được bậc (khoá level.<mã>.<n>.*), kế thừa số bậc của bản sao', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Chuyên viên bậc', copyFrom: 'nv' });
  const res = await addLevel(M, code, { name: 'Bậc cao nhất', base: 9500000, kpi: 9500000 });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.level.level, 5);
  assert.equal((await P.paramsOf(M))[`level.${code}.5.base`], 9500000);
  assert.equal(levelCountOf(await P.paramsOf(M), code), 5);
});

test('GĐ-bậc 3: đầu vào sai bị 400 (tên rỗng hoặc có <, lương không dương hoặc không phải số, kpi âm), chức vụ lạ 404; không ghi gì', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Bậc đầu vào sai', copyFrom: 'nv' });
  const before = await F.snapshot();
  for (const body of [
    { name: '', base: 7000000 },
    { name: 'A<b>', base: 7000000 },
    { name: 'Ổn', base: 0 },
    { name: 'Ổn', base: '7000000' },
    { name: 'Ổn', base: 7000000, kpi: -1 },
    { name: 'x'.repeat(200), base: 7000000 },
    {}
  ]) {
    const res = await addLevel(M, code, body);
    assert.equal(res.status, 400, JSON.stringify([body, res.data]));
  }
  const unknown = await addLevel(M, 'khongco', { name: 'Ổn', base: 7000000, kpi: 7000000 });
  assert.equal(unknown.status, 404, JSON.stringify(unknown.data));
  const longReason = await addLevel(M, code, { name: 'Ổn', base: 7000000, kpi: 7000000, reason: 'x'.repeat(301) });
  assert.equal(longReason.status, 400, JSON.stringify(longReason.data));
  assert.equal(longReason.data.code, 'REASON_REQUIRED');
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});

test('GĐ-bậc 3: thêm bậc không nhập lý do vẫn được (lý do tuỳ chọn)', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Bậc không lý do', copyFrom: 'nv' });
  const res = await F.call('POST', `/positions/${code}/levels`, {
    who: 'admin',
    body: { effectiveMonth: M, name: 'Ổn', base: 7000000, kpi: 7000000 }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.level.level, 5);
});

test('GĐ-bậc 3: quyền: nhân viên 403, chưa đăng nhập 401, người có config.payroll (C&B) thêm được; 403 và 401 không ghi gì', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Bậc quyền', copyFrom: 'nv' });
  const body = { name: 'Do C&B', base: 7000000, kpi: 7000000 };
  await P.grant('qa_ctv1', 'cb');
  const before = await F.snapshot();
  assert.equal((await addLevel(M, code, body, 'qa_nv1')).status, 403);
  assert.equal((await addLevel(M, code, body, null)).status, 401);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  assert.equal((await addLevel(M, code, body, 'qa_ctv1')).status, 200);
});

test('GĐ-bậc 3: chức vụ có KPI (benefit.kpi) thì bậc mới bắt buộc KPI tối đa lớn hơn 0 (400); chức vụ không có KPI thì không cần', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Bậc có KPI', copyFrom: 'nv' });
  const before = await F.snapshot();
  for (const kpi of [undefined, null, 0, -5, '100']) {
    const res = await addLevel(M, code, { name: 'Cao', base: 8000000, ...(kpi === undefined ? {} : { kpi }) });
    assert.equal(res.status, 400, JSON.stringify([kpi, res.data]));
  }
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  assert.equal((await addLevel(M, code, { name: 'Cao', base: 8000000, kpi: 8000000 })).status, 200);
  const none = await P.mustCopy(M, { label: 'Bậc không KPI', copyFrom: 'tts' });
  assert.equal((await addLevel(M, none, { name: 'Cao', base: 8000000 })).status, 200);
});

test('GĐ-bậc 3: thêm bậc ở tháng sớm hơn một bậc đã có hiệu lực muộn hơn bị 409 LEVEL_LATER_EXISTS (không trùng số bậc), không ghi gì; từ tháng đó trở đi thì được bậc kế tiếp', async () => {
  const late = await P.setupMonth();
  const early = await P.setupMonth(); // tháng nhỏ hơn (dãy tháng giảm dần)
  const code = await P.mustCopy(early, { label: 'Bậc hiệu lực muộn', copyFrom: 'nv' });
  assert.equal((await addLevel(late, code, { name: 'Bậc muộn', base: 8000000, kpi: 8000000 })).status, 200);
  const before = await F.snapshot();
  const clash = await addLevel(early, code, { name: 'Bậc sớm', base: 7000000, kpi: 7000000 });
  assert.equal(clash.status, 409, JSON.stringify(clash.data));
  assert.equal(clash.data.code, 'LEVEL_LATER_EXISTS');
  assert.match(clash.data.error, new RegExp(late));
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  const next = await addLevel(late, code, { name: 'Bậc kế', base: 8500000, kpi: 8500000 });
  assert.equal(next.status, 200, JSON.stringify(next.data));
  assert.equal(next.data.level.level, 6);
});
